import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoleChoices, SkillsSource } from "./skills";

const roots: string[] = [];
function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args]);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "omp-skills-test-")));
  roots.push(root);
  const upstream = join(root, "upstream");
  git(root, "init", "-b", "main", upstream);
  git(upstream, "config", "user.name", "Fixture");
  git(upstream, "config", "user.email", "fixture@localhost");
  const body = "---\nname: build-things\ndescription: Build a tested change.\n---\nRead [the helper](templates/example.txt).\n";
  mkdirSync(join(upstream, "skills/engineering/build/templates"), { recursive: true });
  writeFileSync(join(upstream, "skills/engineering/build/SKILL.md"), body);
  writeFileSync(join(upstream, "skills/engineering/build/templates/example.txt"), "upstream helper v1\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Initial skills");
  const stateDir = join(root, "state");
  const source = new SkillsSource({ stateDir, upstream });
  return { root, upstream, stateDir, source, body };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("an absent source is a clear setup prerequisite and never clones implicitly", () => {
  const { source } = fixture();
  expect(source.status()).toMatchObject({ installed: false });
  expect(() => source.snapshot("first-run")).toThrow(/sync|setup/i);
  expect(existsSync(source.sourceDir)).toBe(false);
});

test("explicit setup discovers nested skills and captures original bodies with all companion resources", () => {
  const { source, upstream, body } = fixture();
  mkdirSync(join(upstream, "skills/productivity/deep/handoff"), { recursive: true });
  writeFileSync(join(upstream, "skills/productivity/deep/handoff/SKILL.md"),
    "---\nname: hand-off\ndescription: >-\n  Keep useful\n  context for later.\n---\nCall the Skill tool.\n");
  writeFileSync(join(upstream, "shared-reference.md"), "outside the individual skill folder\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Nested productivity skill");

  expect(source.sync()).toMatchObject({ installed: true, dirty: false, branch: "main", revision: git(upstream, "rev-parse", "HEAD") });
  const snapshot = source.snapshot("first-run");
  expect(snapshot.revision).toBe(git(upstream, "rev-parse", "HEAD"));
  expect(snapshot.skills.map(({ name, description, relativePath }) => ({ name, description, relativePath }))).toEqual([
    { name: "build-things", description: "Build a tested change.", relativePath: "skills/engineering/build/SKILL.md" },
    { name: "hand-off", description: "Keep useful context for later.", relativePath: "skills/productivity/deep/handoff/SKILL.md" },
  ]);
  expect(readFileSync(snapshot.skills[0]!.path, "utf8")).toBe(body);
  expect(readFileSync(join(snapshot.root, "skills/engineering/build/templates/example.txt"), "utf8")).toBe("upstream helper v1\n");
  expect(readFileSync(join(snapshot.root, "shared-reference.md"), "utf8")).toBe("outside the individual skill folder\n");
  expect(snapshot.instructions("implementer")).toContain(snapshot.skills[0]!.path);
  expect(snapshot.instructions("implementer")).toMatch(/Skill tool.*read|read.*Skill tool/i);
  expect(source.status()).toMatchObject({ installed: true, dirty: false });
});

test("explicit upstream updates affect later runs while an active run and its reopened snapshot stay unchanged", () => {
  const { source, upstream, stateDir } = fixture();
  source.sync();
  const before = source.snapshot("active-run");
  writeFileSync(join(upstream, "skills/engineering/build/templates/example.txt"), "upstream helper v2\n");
  git(upstream, "commit", "-am", "Update current instructions");
  const nextRevision = git(upstream, "rev-parse", "HEAD");
  expect(source.sync().revision).toBe(nextRevision);
  const after = source.snapshot("later-run");
  const reopened = new SkillsSource({ stateDir, upstream }).snapshot("active-run");

  expect(after.revision).toBe(nextRevision);
  expect(after.revision).not.toBe(before.revision);
  expect(readFileSync(join(after.root, "skills/engineering/build/templates/example.txt"), "utf8")).toBe("upstream helper v2\n");
  expect(readFileSync(join(before.root, "skills/engineering/build/templates/example.txt"), "utf8")).toBe("upstream helper v1\n");
  expect(reopened).toEqual(before);
  expect(reopened.instructions("spec-reviewer")).toBe(before.instructions("spec-reviewer"));
  rmSync(source.sourceDir, { recursive: true, force: true });
  expect(source.snapshot("active-run")).toEqual(before);
});

