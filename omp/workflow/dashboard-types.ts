import type { JobStatus } from "./types";

export type DashboardBucket = "attention" | "active" | "waiting" | "ready" | "archived";
export interface DashboardEvidence {
  available: boolean;
  current: boolean;
  revision?: string;
  branch?: string;
  receiptFile?: string;
  checks: { name: string; status: string; exitCode: number | null }[];
  reviews: { axis: "spec" | "standards"; status: string; verdict?: string }[];
}
export interface DashboardJob {
  id: string;
  title: string;
  task: string;
  repo: string;
  repoName: string;
  branch: string;
  candidate?: string;
  worktree: string;
  status: JobStatus;
  bucket: DashboardBucket;
  phase: string;
  attempt: number;
  kind: "implementation" | "integration";
  dependsOn: string[];
  integrationTarget?: string;
  updatedAt: string;
  archivedAt?: string;
  blocker?: string;
  attention?: { reason: string; nextAction: string };
  canResume: boolean;
  evidence: DashboardEvidence;
  integrationEvidence?: DashboardEvidence;
}
export interface DashboardSnapshot {
  version: 1;
  generatedAt: string;
  profile: string;
  paused: boolean;
  controllerActive: boolean;
  actionError?: string;
  counts: Record<DashboardBucket, number> & { total: number };
  jobs: DashboardJob[];
}
