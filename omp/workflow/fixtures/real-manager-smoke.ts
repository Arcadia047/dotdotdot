/** Real manager/OMP acceptance driver; invoked only by real-manager-smoke.py.
 * The provider scripts tool calls and verdicts. This verifies pipeline mechanics,
 * native tool execution and evidence binding, not a model's coding/review judgment.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WorkManager, type WorkerRequest } from "../manager";
import { OmpWorker } from "../rpc";
import { executeGit } from "../jobs";
import type { GateResult } from "../quality";

const root = process.argv[2];
const omp = process.argv[3];
assert(root && omp, "Invoke through real-manager-smoke.py");
const repo = join(root, "repo");
mkdirSync(repo);
executeGit(repo, ["init", "-b", "main"]);
executeGit(repo, ["config", "user.name", "OMP synthetic fixture"]);
executeGit(repo, ["config", "user.email", "fixture@example.invalid"]);
writeFileSync(join(repo, "value.txt"), "original\n");
executeGit(repo, ["add", "value.txt"]);
executeGit(repo, ["commit", "-m", "Fixture base"]);
const base = executeGit(repo, ["rev-parse", "HEAD"]);
writeFileSync(join(repo, "value.txt"), "uncommitted original work\n");
writeFileSync(join(repo, "untracked.txt"), "preserve this too\n");
const original = () => ({
  branch: executeGit(repo, ["symbolic-ref", "--short", "HEAD"]),
  head: executeGit(repo, ["rev-parse", "HEAD"]),
  status: executeGit(repo, ["status", "--porcelain=v1", "--untracked-files=all"]),
  diff: executeGit(repo, ["diff", "HEAD", "--"]),
  index: createHash("sha256").update(readFileSync(join(repo, ".git", "index"))).digest("hex"),
  tracked: readFileSync(join(repo, "value.txt"), "utf8"),
  untracked: readFileSync(join(repo, "untracked.txt"), "utf8"),
});
const before = original();
writeFileSync(join(root, "original-before.json"), JSON.stringify(before, null, 2));

const calls: { role: string; cwd: string; sessionDir: string; pid?: number; sessionFile?: string; transcriptFile?: string }[] = [];
const events: unknown[] = [];
let active = 0;
let peak = 0;
const transport = new OmpWorker({ command: [omp], inheritEnv: false, env: { ...process.env },
  defaultTimeoutMs: 25000, killGraceMs: 250,
  extraArgs: ["--no-extensions", "--no-skills", "--no-rules", "--no-context-files", "--no-lsp", "--no-pty", "--no-title"],
});
const manager = new WorkManager({
  stateDir: join(root, "state"),
  // Observe and bound the real adapter; never synthesize worker results.
  worker: { async run(request: WorkerRequest) {
    const call = { role: request.role ?? "unknown", cwd: request.cwd, sessionDir: request.sessionDir } as typeof calls[number];
    calls.push(call);
    peak = Math.max(peak, ++active);
    try {
      const output = await transport.run({ ...request, timeoutMs: Math.min(request.timeoutMs ?? 25000, 25000),
        onSpawn(worker) { call.pid = worker.pid; request.onSpawn?.(worker); },
      });
      call.sessionFile = output.sessionFile;
      call.transcriptFile = output.transcriptFile;
      return output;
    } finally { active--; writeFileSync(join(root, "worker-calls.json"), JSON.stringify(calls, null, 2)); }
  } },
  model: { provider: "manager-fixture", id: "fixture", thinking: "off" },
  maxWorkers: 2, repairLimit: 0,
  onEvent(event) { events.push(event); writeFileSync(join(root, "events.json"), JSON.stringify(events, null, 2)); },
});
const timer = setTimeout(() => { void manager.close(); }, 75000);
try {
  const submitted = manager.submit(["alpha", "beta"].map((id) => ({
    id, repo, branch: `feature/${id}`, task: `Set value.txt to exactly ${id} followed by one newline. Fixture job: ${id}.`,
    acceptance: [`value.txt is exactly ${id} followed by one newline`, "Only value.txt changes, committed on the assigned branch"],
    checks: [{ name: "exact-content-and-scope", command:
      `test "$(cat value.txt)" = ${id} && test "$(wc -l < value.txt | tr -d ' ')" = 1 && test "$(git diff --name-only ${base} HEAD)" = value.txt && test -z "$(git status --porcelain=v1)" && printf 'runtime-check-${id}\\n'` }],
  })));
  assert.equal(submitted[0]!.commonDir, submitted[1]!.commonDir);
  assert.notEqual(submitted[0]!.worktree, submitted[1]!.worktree);
  const jobs = await manager.start();
  writeFileSync(join(root, "jobs.json"), JSON.stringify(jobs, null, 2));
  assert.deepEqual(jobs.map(({ id, status }) => [id, status]), [["alpha", "ready"], ["beta", "ready"]], JSON.stringify(jobs));
  assert.equal(peak, 2, "Two real worker calls overlap within the shared budget");
  assert.equal(calls.length, 6, "Two implementers and four fresh review sessions");
  assert.equal(new Set(calls.map(({ pid }) => pid)).size, 6);
  assert.equal(new Set(calls.map(({ sessionDir }) => sessionDir)).size, 6);
  assert.equal(new Set(calls.map(({ sessionFile }) => sessionFile)).size, 6);
  for (const call of calls) {
    assert(call.sessionFile && existsSync(call.sessionFile), "Real OMP session retained");
    assert(call.transcriptFile && existsSync(call.transcriptFile), "Real RPC transcript retained");
    const frames = readFileSync(call.transcriptFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert(frames.some((frame) => frame.type === "prompt_result" && frame.status === "completed" && frame.agentInvoked === true));
    assert(frames.some((frame) => frame.type === "session_settled"));
    if (call.role !== "implementer") assert(frames.some((frame) => frame.type === "host_tool_call" && frame.toolName === "finish_report"));
  }
  const gates: GateResult[] = [];
  for (const job of jobs) {
    assert.equal(job.attempt, 1);
    assert(job.candidate && job.candidate !== base);
    assert.equal(executeGit(job.worktree, ["symbolic-ref", "--short", "HEAD"]), job.branch);
    assert.equal(executeGit(job.worktree, ["rev-parse", "HEAD"]), job.candidate);
    assert.equal(executeGit(job.worktree, ["status", "--porcelain=v1"]), "");
    assert.equal(executeGit(job.worktree, ["rev-list", "--count", `${base}..HEAD`]), "1");
    assert.equal(readFileSync(join(job.worktree, "value.txt"), "utf8"), `${job.id}\n`);
    const gate: GateResult = JSON.parse(readFileSync(join(root, "state", "results", `${job.id}.json`), "utf8"));
    assert.equal(gate.passed, true);
    assert.equal(gate.revision, job.candidate);
    assert.equal(gate.checks.length, 1);
    const check = gate.checks[0]!;
    assert.equal(check.status, "passed");
    assert.equal(check.exitCode, 0);
    assert.equal(check.revision, job.candidate);
    assert.equal(readFileSync(check.stdoutFile, "utf8"), `runtime-check-${job.id}\n`);
    assert.equal(JSON.parse(readFileSync(check.receiptFile, "utf8")).revision, job.candidate);
    assert.deepEqual(gate.reviews.map(({ axis, status }) => [axis, status]), [["spec", "passed"], ["standards", "passed"]]);
    for (const review of gate.reviews) {
      assert.equal(review.report?.revision, job.candidate);
      assert.equal(review.report?.verdict, "pass");
      assert.deepEqual(review.report?.findings, []);
    }
    gates.push(gate);
  }
  assert.notEqual(jobs[0]!.candidate, jobs[1]!.candidate);
  assert.deepEqual(original(), before, "Original dirty checkout, index and untracked file preserved");
  writeFileSync(join(root, "original-after.json"), JSON.stringify(original(), null, 2));
  const summary = { scope: "Controlled provider pipeline acceptance; does not assess model judgment or skill adoption",
    jobs: jobs.map(({ id, status, branch, candidate, worktree }) => ({ id, status, branch, candidate, worktree })),
    originalPreserved: true, realOmpSessions: calls.length, peakWorkers: peak,
    runtimeChecks: gates.reduce((n, gate) => n + gate.checks.length, 0),
    freshReviews: gates.reduce((n, gate) => n + gate.reviews.length, 0) };
  writeFileSync(join(root, "result.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
} finally {
  clearTimeout(timer);
  await manager.close();
}
