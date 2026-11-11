import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { DashboardBucket, DashboardJob, DashboardSnapshot } from "./dashboard-types";
import type { WorkManager } from "./manager";
import type { Job } from "./types";

export interface DashboardServer { url: string; close(): Promise<void> }
interface DashboardOptions { manager: WorkManager; stateDir: string; profile?: string; assetsDir?: string }

function needsRecovery(job: Job, controllerActive: boolean): boolean {
  return !controllerActive && ["running", "checking", "reviewing", "integrating"].includes(job.status);
}
export function dashboardBucket(job: Job, controllerActive = true): DashboardBucket {
  if (job.archivedAt) return "archived";
  if (needsRecovery(job, controllerActive)) return "attention";
  if (job.blocker?.startsWith("Blocked by dependency:")) return "waiting";
  if (["blocked", "interrupted"].includes(job.status)) return "attention";
  if (job.status === "ready") return "ready";
  return ["running", "checking", "reviewing", "integrating"].includes(job.status) ? "active" : "waiting";
}
function attention(job: Job, recovery: boolean): NonNullable<DashboardJob["attention"]> {
  if (recovery) return { reason: "Manager stopped before completion", nextAction: "Resume this job to reconcile its retained work through the existing recovery guards." };
  const blocker = job.blocker ?? "Work was interrupted before completion.";
  if (/model.*unavailable|available selected model|selected model.*unavailable/i.test(blocker)) return { reason: "Selected model unavailable", nextAction: "Choose an available role model in OMP, then resume this job." };
  if (/skills|SKILL\.md|source checkout/i.test(blocker)) return { reason: "Work skills need setup", nextAction: "Inspect /work skills status in OMP and complete explicit skills setup, then resume." };
  if (/Repair budget exhausted/i.test(blocker)) return { reason: "Repair budget exhausted", nextAction: "Inspect the validation details and provide a corrected candidate or revise the local repair budget." };
  if (/process group|process intent|process record|process.*still exists/i.test(blocker)) return { reason: "Owned process needs reconciliation", nextAction: "Inspect the recorded local process and wait for it to stop before resuming." };
  if (/uncommitted|ignored|unaccounted|assigned repository|replaced|moved unexpectedly/i.test(blocker)) return { reason: "Local work needs reconciliation", nextAction: "Inspect and preserve the workspace changes, then explicitly resume when reconciled." };
  if (/Ready evidence expired/i.test(blocker)) return { reason: "Ready evidence expired", nextAction: "Inspect the candidate and validation details, then resume to obtain fresh evidence." };
  return { reason: blocker.split("\n")[0]!.replace(/\s+/g, " ").slice(0, 140), nextAction: "Inspect the blocker and local evidence, resolve it, then explicitly resume this job." };
}
function evidence(job: Job, stateDir: string, integration = false): DashboardJob["evidence"] {
  const unavailable = { available: false, current: false, checks: [], reviews: [] };
  try {
    const result = JSON.parse(readFileSync(join(stateDir, "results", `${job.id}${integration ? "-integration" : ""}.json`), "utf8"));
    if (result?.jobId !== job.id || typeof result.revision !== "string" || typeof result.branch !== "string" || !Array.isArray(result.checks) || !Array.isArray(result.reviews)) return unavailable;
    if (!result.checks.every((check: any) => typeof check?.name === "string" && typeof check.status === "string" && (check.exitCode === null || Number.isInteger(check.exitCode))) ||
      !result.reviews.every((review: any) => ["spec", "standards"].includes(review?.axis) && typeof review.status === "string")) return unavailable;
    return { available: true, current: !integration && job.status === "ready" && !job.archivedAt && job.candidate === result.revision && job.branch === result.branch, revision: result.revision, branch: result.branch,
      receiptFile: typeof result.receiptFile === "string" ? result.receiptFile : undefined,
      checks: result.checks.map((check: any) => ({ name: check.name, status: check.status, exitCode: check.exitCode })),
      reviews: result.reviews.map((review: any) => ({ axis: review.axis, status: review.status, verdict: typeof review.report?.verdict === "string" ? review.report.verdict : undefined })) };
  } catch { return unavailable; }
}
function snapshot(options: DashboardOptions): DashboardSnapshot {
  // status() rechecks ready receipts and demotes expired evidence through the manager.
  const status = options.manager.status();
  const jobs: DashboardJob[] = status.jobs.map((job) => {
    const group = dashboardBucket(job, status.controllerActive);
    const recovery = needsRecovery(job, status.controllerActive);
    return { id: job.id, title: job.task.split("\n")[0]!.replace(/\s+/g, " ").slice(0, 120), task: job.task, repo: job.repo, repoName: basename(job.repo),
      branch: job.branch, candidate: job.candidate, worktree: job.worktree, status: job.status, bucket: group, phase: recovery ? "recovery" : job.status,
      attempt: job.attempt, kind: job.kind, dependsOn: job.dependsOn, integrationTarget: job.integrationTarget, updatedAt: job.updatedAt, archivedAt: job.archivedAt,
      blocker: job.blocker, attention: group === "attention" ? attention(job, recovery) : undefined, canResume: group === "attention", evidence: evidence(job, options.stateDir),
      integrationEvidence: job.integrationTarget ? evidence(job, options.stateDir, true) : undefined };
  });
  const counts: DashboardSnapshot["counts"] = { attention: 0, active: 0, waiting: 0, ready: 0, archived: 0, total: jobs.length };
  for (const job of jobs) counts[job.bucket]++;
  return { version: 1, generatedAt: new Date().toISOString(), profile: options.profile ?? "default", paused: status.paused, controllerActive: status.controllerActive, counts, jobs };
}

