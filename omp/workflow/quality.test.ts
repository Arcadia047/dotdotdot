import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkRepository } from "./jobs";
import { QualityGate } from "./quality";
import type { GateResult, QualityWorker } from "./quality";

const fixtures: string[] = [];
const stores: WorkRepository[] = [];

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args]);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function fixture(command = "test \"$(cat shared.txt)\" = candidate", change = true) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "omp-quality-test-")));
  fixtures.push(root);
  git(root, "init", "-b", "main", "repo");
  const repo = join(root, "repo");
  git(repo, "config", "user.name", "Fixture");
  git(repo, "config", "user.email", "fixture@localhost");
  writeFileSync(join(repo, "shared.txt"), "original\n");
  git(repo, "add", "shared.txt");
  git(repo, "commit", "-m", "Initial fixture");
  const store = new WorkRepository(join(root, "jobs"));
  stores.push(store);
  const job = store.submit({
    task: "Change shared.txt to candidate",
    repo, branch: "feature/candidate",
    acceptance: ["shared.txt contains candidate"],
    checks: [{ name: "content", command }],
  });
  if (change) {
    writeFileSync(join(job.worktree, "shared.txt"), "candidate\n");
    git(job.worktree, "commit", "-am", "Candidate");
  }
  job.candidate = git(job.worktree, "rev-parse", "HEAD");
  return { root, repo, job, stateDir: join(root, "quality") };
}

const model = { provider: "fixture-provider", id: "local-choice" };
const passingWorker = {
  async run(request: { cwd: string }) {
    return {
      text: "Reviewed the actual candidate", model, pid: 123, promptId: "fixture", stderrFile: "/unused-fixture-stderr",
      report: { revision: git(request.cwd, "rev-parse", "HEAD"), verdict: "pass", findings: [] },
    };
  },
};

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("actual checks and fresh separate reviews permit the exact clean candidate", async () => {
  const { job, stateDir } = fixture("printf 'runner stdout'; printf 'runner stderr' >&2; test \"$(cat shared.txt)\" = candidate");
  const gate = new QualityGate({ stateDir, worker: passingWorker, modelFor: () => model });
  const result = await gate.verify(job);

  expect(result).toMatchObject({ passed: true, disposition: "passed", revision: job.candidate, failures: [] });
  expect(result.checks).toHaveLength(1);
  expect(result.checks[0]!.status).toBe("passed");
  expect(readFileSync(result.checks[0]!.stdoutFile, "utf8")).toBe("runner stdout");
  expect(readFileSync(result.checks[0]!.stderrFile, "utf8")).toBe("runner stderr");
  expect(result.reviews.map((review) => review.axis).sort()).toEqual(["spec", "standards"]);
  expect(() => gate.assertCurrent(job, result)).not.toThrow();
  expect(() => new QualityGate({ stateDir, worker: passingWorker, modelFor: () => model }).assertCurrent(job, result)).not.toThrow();
});

test("a concrete blocking finding requires repair while heuristic style advice alone permits readiness", async () => {
  const { job, stateDir } = fixture();
  const worker: QualityWorker = {
    async run(request) {
      const output = await passingWorker.run(request);
      output.report = {
        revision: job.candidate!, verdict: "changes_requested",
        findings: [{ severity: request.role === "spec-reviewer" ? "blocking" : "advisory", summary: "Known planted omission", evidence: "The fixture omits the explicitly requested failure case." }],
      } as typeof output.report;
      return output;
    },
  };
  const gate = new QualityGate({ stateDir, worker, modelFor: () => model });
  const rejected = await gate.verify(job);
  expect(rejected).toMatchObject({ passed: false, disposition: "repair" });
  expect(rejected.failures.join("\n")).toContain("Known planted omission");
  expect(rejected.reviews.find((review) => review.axis === "standards")!.status).toBe("passed");
  expect(() => gate.assertCurrent(job, rejected)).toThrow();

  const advisory = new QualityGate({ stateDir, worker: {
    async run(request) {
      const output = await passingWorker.run(request);
      return { ...output, report: { ...output.report, verdict: "changes_requested", findings: [{ severity: "advisory", summary: "Prefer another layout", evidence: "A personal style preference only." }] } };
    },
  }, modelFor: () => model });
  const accepted = await advisory.verify(job);
  expect(accepted.passed).toBe(true);
  expect(() => advisory.assertCurrent(job, accepted)).not.toThrow();
});

