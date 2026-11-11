/** Controlled external-worker fixture: stop the host after a committed but unreported result. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { WorkManager } from "../manager";
import { executeGit } from "../jobs";

const [repo, stateDir, marker] = Bun.argv.slice(2) as [string, string, string];
const manager = new WorkManager({
	stateDir,
	model: { provider: "fixture", id: "local" },
	worker: { async run(request) {
		request.onSpawn?.({ pid: process.pid, sessionDir: request.sessionDir });
		writeFileSync(join(request.cwd, "value.txt"), "committed\n");
		executeGit(request.cwd, ["commit", "-am", "Committed before host crash"]);
		writeFileSync(marker, "committed");
		await new Promise(() => { setInterval(() => {}, 1000); });
		throw new Error("Unreachable controlled worker");
	} },
});
manager.submit([{ id: "crash", repo, branch: "feature/crash", task: "Set committed value", acceptance: ["Value is committed"], checks: [{ name: "content", command: "test \"$(cat value.txt)\" = committed" }] }]);
await manager.start();
