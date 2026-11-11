import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { Job, JobInput, JobPatch, JobStatus } from "./types";

interface PreparedJob {
  job: Job;
  existingBranch: boolean;
}

/** Execute Git directly, without shell parsing of paths or arguments. */
export function executeGit(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args]);
  if (result.exitCode !== 0) {
    throw new Error(`Git ${args[0]} failed in ${cwd}: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString().trim();
}

/** Local durable jobs and owned Git worktrees. No original checkout is mutated. */
export class WorkRepository {
  private readonly db: Database;
  private readonly stateDir: string;

  constructor(stateDir: string) {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    this.stateDir = realpathSync(stateDir);
    mkdirSync(join(this.stateDir, "worktrees"), { recursive: true, mode: 0o700 });
    this.db = new Database(join(this.stateDir, "jobs.sqlite"), { create: true });
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        common_dir TEXT NOT NULL,
        branch TEXT NOT NULL,
        record TEXT NOT NULL,
        UNIQUE(common_dir, branch)
      );
    `);
  }

  submit(input: JobInput): Job {
    return this.submitMany([input])[0]!;
  }

  /** Validate the whole graph before reserving jobs or creating worktrees. */
  submitMany(inputs: JobInput[]): Job[] {
    const prepared = this.db.transaction(() => {
      const planned = inputs.map((input) => this.prepare(input));
      const jobs = new Map(this.list().map((job) => [job.id, job]));
      const branches = new Set<string>();
      for (const { job } of planned) {
        if (jobs.has(job.id)) throw new Error(`Job ID ${job.id} already exists in this batch; choose unique IDs.`);
        const claim = JSON.stringify([job.commonDir, job.branch]);
        if (branches.has(claim)) throw new Error(`Branch ${job.branch} has multiple jobs in this batch; choose separate branches.`);
        branches.add(claim);
        jobs.set(job.id, job);
      }
      for (const { job } of planned) {
        for (const dependency of job.dependsOn) {
          if (!jobs.has(dependency)) throw new Error(`Unknown dependency ${dependency} for job ${job.id}; submit it in this batch or use an existing job ID.`);
        }
        if (job.integrationTarget !== undefined) {
          if (job.kind === "integration") throw new Error(`Integration job ${job.id} cannot have an integration target.`);
          const target = jobs.get(job.integrationTarget);
          if (!target) throw new Error(`Unknown integration target ${job.integrationTarget} for job ${job.id}; submit the integration job in this batch or use an existing job ID.`);
          if (target.kind !== "integration") throw new Error(`Integration target ${target.id} must be an integration job.`);
          if (target.commonDir !== job.commonDir) throw new Error(`Integration target ${target.id} must use the same repository as job ${job.id}.`);
          if (!target.dependsOn.includes(job.id)) throw new Error(`Integration target ${target.id} must depend on child job ${job.id}; submit the complete group together.`);
        }
      }
      const complete = new Set<string>();
      const visiting: string[] = [];
      const visit = (id: string): void => {
        if (complete.has(id)) return;
        if (visiting.includes(id)) {
          throw new Error(`Dependency cycle: ${[...visiting.slice(visiting.indexOf(id)), id].join(" -> ")}. Remove a dependency edge.`);
        }
        visiting.push(id);
        for (const dependency of jobs.get(id)!.dependsOn) visit(dependency);
        visiting.pop();
        complete.add(id);
      };
      for (const id of jobs.keys()) visit(id);
      for (const { job } of planned) {
        this.db.query("INSERT INTO jobs (id, common_dir, branch, record) VALUES (?, ?, ?, ?)")
          .run(job.id, job.commonDir, job.branch, JSON.stringify(job));
      }
      return planned;
    }).immediate();

    // Reservation is durable before Git runs. A crash leaves an interrupted job
    // whose owned path can be reconciled, rather than an unrecorded worktree.
    for (const { job, existingBranch } of prepared) {
      try {
        executeGit(job.repo, existingBranch
          ? ["worktree", "add", job.worktree, job.branch]
          : ["worktree", "add", "--no-track", "-b", job.branch, job.worktree, job.base]);
        if (executeGit(job.worktree, ["rev-parse", "HEAD"]) !== job.base ||
          executeGit(job.worktree, ["symbolic-ref", "--short", "HEAD"]) !== job.branch ||
          executeGit(job.worktree, ["status", "--porcelain=v1"]) !== "") {
          throw new Error("New worktree does not match its recorded clean branch and base.");
        }
        job.status = "queued";
        delete job.blocker;
        this.save(job);
      } catch (error) {
        job.status = "blocked";
        job.blocker = `Worktree allocation failed: ${error instanceof Error ? error.message : String(error)}. Inspect job ${job.id} and ${job.worktree} before retrying; existing artifacts were retained.`;
        this.save(job);
        throw new Error(job.blocker);
      }
    }
    return prepared.map(({ job }) => this.get(job.id)!);
  }

  private prepare(input: JobInput): PreparedJob {
    const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
    if (input.kind !== undefined && input.kind !== "implementation" && input.kind !== "integration") {
      throw new Error("Job kind must be implementation or integration.");
    }
    if (!nonempty(input.task)) throw new Error("Job task must describe the scoped work.");
    if (!Array.isArray(input.acceptance) || input.acceptance.length === 0 || !input.acceptance.every(nonempty)) {
      throw new Error("Job acceptance must contain at least one nonempty criterion.");
    }
    if (!Array.isArray(input.checks) || input.checks.length === 0 || !input.checks.every((check) => check && nonempty(check.name) && nonempty(check.command))) {
      throw new Error("Job checks must contain at least one named, nonempty command.");
    }
    if (input.dependsOn !== undefined && (!Array.isArray(input.dependsOn) || !input.dependsOn.every(nonempty))) {
      throw new Error("Job dependencies must be a list of job IDs.");
    }
    if (!nonempty(input.branch) || input.branch.startsWith("refs/") || input.branch.includes("@{") ||
      Bun.spawnSync(["git", "check-ref-format", "--branch", input.branch]).exitCode !== 0) {
      throw new Error("Job branch must be an explicit valid local branch name, without refs/ prefixes or checkout shorthand.");
    }
    const id = input.id ?? randomUUID();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) {
      throw new Error("Job ID must be 1–128 letters, digits, dots, underscores or hyphens, beginning with a letter or digit.");
    }
    if (this.get(id)) throw new Error(`Job ID ${id} already exists; inspect it or choose a unique ID.`);
    const repo = realpathSync(executeGit(input.repo, ["rev-parse", "--show-toplevel"]));
    const commonDir = realpathSync(executeGit(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
    const conflict = this.db.query("SELECT id FROM jobs WHERE common_dir = ? AND branch = ?")
      .get(commonDir, input.branch) as { id: string } | null;
    if (conflict) {
      throw new Error(`Branch ${input.branch} is already managed by job ${conflict.id}; inspect that job or choose another branch.`);
    }
    const branchRef = `refs/heads/${input.branch}`;
    for (const entry of executeGit(repo, ["worktree", "list", "--porcelain", "-z"]).split("\0\0")) {
      const fields = entry.split("\0");
      if (fields.includes(`branch ${branchRef}`)) {
        const occupied = fields.find((field) => field.startsWith("worktree "))?.slice(9);
        throw new Error(`Branch ${input.branch} is already checked out in worktree ${occupied}; use another branch or reconcile that checkout first.`);
      }
    }
    const existingBranch = Bun.spawnSync(["git", "-C", repo, "show-ref", "--verify", "--quiet", branchRef]).exitCode === 0;
    const base = executeGit(repo, ["rev-parse", "--verify", "--end-of-options", `${input.base ?? (existingBranch ? branchRef : "HEAD")}^{commit}`]);
    if (existingBranch && executeGit(repo, ["rev-parse", branchRef]) !== base) {
      throw new Error(`Base ${base} differs from existing branch ${input.branch} tip; choose its tip as the base or use a new branch.`);
    }
    const now = new Date().toISOString();
    const job: Job = {
      id,
      kind: input.kind ?? "implementation",
      task: input.task,
      repo,
      commonDir,
      branch: input.branch,
      base,
      worktree: join(this.stateDir, "worktrees", id),
      acceptance: input.acceptance,
      checks: input.checks,
      dependsOn: input.dependsOn ?? [],
      integrationTarget: input.integrationTarget,
      status: "interrupted",
      blocker: "Worktree allocation pending; reconcile the recorded owned path before resuming.",
      attempt: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (existsSync(job.worktree)) throw new Error(`Owned worktree path ${job.worktree} already exists; inspect and reconcile it before submitting this job ID.`);
    return { job, existingBranch };
  }

  private save(job: Job): void {
    job.updatedAt = new Date().toISOString();
    this.db.query("UPDATE jobs SET record = ? WHERE id = ?").run(JSON.stringify(job), job.id);
  }

  get(id: string): Job | undefined {
    const row = this.db.query("SELECT record FROM jobs WHERE id = ?").get(id) as { record: string } | null;
    return row ? JSON.parse(row.record) : undefined;
  }

  list(): Job[] {
    return (this.db.query("SELECT record FROM jobs ORDER BY rowid").all() as { record: string }[])
      .map((row) => JSON.parse(row.record));
  }

  /** Trusted host runtime only. Readiness enforcement belongs to the manager. */
  update(id: string, patch: JobPatch): Job {
    const fields = new Set(["status", "attempt", "candidate", "owner", "blocker"]);
    for (const key of Object.keys(patch)) {
      if (!fields.has(key)) throw new Error(`Job field ${key} cannot be changed through a runtime update.`);
    }
    const statuses: JobStatus[] = ["queued", "running", "checking", "reviewing", "integrating", "ready", "blocked", "paused", "interrupted"];
    if (patch.status !== undefined && !statuses.includes(patch.status)) throw new Error(`Unknown job status ${patch.status}.`);
    if (patch.attempt !== undefined && (!Number.isSafeInteger(patch.attempt) || patch.attempt < 0)) {
      throw new Error("Job attempt must be a nonnegative integer.");
    }
    return this.change(id, (job) => Object.assign(job, patch));
  }

  /** Claim an exclusive host operation; this does not launch a worker. */
  claim(id: string, owner: string): Job {
    if (typeof owner !== "string" || !owner.trim()) throw new Error("An operation claim requires a nonempty owner.");
    return this.change(id, (job) => {
      if (job.owner && job.owner !== owner) throw new Error(`Job ${id} is claimed by ${job.owner}; reconcile that owner before retrying.`);
      job.owner = owner;
    });
  }

  release(id: string, owner: string): Job {
    return this.change(id, (job) => {
      if (job.owner && job.owner !== owner) throw new Error(`Job ${id} is claimed by ${job.owner}; ${owner} cannot release it.`);
      delete job.owner;
    });
  }

  private change(id: string, apply: (job: Job) => void): Job {
    return this.db.transaction(() => {
      const job = this.get(id);
      if (!job) throw new Error(`Unknown job ${id}; inspect the local job list.`);
      apply(job);
      this.save(job);
      return this.get(id)!;
    }).immediate();
  }

  close(): void {
    this.db.close();
  }
}
