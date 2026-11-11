import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { executeGit } from "./jobs";
import type { Job } from "./types";

export interface ModelSelection {
  provider: string;
  id: string;
  thinking?: string;
}

export type ReviewAxis = "spec" | "standards";
export type ReviewRole = "spec-reviewer" | "technical-reviewer";

/** Structural boundary implemented by the external OMP process adapter. */
export interface QualityWorker {
  run(request: {
    cwd: string;
    model: ModelSelection;
    selectModel?: () => ModelSelection | Promise<ModelSelection>;
    prompt: string;
    sessionDir: string;
    role?: ReviewRole;
    reportSchema?: Record<string, unknown>;
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<{
    text: string;
    report?: unknown;
    sessionFile?: string;
    model: { provider: string; id: string };
    pid?: number;
    promptId?: string;
    stderrFile?: string;
  }>;
}

export interface ReviewReport {
  revision: string;
  verdict: "pass" | "changes_requested";
  findings: {
    severity: "blocking" | "advisory";
    summary: string;
    evidence: string;
    location?: string;
  }[];
}

export interface CheckResult {
  name: string;
  command: string;
  revision: string;
  planHash: string;
  status: "passed" | "failed" | "timed_out" | "cancelled" | "unavailable" | "skipped";
  exitCode: number | null;
  signal: string | null;
  startedAt: string;
  finishedAt: string;
  stdoutFile: string;
  stderrFile: string;
  receiptFile: string;
  processFile?: string;
  failures: string[];
}

export interface ReviewResult {
  axis: ReviewAxis;
  revision: string;
  planHash: string;
  status: "passed" | "failed";
  report?: ReviewReport;
  failures: string[];
  evidenceFile: string;
  sessionFile?: string;
  model?: ModelSelection;
}

export interface GateResult {
  passed: boolean;
  disposition: "passed" | "repair" | "blocked";
  jobId: string;
  revision: string;
  planHash: string;
  base: string;
  branch: string;
  worktree: string;
  commonDir: string;
  checks: CheckResult[];
  reviews: ReviewResult[];
  failures: string[];
  diffFile: string;
  evidence: string[];
  receiptFile: string;
}

export interface QualityGateOptions {
  stateDir: string;
  worker: QualityWorker;
  modelFor: (role: ReviewRole) => ModelSelection | Promise<ModelSelection>;
  timeoutMs?: number;
  signal?: AbortSignal;
  instructions?: string | ((role: string, job: Job) => string | Promise<string>);
}

interface Receipt {
  version: 1;
  result: GateResult;
  artifacts: { path: string; sha256: string }[];
}

/** Durable host-owned process identity; an unsettled record is never a pass. */
export interface CheckProcessRecord {
  version: 1;
  kind: "check";
  role: "check";
  jobId: string;
  cwd: string;
  revision: string;
  planHash: string;
  name: string;
  command: string;
  status: "starting" | "running" | "ended";
  ended: boolean;
  startedAt: string;
  pid?: number;
  pgid?: number;
  stamp?: string;
  endedAt?: string;
  exitCode?: number | null;
  signal?: string | null;
  /** Set by trusted recovery after observing that an interrupted group drained. */
  interrupted?: boolean;
}

function writeProcessRecord(path: string, record: CheckProcessRecord): void {
  const pending = `${path}.${randomUUID()}.tmp`;
  const file = openSync(pending, "wx", 0o600);
  try { writeFileSync(file, JSON.stringify(record, null, 2)); fsyncSync(file); } finally { closeSync(file); }
  renameSync(pending, path);
  const directory = openSync(dirname(path), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function groupAlive(pgid: number): boolean {
  try { process.kill(-pgid, 0); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    return true; // Missing access or an unknown process state is not a drain.
  }
}

const reportSchema: Record<string, unknown> = {
  type: "object", additionalProperties: false,
  required: ["revision", "verdict", "findings"],
  properties: {
    revision: { type: "string" },
    verdict: { type: "string", enum: ["pass", "changes_requested"] },
    findings: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["severity", "summary", "evidence"],
        properties: {
          severity: { type: "string", enum: ["blocking", "advisory"] },
          summary: { type: "string", minLength: 1 },
          evidence: { type: "string", minLength: 1 },
          location: { type: "string", minLength: 1 },
        },
      },
    },
  },
};

const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const planHash = (job: Job): string => digest(JSON.stringify({ task: job.task, acceptance: job.acceptance, checks: job.checks }));
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

function validPlan(job: Job): boolean {
  return nonempty(job.task) && Array.isArray(job.acceptance) && job.acceptance.length > 0 && Array.from(job.acceptance).every(nonempty) &&
    Array.isArray(job.checks) && job.checks.length > 0 && Array.from(job.checks).every((check) => check && nonempty(check.name) && nonempty(check.command));
}

function parseReport(value: unknown, revision: string): ReviewReport {
  const object = (item: unknown): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item);
  const keys = (item: Record<string, unknown>, allowed: string[]) => Object.keys(item).every((key) => allowed.includes(key));
  if (!object(value) || !keys(value, ["revision", "verdict", "findings"]) || value.revision !== revision ||
    (value.verdict !== "pass" && value.verdict !== "changes_requested") || !Array.isArray(value.findings) ||
    !Array.from(value.findings).every((finding) => object(finding) && keys(finding, ["severity", "summary", "evidence", "location"]) &&
      (finding.severity === "blocking" || finding.severity === "advisory") && nonempty(finding.summary) && nonempty(finding.evidence) &&
      (finding.location === undefined || nonempty(finding.location)))) {
    throw new Error("Missing, malformed or wrong-revision finish_report; a complete structured review of the current revision is required.");
  }
  const report = value as unknown as ReviewReport;
  if (report.verdict === "pass" && report.findings.some((finding) => finding.severity === "blocking")) {
    throw new Error("Inconsistent finish_report: pass verdict contains a blocking finding.");
  }
  return report;
}

/** Runtime-issued checks and independent review evidence, bound to actual Git state. */
export class QualityGate {
  private readonly stateDir: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: QualityGateOptions) {
    mkdirSync(options.stateDir, { recursive: true, mode: 0o700 });
    this.stateDir = realpathSync(options.stateDir);
    this.timeoutMs = options.timeoutMs ?? 120_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new Error("Quality timeout must be positive.");
  }