test("done text, malformed reports, wrong revisions and pass with blocking findings never permit readiness", async () => {
  const { job, stateDir } = fixture();
  const reports: unknown[] = [
    undefined,
    "Everything looks good",
    { verdict: "pass", findings: [] },
    { revision: job.base, verdict: "pass", findings: [] },
    { revision: job.candidate, verdict: "pass", findings: [{ severity: "blocking", summary: "Bug", evidence: "Concrete scenario" }] },
    { revision: job.candidate, verdict: "pass", findings: [{ severity: "advisory", summary: "Vague" }] },
    { revision: job.candidate, verdict: "pass", findings: [], arbitraryPass: true },
    { revision: job.candidate, verdict: "pass", findings: new Array(1) },
  ];
  for (const report of reports) {
    const gate = new QualityGate({ stateDir, worker: {
      async run(request) { return { ...await passingWorker.run(request), text: "done", report }; },
    }, modelFor: () => model });
    const result = await gate.verify(job);
    expect(result).toMatchObject({ passed: false, disposition: "blocked" });
    expect(result.failures.join("\n")).toMatch(/finish_report/);
    expect(() => gate.assertCurrent(job, result)).toThrow();
  }
});

test("a check terminated by a signal is unavailable evidence rather than a code-repair request", async () => {
  const { job, stateDir } = fixture("kill -TERM $$");
  const gate = new QualityGate({ stateDir, worker: passingWorker, modelFor: () => model });
  const result = await gate.verify(job);
  expect(result).toMatchObject({ passed: false, disposition: "blocked" });
  expect(result.checks[0]).toMatchObject({ exitCode: null, signal: "SIGTERM" });
});

test("real nonzero and unchanged-baseline failures remain failures, with captured output for repair", async () => {
  const { job, stateDir } = fixture("printf 'pre-existing failure' >&2; exit 4", false);
  const gate = new QualityGate({ stateDir, worker: passingWorker, modelFor: () => model });
  const result = await gate.verify(job);
  expect(result.disposition).toBe("repair");
  expect(result.passed).toBe(false);
  expect(result.revision).toBe(job.base);
  expect(result.checks[0]).toMatchObject({ status: "failed", exitCode: 4 });
  expect(readFileSync(result.checks[0]!.stderrFile, "utf8")).toBe("pre-existing failure");
  expect(() => gate.assertCurrent(job, result)).toThrow();
});

test("timeouts and unavailable commands prevent readiness without inventing a passing result", async () => {
  for (const [command, status] of [["sleep 5", "timed_out"], ["omp_fixture_nonexistent_command", "unavailable"]] as const) {
    const { job, stateDir } = fixture(command);
    const gate = new QualityGate({ stateDir, worker: passingWorker, modelFor: () => model, timeoutMs: 40 });
    const result = await gate.verify(job);
    expect(result.disposition).toBe("blocked");
    expect(result.passed).toBe(false);
    expect(result.checks[0]!.status).toBe(status);
    expect(() => gate.assertCurrent(job, result)).toThrow();
  }
});

test("missing or empty required check plans are rejected even when reviewers would say pass", async () => {
  const { job, stateDir } = fixture();
  const gate = new QualityGate({ stateDir, worker: passingWorker, modelFor: () => model });
  for (const checks of [undefined, [], new Array(1), [{ name: "empty", command: " " }], [{ name: "", command: "true" }]]) {
    const invalid = { ...job, checks } as typeof job;
    const result = await gate.verify(invalid);
    expect(result.disposition).toBe("blocked");
    expect(result.passed).toBe(false);
    expect(result.failures.join("\n")).toMatch(/check command/);
    expect(() => gate.assertCurrent(invalid, result)).toThrow();
  }
});

