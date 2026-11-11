import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});

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