test("sync refuses dirty, ignored, detached, wrong-branch, and diverged sources while preserving their work", () => {
  const { source, upstream } = fixture();
  source.sync();
  const tip = source.status().revision;
  const skillPath = join(source.sourceDir, "skills/engineering/build/SKILL.md");
  writeFileSync(skillPath, "unfinished skill edit\n");
  writeFileSync(join(source.sourceDir, "personal-note"), "keep this too\n");
  expect(() => source.sync()).toThrow(/clean|changes/i);
  expect(() => source.snapshot("dirty-run")).toThrow(/clean|changes/i);
  expect(readFileSync(skillPath, "utf8")).toBe("unfinished skill edit\n");
  expect(readFileSync(join(source.sourceDir, "personal-note"), "utf8")).toBe("keep this too\n");
  expect(source.status().revision).toBe(tip);
  git(source.sourceDir, "restore", "skills/engineering/build/SKILL.md");
  rmSync(join(source.sourceDir, "personal-note"));

  writeFileSync(join(source.sourceDir, ".git/info/exclude"), "private-note\n");
  writeFileSync(join(source.sourceDir, "private-note"), "ignored user file\n");
  expect(() => source.sync()).toThrow(/ignored|changes/i);
  expect(readFileSync(join(source.sourceDir, "private-note"), "utf8")).toBe("ignored user file\n");
  rmSync(join(source.sourceDir, "private-note"));

  git(source.sourceDir, "checkout", "--detach");
  expect(() => source.sync()).toThrow(/detached/i);
  git(source.sourceDir, "checkout", "-b", "personal-branch");
  git(source.sourceDir, "branch", "--set-upstream-to=origin/main");
  expect(() => source.sync()).toThrow(/default.*branch/i);
  expect(git(source.sourceDir, "branch", "--show-current")).toBe("personal-branch");
  git(source.sourceDir, "checkout", "main");
  git(source.sourceDir, "config", "user.name", "Local user");
  git(source.sourceDir, "config", "user.email", "local@localhost");
  writeFileSync(join(source.sourceDir, "local-work"), "committed user changes\n");
  git(source.sourceDir, "add", ".");
  git(source.sourceDir, "commit", "-m", "User work");
  const localTip = source.status().revision;
  writeFileSync(join(upstream, "remote-work"), "upstream changes\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Divergent upstream");
  expect(() => source.sync()).toThrow(/fast-forward|diverged|local.*commits/i);
  expect(source.status().revision).toBe(localTip);
  expect(readFileSync(join(source.sourceDir, "local-work"), "utf8")).toBe("committed user changes\n");
  expect(existsSync(join(upstream, "local-work"))).toBe(false);
});

test("snapshots materialize committed internal file links and chains without changing source links", () => {
  const { source, upstream } = fixture();
  const body = "Original committed agent instructions.\n";
  writeFileSync(join(upstream, "CLAUDE.md"), body);
  symlinkSync("CLAUDE.md", join(upstream, "AGENTS.md"));
  mkdirSync(join(upstream, "docs"));
  symlinkSync("../AGENTS.md", join(upstream, "docs/agent-link.md"));
  symlinkSync("docs/agent-link.md", join(upstream, "agent-chain.md"));
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Committed internal links like current upstream");
  source.sync();
  const snapshot = source.snapshot("internal-links");
  for (const path of ["CLAUDE.md", "AGENTS.md", "docs/agent-link.md", "agent-chain.md"]) {
    expect(lstatSync(join(snapshot.root, path)).isFile()).toBe(true);
    expect(lstatSync(join(snapshot.root, path)).isSymbolicLink()).toBe(false);
    expect(lstatSync(join(snapshot.root, path)).mode & 0o222).toBe(0);
    expect(readFileSync(join(snapshot.root, path), "utf8")).toBe(body);
  }
  expect(readlinkSync(join(source.sourceDir, "AGENTS.md"))).toBe("CLAUDE.md");
  expect(source.snapshot("internal-links")).toEqual(snapshot);
  expect(source.status().dirty).toBe(false);
});

test("snapshots refuse external symlinks instead of following them", () => {
  const { root, source, upstream } = fixture();
  writeFileSync(join(root, "private.txt"), "private secret fixture\n");
  symlinkSync(join(root, "private.txt"), join(upstream, "external-file"));
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Unsafe symlinks");
  source.sync();
  expect(() => source.snapshot("unsafe-run")).toThrow(/symlink|regular/i);
  expect(existsSync(join(root, "state/skill-snapshots/unsafe-run"))).toBe(false);
  expect(readFileSync(join(root, "private.txt"), "utf8")).toBe("private secret fixture\n");
});

test("escaping, cyclic, dangling, directory and backslash links cannot enter a snapshot", () => {
  for (const [name, target] of [["escape", "../outside"], ["cycle", "cycle"], ["dangling", "missing.md"], ["directory", "skills"], ["backslash", "skills\\engineering"]]) {
    const { root, source, upstream } = fixture();
    symlinkSync(target!, join(upstream, name!));
    git(upstream, "add", ".");
    git(upstream, "commit", "-m", `Unsafe ${name} link`);
    source.sync();
    expect(() => source.snapshot(`unsafe-${name}`)).toThrow(/symlink|unsafe|regular|path/i);
    expect(existsSync(join(root, "state/skill-snapshots", `unsafe-${name}`))).toBe(false);
  }
});

