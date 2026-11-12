import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startDashboard, type DashboardServer } from "./dashboard";
import { WorkManager, type WorkerClient } from "./manager";
import { executeGit } from "./jobs";

const roots: string[] = [];
const managers: WorkManager[] = [];
const dashboards: DashboardServer[] = [];
function fixture(worker: WorkerClient = { async run(): Promise<never> { throw new Error("Unexpected worker"); } }, maxWorkers = 2) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "omp-dashboard-test-"))); roots.push(root);
  const stateDir = join(root, "state");
  const assetsDir = join(root, "assets"); mkdirSync(assetsDir);
  writeFileSync(join(assetsDir, "index.html"), "<!doctype html><title>Local work</title>");
  writeFileSync(join(assetsDir, "app.css"), "body { color: black }");
  writeFileSync(join(assetsDir, "app.js"), "console.log('local work')");
  const manager = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" }, repairLimit: 0, maxWorkers });
  managers.push(manager);
  const dashboard = startDashboard({ manager, stateDir, assetsDir, profile: "fixture" }); dashboards.push(dashboard);
  const url = new URL(dashboard.url);
  const headers = { Authorization: `Bearer ${new URLSearchParams(url.hash.slice(1)).get("token")}` };
  return { root, stateDir, manager, dashboard, url, headers };
}
function repository(root: string) {
  executeGit(root, ["init", "-b", "main", "repo"]);
  const repo = join(root, "repo");
  executeGit(repo, ["config", "user.name", "Fixture"]); executeGit(repo, ["config", "user.email", "fixture@example.invalid"]);
  writeFileSync(join(repo, "value"), "original\n"); executeGit(repo, ["add", "."]); executeGit(repo, ["commit", "-m", "Base"]);
  return repo;
}
afterEach(async () => {
  for (const dashboard of dashboards.splice(0)) await dashboard.close();
  for (const manager of managers.splice(0)) await manager.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("the loopback browser receives the real empty profile only with its start capability", async () => {
  const { url, headers } = fixture();
  expect(url.hostname).toBe("127.0.0.1");
  expect(url.port).not.toBe("0");
  expect(url.search).toBe("");
  expect((await fetch(new URL("/api/status", url))).status).toBe(401);
  const response = await fetch(new URL("/api/status", url), { headers });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ version: 1, profile: "fixture", paused: false, counts: { attention: 0, active: 0, waiting: 0, ready: 0, archived: 0, total: 0 }, jobs: [] });
});

test("the browser separates dependency waiting from attention and labels retained validation honestly", async () => {
  const blocker = `No available selected model for implementer.\n${"<script>long untrusted detail</script>".repeat(100)}`;
  const { root, manager, url, headers } = fixture({ async run(request) {
    if (request.prompt.includes("job blocked.")) throw new Error(blocker);
    if (request.role === "implementer") { writeFileSync(join(request.cwd, "value"), "candidate\n"); executeGit(request.cwd, ["commit", "-am", "Candidate"]); }
    return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
  } });
  const repo = repository(root);
  const input = (id: string, dependsOn: string[] = []) => ({ id, repo, branch: `feature/${id}`, task: `Accepted task for ${id}`, acceptance: ["Value changed"], checks: [{ name: "value", command: "test -f value" }], dependsOn });
  manager.submit([input("archived"), input("ready"), input("blocked"), input("dependent", ["blocked"])]);
  await manager.start();
  manager.cleanup("archived");
  manager.submit([input("queued")]);
  const snapshot = await (await fetch(new URL("/api/status", url), { headers })).json();
  expect(snapshot.counts).toEqual({ attention: 1, active: 0, waiting: 2, ready: 1, archived: 1, total: 5 });
  const job = (id: string) => snapshot.jobs.find((job: { id: string }) => job.id === id);
  expect(job("blocked")).toMatchObject({ bucket: "attention", blocker, canResume: true, attention: { reason: "Selected model unavailable", nextAction: "Choose an available role model in OMP, then resume this job." }, evidence: { available: false, current: false, checks: [], reviews: [] } });
  expect(job("dependent")).toMatchObject({ bucket: "waiting", canResume: false });
  expect(job("dependent").attention).toBeUndefined();
  expect(job("ready")).toMatchObject({ repo, repoName: "repo", branch: "feature/ready", task: "Accepted task for ready", evidence: { available: true, current: true, checks: [{ name: "value", status: "passed", exitCode: 0 }], reviews: [{ axis: "spec", status: "passed", verdict: "pass" }, { axis: "standards", status: "passed", verdict: "pass" }] } });
  expect(job("archived")).toMatchObject({ bucket: "archived", canResume: false, evidence: { available: true, current: false } });
  const ready = manager.status().jobs.find((job) => job.id === "ready")!;
  writeFileSync(join(ready.worktree, "value"), "later change\n");
  const changed = await (await fetch(new URL("/api/status", url), { headers })).json();
  expect(changed.jobs.find((job: { id: string }) => job.id === "ready")).toMatchObject({ status: "interrupted", bucket: "attention", evidence: { available: true, current: false } });
});