  async verify(job: Job): Promise<GateResult> {
    // Freeze accepted inputs for this run; subsequent plan changes invalidate it.
    const input = structuredClone(job);
    const runDir = join(this.stateDir, randomUUID());
    mkdirSync(runDir, { mode: 0o700 });
    const result: GateResult = {
      passed: false, disposition: "blocked", jobId: input.id, revision: "", planHash: planHash(input),
      base: input.base, branch: input.branch, worktree: input.worktree, commonDir: input.commonDir,
      checks: [], reviews: [], failures: [], diffFile: join(runDir, "candidate.diff"), evidence: [], receiptFile: join(runDir, "gate.json"),
    };
    writeFileSync(result.diffFile, "", { mode: 0o600 });
    let blocked = false;
    if (!validPlan(input)) {
      result.failures.push("Accepted task, acceptance criteria and at least one named nonempty check command are required.");
      blocked = true;
    }
    try { this.assertSettledChecks(input); } catch (error) { result.failures.push(message(error)); blocked = true; }
    try {
      result.revision = executeGit(input.worktree, ["rev-parse", "HEAD"]);
      this.assertGit(input, result.revision);
      writeFileSync(result.diffFile, executeGit(input.worktree, ["diff", "--no-ext-diff", "--no-textconv", "--binary", input.base, result.revision, "--"]));
    } catch (error) {
      result.failures.push(message(error));
      blocked = true;
    }
    if (!blocked) {
      for (const [index, check] of input.checks.entries()) {
        const outcome = await this.runCheck(input, result, check, join(runDir, `check-${index}`));
        result.checks.push(outcome);
        result.failures.push(...outcome.failures);
        if (["timed_out", "cancelled", "unavailable", "skipped"].includes(outcome.status)) { blocked = true; break; }
      }
      const reviews = blocked ? [] : await Promise.all((["spec", "standards"] as const).map((axis) => this.review(input, result, axis, runDir)));
      for (const review of reviews) {
        result.reviews.push(review.result);
        result.failures.push(...review.result.failures);
        blocked ||= review.blocked;
      }
      try { this.assertGit(input, result.revision); } catch (error) {
        result.failures.push(message(error));
        blocked = true;
      }
    }
    if (planHash(job) !== result.planHash) {
      result.failures.push("Accepted task, acceptance criteria or check plan changed during verification.");
      blocked = true;
    }
    result.passed = result.failures.length === 0;
    result.disposition = result.passed ? "passed" : blocked ? "blocked" : "repair";
    const paths = [
      result.diffFile,
      ...result.checks.flatMap((check) => [check.stdoutFile, check.stderrFile, check.receiptFile, ...(check.processFile ? [check.processFile] : [])]),
      ...result.reviews.map((review) => review.evidenceFile),
    ];
    result.evidence = [...paths, result.receiptFile];
    const receipt: Receipt = { version: 1, result, artifacts: paths.map((path) => ({ path, sha256: digest(readFileSync(path)) })) };
    writeFileSync(result.receiptFile, JSON.stringify(receipt, null, 2), { mode: 0o600 });
    return result;
  }

