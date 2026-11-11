/** Kill the host after a real detached validation command has started. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { WorkManager } from "../manager";
import { executeGit } from "../jobs";

const [repo, stateDir, marker] = Bun.argv.slice(2) as [string, string, string];
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const manager = new WorkManager({ stateDir, model: { provider: "fixture", id: "local" }, worker: { async run(request) {
	if (request.role === "implementer") {
		writeFileSync(join(request.cwd, "value.txt"), "committed\n");
		executeGit(request.cwd, ["commit", "-am", "Candidate before check"]);
	}
	return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
} } });
manager.submit([{ id: "crash-check", repo, branch: "feature/crash-check", task: "Set committed value", acceptance: ["Value is committed"], checks: [{ name: "slow", command: `echo $$ >> ${quote(marker)}; sleep 2; test -f value.txt` }] }]);
await manager.start();
