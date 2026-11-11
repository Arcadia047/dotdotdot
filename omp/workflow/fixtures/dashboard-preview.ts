/** Local browser acceptance fixture. Real queue/Git/checks; controlled reviewers.
 * No work source, credentials, external models, or user OMP profile is used.
 * Run with Bun after building the dashboard. Ctrl-C closes the preview.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { WorkManager, type WorkerClient } from "../manager";
import { executeGit } from "../jobs";
import { startDashboard } from "../dashboard";
import type { JobInput } from "../types";

const root = mkdtempSync(join(tmpdir(), "omp-dashboard-preview-"));
executeGit(root, ["init", "-b", "main", "sample-repo"]);
const repo = join(root, "sample-repo");
const stateDir = join(root, "state");
executeGit(repo, ["config", "user.name", "Dashboard fixture"]);
executeGit(repo, ["config", "user.email", "fixture@example.invalid"]);
writeFileSync(join(repo, "README.md"), "Synthetic browser acceptance workspace.\n");
executeGit(repo, ["add", "."]);
executeGit(repo, ["commit", "-m", "Fixture base"]);

let booting = true;
let interruptedStarted!: () => void;
const started = new Promise<void>((resolve) => { interruptedStarted = resolve; });
const worker: WorkerClient = { async run(request) {
  const id = basename(request.cwd);
  if (request.role === "implementer") {
    if ((id === "recovery" && booting) || id === "active") {
      if (id === "recovery") interruptedStarted();
      await new Promise<never>((_resolve, reject) => {
        const abort = () => reject(new Error("Preview session stopped; reconcile before resuming."));
        if (request.signal?.aborted) abort();
        else request.signal?.addEventListener("abort", abort, { once: true });
      });
    }
    writeFileSync(join(request.cwd, `${id}.txt`), id === "check-failure" ? "incorrect\n" : "accepted\n");
    executeGit(request.cwd, ["add", "."]);
    executeGit(request.cwd, ["commit", "-m", `Fixture ${id}`]);
  }
  return { text: "Controlled fixture result", model: request.model,
    report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
} };
const options = { stateDir, worker, model: { provider: "fixture", id: "local", thinking: "off" }, maxWorkers: 3, repairLimit: 0 };
const job = (id: string, task: string, dependsOn: string[] = []): JobInput => ({
  id, repo, branch: `preview/${id}`, task, acceptance: ["The scoped fixture output is accepted and committed"], dependsOn,
  checks: [{ name: "Accepted output", command: `test "$(cat ${id}.txt)" = accepted` }],
});
const initial = new WorkManager(options);
initial.submit([job("archived", "Keep a completed job in local history")]);
await initial.start();
initial.cleanup("archived");
initial.submit([job("recovery", "Resume a safely retained interrupted workspace")]);
const firstRun = initial.start();
await started;
await initial.close();
await firstRun;
booting = false;

const manager = new WorkManager(options);
manager.submit([
  job("check-failure", "Repair the output that failed its acceptance check"),
  job("ready", "Capture current checks and independent review receipts"),
  job("active", "Implement branch-scoped cancellation recovery"),
  job("waiting", "Integrate after the output repair is ready", ["check-failure"]),
]);
void manager.start().catch((error) => { console.error(error); });
const deadline = Date.now() + 15_000;
while (Date.now() < deadline) {
  const jobs = manager.status().jobs;
  if (jobs.find((item) => item.id === "ready")?.status === "ready" && jobs.find((item) => item.id === "check-failure")?.status === "blocked") break;
  await Bun.sleep(20);
}
const dashboard = await startDashboard({ manager, stateDir, profile: "Synthetic preview", assetsDir: process.env.OMP_DASHBOARD_PREVIEW_ASSETS });
console.log(JSON.stringify({ url: dashboard.url, root, scope: "Synthetic local queue; controlled reviewers, no external model requests" }));
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await dashboard.close();
  await manager.close();
  process.exit(0);
};
process.on("SIGINT", () => { void close(); });
process.on("SIGTERM", () => { void close(); });