  /** Refuses stale, incomplete, caller-edited or missing runner-issued evidence. */
  assertCurrent(job: Job, result: GateResult): void {
    if (!result || result.passed !== true || result.disposition !== "passed" || !Array.isArray(result.failures) || result.failures.length ||
      !validPlan(job) || result.jobId !== job.id || result.planHash !== planHash(job) || result.base !== job.base ||
      result.branch !== job.branch || result.worktree !== job.worktree || result.commonDir !== job.commonDir || !nonempty(result.revision)) {
      throw new Error("Quality evidence is failed, incomplete or stale for the accepted job and plan.");
    }
    this.assertSettledChecks(job);
    this.assertGit(job, result.revision);
    if (!Array.isArray(result.checks) || result.checks.length !== job.checks.length || !Array.from(result.checks).every((check, index) =>
      check && check.name === job.checks[index]!.name && check.command === job.checks[index]!.command && check.status === "passed" &&
      check.exitCode === 0 && check.signal === null && check.revision === result.revision && check.planHash === result.planHash &&
      Array.isArray(check.failures) && check.failures.length === 0 && nonempty(check.stdoutFile) && nonempty(check.stderrFile) && nonempty(check.receiptFile))) {
      throw new Error("Required passing current check evidence is missing or malformed.");
    }
    if (!Array.isArray(result.reviews) || result.reviews.length !== 2 || !(["spec", "standards"] as const).every((axis) =>
      result.reviews.filter((review) => review?.axis === axis).length === 1 && result.reviews.some((review) => {
        if (review?.axis !== axis || review.status !== "passed" || review.revision !== result.revision || review.planHash !== result.planHash ||
          !Array.isArray(review.failures) || review.failures.length || !nonempty(review.evidenceFile) ||
          !nonempty(review.model?.provider) || !nonempty(review.model?.id)) return false;
        const report = parseReport(review.report, result.revision);
        return report.findings.every((finding) => finding.severity !== "blocking");
      }))) {
      throw new Error("Required passing current Spec and Standards reviews are missing or malformed.");
    }
    const receiptPath = this.ownedEvidence(result.receiptFile);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as Receipt;
    if (receipt.version !== 1 || JSON.stringify(receipt.result) !== JSON.stringify(result) || !Array.isArray(receipt.artifacts)) {
      throw new Error("Quality result differs from its runner-issued receipt.");
    }
    const required = [
      result.diffFile,
      ...result.checks.flatMap((check) => [check.stdoutFile, check.stderrFile, check.receiptFile, ...(check.processFile ? [check.processFile] : [])]),
      ...result.reviews.map((review) => review.evidenceFile),
    ];
    if (JSON.stringify(result.evidence) !== JSON.stringify([...required, result.receiptFile]) ||
      receipt.artifacts.length !== required.length || !receipt.artifacts.every((artifact, index) =>
        artifact.path === required[index] && artifact.sha256 === digest(readFileSync(this.ownedEvidence(artifact.path))))) {
      throw new Error("Required quality evidence is missing or has changed since verification.");
    }
  }

