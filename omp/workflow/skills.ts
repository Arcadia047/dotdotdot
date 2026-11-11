import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";

export interface SkillsSourceOptions {
  /** Host-owned local state, outside candidate worktrees. */
  stateDir: string;
  sourceDir?: string;
  /** Trusted host option; never accept an arbitrary checkout URL from a model tool. */
  upstream?: string;
}
export interface SkillsStatus {
  installed: boolean;
  sourceDir: string;
  revision?: string;
  branch?: string;
  dirty?: boolean;
  message?: string;
}
export interface SkillEntry {
  name: string;
  description: string;
  relativePath: string;
  /** Exact immutable run input; use read instead of a nonexistent Skill tool. */
  path: string;
}
interface SnapshotRecord {
  version: 1;
  runId: string;
  revision: string;
  skills: Omit<SkillEntry, "path">[];
  files: { path: string; sha256: string; resolvedFrom?: string }[];
}

export class SkillsSnapshot {
  readonly skills: SkillEntry[];
  constructor(readonly runId: string, readonly revision: string, readonly root: string, skills: Omit<SkillEntry, "path">[]) {
    this.skills = skills.map((skill) => ({ ...skill, path: join(root, skill.relativePath) }));
  }
  instructions(role: string): string {
    return [
      `Upstream skill instructions for role ${JSON.stringify(role)} (run ${this.runId}, source revision ${this.revision}).`,
      "Read the relevant SKILL.md below before applying a skill; read its referenced companion files relative to that skill file.",
      "When upstream says to call the Skill tool, use the read tool on the exact SKILL.md path below instead.",
      "Keep these upstream files unchanged. Apply relevant skills within the assigned role and the manager's worktree, verification and delegation contract.",
      "Do not create extra unmanaged workers or change branches merely because an upstream skill describes a different execution environment.",
      ...this.skills.map((skill) => `- ${JSON.stringify(skill.name)}: ${skill.description}\n  SKILL.md: ${JSON.stringify(skill.path)}`),
    ].join("\n");
  }
}

