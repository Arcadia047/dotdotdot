/** Distinct real native-tool cancellation case; see real-manager-smoke.py. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OmpWorker, WorkerError } from "../rpc";

const root = process.argv[2];
const omp = process.argv[3];
assert(root && omp, "Invoke through real-manager-smoke.py --cancel-native");
const cwd = join(root, "cancel-cwd");
const sessionDir = join(root, "state", "cancellation-session");
mkdirSync(cwd);
const controller = new AbortController();
const worker = new OmpWorker({ command: [omp], inheritEnv: false, env: { ...process.env },
  defaultTimeoutMs: 20000, killGraceMs: 250,
  extraArgs: ["--no-extensions", "--no-skills", "--no-rules", "--no-context-files", "--no-lsp", "--no-pty", "--no-title"],
});
const outcome = worker.run({ cwd, sessionDir, signal: controller.signal, role: "implementer",
  model: { provider: "manager-fixture", id: "fixture", thinking: "off" },
  prompt: "Exercise only the isolated native shell cancellation fixture. Fixture cancellation: native-bash.",
  onSpawn(process) { writeFileSync(join(sessionDir, "process.json"), JSON.stringify(process)); },
}).then((value) => ({ value, error: undefined }), (error: unknown) => ({ value: undefined, error }));
try {
  const deadline = Date.now() + 15000;
  while (!existsSync(join(cwd, "started.txt")) && Date.now() < deadline) await Bun.sleep(20);
  assert.equal(readFileSync(join(cwd, "started.txt"), "utf8"), "started", "The real native shell must have begun executing");
  controller.abort(new Error("Fixture stops a running native shell"));
  const result = await outcome;
  assert(result.error instanceof WorkerError, "Cancelled worker must reject rather than report completion");
  assert.equal(result.error.code, "cancelled");
  // The tool would mutate after three seconds if its subprocess survived shutdown.
  await Bun.sleep(4000);
  assert.equal(existsSync(join(cwd, "late.txt")), false, "Cancelled native shell must not mutate later");
  assert.equal(readFileSync(join(cwd, "started.txt"), "utf8"), "started");
  const artifacts = readdirSync(sessionDir);
  const transcriptFile = artifacts.find((file) => file.endsWith(".stdout.jsonl"));
  const stderrFile = artifacts.find((file) => file.endsWith(".stderr.log"));
  const sessionFile = artifacts.find((file) => file.endsWith(".jsonl") && !file.endsWith(".stdout.jsonl"));
  assert(transcriptFile && stderrFile && sessionFile, "Cancellation must preserve OMP session, RPC transcript and stderr artifacts");
  const frames = readFileSync(join(sessionDir, transcriptFile), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert(frames.some((frame) => frame.type === "ready"));
  assert(frames.some((frame) => frame.type === "response" && frame.command === "prompt" && frame.success === true));
  assert(readFileSync(join(sessionDir, sessionFile), "utf8").includes("started.txt"), "Real session records the native shell command");
  const summary = { scope: "Controlled provider real native-shell cancellation; does not assess model judgment",
    cancelled: true, startedObserved: true, lateMutationPrevented: true, observationMs: 4000,
    transcriptFile: join(sessionDir, transcriptFile), stderrFile: join(sessionDir, stderrFile), sessionFile: join(sessionDir, sessionFile) };
  writeFileSync(join(root, "result.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
} finally {
  controller.abort();
  await outcome;
}
