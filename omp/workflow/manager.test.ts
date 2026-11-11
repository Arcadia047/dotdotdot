import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WorkManager } from "./manager";
import { executeGit } from "./jobs";

const roots: string[] = [];
const managers: WorkManager[] = [];
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "omp-manager-test-"));
	roots.push(root);
	executeGit(root, ["init", "-b", "main", "repo"]);
	const repo = join(root, "repo");
	executeGit(repo, ["config", "user.name", "Fixture"]);
	executeGit(repo, ["config", "user.email", "fixture@example.invalid"]);
	writeFileSync(join(repo, "value.txt"), "original\n");
	executeGit(repo, ["add", "."]);
	executeGit(repo, ["commit", "-m", "Fixture base"]);
	return { root, repo, stateDir: join(root, "state") };
}
afterEach(async () => {
	for (const manager of managers.splice(0)) await manager.close();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("cleanup preserves ignored local data inside a ready worktree", async () => {
	const { repo, stateDir } = fixture();
	writeFileSync(join(repo, ".gitignore"), "private-data/\n");
	executeGit(repo, ["add", ".gitignore"]);
	executeGit(repo, ["commit", "-m", "Ignore local data"]);
	const worker = { async run(request: import("./manager").WorkerRequest) {
		if (request.role === "implementer") {
			writeFileSync(join(request.cwd, "value.txt"), "ready\n");
			executeGit(request.cwd, ["commit", "-am", "Candidate"]);
		}
		return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
	} };
	const manager = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" } });
	managers.push(manager);
	manager.submit([{ id: "one", repo, branch: "feature/one", task: "Set ready value", acceptance: ["Value is ready"], checks: [{ name: "value", command: "test -f value.txt" }] }]);
	await manager.start();
	const job = manager.status().jobs[0]!;
	expect(job.status).toBe("ready");
	const data = join(job.worktree, "private-data");
	const { mkdirSync } = await import("node:fs");
	mkdirSync(data);
	writeFileSync(join(data, "local.db"), "unaccounted local data");
	expect(() => manager.cleanup(job.id)).toThrow(/ignored|unaccounted/i);
	expect(readFileSync(join(data, "local.db"), "utf8")).toBe("unaccounted local data");
	expect(manager.status().jobs[0]!.archivedAt).toBeUndefined();
});

test("a timed-out queued review never dispatches after its worker slot becomes free", async () => {
	const { repo, stateDir } = fixture();
	const dispatched: string[] = [];
	let runningReviews = 0;
	const worker = { async run(request: import("./manager").WorkerRequest) {
		dispatched.push(request.role!);
		if (request.role === "implementer") {
			writeFileSync(join(request.cwd, "value.txt"), "candidate\n");
			executeGit(request.cwd, ["commit", "-am", "Candidate"]);
		} else {
			runningReviews++;
			try {
				await new Promise<never>((_resolve, reject) => {
					const stop = () => { setTimeout(() => reject(new Error("Review stopped and drained")), 80); };
					if (request.signal?.aborted) stop();
					else request.signal?.addEventListener("abort", stop, { once: true });
				});
			} finally { runningReviews--; }
		}
		return { text: "Candidate", model: request.model };
	} };
	const manager = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" }, maxWorkers: 1, validationTimeoutMs: 80 });
	managers.push(manager);
	manager.submit([{ id: "one", repo, branch: "feature/one", task: "Set candidate", acceptance: ["Value changed"], checks: [{ name: "value", command: "test -f value.txt" }] }]);
	const running = manager.start();
	await Promise.race([running, Bun.sleep(1200)]);
	expect(manager.status().jobs[0]!.status).toBe("blocked");
	await Bun.sleep(250);
	expect(dispatched).toEqual(["implementer", "spec-reviewer"]);
	expect(runningReviews).toBe(0);
	await running;
});

test("each role resolves the live choice after implementation and after waiting for a worker slot", async () => {
	const { repo, stateDir } = fixture();
	let live = "initial";
	const selections: [string, string][] = [];
	const worker = { async run(request: import("./manager").WorkerRequest) {
		selections.push([request.role!, request.model.id]);
		if (request.role === "implementer") {
			writeFileSync(join(request.cwd, "value.txt"), "candidate\n");
			executeGit(request.cwd, ["commit", "-am", "Candidate"]);
			live = "after-implementation";
		} else if (request.role === "spec-reviewer") live = "after-first-review";
		return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
	} };
	const manager = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "initial" }, modelFor: () => ({ provider: "fixture", id: live }), maxWorkers: 1 });
	managers.push(manager);
	manager.submit([{ id: "one", repo, branch: "feature/one", task: "Set candidate", acceptance: ["Value changed"], checks: [{ name: "value", command: "test -f value.txt" }] }]);
	await manager.start();
	expect(selections).toEqual([["implementer", "initial"], ["spec-reviewer", "after-implementation"], ["technical-reviewer", "after-first-review"]]);
	expect(manager.status().jobs[0]!.status).toBe("ready");
});