function git(cwd: string, args: string[], input?: Buffer): Buffer {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdin: input });
  if (result.exitCode !== 0) throw new Error(`Skills Git ${args[0]} failed: ${result.stderr.toString().trim()}`);
  return result.stdout;
}
function textGit(cwd: string, ...args: string[]): string { return git(cwd, args).toString().trim(); }
function safePath(path: string): void {
  if (!path || path.includes("\0") || path.includes("\\") || isAbsolute(path) || /^[a-z]:/i.test(path) || path.split("/").some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) {
    throw new Error(`Unsafe skills tree path ${JSON.stringify(path)}.`);
  }
}
function canonical(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  return parent === path ? path : join(canonical(parent), relative(parent, path));
}
function inside(parent: string, path: string): boolean {
  const child = relative(parent, path);
  return child === "" || (!isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`));
}
function directory(path: string): void {
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Skills snapshot integrity: directory ${path} is missing or redirected.`);
}
function regular(path: string): void {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Skills snapshot integrity: file ${path} is missing or redirected.`);
}
function digest(body: Buffer): string { return createHash("sha256").update(body).digest("hex"); }
function skillMetadata(header: string, path: string): Record<string, unknown> {
  try { return Bun.YAML.parse(header) as Record<string, unknown>; }
  catch {
    // Some upstream descriptions are plain text with an unquoted colon. Quote
    // that scalar for inventory parsing only; the captured skill bytes stay exact.
    const description = /^description:[ \t]*([^\r\n]+)$/m.exec(header)?.[1]?.trim();
    if (description?.includes(": ") && !["'", '"', "|", ">", "{", "[", "&", "*", "!", "#"].includes(description[0]!)) {
      try {
        return Bun.YAML.parse(header.replace(/^description:[ \t]*[^\r\n]*$/m, `description: ${JSON.stringify(description)}`)) as Record<string, unknown>;
      } catch { /* Report the upstream path below rather than a bare YAML error. */ }
    }
    throw new Error(`Skill ${path} has unreadable name/description frontmatter; inspect the upstream file.`);
  }
}

/** Explicit, inbound-only upstream maintenance, separate from run instructions. */
export class SkillsSource {
  readonly sourceDir: string;
  private readonly stateDir: string;
  private readonly upstream: string;

  constructor(options: SkillsSourceOptions) {
    this.stateDir = canonical(resolve(options.stateDir));
    this.sourceDir = canonical(resolve(options.sourceDir ?? join(this.stateDir, "skills-source")));
    this.upstream = options.upstream ?? "https://github.com/mattpocock/skills";
    const snapshots = join(this.stateDir, "skill-snapshots");
    if (inside(this.sourceDir, snapshots) || inside(snapshots, this.sourceDir)) {
      throw new Error("Skills source and local snapshot directories must be separate, outside candidate checkouts.");
    }
  }

  status(): SkillsStatus {
    if (!existsSync(this.sourceDir)) return { installed: false, sourceDir: this.sourceDir,
      message: "Run the explicit skills sync/setup command before starting work." };
    if (resolve(textGit(this.sourceDir, "rev-parse", "--show-toplevel")) !== this.sourceDir) {
      throw new Error("Skills source must be the root of its own Git checkout.");
    }
    return { installed: true, sourceDir: this.sourceDir,
      revision: textGit(this.sourceDir, "rev-parse", "HEAD"),
      branch: textGit(this.sourceDir, "branch", "--show-current"),
      dirty: textGit(this.sourceDir, "status", "--porcelain=v1", "--untracked-files=all", "--ignored=matching") !== "" };
  }

  /** The only entry point that contacts upstream. Never called by snapshot(). */
  sync(): SkillsStatus {
    if (!existsSync(this.sourceDir)) {
      mkdirSync(dirname(this.sourceDir), { recursive: true, mode: 0o700 });
      const temporary = join(dirname(this.sourceDir), `.skills-clone-${randomUUID()}`);
      try {
        textGit(dirname(this.sourceDir), "clone", "--", this.upstream, temporary);
        renameSync(temporary, this.sourceDir);
      } finally { rmSync(temporary, { recursive: true, force: true }); }
    }
    const status = this.status();
    if (status.dirty) throw new Error("Skills source has local, untracked, or ignored changes; preserve them and restore a clean checkout before syncing.");
    if (!status.branch) throw new Error("Skills source is detached; select its default tracked branch before syncing.");
    const tracking = textGit(this.sourceDir, "for-each-ref", "--format=%(upstream:remotename)%00%(upstream:remoteref)", `refs/heads/${status.branch}`).split("\0");
    const [remote, trackedRef] = tracking;
    if (!remote || remote === "." || !trackedRef?.startsWith("refs/heads/")) {
      throw new Error("Skills source needs its default branch to track an upstream remote before syncing.");
    }
    const remoteUrl = textGit(this.sourceDir, "remote", "get-url", remote);
    const normalize = (url: string): string => url.replace(/\/$/, "").replace(/\.git$/, "");
    if (normalize(remoteUrl) !== normalize(this.upstream)) {
      throw new Error("Skills source remote differs from the host-configured upstream; inspect the source directory and trusted setup options.");
    }
    const advertised = textGit(this.sourceDir, "ls-remote", "--symref", "--", remote, "HEAD");
    const defaultRef = /^ref:\s+(refs\/heads\/\S+)\s+HEAD$/m.exec(advertised)?.[1];
    if (!defaultRef || trackedRef !== defaultRef || status.branch !== defaultRef.slice("refs/heads/".length)) {
      throw new Error("Skills source must be on the upstream default tracked branch; other branches are preserved without updating.");
    }
    const remoteRef = `refs/remotes/${remote}/${defaultRef.slice("refs/heads/".length)}`;
    textGit(this.sourceDir, "fetch", "--no-tags", "--no-write-fetch-head", "--", remote, `${defaultRef}:${remoteRef}`);
    const ancestor = Bun.spawnSync(["git", "-C", this.sourceDir, "merge-base", "--is-ancestor", status.revision!, remoteRef]);
    if (ancestor.exitCode !== 0) throw new Error("Skills source contains local or diverged commits; preserve them. Only a fast-forward upstream update is allowed.");
    textGit(this.sourceDir, "-c", "core.hooksPath=/dev/null", "merge", "--ff-only", "--no-overwrite-ignore", remoteRef);
    return this.status();
  }

  /** Captures committed blobs, materializing safe file links without reading working files. */
  snapshot(runId: string): SkillsSnapshot {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(runId)) throw new Error("Invalid skills run ID.");
    const destination = join(this.stateDir, "skill-snapshots", runId);
    const load = (): SkillsSnapshot => {
      directory(join(this.stateDir, "skill-snapshots"));
      directory(destination);
      directory(join(destination, "tree"));
      regular(join(destination, "snapshot.json"));
      const record = JSON.parse(readFileSync(join(destination, "snapshot.json"), "utf8")) as SnapshotRecord;
      if (record.version !== 1 || record.runId !== runId || !/^[a-f0-9]{40,64}$/.test(record.revision) || !Array.isArray(record.files) || !Array.isArray(record.skills)) {
        throw new Error("Invalid skills snapshot record; retain it for inspection.");
      }
      for (const file of record.files) {
        safePath(file.path);
        let parent = join(destination, "tree");
        for (const component of file.path.split("/").slice(0, -1)) { parent = join(parent, component); directory(parent); }
        const path = join(destination, "tree", file.path);
        regular(path);
        if (digest(readFileSync(path)) !== file.sha256) throw new Error(`Skills snapshot integrity: ${file.path} changed; retain the run and investigate.`);
      }
      for (const skill of record.skills) {
        safePath(skill.relativePath);
        if (!record.files.some((file) => file.path === skill.relativePath) || typeof skill.name !== "string" || typeof skill.description !== "string") {
          throw new Error("Invalid skills snapshot inventory; retain it for inspection.");
        }
      }
      return new SkillsSnapshot(runId, record.revision, join(destination, "tree"), record.skills);
    };
    if (existsSync(destination)) return load();
    const status = this.status();
    if (!status.installed) throw new Error("Skills source is unavailable; run skills sync/setup first.");
    if (status.dirty) throw new Error("Skills source has local or untracked changes; preserve them and restore a clean checkout before snapshotting.");
    const revision = status.revision!;
    const tree = git(this.sourceDir, ["ls-tree", "-rz", "--full-tree", revision]).toString("utf8").split("\0").filter(Boolean).map((entry) => {
      const tab = entry.indexOf("\t");
      const [mode, type, object] = entry.slice(0, tab).split(" ");
      const path = entry.slice(tab + 1);
      safePath(path);
      if (type !== "blob" || (mode !== "100644" && mode !== "100755" && mode !== "120000")) {
        throw new Error(`Unsupported skills submodule or tree entry at ${JSON.stringify(path)}; snapshots require committed files.`);
      }
      return { path, mode, object: object! };
    });
    const entries = new Map(tree.map((entry) => [entry.path, entry]));
    const resolveFile = (path: string): typeof tree[number] => {
      const seen = new Set<string>();
      while (true) {
        if (seen.has(path)) throw new Error(`Cyclic skills symlink at ${JSON.stringify(path)}; a regular committed file is required.`);
        seen.add(path);
        const entry = entries.get(path);
        if (!entry) throw new Error(`Dangling or directory skills symlink target ${JSON.stringify(path)}; a regular committed file is required.`);
        if (entry.mode !== "120000") return entry;
        const blob = git(this.sourceDir, ["cat-file", "blob", entry.object]);
        const target = blob.toString("utf8");
        if (!target || target.includes("\0") || target.includes("\\") || posix.isAbsolute(target) || /^[a-z]:/i.test(target) || !Buffer.from(target, "utf8").equals(blob)) {
          throw new Error(`Unsafe skills symlink target at ${JSON.stringify(path)}; only relative Git-tree file links are supported.`);
        }
        path = posix.normalize(posix.join(posix.dirname(path), target));
        safePath(path);
      }
    };
    mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    directory(this.stateDir);
    const snapshots = join(this.stateDir, "skill-snapshots");
    if (!existsSync(snapshots)) mkdirSync(snapshots, { mode: 0o700 });
    directory(snapshots);
    const temporary = join(this.stateDir, "skill-snapshots", `.capture-${randomUUID()}`);
    mkdirSync(join(temporary, "tree"), { recursive: true, mode: 0o700 });
    const skills: Omit<SkillEntry, "path">[] = [];
    const files: SnapshotRecord["files"] = [];
    try {
      for (const entry of tree) {
        const resolved = resolveFile(entry.path);
        const body = git(this.sourceDir, ["cat-file", "blob", resolved.object]);
        const path = join(temporary, "tree", entry.path);
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        writeFileSync(path, body, { flag: "wx", mode: resolved.mode === "100755" ? 0o500 : 0o400 });
        files.push({ path: entry.path, sha256: digest(body), ...(resolved.path === entry.path ? {} : { resolvedFrom: resolved.path }) });
        if (entry.path.split("/").at(-1) === "SKILL.md") {
          const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body.toString("utf8"));
          const metadata = frontmatter ? skillMetadata(frontmatter[1]!, entry.path) : undefined;
          if (!metadata || typeof metadata.name !== "string" || !metadata.name.trim() || typeof metadata.description !== "string" || !metadata.description.trim()) {
            throw new Error(`Skill ${entry.path} requires name and description frontmatter.`);
          }
          skills.push({ name: metadata.name, description: metadata.description, relativePath: entry.path });
        }
      }
      if (!skills.length) throw new Error("The skills source has no SKILL.md instructions; inspect its upstream and layout.");
      const record: SnapshotRecord = { version: 1, runId, revision, skills, files };
      writeFileSync(join(temporary, "snapshot.json"), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o400 });
      renameSync(temporary, destination);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
    return load();
  }
}

export interface LiveRoleModels<Model> {
  /** Read from the live OMP host at dispatch, including any supported thinking choice. */
  current: Model | undefined;
  resolve(spec: string): Model | undefined | Promise<Model | undefined>;
}

/** Only locally chosen aliases/selectors are persisted; no catalog or ranking. */
export class RoleChoices {
  private readonly path: string;
  constructor(stateDir: string) { this.path = join(canonical(resolve(stateDir)), "role-choices.json"); }

  list(): Record<string, string> {
    if (!existsSync(this.path)) return {};
    regular(this.path);
    const choices: unknown = JSON.parse(readFileSync(this.path, "utf8"));
    if (!choices || typeof choices !== "object" || Array.isArray(choices)) throw new Error("Invalid local role choices; inspect role-choices.json.");
    for (const [role, spec] of Object.entries(choices)) this.validate(role, spec);
    return { ...choices } as Record<string, string>;
  }

  set(role: string, spec: string | undefined): void {
    this.validate(role, spec ?? "remove");
    const choices = this.list();
    if (spec === undefined) delete choices[role];
    else choices[role] = spec;
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(choices, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      renameSync(temporary, this.path);
    } finally { rmSync(temporary, { force: true }); }
  }

  async resolve<Model>(role: string, models: LiveRoleModels<Model>): Promise<Model> {
    this.validate(role, "role");
    const spec = this.list()[role];
    if (spec !== undefined) {
      let selected: Model | undefined;
      try { selected = await models.resolve(spec); }
      catch (error) { throw new Error(`Local model choice ${JSON.stringify(spec)} for ${role} is unavailable: ${error instanceof Error ? error.message : String(error)}`); }
      if (selected === undefined || selected === null) throw new Error(`Local model choice ${JSON.stringify(spec)} for ${role} is unavailable; update or remove that local override.`);
      return selected;
    }
    if (models.current === undefined || models.current === null) throw new Error(`No live current model is selected for ${role}; choose one in OMP before dispatch.`);
    return models.current;
  }

  private validate(role: string, spec: unknown): void {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(role) || typeof spec !== "string" || !spec.trim()) {
      throw new Error("Local role choices require a role name and a nonempty alias or selector.");
    }
  }
}