test("inventory accepts upstream's plain-text description containing an unquoted colon without rewriting its body", () => {
  const { source, upstream } = fixture();
  const body = "---\nname: build-things\ndescription: Shared language for a factory: tasks and services.\ndisable-model-invocation: true\n---\nOriginal skill body.\n";
  writeFileSync(join(upstream, "skills/engineering/build/SKILL.md"), body);
  git(upstream, "commit", "-am", "Plain-text description like current upstream");
  source.sync();
  const snapshot = source.snapshot("plain-description");
  expect(snapshot.skills[0]!.description).toBe("Shared language for a factory: tasks and services.");
  expect(readFileSync(snapshot.skills[0]!.path, "utf8")).toBe(body);
});

test("a changed snapshot is refused instead of silently changing active instructions", () => {
  const { source } = fixture();
  source.sync();
  const snapshot = source.snapshot("active-run");
  chmodSync(snapshot.skills[0]!.path, 0o600);
  writeFileSync(snapshot.skills[0]!.path, "changed active instructions\n");
  expect(() => source.snapshot("active-run")).toThrow(/snapshot.*changed|integrity/i);
});

test("unsafe run IDs and source paths cannot place snapshots into the source checkout", () => {
  const { root, source, stateDir } = fixture();
  for (const id of ["../escape", "/absolute", "with space", "", ".", "x".repeat(129)]) {
    expect(() => source.snapshot(id)).toThrow(/run id/i);
  }
  expect(() => new SkillsSource({ stateDir, sourceDir: stateDir })).toThrow(/separate/i);
  expect(() => new SkillsSource({ stateDir, sourceDir: join(stateDir, "skill-snapshots/nested-source") })).toThrow(/separate/i);
  mkdirSync(join(root, "not-a-checkout"));
  writeFileSync(join(root, "not-a-checkout", "user-file"), "unrelated user file\n");
  const unknown = new SkillsSource({ stateDir, sourceDir: join(root, "not-a-checkout") });
  expect(() => unknown.sync()).toThrow(/git|checkout/i);
  expect(readFileSync(join(root, "not-a-checkout", "user-file"), "utf8")).toBe("unrelated user file\n");
});

test("redirected snapshot directories and unsafe committed filenames are refused without following them", () => {
  const { root, source, upstream } = fixture();
  source.sync();
  const snapshot = source.snapshot("safe-run");
  rmSync(join(snapshot.root, "skills"), { recursive: true });
  symlinkSync(upstream, join(snapshot.root, "skills"));
  expect(() => source.snapshot("safe-run")).toThrow(/integrity|redirected/i);
  expect(readFileSync(join(upstream, "skills/engineering/build/templates/example.txt"), "utf8")).toBe("upstream helper v1\n");
  writeFileSync(join(upstream, "unsafe\\name"), "a filename unsafe on another host\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Unsafe filename");
  source.sync();
  expect(() => source.snapshot("unsafe-name")).toThrow(/unsafe.*path/i);
  expect(existsSync(join(root, "state/skill-snapshots/unsafe-name"))).toBe(false);
});

test("local role choices use the live current model unless a resolvable explicit alias was saved", async () => {
  const { stateDir } = fixture();
  const choices = new RoleChoices(stateDir);
  const first = { provider: "fixture-one", id: "available", thinking: "high" };
  const second = { provider: "entirely-different", id: "only-one" };
  expect(await choices.resolve("implementer", { current: first, resolve: () => undefined })).toBe(first);
  expect(await choices.resolve("implementer", { current: second, resolve: () => undefined })).toBe(second);
  choices.set("spec-reviewer", "@local-review");
  expect(new RoleChoices(stateDir).list()).toEqual({ "spec-reviewer": "@local-review" });
  const resolved = await new RoleChoices(stateDir).resolve("spec-reviewer", {
    current: first,
    resolve: (spec) => spec === "@local-review" ? second : undefined,
  });
  expect(resolved).toBe(second);
  await expect(choices.resolve("spec-reviewer", { current: first, resolve: () => undefined })).rejects.toThrow(/unavailable.*@local-review|@local-review.*unavailable/i);
  choices.set("spec-reviewer", undefined);
  expect(await choices.resolve("spec-reviewer", { current: first, resolve: () => undefined })).toBe(first);
  await expect(choices.resolve("implementer", { current: undefined, resolve: () => second })).rejects.toThrow(/live.*model|current.*model/i);
});