test("the browser retains passing branch validation alongside a failed integration attempt", async () => {
  const { root, manager, url, headers } = fixture({ async run(request) {
    if (request.role === "implementer") {
      writeFileSync(join(request.cwd, "child.txt"), "child\n");
      executeGit(request.cwd, ["add", "."]); executeGit(request.cwd, ["commit", "-m", "Child"]);
    }
    return { text: "Controlled result", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
  } });
  const repo = repository(root);
  manager.submit([
    { id: "feature", kind: "integration", repo, branch: "feature/all", task: "Deliver the combined child", acceptance: ["Child exists"], checks: [{ name: "Combined behavior", command: "test -f child.txt" }], dependsOn: ["child"] },
    { id: "child", repo, branch: "feature/child", task: "Implement the child", acceptance: ["Child works standalone and integrated"], checks: [{ name: "Context behavior", command: 'test -f child.txt && test "$(basename "$PWD")" != feature' }], integrationTarget: "feature" },
  ]);
  const pending = await (await fetch(new URL("/api/status", url), { headers })).json();
  await manager.start();
  const snapshot = await (await fetch(new URL("/api/status", url), { headers })).json();
  const child = snapshot.jobs.find((job: { id: string }) => job.id === "child");
  expect(child).toMatchObject({ status: "blocked", bucket: "attention", evidence: {
    available: true, current: false, branch: "feature/child", revision: child.candidate,
    checks: [{ name: "Context behavior", status: "passed", exitCode: 0 }],
    reviews: [{ axis: "spec", status: "passed", verdict: "pass" }, { axis: "standards", status: "passed", verdict: "pass" }],
  }, integrationEvidence: {
    available: true, current: false, branch: "feature/all",
    checks: [{ name: "Context behavior", status: "failed", exitCode: 1 }],
    reviews: [{ axis: "spec", status: "passed", verdict: "pass" }, { axis: "standards", status: "passed", verdict: "pass" }],
  } });
  expect(child.integrationEvidence.revision).toBe(executeGit(repo, ["rev-parse", "feature/all"]));
  expect(child.integrationEvidence.revision).not.toBe(child.candidate);
  expect(child.integrationEvidence.receiptFile).not.toBe(child.evidence.receiptFile);
  expect(pending.jobs.find((job: { id: string }) => job.id === "child").integrationEvidence).toEqual({ available: false, current: false, checks: [], reviews: [] });
});

test("only explicit local assets and same-origin authenticated API requests are accepted", async () => {
  const { root, url, headers } = fixture();
  writeFileSync(join(root, "private.txt"), "private local contents");
  const page = await fetch(url);
  expect(page.status).toBe(200);
  expect(await page.text()).toBe("<!doctype html><title>Local work</title>");
  expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
  expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  expect(page.headers.get("referrer-policy")).toBe("no-referrer");
  expect(page.headers.get("x-content-type-options")).toBe("nosniff");
  expect((await fetch(new URL("/app.js", url))).headers.get("content-type")).toContain("javascript");
  expect((await fetch(new URL("/app.css", url))).status).toBe(200);
  for (const path of ["/private.txt", "/files/private.txt", "/../private.txt", "/fonts/OFL.txt"]) expect((await fetch(new URL(path, url), { headers })).status).toBe(404);
  for (const host of ["localhost", "evil.example", "127.0.0.1:1"]) expect((await fetch(new URL("/api/status", url), { headers: { ...headers, Host: host } })).status).toBe(403);
  for (const origin of ["https://evil.example", "null", "http://localhost"]) {
    const response = await fetch(new URL("/api/status", url), { headers: { ...headers, Origin: origin } });
    expect(response.status).toBe(403);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  }
  expect((await fetch(new URL("/api/status", url), { headers: { ...headers, Origin: url.origin } })).status).toBe(200);
  expect((await fetch(new URL("/api/status", url), { headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
  expect((await fetch(new URL("/api/status", url), { method: "OPTIONS", headers })).status).toBe(405);
  expect((await fetch(new URL("/api/status?token=wrong", url), { headers })).status).toBe(400);
});

test("bounded browser controls change the same manager and report guarded resume acceptance honestly", async () => {
  const { root, manager, url, headers } = fixture();
  const control = (body: unknown, extra: Record<string, string> = {}) => fetch(new URL("/api/control", url), { method: "POST", headers: { ...headers, "Content-Type": "application/json", Origin: url.origin, ...extra }, body: JSON.stringify(body) });
  expect((await control({ action: "pause" }, { Authorization: "Bearer wrong" })).status).toBe(401);
  expect((await control({ action: "pause" }, { Origin: "https://evil.example" })).status).toBe(403);
  expect((await fetch(new URL("/api/control", url), { method: "POST", headers, body: '{"action":"pause"}' })).status).toBe(403);
  for (const body of [{ action: "cleanup", id: "one" }, { action: "pause", id: "one" }, { action: "pause", command: "run" }, { action: "resume", id: "" }, { action: "resume", id: "../one" }, ["pause"], null]) expect((await control(body)).status).toBe(400);
  const paused = await control({ action: "pause" });
  expect(paused.status).toBe(202);
  expect(await paused.json()).toEqual({ accepted: true });
  expect(manager.status().paused).toBe(true);
  const repo = repository(root);
  manager.submit([{ id: "held", repo, branch: "feature/held", task: "Keep pending", acceptance: ["Keep work"], checks: [{ name: "file", command: "test -f value" }] }]);
  expect((await control({ action: "resume", id: "held" })).status).toBe(409);
  expect((await control({ action: "resume", id: "missing" })).status).toBe(409);
  const resumed = await control({ action: "resume" });
  expect(await resumed.json()).toEqual({ accepted: true });
  for (let i = 0; i < 100 && manager.status().jobs[0]!.status !== "blocked"; i++) await Bun.sleep(10);
  expect(manager.status().paused).toBe(false);
  expect(manager.status().jobs[0]!.status).toBe("blocked");
  expect((await control({ action: "resume", id: "held" })).status).toBe(202);
  const status = await (await fetch(new URL("/api/status", url), { headers })).json();
  expect(status.jobs[0].status).not.toBe("ready");
});

test("manager failures remain errors and stopping the server revokes its browser capability", async () => {
  const { stateDir, manager, dashboard, url, headers } = fixture();
  await manager.close();
  const response = await fetch(new URL("/api/status", url), { headers });
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Dashboard status is unavailable. Inspect the managing OMP session." });
  await dashboard.close();
  await dashboard.close();
  await expect(fetch(new URL("/api/status", url), { headers })).rejects.toThrow();
  const replacement = new WorkManager({ stateDir, worker: { async run(): Promise<never> { throw new Error("Unexpected worker"); } }, model: { provider: "fixture", id: "local" } }); managers.push(replacement);
  const restarted = startDashboard({ stateDir, manager: replacement }); dashboards.push(restarted);
  expect(new URL(restarted.url).hash).not.toBe(url.hash);
  expect((await fetch(new URL("/api/status", restarted.url), { headers })).status).toBe(401);
});

test("a rejected asynchronous resume is surfaced without fabricating a job outcome", async () => {
  const { url, headers } = fixture(undefined, 0);
  const response = await fetch(new URL("/api/control", url), { method: "POST", headers: { ...headers, Origin: url.origin, "Content-Type": "application/json" }, body: '{"action":"resume"}' });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "maxWorkers must be a positive integer." });
  const snapshot = await (await fetch(new URL("/api/status", url), { headers })).json();
  expect(snapshot.actionError).toBe("maxWorkers must be a positive integer.");
  expect(snapshot.jobs).toEqual([]);
});

test("after a host crash the browser exposes guarded recovery while a live controller remains active", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "omp-dashboard-crash-test-"))); roots.push(root);
  const repo = repository(root), stateDir = join(root, "state"), marker = join(root, "committed.marker");
  writeFileSync(join(repo, "value.txt"), "original\n"); executeGit(repo, ["add", "."]); executeGit(repo, ["commit", "-m", "Crash fixture input"]);
  const child = Bun.spawn([process.execPath, fileURLToPath(new URL("./fixtures/crash-manager.ts", import.meta.url)), repo, stateDir, marker], { stdout: "pipe", stderr: "pipe" });
  let implementations = 0;
  const worker: WorkerClient = { async run(request) {
    if (request.role === "implementer") implementations++;
    return { text: "Review retained commit", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
  } };
  const open = () => {
    const manager = new WorkManager({ stateDir, worker, model: { provider: "fixture", id: "local" } }); managers.push(manager);
    const dashboard = startDashboard({ manager, stateDir }); dashboards.push(dashboard);
    const url = new URL(dashboard.url), headers = { Authorization: `Bearer ${new URLSearchParams(url.hash.slice(1)).get("token")}` };
    const status = async () => (await fetch(new URL("/api/status", url), { headers })).json();
    const resume = () => fetch(new URL("/api/control", url), { method: "POST", headers: { ...headers, Origin: url.origin, "Content-Type": "application/json" }, body: '{"action":"resume","id":"crash"}' });
    return { manager, dashboard, status, resume };
  };
  try {
    const deadline = Date.now() + 10_000;
    while (!existsSync(marker) && Date.now() < deadline && child.exitCode === null) await Bun.sleep(10);
    expect(existsSync(marker)).toBe(true);
    const live = open();
    expect(await live.status()).toMatchObject({ controllerActive: true, counts: { active: 1, attention: 0 }, jobs: [{ id: "crash", status: "running", bucket: "active", canResume: false }] });
    expect((await live.resume()).status).toBe(409);
    await live.dashboard.close(); await live.manager.close();
    child.kill("SIGKILL"); await child.exited;
    expect(child.signalCode).toBe("SIGKILL");
    expect(() => process.kill(child.pid, 0)).toThrow();
    const recovered = open();
    const snapshot = await recovered.status();
    expect(snapshot).toMatchObject({ controllerActive: false, counts: { active: 0, attention: 1 }, jobs: [{ id: "crash", status: "running", bucket: "attention", phase: "recovery", canResume: true, attention: { reason: "Manager stopped before completion" } }] });
    expect((await recovered.status()).jobs[0].bucket).toBe("attention");
    expect(recovered.manager.status().jobs[0]!.status).toBe("running");
    const response = await recovered.resume();
    expect(response.status).toBe(202); expect(await response.json()).toEqual({ accepted: true });
    for (let i = 0; i < 200 && recovered.manager.status().jobs[0]!.status !== "ready"; i++) await Bun.sleep(10);
    expect(await recovered.status()).toMatchObject({ controllerActive: false, counts: { active: 0, attention: 0, ready: 1 }, jobs: [{ id: "crash", status: "ready", canResume: false }] });
    expect(implementations).toBe(0);
  } finally { if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; } }
}, 30_000);