test("a previous pass expires when accepted inputs, branch, worktree or committed candidate change", async () => {
  const { job, stateDir } = fixture();
  const gate = new QualityGate({ stateDir, worker: passingWorker, modelFor: () => model });
  const result = await gate.verify(job);
  for (const changed of [
    { ...job, task: "A different task" },
    { ...job, acceptance: ["An additional requirement"] },
    { ...job, checks: [{ name: "content", command: "true" }] },
    { ...job, base: job.candidate! },
  ]) expect(() => gate.assertCurrent(changed, result)).toThrow();

  writeFileSync(join(job.worktree, "untracked.txt"), "unfinished\n");
  expect(() => gate.assertCurrent(job, result)).toThrow(/dirty|changed/);
  rmSync(join(job.worktree, "untracked.txt"));
  git(job.worktree, "checkout", "-b", "feature/other");
  expect(() => gate.assertCurrent(job, result)).toThrow(/branch/);
  git(job.worktree, "checkout", job.branch);
  expect(() => gate.assertCurrent(job, result)).not.toThrow();
  writeFileSync(join(job.worktree, "shared.txt"), "later candidate\n");
  git(job.worktree, "commit", "-am", "Later candidate");
  const currentJob = { ...job, candidate: git(job.worktree, "rev-parse", "HEAD") };
  expect(() => gate.assertCurrent(currentJob, result)).toThrow(/revision|changed/);
});

test("caller-edited results, missing review axes and altered or missing artifacts cannot forge readiness", async () => {
  const { job, stateDir } = fixture();
  const gate = new QualityGate({ stateDir, worker: passingWorker, modelFor: () => model });
  const result = await gate.verify(job);
  const altered: unknown[] = [
    null,
    { passed: true },
    { ...result, checks: [] },
    { ...result, reviews: [result.reviews[0], result.reviews[0]] },
    { ...result, reviews: [] },
    { ...result, evidence: [] },
    { ...result, checks: [{ ...result.checks[0], command: "true" }] },
    { ...result, reviews: result.reviews.map((review) => ({ ...review, report: undefined })) },
  ];
  for (const changed of altered) expect(() => gate.assertCurrent(job, changed as GateResult)).toThrow();
  const stdout = result.checks[0]!.stdoutFile;
  writeFileSync(stdout, "invented passing log");
  expect(() => gate.assertCurrent(job, result)).toThrow(/evidence.*changed/);
  rmSync(stdout);
  expect(() => gate.assertCurrent(job, result)).toThrow();
});

test("check commands that dirty files, commit new code or switch branches cannot validate their mutated candidate", async () => {
  for (const command of [
    "printf 'mutation' > shared.txt",
    "printf 'mutation' > shared.txt; git commit -am 'Unpermitted command mutation'",
    "git checkout -b feature/unpermitted",
  ]) {
    const { job, stateDir } = fixture(command);
    const gate = new QualityGate({ stateDir, worker: passingWorker, modelFor: () => model });
    const result = await gate.verify(job);
    expect(result.passed).toBe(false);
    expect(result.disposition).toBe("blocked");
    expect(result.failures.join("\n")).toMatch(/dirty|revision|branch/);
    expect(() => gate.assertCurrent(job, result)).toThrow();
  }
});

test("a reviewer that modifies the candidate invalidates otherwise passing reports", async () => {
  const { job, stateDir } = fixture();
  const gate = new QualityGate({ stateDir, modelFor: () => model, worker: {
    async run(request) {
      const output = await passingWorker.run(request);
      if (request.role === "technical-reviewer") writeFileSync(join(request.cwd, "shared.txt"), "reviewer mutation\n");
      return output;
    },
  } });
  const result = await gate.verify(job);
  expect(result.disposition).toBe("blocked");
  expect(result.passed).toBe(false);
  expect(result.failures.join("\n")).toMatch(/dirty|changed/);
  expect(readFileSync(join(job.worktree, "shared.txt"), "utf8")).toBe("reviewer mutation\n");
});