test("crash recovery retains a running validation group and retries only after it drains", async () => {
	const { root, repo, stateDir } = fixture();
	const marker = join(root, "check-starts");
	const child = Bun.spawn([process.execPath, fileURLToPath(new URL("./fixtures/crash-check-manager.ts", import.meta.url)), repo, stateDir, marker], { stdout: "pipe", stderr: "pipe" });
	try {
		const deadline = Date.now() + 10_000;
		while (!existsSync(marker) && Date.now() < deadline && child.exitCode === null) await Bun.sleep(10);
		expect(existsSync(marker)).toBe(true);
		child.kill("SIGKILL");
		await child.exited;
		let implementations = 0;
		const worker = { async run(request: import("./manager").WorkerRequest) {
			if (request.role === "implementer") implementations++;
			return { text: "Existing candidate reviewed", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
		} };
		const recovered = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" } });
		managers.push(recovered);
		await recovered.resume();
		expect(recovered.status().jobs[0]).toMatchObject({ status: "blocked", blocker: expect.stringMatching(/validation|process|worker/i) });
		expect(readFileSync(marker, "utf8").trim().split("\n")).toHaveLength(1);
		await Bun.sleep(2300);
		await recovered.resume();
		expect(recovered.status().jobs[0]!.status).toBe("ready");
		expect(implementations).toBe(0);
		expect(readFileSync(marker, "utf8").trim().split("\n")).toHaveLength(2);
	} finally {
		if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; }
	}
}, 20_000);

test("a deliberate pause prevents new worker dispatch and survives reopening", async () => {
	const { repo, stateDir } = fixture();
	writeFileSync(join(repo, "value.txt"), "unfinished original\n");
	const worker = { async run(): Promise<never> { throw new Error("Paused work must not start"); } };
	const manager = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" } });
	managers.push(manager);
	manager.pause();
	manager.submit([{ id: "one", repo, branch: "feature/one", task: "Set the value", acceptance: ["Value is updated"], checks: [{ name: "value", command: "test -f value.txt" }] }]);
	await manager.start();
	expect(manager.status().paused).toBe(true);
	expect(manager.status().jobs[0]?.status).toBe("queued");
	expect(readFileSync(join(repo, "value.txt"), "utf8")).toBe("unfinished original\n");
	await manager.close();
	managers.splice(managers.indexOf(manager), 1);
	const reopened = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" } });
	managers.push(reopened);
	expect(reopened.status().paused).toBe(true);
	expect(reopened.status().jobs[0]?.id).toBe("one");
});