test("an orphaned job still needs browser recovery while a new controller runs unrelated work", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "omp-dashboard-mixed-crash-test-"))); roots.push(root);
  const repo = repository(root), stateDir = join(root, "state"), marker = join(root, "committed.marker");
  writeFileSync(join(repo, "value.txt"), "original\n"); executeGit(repo, ["add", "."]); executeGit(repo, ["commit", "-m", "Crash fixture input"]);
  const child = Bun.spawn([process.execPath, fileURLToPath(new URL("./fixtures/crash-manager.ts", import.meta.url)), repo, stateDir, marker], { stdout: "pipe", stderr: "pipe" });
  try {
    const deadline = Date.now() + 10_000;
    while (!existsSync(marker) && Date.now() < deadline && child.exitCode === null) await Bun.sleep(10);
    expect(existsSync(marker)).toBe(true);
    child.kill("SIGKILL"); await child.exited;
    expect(child.signalCode).toBe("SIGKILL");
    let started!: () => void, repeatedImplementations = 0;
    const running = new Promise<void>((resolve) => { started = resolve; });
    const manager = new WorkManager({ stateDir, model: { provider: "fixture", id: "local" }, worker: { async run(request) {
      if (request.role === "implementer" && request.cwd.endsWith("/unrelated")) {
        started();
        await new Promise<never>((_resolve, reject) => request.signal!.addEventListener("abort", () => reject(new Error("Fixture stopped")), { once: true }));
      } else if (request.role === "implementer") repeatedImplementations++;
      return { text: "Review retained commit", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
    } } }); managers.push(manager);
    manager.submit([{ id: "unrelated", repo, branch: "feature/unrelated", task: "Independent authorized work", acceptance: ["Keep independent"], checks: [{ name: "value", command: "test -f value.txt" }] }]);
    void manager.start(); await running;
    const original = manager.status().jobs;
    const dashboard = startDashboard({ manager, stateDir }); dashboards.push(dashboard);
    const url = new URL(dashboard.url), headers = { Authorization: `Bearer ${new URLSearchParams(url.hash.slice(1)).get("token")}` };
    const status = async () => (await fetch(new URL("/api/status", url), { headers })).json();
    const snapshot = await status();
    expect(snapshot).toMatchObject({ controllerActive: true, counts: { active: 1, attention: 1 }, jobs: [
      { id: "crash", status: "running", bucket: "attention", phase: "recovery", canResume: true },
      { id: "unrelated", status: "running", bucket: "active", canResume: false },
    ] });
    expect((await status()).counts).toMatchObject({ active: 1, attention: 1 });
    expect(manager.status().jobs).toEqual(original);
    expect(snapshot.jobs.every((job: { owner?: string }) => job.owner === undefined)).toBe(true);
    const response = await fetch(new URL("/api/control", url), { method: "POST", headers: { ...headers, Origin: url.origin, "Content-Type": "application/json" }, body: '{"action":"resume","id":"crash"}' });
    expect(response.status).toBe(202); expect(await response.json()).toEqual({ accepted: true });
    for (let i = 0; i < 200 && manager.status().jobs.find((job) => job.id === "crash")!.status !== "ready"; i++) await Bun.sleep(10);
    expect(await status()).toMatchObject({ controllerActive: true, counts: { active: 1, attention: 0, ready: 1 }, jobs: [
      { id: "crash", status: "ready", canResume: false }, { id: "unrelated", status: "running", bucket: "active", canResume: false },
    ] });
    expect(repeatedImplementations).toBe(0);
  } finally { if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; } }
}, 30_000);