test("reviews inspect the same actual revision in separate fresh contexts and inherit role selections", async () => {
  const { job, stateDir } = fixture();
  const requests: Parameters<QualityWorker["run"]>[0][] = [];
  const guidance = "Current run instructions";
  let release!: () => void;
  const bothStarted = new Promise<void>((resolve) => { release = resolve; });
  const gate = new QualityGate({ stateDir, instructions: async (role, input) => `${guidance} for ${role} on ${input.id}`, modelFor: (role) => ({ provider: "local-route", id: role }), worker: {
    async run(request) {
      requests.push(request);
      if (requests.length === 2) release();
      await bothStarted;
      return passingWorker.run(request);
    },
  } });
  const result = await gate.verify(job);
  expect(result.passed).toBe(true);
  expect(readFileSync(result.diffFile, "utf8")).toContain("-original");
  expect(readFileSync(result.diffFile, "utf8")).toContain("+candidate");
  expect(requests.map((request) => request.role).sort()).toEqual(["spec-reviewer", "technical-reviewer"]);
  expect(new Set(requests.map((request) => request.sessionDir)).size).toBe(2);
  for (const request of requests) {
    expect(request.cwd).toBe(job.worktree);
    expect(request.model).toEqual({ provider: "local-route", id: request.role! });
    expect(request.prompt).toContain(result.diffFile);
    expect(request.prompt).toContain(job.base);
    expect(request.prompt).toContain(job.candidate!);
    expect(request.prompt).toContain(job.acceptance[0]!);
    expect(request.prompt).toContain(`${guidance} for ${request.role} on ${job.id}`);
    expect(request.reportSchema).toMatchObject({ required: ["revision", "verdict", "findings"] });
    expect(request.sessionDir.startsWith(job.worktree)).toBe(false);
  }
  expect(requests.find((request) => request.role === "technical-reviewer")!.prompt).toMatch(/partial failures and recovery/);
});

test("model, transport and review-timeout failures are explicit blockers rather than repair instructions", async () => {
  const { job, stateDir } = fixture();
  for (const worker of [
    { async run(): Promise<never> { throw new Error("Provider access unavailable"); } },
    { async run(): Promise<never> { return new Promise(() => {}); } },
  ]) {
    const gate = new QualityGate({ stateDir, worker, modelFor: () => model, timeoutMs: 40 });
    const result = await gate.verify(job);
    expect(result.disposition).toBe("blocked");
    expect(result.passed).toBe(false);
    expect(result.failures.join("\n")).toMatch(/unavailable|timed out/);
  }
  const gate = new QualityGate({ stateDir, worker: passingWorker, modelFor: () => { throw new Error("No selected model"); } });
  const result = await gate.verify(job);
  expect(result.disposition).toBe("blocked");
  expect(result.failures.join("\n")).toContain("No selected model");
});

test("cancellation during already-started reviews cannot become ready even when both workers return pass", async () => {
  const { job, stateDir } = fixture();
  const controller = new AbortController();
  let started = 0;
  let release!: () => void;
  const bothStarted = new Promise<void>((resolve) => { release = resolve; });
  const gate = new QualityGate({ stateDir, signal: controller.signal, modelFor: () => model, worker: {
    async run(request) {
      if (++started === 2) release();
      await bothStarted;
      controller.abort();
      return passingWorker.run(request);
    },
  } });
  const result = await gate.verify(job);
  expect(result.passed).toBe(false);
  expect(result.disposition).toBe("blocked");
  expect(result.failures.join("\n")).toMatch(/cancel/);
});

test("checks cannot report completion while leaving background descendants running", async () => {
  const { job, stateDir } = fixture("sleep 5 & printf '%s' \"$!\"");
  const gate = new QualityGate({ stateDir, worker: passingWorker, modelFor: () => model });
  const result = await gate.verify(job);
  const pid = Number(readFileSync(result.checks[0]!.stdoutFile, "utf8"));
  try {
    expect(result.passed).toBe(false);
    expect(result.disposition).toBe("blocked");
    expect(result.failures.join("\n")).toMatch(/running|descendant/);
  } finally {
    try { process.kill(pid, "SIGKILL"); } catch { /* Gate cleanup should already have stopped it. */ }
  }
});
