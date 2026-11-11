import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WorkRepository } from "./jobs";
import type { JobInput } from "./types";

const fixtures: string[] = [];
const stores: WorkRepository[] = [];

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args]);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "omp-jobs-test-")));
  fixtures.push(root);
  git(root, "init", "-b", "main", "repo");
  const repo = join(root, "repo");
  git(repo, "config", "user.name", "Fixture");
  git(repo, "config", "user.email", "fixture@localhost");
  writeFileSync(join(repo, "shared.txt"), "committed original\n");
  git(repo, "add", "shared.txt");
  git(repo, "commit", "-m", "Initial fixture");
  const state = join(root, "state");
  const store = open(state);
  const input: JobInput = {
    task: "Change the shared file",
    repo,
    branch: "feature/first",
    acceptance: ["The requested file content is present"],
    checks: [{ name: "content", command: "test -f shared.txt" }],
  };
  return { root, repo, state, store, input };
}

function open(state: string): WorkRepository {
  const store = new WorkRepository(state);
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("submitting a scoped job creates a clean owned worktree and preserves the dirty original", () => {
  const { repo, state, store, input } = fixture();
  const base = git(repo, "rev-parse", "HEAD");
  writeFileSync(join(repo, "shared.txt"), "unfinished original\n");
  writeFileSync(join(repo, "untracked.txt"), "keep me\n");
  const before = git(repo, "status", "--porcelain=v1");

  const job = store.submit(input);

  expect(job).toMatchObject({
    task: input.task,
    repo: resolve(repo),
    branch: "feature/first",
    base,
    status: "queued",
    attempt: 0,
    acceptance: input.acceptance,
    checks: input.checks,
    dependsOn: [],
  });
  expect(job.worktree).toBe(join(resolve(state), "worktrees", job.id));
  expect(git(job.worktree, "branch", "--show-current")).toBe("feature/first");
  expect(git(job.worktree, "rev-parse", "HEAD")).toBe(base);
  expect(git(job.worktree, "status", "--porcelain=v1")).toBe("");
  expect(readFileSync(join(job.worktree, "shared.txt"), "utf8")).toBe("committed original\n");
  expect(git(repo, "branch", "--show-current")).toBe("main");
  expect(git(repo, "status", "--porcelain=v1")).toBe(before);
  expect(readFileSync(join(repo, "shared.txt"), "utf8")).toBe("unfinished original\n");
  expect(readFileSync(join(repo, "untracked.txt"), "utf8")).toBe("keep me\n");
  expect(store.get(job.id)).toEqual(job);
  expect(store.list()).toEqual([job]);
});

test("existing target branches retain their committed tip and jobs remain available after reopening", () => {
  const { repo, state, store, input } = fixture();
  git(repo, "checkout", "-b", "feature/existing");
  writeFileSync(join(repo, "shared.txt"), "existing branch content\n");
  git(repo, "commit", "-am", "Existing branch change");
  const existingTip = git(repo, "rev-parse", "HEAD");
  git(repo, "checkout", "main");

  const job = store.submit({ ...input, branch: "feature/existing" });
  store.close();
  stores.splice(stores.indexOf(store), 1);
  const reopened = open(state);

  expect(reopened.get(job.id)).toEqual(job);
  expect(reopened.list()).toEqual([job]);
  expect(reopened.get("unknown")).toBeUndefined();
  expect(job.base).toBe(existingTip);
  expect(git(job.worktree, "rev-parse", "HEAD")).toBe(existingTip);
  expect(readFileSync(join(job.worktree, "shared.txt"), "utf8")).toBe("existing branch content\n");
});

test("an explicit base cannot silently replace an existing target branch's tip", () => {
  const { repo, store, input } = fixture();
  git(repo, "branch", "feature/existing");
  const existingTip = git(repo, "rev-parse", "feature/existing");
  writeFileSync(join(repo, "shared.txt"), "new main content\n");
  git(repo, "commit", "-am", "Advance main");

  expect(() => store.submit({ ...input, branch: "feature/existing", base: "main" }))
    .toThrow(/base.*existing.*tip|existing.*tip.*base/i);
  expect(store.list()).toEqual([]);
  expect(git(repo, "rev-parse", "feature/existing")).toBe(existingTip);
  expect(git(repo, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
});

test("unsafe job IDs are refused before allocating any worktree", () => {
  const { repo, store, input } = fixture();
  for (const id of ["../escape", "", "/absolute", ".", "with space", "x".repeat(129)]) {
    expect(() => store.submit({ ...input, id })).toThrow(/job id/i);
  }
  expect(store.list()).toEqual([]);
  expect(git(repo, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
});

test("a second database connection refuses the same repository and branch through a linked checkout", () => {
  const { repo, state, store, input } = fixture();
  const first = store.submit({ ...input, id: "first-job" });
  const other = open(state);

  expect(() => other.submit({ ...input, repo: first.worktree }))
    .toThrow(/branch.*first-job|first-job.*branch/i);
  expect(other.list()).toEqual([first]);
  expect(git(repo, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(2);
});

test("a repeated job ID is refused before another branch is created", () => {
  const { repo, store, input } = fixture();
  const first = store.submit({ ...input, id: "stable-id" });
  expect(() => store.submit({ ...input, id: "stable-id", branch: "feature/second" }))
    .toThrow(/job id.*stable-id.*already/i);
  expect(store.list()).toEqual([first]);
  expect(git(repo, "branch", "--list", "feature/second")).toBe("");
});

test("submission requires scoped acceptance, validation and an explicit valid branch", () => {
  const { repo, store, input } = fixture();
  const invalid: [Partial<JobInput>, RegExp][] = [
    [{ task: " " }, /task/i],
    [{ acceptance: [] }, /acceptance/i],
    [{ acceptance: [" "] }, /acceptance/i],
    [{ checks: [] }, /check/i],
    [{ checks: [{ name: "content", command: " " }] }, /check/i],
    [{ checks: [{ name: " ", command: "true" }] }, /check/i],
    [{ branch: "" }, /branch/i],
    [{ branch: "@{-1}" }, /branch/i],
    [{ branch: "--detach" }, /branch/i],
    [{ branch: "feature/../escape" }, /branch/i],
    [{ branch: "refs/heads/ambiguous" }, /branch/i],
  ];
  for (const [patch, message] of invalid) {
    expect(() => store.submit({ ...input, ...patch })).toThrow(message);
  }
  expect(store.list()).toEqual([]);
  expect(git(repo, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
});

test("unknown and cyclic batch dependencies are refused before jobs or branches are created", () => {
  const { repo, store, input } = fixture();
  expect(() => store.submit({ ...input, dependsOn: ["missing"] })).toThrow(/unknown dependency.*missing/i);
  expect(() => store.submitMany([
    { ...input, id: "first", dependsOn: ["second"] },
    { ...input, id: "second", branch: "feature/second", dependsOn: ["first"] },
  ])).toThrow(/dependency cycle.*first.*second.*first/i);
  expect(() => store.submitMany([{ ...input, id: "self", dependsOn: ["self"] }]))
    .toThrow(/dependency cycle/i);
  expect(store.list()).toEqual([]);
  expect(git(repo, "branch", "--list", "feature/*")).toBe("");
  expect(git(repo, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
});

test("ordinary Git worktree occupancy is refused before reserving a job", () => {
  const { root, repo, store, input } = fixture();
  const external = join(root, "ordinary checkout");
  git(repo, "worktree", "add", "-b", "feature/external", external);
  writeFileSync(join(external, "shared.txt"), "external unfinished work\n");

  expect(() => store.submit({ ...input, branch: "feature/external" }))
    .toThrow(/already.*worktree.*ordinary checkout/i);
  expect(() => store.submit({ ...input, branch: "main" })).toThrow(/already.*worktree/i);
  expect(store.list()).toEqual([]);
  expect(readFileSync(join(external, "shared.txt"), "utf8")).toBe("external unfinished work\n");
  expect(git(external, "branch", "--show-current")).toBe("feature/external");
});

test("a batch preserves forward dependencies and separate same-repository ticket worktrees", () => {
  const { repo, store, input } = fixture();
  writeFileSync(join(repo, "shared.txt"), "original in progress\n");
  const [parent, first, second] = store.submitMany([
    { ...input, id: "integration", kind: "integration", branch: "feature/combined", dependsOn: ["first", "second"] },
    { ...input, id: "first", branch: "feature/first", integrationTarget: "integration" },
    { ...input, id: "second", branch: "feature/second", dependsOn: ["first"], integrationTarget: "integration" },
  ]);

  expect(parent).toMatchObject({ kind: "integration", dependsOn: ["first", "second"] });
  expect(first).toMatchObject({ kind: "implementation", integrationTarget: "integration", dependsOn: [] });
  expect(second).toMatchObject({ kind: "implementation", integrationTarget: "integration", dependsOn: ["first"] });
  writeFileSync(join(first!.worktree, "shared.txt"), "first ticket\n");
  writeFileSync(join(second!.worktree, "shared.txt"), "second ticket\n");
  git(first!.worktree, "commit", "-am", "First ticket");
  git(second!.worktree, "commit", "-am", "Second ticket");
  expect(readFileSync(join(first!.worktree, "shared.txt"), "utf8")).toBe("first ticket\n");
  expect(readFileSync(join(second!.worktree, "shared.txt"), "utf8")).toBe("second ticket\n");
  expect(readFileSync(join(parent!.worktree, "shared.txt"), "utf8")).toBe("committed original\n");
  expect(readFileSync(join(repo, "shared.txt"), "utf8")).toBe("original in progress\n");
  expect(new Set(store.list().map((job) => job.commonDir)).size).toBe(1);
});

test("integration targets must identify an integration job in the same repository", () => {
  const { repo, store, input } = fixture();
  const other = fixture();
  expect(() => store.submit({ ...input, integrationTarget: "missing" }))
    .toThrow(/unknown integration target.*missing/i);
  expect(() => store.submitMany([
    { ...input, id: "child", integrationTarget: "parent" },
    { ...input, id: "parent", branch: "feature/parent" },
  ])).toThrow(/integration target.*integration job/i);
  expect(() => store.submit({ ...input, id: "parent", kind: "integration", integrationTarget: "parent" }))
    .toThrow(/integration job.*cannot.*target/i);
  expect(() => store.submitMany([
    { ...input, id: "child", integrationTarget: "parent" },
    { ...other.input, id: "parent", kind: "integration" },
  ])).toThrow(/integration target.*same repository/i);
  expect(() => store.submitMany([
    { ...input, id: "child", integrationTarget: "parent" },
    { ...input, id: "parent", kind: "integration", branch: "feature/parent" },
  ])).toThrow(/integration target.*depend.*child/i);
  expect(() => store.submit({ ...input, kind: "review" as JobInput["kind"] })).toThrow(/kind/i);
  expect(store.list()).toEqual([]);
  expect(git(repo, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
});

test("unexpected allocation failure retains a durable blocker and any created worktree", () => {
  const { root, repo, state, store, input } = fixture();
  const hooks = join(root, "hooks");
  mkdirSync(hooks);
  writeFileSync(join(hooks, "post-checkout"), "#!/bin/sh\nexit 9\n");
  chmodSync(join(hooks, "post-checkout"), 0o755);
  git(repo, "config", "core.hooksPath", hooks);
  writeFileSync(join(repo, "shared.txt"), "unfinished original\n");

  expect(() => store.submit({ ...input, id: "hook-failure" })).toThrow(/allocation failed.*git worktree/is);

  const retained = open(state).get("hook-failure")!;
  expect(retained.status).toBe("blocked");
  expect(retained.blocker).toMatch(/artifacts were retained/);
  expect(existsSync(retained.worktree)).toBe(true);
  expect(git(retained.worktree, "branch", "--show-current")).toBe("feature/first");
  expect(git(retained.worktree, "status", "--porcelain=v1")).toBe("");
  expect(readFileSync(join(repo, "shared.txt"), "utf8")).toBe("unfinished original\n");
});