  private ownedEvidence(path: string): string {
    if (!nonempty(path)) throw new Error("Quality evidence path is missing.");
    const actual = realpathSync(path);
    const rel = relative(this.stateDir, actual);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Quality evidence must belong to this gate's state directory.");
    return actual;
  }

  private assertSettledChecks(job: Job): void {
    const directory = join(this.stateDir, "processes", job.id);
    if (!existsSync(directory)) return;
    for (const file of readdirSync(directory)) {
      if (!file.endsWith(".json")) continue;
      try {
        const record = JSON.parse(readFileSync(join(directory, file), "utf8")) as CheckProcessRecord;
        if (record.version !== 1 || record.kind !== "check" || record.role !== "check" || record.jobId !== job.id ||
          record.cwd !== job.worktree || record.ended !== true || record.status !== "ended") throw new Error("unsettled process");
      } catch {
        throw new Error(`Interrupted or unknown check process record ${join(directory, file)} must be reconciled before verification or readiness.`);
      }
    }
  }

  private assertGit(job: Job, revision: string): void {
    if (realpathSync(executeGit(job.worktree, ["rev-parse", "--show-toplevel"])) !== realpathSync(job.worktree) ||
      realpathSync(executeGit(job.worktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"])) !== realpathSync(job.commonDir) ||
      realpathSync(executeGit(job.repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"])) !== realpathSync(job.commonDir)) {
      throw new Error("Quality worktree no longer belongs to the recorded repository.");
    }
    if (executeGit(job.worktree, ["symbolic-ref", "--short", "HEAD"]) !== job.branch) throw new Error("Candidate branch changed or differs from its assignment.");
    if (executeGit(job.worktree, ["rev-parse", "HEAD"]) !== revision || (job.candidate !== undefined && job.candidate !== revision)) {
      throw new Error("Candidate revision changed; fresh checks and reviews are required.");
    }
    if (executeGit(job.worktree, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
      throw new Error("Candidate worktree is dirty or changed during verification; retain the changes and verify a fresh clean candidate.");
    }
  }

  private async runCheck(job: Job, gate: GateResult, check: Job["checks"][number], prefix: string): Promise<CheckResult> {
    const result: CheckResult = {
      ...check, revision: gate.revision, planHash: gate.planHash, status: "unavailable", exitCode: null, signal: null,
      startedAt: new Date().toISOString(), finishedAt: "", stdoutFile: `${prefix}.stdout`, stderrFile: `${prefix}.stderr`,
      receiptFile: `${prefix}.json`, failures: [],
    };
    writeFileSync(result.stdoutFile, "", { mode: 0o600 });
    writeFileSync(result.stderrFile, "", { mode: 0o600 });
    try {
      this.assertGit(job, gate.revision);
      if (this.options.signal?.aborted) {
        result.status = "cancelled";
        result.failures.push(`Check ${check.name} cancelled before execution.`);
      } else {
        const directory = join(this.stateDir, "processes", job.id);
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        result.processFile = join(directory, `${randomUUID()}.json`);
        let record: CheckProcessRecord = {
          version: 1, kind: "check", role: "check", jobId: job.id, cwd: job.worktree,
          revision: gate.revision, planHash: gate.planHash, name: check.name, command: check.command,
          status: "starting", ended: false, startedAt: result.startedAt,
        };
        writeProcessRecord(result.processFile, record);
        await new Promise<void>((resolve) => {
          const stdout = openSync(result.stdoutFile, "a");
          const stderr = openSync(result.stderrFile, "a");
          // No command can run until its identity is durably recorded. EOF from
          // a killed manager exits this wrapper without executing the command.
          const child = spawn("/bin/sh", ["-c", 'IFS= read -r _omp_check_start && [ "$_omp_check_start" = run ] || exit 125\nexec /bin/sh -c "$1"', "omp-quality-check", check.command], {
            cwd: job.worktree, detached: true, stdio: ["pipe", stdout, stderr],
          });
          closeSync(stdout);
          closeSync(stderr);
          let stopReason: "timed_out" | "cancelled" | undefined;
          let journalFailure = false;
          let settled = false;
          const stop = (reason: typeof stopReason) => {
            stopReason = reason;
            if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already settled. */ } }
          };
          const timer = setTimeout(() => stop("timed_out"), this.timeoutMs);
          const abort = () => stop("cancelled");
          this.options.signal?.addEventListener("abort", abort, { once: true });
          if (this.options.signal?.aborted) abort();
          const finish = async (code: number | null, signal: string | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            this.options.signal?.removeEventListener("abort", abort);
            result.exitCode = code;
            result.signal = signal;
            // The shell's exit is not completion when its owned descendants can
            // still write files after the current-revision check.
            let descendants = false;
            if (child.pid) {
              try { process.kill(-child.pid, "SIGKILL"); descendants = true; } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
                  descendants = true;
                  result.failures.push(`Check ${check.name} could not stop its remaining process group: ${message(error)}`);
                }
              }
            }
            if (descendants) result.failures.push(`Check ${check.name} left running descendants after the shell exited; the owned process group was stopped.`);
            // Record completion only after the entire detached group drains.
            for (let count = 0; child.pid && groupAlive(child.pid) && count < 100; count++) await Bun.sleep(10);
            const drained = !child.pid || !groupAlive(child.pid);
            if (!drained) result.failures.push(`Check ${check.name} process group has not drained; its interrupted journal was retained.`);
            result.status = stopReason ?? (journalFailure || !drained || descendants || signal || code === null || code === 126 || code === 127 ? "unavailable" : code === 0 ? "passed" : "failed");
            if (drained) {
              record = { ...record, status: "ended", ended: true, endedAt: new Date().toISOString(), exitCode: code, signal };
              try { writeProcessRecord(result.processFile!, record); } catch (error) {
                result.status = "unavailable";
                result.failures.push(`Check ${check.name} cannot persist its drained outcome: ${message(error)}`);
              }
            }
            if (result.status !== "passed") result.failures.push(`Check ${check.name} ${result.status} (exit ${code}, signal ${signal}); see ${result.stderrFile}.`);
            resolve();
          };
          child.once("error", (error) => {
            journalFailure = true;
            result.failures.push(`Check ${check.name} unavailable: ${message(error)}`);
            void finish(null, null);
          });
          child.once("exit", (code, signal) => { void finish(code, signal); });
          child.stdin?.on("error", (error) => {
            journalFailure = true;
            result.failures.push(`Check ${check.name} could not release its journaled command: ${message(error)}`);
            stop(undefined);
          });
          if (child.pid) {
            try {
              const stamp = Bun.spawnSync(["ps", "-p", String(child.pid), "-o", "lstart="]);
              record = { ...record, status: "running", pid: child.pid, pgid: child.pid, stamp: stamp.exitCode === 0 ? stamp.stdout.toString().trim() : "" };
              writeProcessRecord(result.processFile!, record);
              if (!record.stamp) throw new Error("The owned check process identity could not be observed.");
              if (this.options.signal?.aborted) stop("cancelled");
              else child.stdin?.end("run\n");
            } catch (error) {
              journalFailure = true;
              result.failures.push(`Check ${check.name} cannot persist a usable running identity: ${message(error)}`);
              stop(undefined);
              child.stdin?.end();
            }
          }
        });
      }
      this.assertGit(job, gate.revision);
    } catch (error) {
      result.status = "skipped";
      result.failures.push(`Check ${check.name}: ${message(error)}`);
    }
    result.finishedAt = new Date().toISOString();
    writeFileSync(result.receiptFile, JSON.stringify(result, null, 2), { mode: 0o600 });
    return result;
  }

  private async review(job: Job, gate: GateResult, axis: ReviewAxis, runDir: string): Promise<{ result: ReviewResult; blocked: boolean }> {
    const role = axis === "spec" ? "spec-reviewer" : "technical-reviewer";
    const result: ReviewResult = {
      axis, revision: gate.revision, planHash: gate.planHash, status: "failed", failures: [], evidenceFile: join(runDir, `${axis}.json`),
    };
    let blocked = false;
    let response: unknown;
    const controller = new AbortController();
    const relay = () => controller.abort(this.options.signal?.reason);
    this.options.signal?.addEventListener("abort", relay, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      this.assertGit(job, gate.revision);
      if (this.options.signal?.aborted) throw new Error("Review cancelled before execution.");
      const selectModel = async () => {
        const selected = await this.options.modelFor(role);
        if (!selected || !nonempty(selected.provider) || !nonempty(selected.id)) throw new Error(`No usable local model selection for ${role}.`);
        result.model = { ...selected };
        return { ...selected };
      };
      const model = await selectModel();
      const sessionDir = join(runDir, `${axis}-session`);
      mkdirSync(sessionDir, { mode: 0o700 });
      const guidance = typeof this.options.instructions === "function" ? await this.options.instructions(role, structuredClone(job)) : this.options.instructions;
      const request = this.options.worker.run({
        cwd: job.worktree, model, selectModel, role, sessionDir, reportSchema,
        signal: controller.signal, timeoutMs: this.timeoutMs,
        prompt: [
          `Perform an independent ${axis === "spec" ? "Spec" : "Standards and technical correctness"} review; do not edit files or change Git state.`,
          `Review the actual candidate ${gate.revision} on branch ${job.branch} against recorded base ${job.base}.`,
          `Read the runtime-captured actual diff at ${gate.diffFile}, produced from base ${job.base} to candidate ${gate.revision}. Use read/grep/glob to inspect the relevant actual worktree files and project requirements yourself. Do not rely on an implementer's summary or a check pass.`,
          `Task: ${job.task}`, `Accepted requirements:\n${job.acceptance.map((item) => `- ${item}`).join("\n")}`,
          `Required checks:\n${job.checks.map((item) => `- ${item.name}: ${item.command}`).join("\n")}`,
          axis === "spec" ? "Compare every accepted requirement, omitted behavior, negative cases and scope against the actual result." :
            "Read project standards and review correctness, races, ownership, partial failures and recovery paths. Substantiate each blocking defect or documented-standard violation with a concrete scenario and evidence. Heuristic style preferences alone are advisory.",
          `Call finish_report with revision ${gate.revision}, verdict pass or changes_requested and findings. Every finding needs severity blocking or advisory, summary, evidence and optional location. A pass must have no blocking findings.`,
          guidance ?? "",
        ].filter(Boolean).join("\n\n"),
      });
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error(`Review timed out after ${this.timeoutMs}ms.`)); }, this.timeoutMs);
      });
      const cancelled = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("Review cancelled or timed out; complete current evidence is unavailable.")), { once: true });
      });
      const output = await Promise.race([request, timeout, cancelled]);
      response = output;
      if (output.model?.provider !== result.model?.provider || output.model?.id !== result.model?.id) throw new Error("Reviewer actual model differs from its host-selected dispatch model.");
      const report = parseReport(output.report, gate.revision);
      result.report = report;
      if (output.sessionFile !== undefined) result.sessionFile = output.sessionFile;
      const findings = report.findings.filter((finding) => finding.severity === "blocking");
      result.failures.push(...findings.map((finding) => `${axis}: ${finding.summary}${finding.location ? ` (${finding.location})` : ""}. ${finding.evidence}`));
      result.status = findings.length ? "failed" : "passed";
      this.assertGit(job, gate.revision);
    } catch (error) {
      result.status = "failed";
      result.failures.push(`${axis} review unavailable or invalid: ${message(error)}`);
      blocked = true;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      this.options.signal?.removeEventListener("abort", relay);
    }
    writeFileSync(result.evidenceFile, JSON.stringify({ result, response }, null, 2), { mode: 0o600 });
    return { result, blocked };
  }
}
