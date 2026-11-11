import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OmpWorker, WorkerError } from "./rpc";

const roots: string[] = [];
function fixture(scenario = "success") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "omp-rpc-test-")));
  roots.push(root);
  const worker = new OmpWorker({ command: [process.execPath, join(import.meta.dir, "fixtures/rpc-worker.ts")],
    env: { RPC_FIXTURE_SCENARIO: scenario }, defaultTimeoutMs: 1000, killGraceMs: 50 });
  return { root, worker, request: { cwd: root, model: { provider: "host-route", id: "chosen/model", thinking: "high" },
    prompt: "Complete the assignment", sessionDir: join(root, "sessions") } };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test("runs in the assigned directory with the exact host model and returns only after correlated settlement", async () => {
  const { root, worker, request } = fixture();
  const result = await worker.run(request);
  const observed = JSON.parse(result.text);
  expect(observed.cwd).toBe(root);
  expect(observed.args).toContain("host-route/chosen/model");
  expect(observed.args).toContain("high");
  expect(observed.args).toContain(request.sessionDir);
  expect(observed.args).not.toContain("--no-extensions");
  expect(observed.child).toBe("1");
  expect(observed.stateCount).toBe(2);
  expect(result.model).toEqual({ provider: "host-route", id: "chosen/model" });
  expect(result.sessionFile).toBe(join(request.sessionDir, "session.jsonl"));
});

test("refuses a settled event when the final state still has compaction work", async () => {
  const { worker, request } = fixture("compacting");
  await expect(worker.run(request)).rejects.toThrow(/quiet and settled/);
});

test("captures an essential structured report and answers the host request identity before completing", async () => {
  const { worker, request } = fixture("report");
  const result = await worker.run({ ...request, role: "spec-review", reportSchema: { type: "object", properties: { verdict: { type: "string" }, findings: { type: "array", items: { type: "string" } } }, required: ["verdict", "findings"], additionalProperties: false } });
  expect(result.report).toEqual({ verdict: "blocked", findings: ["Planted defect"] });
  const observed = JSON.parse(result.text);
  expect(observed.reportRegistered).toBe(true);
  const enabled = observed.args[observed.args.indexOf("--tools") + 1].split(",");
  expect(enabled).toContain("read");
  for (const tool of ["write", "edit", "bash", "task", "eval"]) expect(enabled).not.toContain(tool);
});

test.each(["ack-only", "early-settled", "report-only", "no-ready"])("%s cannot substitute for a complete correlated lifecycle", async (scenario) => {
  const { worker, request } = fixture(scenario);
  await expect(worker.run({ ...request, timeoutMs: 150, reportSchema: { type: "object" } })).rejects.toThrow(/deadline/);
});

test.each(["aborted", "error", "late-error", "wrong-model", "changed-model", "busy", "exit", "bad-json", "chunk"])("%s fails honestly", async (scenario) => {
  const { worker, request } = fixture(scenario);
  try { await worker.run(request); throw new Error("Expected worker rejection"); }
  catch (error) {
    expect(error).toBeInstanceOf(WorkerError);
    expect((error as WorkerError).code).not.toBe("timeout");
    if (scenario === "exit") expect(readFileSync((error as WorkerError).stderrFile!, "utf8")).toContain("Fixture startup failed");
  }
});

test("cancelling a worker terminates its owned process tree and preserves stderr", async () => {
  const { worker, request } = fixture("tree");
  const abort = new AbortController();
  const run = worker.run({ ...request, signal: abort.signal, timeoutMs: 1000, onSpawn: () => { setTimeout(() => abort.abort(), 150); } });
  let error: WorkerError;
  try { await run; throw new Error("Expected cancellation"); } catch (caught) { error = caught as WorkerError; }
  expect(error.code).toBe("cancelled");
  const descendant = Number(readFileSync(error.stderrFile!, "utf8").match(/grandchild:(\d+)/)?.[1]);
  expect(descendant).toBeGreaterThan(0);
  await Bun.sleep(50);
  expect(() => process.kill(descendant, 0)).toThrow();
});
