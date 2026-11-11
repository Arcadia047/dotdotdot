import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeGit } from "./jobs";
import { registerWorkExtension, type WorkContext, type WorkHost } from "./index";

const roots: string[] = [];
const shutdowns: (() => Promise<void>)[] = [];
// OMP supplies Zod. This host boundary fixture only builds schemas; actual host
// parsing/registration is checked with the installed binary in the RPC smoke.
const schema: any = new Proxy(() => schema, { get: (_target, property) => property === "parse" ? (value: unknown) => value : schema });
function host() {
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const events = new Map<string, any>();
  const messages: any[] = [];
  const pi: WorkHost = { zod: schema, registerTool: (tool) => tools.set(tool.name, tool),
    registerCommand: (name, command) => commands.set(name, command), on: (name, handler) => events.set(name, handler),
    sendMessage: (message, options) => { messages.push({ message, options }); }, getThinkingLevel: () => "off" };
  const model = { provider: "fixture", id: "one" };
  const ctx: WorkContext = { model, models: { current: () => ctx.model, resolve: (spec) => spec === "fixture/one" ? model : undefined, list: () => [model] }, agent: { kind: "main" } };
  return { pi, ctx, tools, commands, events, messages,
    call: (name: string, args: unknown = {}) => tools.get(name).execute("fixture", args, undefined, undefined, ctx) };
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "omp-entry-test-")); roots.push(root);
  const agentDir = join(root, "agent");
  executeGit(root, ["init", "-b", "main", "repo"]);
  const repo = join(root, "repo");
  executeGit(repo, ["config", "user.name", "Fixture"]);
  executeGit(repo, ["config", "user.email", "fixture@example.invalid"]);
  writeFileSync(join(repo, "value"), "original\n"); executeGit(repo, ["add", "."]); executeGit(repo, ["commit", "-m", "Base"]);
  const h = host();
  return { ...h, root, repo, agentDir };
}
afterEach(async () => {
  for (const close of shutdowns.splice(0)) await close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("registration is lazy and leaves the host and profile untouched until work is requested", () => {
  const h = fixture();
  registerWorkExtension(h.pi, { agentDir: h.agentDir });
  shutdowns.push(() => h.events.get("session_shutdown")({}, h.ctx));
  expect([...h.tools.keys()]).toEqual(["work_submit", "work_status", "work_control", "work_skills"]);
  expect(h.commands.has("work")).toBe(true);
  expect(h.messages).toEqual([]);
  expect(existsSync(h.agentDir)).toBe(false);
});

test("submitting an accepted job starts the pipeline and wakes the parent only with its checked result", async () => {
  const h = fixture();
  const skillsDir = join(h.root, "skills");
  executeGit(h.root, ["init", "-b", "main", skillsDir]);
  executeGit(skillsDir, ["config", "user.name", "Fixture"]); executeGit(skillsDir, ["config", "user.email", "fixture@example.invalid"]);
  writeFileSync(join(skillsDir, "SKILL.md"), "---\nname: fixture\ndescription: Fixture instructions.\n---\nObserve the accepted task.\n");
  executeGit(skillsDir, ["add", "."]); executeGit(skillsDir, ["commit", "-m", "Skills"]);
  const requests: import("./manager").WorkerRequest[] = [];
  registerWorkExtension(h.pi, { agentDir: h.agentDir, skillsDir, worker: { async run(request) {
    requests.push(request);
    if (request.role === "implementer") {
      writeFileSync(join(request.cwd, "value"), "changed\n"); executeGit(request.cwd, ["commit", "-am", "Change"]);
    }
    return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
  } } });
  shutdowns.push(() => h.events.get("session_shutdown")({}, h.ctx));
  const queued = await h.call("work_submit", { jobs: [{ id: "one", repo: h.repo, branch: "feature/one", task: "Change value", acceptance: ["Value changed"], checks: [{ name: "value", command: "test \"$(cat value)\" = changed" }] }] });
  expect(queued.details.jobs[0].id).toBe("one");
  for (let i = 0; i < 200 && !h.messages.length; i++) await Bun.sleep(10);
  const status = await h.call("work_status");
  expect(status.details.jobs[0].status).toBe("ready");
  expect(requests.map((request) => request.role)).toEqual(["implementer", "spec-reviewer", "technical-reviewer"]);
  expect(requests.every((request) => request.prompt.includes("source revision") && request.model.provider === "fixture" && request.model.thinking === "off")).toBe(true);
  expect(h.messages).toHaveLength(1);
  expect(h.messages[0].options).toEqual({ deliverAs: "followUp", triggerTurn: true });
  expect(h.messages[0].message.content).toContain('"status":"ready"');
  expect(readFileSync(join(h.repo, "value"), "utf8")).toBe("original\n");
});

test("missing skills block with explicit setup guidance before any model request", async () => {
  const h = fixture();
  registerWorkExtension(h.pi, { agentDir: h.agentDir, worker: { async run(): Promise<never> { throw new Error("No worker should be launched"); } } });
  shutdowns.push(() => h.events.get("session_shutdown")({}, h.ctx));
  await h.call("work_submit", { jobs: [{ id: "missing", repo: h.repo, branch: "feature/missing", task: "Change value", acceptance: ["Value changed"], checks: [{ name: "file", command: "test -f value" }] }] });
  for (let i = 0; i < 100 && !h.messages.length; i++) await Bun.sleep(10);
  const status = await h.call("work_status");
  expect(status.details.jobs[0].status).toBe("blocked");
  expect(status.details.jobs[0].blocker).toContain("/work skills sync");
  expect((await h.call("work_skills", { action: "status" })).details.installed).toBe(false);
  expect(existsSync(join(h.agentDir, "work", "skills-source"))).toBe(false);
});

test("user-only role choices use the live catalog and can be cleared without starting work", async () => {
  const h = fixture();
  registerWorkExtension(h.pi, { agentDir: h.agentDir });
  shutdowns.push(() => h.events.get("session_shutdown")({}, h.ctx));
  const command = h.commands.get("work");
  await command.handler("role set implementer fixture/one", h.ctx);
  await command.handler("roles", h.ctx);
  expect(h.messages.at(-1).message.content).toContain('"implementer": "fixture/one"');
  await command.handler("role set spec-reviewer unavailable/choice", h.ctx);
  expect(h.messages.at(-1).message.content).toContain("unavailable");
  await command.handler("role clear implementer", h.ctx);
  await command.handler("roles", h.ctx);
  expect(h.messages.at(-1).message.content).toBe("{}");
  expect(existsSync(join(h.agentDir, "work", "jobs.sqlite"))).toBe(false);
  expect([...h.tools.keys()].some((name) => name.includes("role"))).toBe(false);
});

test("invalid local worker limits fail before creating worktree state", async () => {
  const h = fixture();
  mkdirSync(join(h.agentDir, "work"), { recursive: true });
  writeFileSync(join(h.agentDir, "work", "config.json"), '{"maxWorkers":0}');
  registerWorkExtension(h.pi, { agentDir: h.agentDir });
  shutdowns.push(() => h.events.get("session_shutdown")({}, h.ctx));
  await expect(h.call("work_status")).rejects.toThrow("maxWorkers");
  expect(existsSync(join(h.agentDir, "work", "jobs.sqlite"))).toBe(false);
});

test("managed children register no nested manager and native subagents cannot use its tools", async () => {
  const h = fixture();
  const previous = process.env.DOTDOTDOT_WORK_CHILD;
  process.env.DOTDOTDOT_WORK_CHILD = "1";
  try { registerWorkExtension(h.pi, { agentDir: h.agentDir }); }
  finally { if (previous === undefined) delete process.env.DOTDOTDOT_WORK_CHILD; else process.env.DOTDOTDOT_WORK_CHILD = previous; }
  expect([...h.tools]).toEqual([]);
  registerWorkExtension(h.pi, { agentDir: h.agentDir });
  shutdowns.push(() => h.events.get("session_shutdown")({}, h.ctx));
  h.ctx.agent = { kind: "sub" };
  await expect(h.call("work_status")).rejects.toThrow("main OMP session");
  expect(existsSync(h.agentDir)).toBe(false);
});

test("pause holds new jobs and explicit resume/cleanup operate through the manager-facing tools", async () => {
  const h = fixture();
  const skillsDir = join(h.root, "skills");
  executeGit(h.root, ["init", "-b", "main", skillsDir]);
  executeGit(skillsDir, ["config", "user.name", "Fixture"]); executeGit(skillsDir, ["config", "user.email", "fixture@example.invalid"]);
  writeFileSync(join(skillsDir, "SKILL.md"), "---\nname: fixture\ndescription: Fixture instructions.\n---\nFollow scope.\n");
  executeGit(skillsDir, ["add", "."]); executeGit(skillsDir, ["commit", "-m", "Skills"]);
  let ran = false;
  registerWorkExtension(h.pi, { agentDir: h.agentDir, skillsDir, worker: { async run(request) {
    ran = true;
    if (request.role === "implementer") { writeFileSync(join(request.cwd, "value"), "changed\n"); executeGit(request.cwd, ["commit", "-am", "Change"]); }
    return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
  } } });
  shutdowns.push(() => h.events.get("session_shutdown")({}, h.ctx));
  await h.call("work_control", { action: "pause" });
  await h.call("work_submit", { jobs: [{ id: "paused", repo: h.repo, branch: "feature/paused", task: "Change value", acceptance: ["Value changed"], checks: [{ name: "file", command: "test -f value" }] }] });
  expect(ran).toBe(false);
  expect((await h.call("work_status")).details.paused).toBe(true);
  await h.call("work_control", { action: "resume" });
  for (let i = 0; i < 200 && !h.messages.length; i++) await Bun.sleep(10);
  const ready = (await h.call("work_status")).details.jobs[0];
  expect(ready.status).toBe("ready");
  expect(existsSync(ready.worktree)).toBe(true);
  await h.call("work_control", { action: "cleanup", id: "paused" });
  expect(existsSync(ready.worktree)).toBe(false);
  expect(existsSync(join(h.agentDir, "work", "results", "paused.json"))).toBe(true);
});

test("session shutdown aborts owned workers, retains interrupted work, and sends no later wakeup", async () => {
  const h = fixture();
  const skillsDir = join(h.root, "skills");
  executeGit(h.root, ["init", "-b", "main", skillsDir]);
  executeGit(skillsDir, ["config", "user.name", "Fixture"]); executeGit(skillsDir, ["config", "user.email", "fixture@example.invalid"]);
  writeFileSync(join(skillsDir, "SKILL.md"), "---\nname: fixture\ndescription: Fixture instructions.\n---\nFollow scope.\n");
  executeGit(skillsDir, ["add", "."]); executeGit(skillsDir, ["commit", "-m", "Skills"]);
  let started = false;
  let aborted = false;
  registerWorkExtension(h.pi, { agentDir: h.agentDir, skillsDir, worker: { run(request): Promise<never> {
    started = true;
    return new Promise((_resolve, reject) => request.signal!.addEventListener("abort", () => { aborted = true; reject(new Error("Fixture stopped")); }, { once: true }));
  } } });
  const queued = await h.call("work_submit", { jobs: [{ id: "shutdown", repo: h.repo, branch: "feature/shutdown", task: "Change value", acceptance: ["Value changed"], checks: [{ name: "file", command: "test -f value" }] }] });
  for (let i = 0; i < 100 && !started; i++) await Bun.sleep(10);
  expect(started).toBe(true);
  await h.events.get("session_shutdown")({}, h.ctx);
  expect(aborted).toBe(true);
  expect(existsSync(queued.details.jobs[0].worktree)).toBe(true);
  expect(h.messages).toEqual([]);
  await expect(h.call("work_status")).rejects.toThrow("shutting down");
});

test("an active job keeps its captured skills while the next independent job sees current committed instructions", async () => {
  const h = fixture();
  const skillsDir = join(h.root, "skills");
  executeGit(h.root, ["init", "-b", "main", skillsDir]);
  executeGit(skillsDir, ["config", "user.name", "Fixture"]); executeGit(skillsDir, ["config", "user.email", "fixture@example.invalid"]);
  const body = "---\nname: fixture\ndescription: Fixture instructions.\n---\nFollow scope.";
  writeFileSync(join(skillsDir, "SKILL.md"), body + " Version one.\n");
  executeGit(skillsDir, ["add", "."]); executeGit(skillsDir, ["commit", "-m", "Skills one"]);
  const before = executeGit(skillsDir, ["rev-parse", "HEAD"]);
  const revisions: Record<string, string[]> = {};
  registerWorkExtension(h.pi, { agentDir: h.agentDir, skillsDir, worker: { async run(request) {
    const id = request.cwd.split("/").at(-1)!;
    (revisions[id] ??= []).push(/source revision ([a-f0-9]+)/.exec(request.prompt)![1]!);
    if (request.role === "implementer") {
      writeFileSync(join(request.cwd, "value"), id + "\n"); executeGit(request.cwd, ["commit", "-am", "Change"]);
      if (id === "first") { writeFileSync(join(skillsDir, "SKILL.md"), body + " Version two.\n"); executeGit(skillsDir, ["commit", "-am", "Skills two"]); }
    }
    return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
  } } });
  shutdowns.push(() => h.events.get("session_shutdown")({}, h.ctx));
  for (const id of ["first", "second"]) {
    await h.call("work_submit", { jobs: [{ id, repo: h.repo, branch: "feature/" + id, task: "Change value", acceptance: ["Value changed"], checks: [{ name: "file", command: "test -f value" }] }] });
    for (let i = 0; i < 200; i++) { if ((await h.call("work_status")).details.jobs.find((job: any) => job.id === id).status === "ready") break; await Bun.sleep(10); }
  }
  const after = executeGit(skillsDir, ["rev-parse", "HEAD"]);
  expect(revisions.first).toEqual([before, before, before]);
  expect(after).not.toBe(before);
  expect(revisions.second).toEqual([after, after, after]);
});

test("default child launch stays in the actual named parent profile even when selection came from CLI", async () => {
  const h = fixture();
  const agentDir = join(h.root, ".omp", "profiles", "work", "agent");
  const skillsDir = join(h.root, "skills");
  executeGit(h.root, ["init", "-b", "main", skillsDir]);
  executeGit(skillsDir, ["config", "user.name", "Fixture"]); executeGit(skillsDir, ["config", "user.email", "fixture@example.invalid"]);
  writeFileSync(join(skillsDir, "SKILL.md"), "---\nname: fixture\ndescription: Fixture instructions.\n---\nFollow scope.\n");
  executeGit(skillsDir, ["add", "."]); executeGit(skillsDir, ["commit", "-m", "Skills"]);
  const bin = join(h.root, "bin"); mkdirSync(bin);
  const observed = join(h.root, "child-environment.json");
  const executable = join(bin, "omp");
  writeFileSync(executable, `#!${process.execPath}\nimport { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(observed)}, JSON.stringify({agentDir:process.env.PI_CODING_AGENT_DIR, profile:process.env.OMP_PROFILE, legacyProfile:process.env.PI_PROFILE, child:process.env.DOTDOTDOT_WORK_CHILD, unrelated:process.env.WORK_FIXTURE_UNRELATED}));\nawait import(${JSON.stringify(join(import.meta.dir, "fixtures/rpc-worker.ts"))});\n`, { mode: 0o755 });
  const keys = ["PATH", "OMP_PROFILE", "PI_PROFILE", "PI_CODING_AGENT_DIR", "WORK_FIXTURE_UNRELATED"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.PATH = bin + ":" + process.env.PATH;
  delete process.env.OMP_PROFILE; // --profile work need not be reflected here.
  process.env.PI_PROFILE = "unrelated";
  process.env.PI_CODING_AGENT_DIR = join(h.root, "default-agent");
  process.env.WORK_FIXTURE_UNRELATED = "preserved";
  registerWorkExtension(h.pi, { agentDir, skillsDir });
  try {
    await h.call("work_submit", { jobs: [{ id: "profile", repo: h.repo, branch: "feature/profile", task: "Inspect value", acceptance: ["Value exists"], checks: [{ name: "file", command: "test -f value" }] }] });
    for (let i = 0; i < 100 && !existsSync(observed); i++) await Bun.sleep(10);
    expect(JSON.parse(readFileSync(observed, "utf8"))).toEqual({ agentDir, profile: "default", child: "1", unrelated: "preserved" });
  } finally {
    await h.events.get("session_shutdown")({}, h.ctx);
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

test("explicit skill sync exposes current immutable planning skills and companion paths to a fresh manager", async () => {
  const h = fixture();
  const upstream = join(h.root, "upstream-skills");
  executeGit(h.root, ["init", "-b", "main", upstream]);
  executeGit(upstream, ["config", "user.name", "Fixture"]); executeGit(upstream, ["config", "user.email", "fixture@example.invalid"]);
  for (const name of ["ask-matt", "to-spec", "to-tickets"]) {
    const folder = join(upstream, "skills", "engineering", name); mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "SKILL.md"), `---\nname: ${name}\ndescription: Plan accepted local work.\n---\nRead [the companion](companion.md).\n`);
    writeFileSync(join(folder, "companion.md"), `Original ${name} instructions.\n`);
  }
  executeGit(upstream, ["add", "."]); executeGit(upstream, ["commit", "-m", "Current planning skills"]);
  registerWorkExtension(h.pi, { agentDir: h.agentDir, upstream });
  shutdowns.push(() => h.events.get("session_shutdown")({}, h.ctx));
  const absent = (await h.call("work_skills", { action: "status" })).details;
  expect(absent.installed).toBe(false);
  expect(absent.guide).toBeUndefined();
  const synced = (await h.call("work_skills", { action: "sync" })).details;
  expect(synced.guide.revision).toBe(executeGit(upstream, ["rev-parse", "HEAD"]));
  expect(synced.guide.skills.map((skill: any) => skill.name)).toEqual(["ask-matt", "to-spec", "to-tickets"]);
  expect(synced.guide.instructions).toContain(".scratch/<feature>/spec.md");
  expect(synced.guide.instructions).toContain("work_submit");
  expect(synced.guide.instructions).toMatch(/approval|approved/i);
  expect(synced.guide.instructions).toMatch(/no Skill tool|not.*Skill tool/i);
  for (const skill of synced.guide.skills) {
    expect(readFileSync(skill.path, "utf8")).toContain(`name: ${skill.name}`);
    const companion = join(synced.guide.root, "skills", "engineering", skill.name, "companion.md");
    expect(synced.guide.companionPaths).toContain(companion);
    expect(readFileSync(companion, "utf8")).toBe(`Original ${skill.name} instructions.\n`);
  }
  expect(existsSync(join(h.agentDir, "work", "jobs.sqlite"))).toBe(false);
});

test("skill commands expose the same stable planning guide and update it only after explicit sync", async () => {
  const h = fixture();
  const upstream = join(h.root, "upstream-skills");
  executeGit(h.root, ["init", "-b", "main", upstream]);
  executeGit(upstream, ["config", "user.name", "Fixture"]); executeGit(upstream, ["config", "user.email", "fixture@example.invalid"]);
  const folder = join(upstream, "skills", "engineering", "to-spec"); mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "SKILL.md"), "---\nname: to-spec\ndescription: Plan scoped work.\n---\nRead companion.md.\n");
  writeFileSync(join(folder, "companion.md"), "Planning instructions one.\n");
  executeGit(upstream, ["add", "."]); executeGit(upstream, ["commit", "-m", "Planning version one"]);
  registerWorkExtension(h.pi, { agentDir: h.agentDir, upstream });
  shutdowns.push(() => h.events.get("session_shutdown")({}, h.ctx));
  const command = h.commands.get("work");
  await command.handler("skills sync", h.ctx);
  const first = JSON.parse(h.messages.at(-1).message.content);
  const firstCompanion = first.guide.companionPaths.find((path: string) => path.endsWith("/companion.md"));
  writeFileSync(join(folder, "companion.md"), "Planning instructions two.\n");
  executeGit(upstream, ["commit", "-am", "Planning version two"]);
  await command.handler("skills status", h.ctx);
  expect(JSON.parse(h.messages.at(-1).message.content).guide).toEqual(first.guide);
  expect((await h.call("work_skills", { action: "status" })).details.guide).toEqual(first.guide);
  await command.handler("skills sync", h.ctx);
  const second = JSON.parse(h.messages.at(-1).message.content);
  expect(second.guide.revision).toBe(executeGit(upstream, ["rev-parse", "HEAD"]));
  expect(second.guide.revision).not.toBe(first.guide.revision);
  expect(readFileSync(firstCompanion, "utf8")).toBe("Planning instructions one.\n");
  expect(readFileSync(second.guide.companionPaths.find((path: string) => path.endsWith("/companion.md")), "utf8")).toBe("Planning instructions two.\n");
  writeFileSync(join(second.sourceDir, "local-change.txt"), "Preserve me.\n");
  const dirty = (await h.call("work_skills", { action: "status" })).details;
  expect(dirty.dirty).toBe(true);
  expect(dirty.guide).toBeUndefined();
  expect(dirty.message).toMatch(/clean checkout/);
  expect(readFileSync(join(second.sourceDir, "local-change.txt"), "utf8")).toBe("Preserve me.\n");
});

test("local timeout settings accept positive safe integers and reject invalid values before queue creation", async () => {
  const h = fixture();
  const stateDir = join(h.agentDir, "work"); mkdirSync(stateDir, { recursive: true });
  const local = join(stateDir, "config.json");
  registerWorkExtension(h.pi, { agentDir: h.agentDir });
  shutdowns.push(() => h.events.get("session_shutdown")({}, h.ctx));
  for (const key of ["validationTimeoutMs", "workerTimeoutMs"]) {
    for (const value of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, "1000"]) {
      writeFileSync(local, JSON.stringify({ [key]: value }));
      await expect(h.call("work_status")).rejects.toThrow(`${key} must be a positive safe integer`);
      expect(existsSync(join(stateDir, "jobs.sqlite"))).toBe(false);
    }
  }
  writeFileSync(local, '{"validationTimeoutMs":1500,"workerTimeoutMs":3500}');
  expect((await h.call("work_status")).details.jobs).toEqual([]);
});

test("configured deadlines reach editing workers and actual validation through the public submit tool", async () => {
  const h = fixture();
  const skillsDir = join(h.root, "skills");
  executeGit(h.root, ["init", "-b", "main", skillsDir]);
  executeGit(skillsDir, ["config", "user.name", "Fixture"]); executeGit(skillsDir, ["config", "user.email", "fixture@example.invalid"]);
  writeFileSync(join(skillsDir, "SKILL.md"), "---\nname: fixture\ndescription: Fixture instructions.\n---\nFollow scope.\n");
  executeGit(skillsDir, ["add", "."]); executeGit(skillsDir, ["commit", "-m", "Skills"]);
  const stateDir = join(h.agentDir, "work"); mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "config.json"), '{"validationTimeoutMs":30,"workerTimeoutMs":2000}');
  const requests: import("./manager").WorkerRequest[] = [];
  registerWorkExtension(h.pi, { agentDir: h.agentDir, skillsDir, worker: { async run(request) {
    requests.push(request);
    if (request.role === "implementer") { writeFileSync(join(request.cwd, "value"), "changed\n"); executeGit(request.cwd, ["commit", "-am", "Change"]); }
    return { text: "Candidate", model: request.model, report: { revision: executeGit(request.cwd, ["rev-parse", "HEAD"]), verdict: "pass", findings: [] } };
  } } });
  shutdowns.push(() => h.events.get("session_shutdown")({}, h.ctx));
  await h.call("work_submit", { jobs: [{ id: "deadline", repo: h.repo, branch: "feature/deadline", task: "Change value", acceptance: ["Value changed"], checks: [{ name: "delayed value", command: 'sleep 0.3; test "$(cat value)" = changed' }] }] });
  for (let i = 0; i < 200 && !h.messages.length; i++) await Bun.sleep(10);
  expect(requests[0]?.timeoutMs).toBe(2000);
  expect((await h.call("work_status")).details.jobs[0].status).toBe("blocked");
  const receipt = JSON.parse(readFileSync(join(stateDir, "results", "deadline.json"), "utf8"));
  expect(receipt.checks[0]).toMatchObject({ status: "timed_out" });
});
