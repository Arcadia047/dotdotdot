/** Leave a real check or model group in a shared integration worktree after host SIGKILL. */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { WorkManager } from "../manager";
import { executeGit } from "../jobs";

const [repo, stateDir, marker, release, mode] = Bun.argv.slice(2) as [string, string, string, string, string];
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const hold = `echo $$ >> ${quote(marker)}; while ! test -f ${quote(release)}; do sleep 0.05; done`;
const manager = new WorkManager({ stateDir, maxWorkers: 1, model: { provider: "fixture", id: "local" }, worker: { async run(request) {
	if (mode === "model" && request.role === "spec-reviewer" && request.cwd.endsWith("/target")) {
		const child = spawn("/bin/sh", ["-c", `read -r start; ${hold}`], { cwd: request.cwd, detached: true, stdio: ["pipe", "ignore", "ignore"] });
		if (!child.pid) throw new Error("Controlled model did not start");
		request.onSpawn?.({ pid: child.pid, sessionDir: request.sessionDir });
		child.stdin!.end("run\n");
		await new Promise<void>((resolve) => child.once("exit", () => resolve()));
	}
	if (request.role === "implementer") {
		const id = request.cwd.split("/").at(-1)!;
		writeFileSync(join(request.cwd, `${id}.txt`), id);
		executeGit(request.cwd, ["add", "."]);
		executeGit(request.cwd, ["commit", "-m", `Build ${id}`]);
	}
	return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
} } });
manager.submit([
	{ id: "target", kind: "integration", repo, branch: "feature/all", task: "Deliver both tickets", acceptance: ["Both files exist"], checks: [{ name: "combined", command: "test -f a.txt && test -f b.txt" }], dependsOn: ["a", "b"] },
	{ id: "a", repo, branch: "feature/a", task: "Create A", acceptance: ["A exists"], checks: [{ name: "a", command: `test -f a.txt${mode === "check" ? ` && if test "$(basename "$PWD")" = target; then ${hold}; fi` : ""}` }], integrationTarget: "target" },
	{ id: "b", repo, branch: "feature/b", task: "Create B", acceptance: ["B exists"], checks: [{ name: "b", command: "test -f b.txt" }], integrationTarget: "target" },
	{ id: "independent", repo, branch: "feature/independent", task: "Create independent file", acceptance: ["Independent file exists"], checks: [{ name: "independent", command: "test -f independent.txt" }] },
]);
await manager.start();