/** Opt-in browser access to the existing session's manager, never a controller. */
export function startDashboard(options: DashboardOptions): DashboardServer {
  const token = randomBytes(32).toString("hex");
  let actionError: string | undefined;
  const assetsDir = options.assetsDir ?? join(import.meta.dir, "dashboard");
  const assets: Record<string, { file: string; type: string }> = {
    "/": { file: "index.html", type: "text/html; charset=utf-8" },
    "/app.css": { file: "app.css", type: "text/css; charset=utf-8" },
    "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
    "/fonts/IBMPlexSans-Regular.woff2": { file: "fonts/IBMPlexSans-Regular.woff2", type: "font/woff2" },
    "/fonts/IBMPlexSans-Medium.woff2": { file: "fonts/IBMPlexSans-Medium.woff2", type: "font/woff2" },
    "/fonts/IBMPlexSans-SemiBold.woff2": { file: "fonts/IBMPlexSans-SemiBold.woff2", type: "font/woff2" },
    "/fonts/IBMPlexMono-Regular.woff2": { file: "fonts/IBMPlexMono-Regular.woff2", type: "font/woff2" },
  };
  const headers = {
    "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'",
  };
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0, development: false, maxRequestBodySize: 4096,
    async fetch(request) {
      const origin = `http://127.0.0.1:${server.port}`;
      if (request.headers.get("host") !== `127.0.0.1:${server.port}` || (request.headers.has("origin") && request.headers.get("origin") !== origin)) return json({ error: "Foreign host or origin rejected." }, 403);
      const url = new URL(request.url);
      if (url.search) return json({ error: "Query parameters are not supported." }, 400);
      if (url.pathname === "/favicon.ico" && request.method === "GET") return new Response(null, { status: 204, headers });
      if (url.pathname === "/api/status" || url.pathname === "/api/control") {
        if (request.headers.get("authorization") !== `Bearer ${token}`) return json({ error: "Dashboard capability required." }, 401);
        if (url.pathname === "/api/status") {
          if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
          return json({ ...snapshot(options), ...(actionError ? { actionError } : {}) });
        }
        if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
        if (request.headers.get("origin") !== origin) return json({ error: "A same-origin browser request is required." }, 403);
        if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return json({ error: "JSON control request required." }, 400);
        let body;
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON control request." }, 400); }
        if (!body || typeof body !== "object" || Array.isArray(body) || !["pause", "resume"].includes(body.action) ||
          Object.keys(body).some((key) => !["action", "id"].includes(key)) ||
          (Object.hasOwn(body, "id") && (body.action !== "resume" || typeof body.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(body.id)))) return json({ error: "Use pause or resume with an optional resume job ID only." }, 400);
        try {
          if (body.id) {
            const status = options.manager.status();
            const job = status.jobs.find((job) => job.id === body.id);
            if (!job || dashboardBucket(job, status.controllerActive) !== "attention") return json({ error: "Only a job needing attention can be resumed individually." }, 409);
          }
          actionError = undefined;
          if (body.action === "pause") options.manager.pause();
          else {
            // Resume includes potentially long worker execution. Acceptance does
            // not mean completion; later failures remain visible in live status.
            let immediateError: string | undefined;
            const resumed = options.manager.resume(body.id).catch((error) => {
              actionError = immediateError = error instanceof Error ? error.message : String(error);
            });
            await Promise.race([resumed, Bun.sleep(0)]);
            if (immediateError) return json({ error: immediateError }, 409);
          }
          return json({ accepted: true }, 202);
        } catch (error) {
          actionError = error instanceof Error ? error.message : String(error);
          return json({ error: actionError }, 409);
        }
      }
      const asset = Object.hasOwn(assets, url.pathname) ? assets[url.pathname] : undefined;
      if (!asset) return json({ error: "Not found." }, 404);
      if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
      try { return new Response(readFileSync(join(assetsDir, asset.file)), { headers: { ...headers, "Content-Type": asset.type } }); }
      catch { return json({ error: "Dashboard asset unavailable." }, 404); }
    },
    error: () => json({ error: "Dashboard status is unavailable. Inspect the managing OMP session." }, 500),
  });
  return { url: `http://127.0.0.1:${server.port}/#token=${token}`, close: () => server.stop(true) };
}