test("independent branches progress concurrently to checked and reviewed candidates", async () => {
	const { repo, stateDir } = fixture();
	let active = 0;
	let peak = 0;
	const seenRoles: string[] = [];
	const worker = {
		async run(request: import("./manager").WorkerRequest) {
			active++;
			peak = Math.max(peak, active);
			seenRoles.push(request.role ?? "unknown");
			try {
				await Bun.sleep(20);
				if (request.role === "implementer") {
					const value = request.cwd.endsWith("/alpha") ? "alpha" : "beta";
					writeFileSync(join(request.cwd, "value.txt"), `${value}\n`);
					executeGit(request.cwd, ["commit", "-am", `Set ${value}`]);
				}
				return { text: "Candidate reported", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
			} finally { active--; }
		},
	};
	const manager = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" }, maxWorkers: 2 });
	managers.push(manager);
	manager.submit(["alpha", "beta"].map((id) => ({ id, repo, branch: `feature/${id}`, task: `Set the value to ${id}`, acceptance: [`Value is ${id}`], checks: [{ name: "content", command: `test "$(cat value.txt)" = ${id}` }] })));
	await manager.start();
	expect(manager.status().jobs.map((job) => [job.id, job.status])).toEqual([["alpha", "ready"], ["beta", "ready"]]);
	expect(peak).toBe(2);
	expect(seenRoles.filter((role) => role === "spec-reviewer")).toHaveLength(2);
	expect(seenRoles.filter((role) => role === "technical-reviewer")).toHaveLength(2);
	expect(readFileSync(join(repo, "value.txt"), "utf8")).toBe("original\n");
});

test("a second manager cannot create a competing scheduling loop for the same local queue", async () => {
	const { repo, stateDir } = fixture();
	const worker = { run(request: import("./manager").WorkerRequest): Promise<never> {
		return new Promise((_resolve, reject) => request.signal?.addEventListener("abort", () => reject(new Error("Stopped fixture worker")), { once: true }));
	} };
	const first = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" } });
	const second = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" } });
	managers.push(first, second);
	first.submit([{ id: "one", repo, branch: "feature/one", task: "Update value", acceptance: ["Value is updated"], checks: [{ name: "content", command: "test -f value.txt" }] }]);
	const running = first.start();
	await expect(second.start()).rejects.toThrow(/another work manager.*already/i);
	await first.close();
	await running;
});

test("a failed prerequisite blocks its dependents while unrelated work still becomes ready", async () => {
	const { repo, stateDir } = fixture();
	const implemented: string[] = [];
	const worker = { async run(request: import("./manager").WorkerRequest) {
		const id = request.cwd.split("/").at(-1)!;
		if (request.role === "implementer") {
			implemented.push(id);
			if (id === "broken") throw new Error("Fixture provider unavailable");
			writeFileSync(join(request.cwd, "value.txt"), `${id}\n`);
			executeGit(request.cwd, ["commit", "-am", "Fixture update"]);
		}
		return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
	} };
	const manager = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" } });
	managers.push(manager);
	manager.submit(["broken", "dependent", "independent"].map((id) => ({ id, repo, branch: `feature/${id}`, task: `Set ${id}`, acceptance: [`Value is ${id}`], checks: [{ name: "content", command: `test "$(cat value.txt)" = ${id}` }], dependsOn: id === "dependent" ? ["broken"] : [] })));
	await manager.start();
	expect(implemented.sort()).toEqual(["broken", "independent"]);
	expect(manager.status().jobs.find((job) => job.id === "independent")?.status).toBe("ready");
	expect(manager.status().jobs.find((job) => job.id === "dependent")).toMatchObject({ status: "blocked", blocker: expect.stringContaining("broken") });
});

test("related tickets integrate into their own branch before dependent work and final validation", async () => {
	const { repo, stateDir } = fixture();
	const worker = { async run(request: import("./manager").WorkerRequest) {
		const id = request.cwd.split("/").at(-1)!;
		if (request.role === "implementer") {
			if (id === "combine") {
				expect(readFileSync(join(request.cwd, "a.txt"), "utf8")).toBe("A");
				expect(readFileSync(join(request.cwd, "b.txt"), "utf8")).toBe("B");
				writeFileSync(join(request.cwd, "combined.txt"), "AB");
			} else writeFileSync(join(request.cwd, `${id}.txt`), id.toUpperCase());
			executeGit(request.cwd, ["add", "."]);
			executeGit(request.cwd, ["commit", "-m", `Build ${id}`]);
		}
		return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
	} };
	const manager = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" }, maxWorkers: 2 });
	managers.push(manager);
	manager.submit([
		{ id: "feature", kind: "integration", repo, branch: "feature/all", task: "Deliver A and B combined", acceptance: ["Combined value is AB"], checks: [{ name: "combined", command: "test \"$(cat combined.txt)\" = AB" }], dependsOn: ["a", "b", "combine"] },
		...["a", "b", "combine"].map((id) => ({ id, repo, branch: `feature/${id}`, task: `Build ${id}`, acceptance: [`${id} is delivered`], checks: [{ name: "content", command: `test -f ${id === "combine" ? "combined" : id}.txt` }], integrationTarget: "feature", dependsOn: id === "combine" ? ["a", "b"] : [] })),
	]);
	await manager.start();
	expect(manager.status().jobs.map((job) => [job.id, job.status])).toEqual([["feature", "ready"], ["a", "ready"], ["b", "ready"], ["combine", "ready"]]);
	const result = manager.status().jobs[0]!;
	expect(readFileSync(join(result.worktree, "combined.txt"), "utf8")).toBe("AB");
	expect(executeGit(repo, ["branch", "--show-current"])).toBe("main");
	expect(readFileSync(join(repo, "value.txt"), "utf8")).toBe("original\n");
}, 30_000);

test("a failing implementation is repaired and receives fresh checks and independent reviews", async () => {
	const { repo, stateDir } = fixture();
	let attempts = 0;
	const reviewed: string[] = [];
	const worker = { async run(request: import("./manager").WorkerRequest) {
		if (request.role === "implementer") {
			attempts++;
			if (attempts === 2) expect(request.prompt).toContain("content");
			writeFileSync(join(request.cwd, "value.txt"), attempts === 1 ? "wrong\n" : "correct\n");
			executeGit(request.cwd, ["commit", "-am", `Attempt ${attempts}`]);
		}
		const revision = executeGit(request.cwd, ["rev-parse", "HEAD"]);
		if (request.role?.includes("reviewer")) reviewed.push(revision);
		return { text: "Candidate", model: request.model, report: { revision, verdict: "pass", findings: [] } };
	} };
	const manager = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" }, repairLimit: 1 });
	managers.push(manager);
	manager.submit([{ id: "one", repo, branch: "feature/one", task: "Set the correct value", acceptance: ["Value is correct"], checks: [{ name: "content", command: "test \"$(cat value.txt)\" = correct" }] }]);
	await manager.start();
	expect(manager.status().jobs[0]).toMatchObject({ status: "ready", attempt: 2 });
	expect(new Set(reviewed).size).toBe(2);
	expect(attempts).toBe(2);
});

test("the final combined result is repaired when individually green tickets are insufficient", async () => {
	const { repo, stateDir } = fixture();
	let integratedRepairs = 0;
	const worker = { async run(request: import("./manager").WorkerRequest) {
		const id = request.cwd.split("/").at(-1)!;
		if (request.role === "implementer") {
			writeFileSync(join(request.cwd, `${id}.txt`), id);
			executeGit(request.cwd, ["add", "."]);
			executeGit(request.cwd, ["commit", "-m", `Build ${id}`]);
		} else if (request.role === "integrator") {
			integratedRepairs++;
			writeFileSync(join(request.cwd, "ready.txt"), "ready");
			executeGit(request.cwd, ["add", "."]);
			executeGit(request.cwd, ["commit", "-m", "Complete combined behavior"]);
		}
		return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
	} };
	const manager = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" } });
	managers.push(manager);
	manager.submit([
		{ id: "feature", kind: "integration", repo, branch: "feature/all", task: "Deliver A and B with a final ready marker", acceptance: ["Both tickets and final marker are present"], checks: [{ name: "combined", command: "test -f a.txt && test -f b.txt && test -f ready.txt" }], dependsOn: ["a", "b"] },
		...["a", "b"].map((id) => ({ id, repo, branch: `feature/${id}`, task: `Create ${id}.txt`, acceptance: [`${id}.txt is present`], checks: [{ name: "content", command: `test -f ${id}.txt` }], integrationTarget: "feature" })),
	]);
	await manager.start();
	expect(manager.status().jobs[0]).toMatchObject({ status: "ready" });
	expect(integratedRepairs).toBe(1);
}, 30_000);

test("readiness expires when the checked worktree changes", async () => {
	const { repo, stateDir } = fixture();
	const worker = { async run(request: import("./manager").WorkerRequest) {
		if (request.role === "implementer") {
			writeFileSync(join(request.cwd, "value.txt"), "checked\n");
			executeGit(request.cwd, ["commit", "-am", "Checked candidate"]);
		}
		return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
	} };
	const manager = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" } });
	managers.push(manager);
	manager.submit([{ id: "one", repo, branch: "feature/one", task: "Set checked value", acceptance: ["Value is checked"], checks: [{ name: "content", command: "test \"$(cat value.txt)\" = checked" }] }]);
	await manager.start();
	const ready = manager.status().jobs[0]!;
	expect(ready.status).toBe("ready");
	writeFileSync(join(ready.worktree, "unfinished.txt"), "Do not lose this\n");
	expect(manager.status().jobs[0]?.status).toBe("interrupted");
	expect(readFileSync(join(ready.worktree, "unfinished.txt"), "utf8")).toBe("Do not lose this\n");
});

test("explicit resume advances queued work after a persisted pause", async () => {
	const { repo, stateDir } = fixture();
	const worker = { async run(request: import("./manager").WorkerRequest) {
		if (request.role === "implementer") {
			writeFileSync(join(request.cwd, "value.txt"), "resumed\n");
			executeGit(request.cwd, ["commit", "-am", "Resumed work"]);
		}
		return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
	} };
	const manager = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" } });
	managers.push(manager);
	manager.pause();
	manager.submit([{ id: "one", repo, branch: "feature/one", task: "Set resumed value", acceptance: ["Value is resumed"], checks: [{ name: "content", command: "test \"$(cat value.txt)\" = resumed" }] }]);
	await manager.start();
	await manager.resume();
	expect(manager.status()).toMatchObject({ paused: false, jobs: [expect.objectContaining({ id: "one", status: "ready" })] });
});

test("cleanup retains the committed result and history while safely releasing its branch", async () => {
	const { repo, stateDir } = fixture();
	const worker = { async run(request: import("./manager").WorkerRequest) {
		if (request.role === "implementer") {
			writeFileSync(join(request.cwd, "value.txt"), "retained\n");
			executeGit(request.cwd, ["commit", "-am", "Retained result"]);
		}
		return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
	} };
	const manager = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" } });
	managers.push(manager);
	const input = { id: "one", repo, branch: "feature/one", task: "Set retained value", acceptance: ["Value is retained"], checks: [{ name: "content", command: "test \"$(cat value.txt)\" = retained" }] };
	manager.submit([input]);
	await manager.start();
	const ready = manager.status().jobs[0]!;
	const archived = manager.cleanup("one");
	expect(archived.archivedAt).toBeString();
	expect(executeGit(repo, ["rev-parse", "feature/one"])).toBe(ready.candidate!);
	manager.submit([{ ...input, id: "two" }]);
	expect(manager.status().jobs[0]).toMatchObject({ id: "one", status: "ready", archivedAt: archived.archivedAt });
	expect(manager.status().jobs[1]?.status).toBe("queued");
});

test("interrupted verification resumes from its committed candidate without duplicate implementation", async () => {
	const { repo, stateDir } = fixture();
	let implementations = 0;
	let holding = true;
	let reviewing!: () => void;
	const reviewStarted = new Promise<void>((resolve) => { reviewing = resolve; });
	const worker = { async run(request: import("./manager").WorkerRequest) {
		if (request.role === "implementer") {
			implementations++;
			writeFileSync(join(request.cwd, "value.txt"), "resumable\n");
			executeGit(request.cwd, ["commit", "-am", "One candidate"]);
		} else if (holding) {
			reviewing();
			await new Promise((_resolve, reject) => request.signal?.addEventListener("abort", () => reject(new Error("Interrupted review")), { once: true }));
		}
		return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
	} };
	const first = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" } });
	managers.push(first);
	first.submit([{ id: "one", repo, branch: "feature/one", task: "Set resumable value", acceptance: ["Value is resumable"], checks: [{ name: "content", command: "test \"$(cat value.txt)\" = resumable" }] }]);
	const running = first.start();
	await reviewStarted;
	await first.close();
	await running;
	holding = false;
	const resumed = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" } });
	managers.push(resumed);
	expect(resumed.status().jobs[0]?.status).toBe("interrupted");
	await resumed.resume();
	expect(resumed.status().jobs[0]?.status).toBe("ready");
	expect(implementations).toBe(1);
	expect(executeGit(repo, ["rev-list", "--count", "feature/one"])).toBe("2");
});

test("recovery after SIGKILL reconciles an unreported commit without rerunning implementation", async () => {
	const { root, repo, stateDir } = fixture();
	const marker = join(root, "committed.marker");
	const child = Bun.spawn([process.execPath, fileURLToPath(new URL("./fixtures/crash-manager.ts", import.meta.url)), repo, stateDir, marker], { stdout: "pipe", stderr: "pipe" });
	try {
		const deadline = Date.now() + 10_000;
		while (!existsSync(marker) && Date.now() < deadline && child.exitCode === null) await Bun.sleep(10);
		expect(existsSync(marker)).toBe(true);
		child.kill("SIGKILL");
		await child.exited;
		let implementations = 0;
		const worker = { async run(request: import("./manager").WorkerRequest) {
			if (request.role === "implementer") implementations++;
			return { text: "Reviewed existing commit", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
		} };
		const recovered = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" } });
		managers.push(recovered);
		expect(recovered.status().jobs[0]?.status).toBe("running");
		await recovered.resume();
		expect(recovered.status().jobs[0]?.status).toBe("ready");
		expect(implementations).toBe(0);
		expect(executeGit(repo, ["rev-list", "--count", "feature/crash"])).toBe("2");
	} finally { if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; } }
}, 30_000);

test("a zero repair budget preserves a conflicted integration without starting a repair worker", async () => {
	const { repo, stateDir } = fixture();
	let repairs = 0;
	const worker = { async run(request: import("./manager").WorkerRequest) {
		const id = request.cwd.split("/").at(-1)!;
		if (request.role === "implementer") {
			writeFileSync(join(request.cwd, "value.txt"), `${id.toUpperCase()}\n`);
			executeGit(request.cwd, ["commit", "-am", `Build ${id}`]);
		} else if (request.role === "integrator") {
			repairs++;
			writeFileSync(join(request.cwd, "value.txt"), "A\nB\n");
			executeGit(request.cwd, ["add", "."]);
			executeGit(request.cwd, ["commit", "-m", "Resolve conflict"]);
		}
		return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
	} };
	const manager = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" }, repairLimit: 0 });
	managers.push(manager);
	manager.submit([
		{ id: "feature", kind: "integration", repo, branch: "feature/all", task: "Deliver both values", acceptance: ["A and B present"], checks: [{ name: "both", command: "grep -q A value.txt && grep -q B value.txt" }], dependsOn: ["a", "b"] },
		...["a", "b"].map((id) => ({ id, repo, branch: `feature/${id}`, task: `Set ${id}`, acceptance: [`${id} is present`], checks: [{ name: "content", command: `grep -q ${id.toUpperCase()} value.txt` }], integrationTarget: "feature" })),
	]);
	await manager.start();
	expect(repairs).toBe(0);
	expect(manager.status().jobs[0]?.status).toBe("blocked");
	expect(readFileSync(join(manager.status().jobs[0]!.worktree, "value.txt"), "utf8")).toContain("<<<<<<<");
	expect(readFileSync(join(repo, "value.txt"), "utf8")).toBe("original\n");
}, 30_000);
