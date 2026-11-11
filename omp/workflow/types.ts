export type JobStatus =
  | "queued"
  | "running"
  | "checking"
  | "reviewing"
  | "integrating"
  | "ready"
  | "blocked"
  | "paused"
  | "interrupted";

export interface CheckPlan {
  name: string;
  command: string;
}

export interface JobInput {
  /** Optional stable ID, allowing dependencies within a submitted batch. */
  id?: string;
  kind?: "implementation" | "integration";
  task: string;
  repo: string;
  branch: string;
  base?: string;
  acceptance: string[];
  checks: CheckPlan[];
  dependsOn?: string[];
  integrationTarget?: string;
}

export interface Job {
  id: string;
  kind: "implementation" | "integration";
  task: string;
  repo: string;
  commonDir: string;
  branch: string;
  /** Resolved committed starting revision, never a moving ref. */
  base: string;
  worktree: string;
  acceptance: string[];
  checks: CheckPlan[];
  dependsOn: string[];
  integrationTarget?: string;
  status: JobStatus;
  attempt: number;
  candidate?: string;
  owner?: string;
  blocker?: string;
  createdAt: string;
  updatedAt: string;
}

/** Host runtime metadata; this interface must not be exposed as an agent tool. */
export type JobPatch = Partial<
  Pick<Job, "status" | "attempt" | "candidate" | "owner" | "blocker">
>;
