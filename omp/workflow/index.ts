import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { WorkManager, type WorkerClient, type ModelSelection } from "./manager";
import { OmpWorker } from "./rpc";
import { RoleChoices, SkillsSource } from "./skills";
import type { JobInput } from "./types";

/** The external OMP boundary; importing this module needs no host package. */
export interface WorkContext {
  model?: ModelSelection;
  models: { current(): ModelSelection | undefined; resolve(spec: string): ModelSelection | undefined | Promise<ModelSelection | undefined>; list(): ModelSelection[] };
  agent?: { kind: string };
}
export interface WorkHost {
  zod: any;
  registerTool(tool: { name: string; label: string; description: string; parameters: any; loadMode: string; approval: string; execute(...args: any[]): Promise<unknown> }): unknown;
  registerCommand(name: string, command: { description: string; handler(args: string, ctx: WorkContext): Promise<void> }): unknown;
  on(name: string, handler: (...args: any[]) => Promise<void>): unknown;
  sendMessage(message: unknown, options?: unknown): unknown;
  getThinkingLevel(): string;
}
interface Options { agentDir: string; worker?: WorkerClient; skillsDir?: string; upstream?: string }
const help = "/work status | pause | resume [job-id] | cleanup <job-id> | skills status|sync | roles | role set <role> <model-selector> | role clear <role>\nSubmit an accepted plan through work_submit with self-contained tasks, acceptance criteria, checks, and explicit dependencies. Work continues while this OMP session is alive. Settings: <agent-dir>/work/config.json; skills require explicit /work skills sync.";

function config(stateDir: string): { maxWorkers?: number; repairLimit?: number; skillsDir?: string } {
  const path = join(stateDir, "config.json");
  if (!existsSync(path)) return {};
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid local work configuration in ${path}.`);
  for (const key of Object.keys(value)) if (!["maxWorkers", "repairLimit", "skillsDir"].includes(key)) throw new Error(`Unknown local work setting ${key} in ${path}.`);
  if (value.maxWorkers !== undefined && (!Number.isSafeInteger(value.maxWorkers) || value.maxWorkers < 1)) throw new Error("maxWorkers must be a positive safe integer.");
  if (value.repairLimit !== undefined && (!Number.isSafeInteger(value.repairLimit) || value.repairLimit < 0)) throw new Error("repairLimit must be a nonnegative safe integer.");
  if (value.skillsDir !== undefined && (typeof value.skillsDir !== "string" || !isAbsolute(value.skillsDir) || value.skillsDir.includes("\0"))) throw new Error("skillsDir must be an absolute local path.");
  return value;
}
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function response(details: unknown) { return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details }; }

/** Called by the host factory, also the public external-host verification seam. */
export function registerWorkExtension(pi: WorkHost, options: Options): void {
  if (process.env.DOTDOTDOT_WORK_CHILD === "1") return;
  if (!isAbsolute(options.agentDir)) throw new Error("OMP must supply an absolute active agent directory.");
  const stateDir = join(options.agentDir, "work");
  let manager: WorkManager | undefined;
  let latest: WorkContext | undefined;
  let closing = false;
  const roles = new RoleChoices(stateDir);
  const source = () => new SkillsSource({ stateDir, sourceDir: options.skillsDir ?? process.env.DOTDOTDOT_WORK_SKILLS_DIR ?? config(stateDir).skillsDir, upstream: options.upstream });
  const notify = (content: string, followThrough = false) => {
    if (!closing) pi.sendMessage({ customType: "work-manager", content, display: true }, followThrough ? { deliverAs: "followUp", triggerTurn: true } : undefined);
  };
  const context = (ctx: WorkContext) => {
    if (closing) throw new Error("This manager session is shutting down.");
    if (ctx.agent?.kind === "sub") throw new Error("Managed work is available only in the main OMP session.");
    latest = ctx;
  };
  const selected = async (role: string): Promise<ModelSelection> => {
    if (!latest?.models) throw new Error("OMP does not expose live model selection; update OMP before dispatch.");
    const selected = await roles.resolve(role, { current: latest.models.current(), resolve: (spec) => latest!.models.resolve(spec) });
    if (!selected?.provider || !selected.id || !latest.models.list().some((model) => model.provider === selected.provider && model.id === selected.id)) throw new Error(`The selected model for ${role} is unavailable in this live OMP session.`);
    return { provider: selected.provider, id: selected.id, thinking: pi.getThinkingLevel() };
  };
  const getManager = (ctx: WorkContext): WorkManager => {
    context(ctx);
    if (!manager) {
      const local = config(stateDir);
      manager = new WorkManager({ stateDir, worker: options.worker ?? new OmpWorker({ env: { PI_CODING_AGENT_DIR: options.agentDir, OMP_PROFILE: "default", PI_PROFILE: undefined } }), model: { provider: "", id: "" },
        maxWorkers: local.maxWorkers, repairLimit: local.repairLimit, modelFor: selected,
        instructions: (role, job) => {
          try { return source().snapshot(job.integrationTarget ?? job.id).instructions(role); }
          catch (error) { throw new Error(`${errorText(error)} Inspect /work skills status; use /work skills sync for explicit setup/update.`); }
        },
        onEvent: ({ job, message }) => {
          if (["ready", "blocked", "interrupted"].includes(job.status)) notify(`${message}\n${JSON.stringify({ id: job.id, status: job.status, branch: job.branch, revision: job.candidate, blocker: job.blocker, worktree: job.worktree, evidence: join(stateDir, "results", `${job.id}.json`) })}\nInspect the local evidence and follow through: report the result or precise blocker to the user; continue independent authorized work.`, true);
        },
      });
    }
    return manager;
  };
  const background = (operation: Promise<unknown>) => { void operation.catch((error) => notify(`Work manager stopped: ${errorText(error)} Inspect /work status and reconcile before resuming.`, true)); };
  const z = pi.zod;
  const check = z.object({ name: z.string().min(1), command: z.string().min(1) }).strict();
  const job = z.object({ id: z.string().optional(), kind: z.enum(["implementation", "integration"]).optional(), task: z.string().min(1), repo: z.string().min(1), branch: z.string().min(1), base: z.string().optional(), acceptance: z.array(z.string().min(1)).min(1), checks: z.array(check).min(1), dependsOn: z.array(z.string()).optional(), integrationTarget: z.string().optional() }).strict();
  const submit = z.object({ jobs: z.array(job).min(1) }).strict();
  const control = z.object({ action: z.enum(["pause", "resume", "cleanup"]), id: z.string().optional() }).strict();
  const skills = z.object({ action: z.enum(["status", "sync"]) }).strict();
  const empty = z.object({}).strict();
  const tool = (name: string, label: string, description: string, parameters: any, approval: string, execute: (params: any, ctx: WorkContext) => Promise<unknown>) => pi.registerTool({ name, label, description, parameters, loadMode: "essential", approval,
    execute: async (_id, params, _signal, _update, ctx) => { context(ctx); return execute(parameters.parse(params), ctx); } });
  tool("work_submit", "Submit work", "Start jobs from the user's accepted plan. Include self-contained authorized scope, acceptance and actual checks. Dependencies are job IDs; related children name their integrationTarget parent. Never submit unapproved work or inject readiness evidence.", submit, "exec", async (params: { jobs: JobInput[] }, ctx) => {
    const current = getManager(ctx);
    const jobs = current.submit(params.jobs);
    background(current.start());
    const { paused } = current.status();
    return response({ message: paused ? "Jobs queued; dispatch remains paused until explicit resume." : "Jobs queued; the manager follows through automatically while this OMP session remains alive.", paused, jobs });
  });
  tool("work_status", "Work status", "Read queue status, branch/revision and blockers. Read local result evidence before explaining readiness.", empty, "read", async (_params, ctx) => response(getManager(ctx).status()));
  tool("work_control", "Control work", "Pause dispatch, explicitly reconcile/resume work, or safely clean an owned completed workspace. Cleanup requires a job ID and preserves dirty or unknown work.", control, "exec", async (params, ctx) => {
    const current = getManager(ctx);
    if (params.action === "pause") current.pause();
    else if (params.action === "resume") background(current.resume(params.id));
    else {
      if (!params.id) throw new Error("Cleanup requires a job ID.");
      current.cleanup(params.id);
    }
    return response(current.status());
  });
  tool("work_skills", "Work skills", "Inspect current upstream skills or explicitly sync their source. Sync is an inbound update; active jobs retain immutable skill inputs. No model selection changes.", skills, "exec", async (params) => response(params.action === "sync" ? source().sync() : source().status()));
  pi.registerCommand("work", { description: "Manage local parallel work, skills and trusted role choices", handler: async (args, ctx) => {
    context(ctx);
    try {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const [action, sub, ...tail] = parts;
      if (!action || action === "help") { notify(`${help}\n${JSON.stringify(getManager(ctx).status(), null, 2)}`); return; }
      if (action === "status" && parts.length === 1) notify(JSON.stringify(getManager(ctx).status(), null, 2));
      else if (action === "pause" && parts.length === 1) { getManager(ctx).pause(); notify("Work dispatch paused. Active workers may finish; /work resume explicitly continues."); }
      else if (action === "resume" && parts.length <= 2) { background(getManager(ctx).resume(sub)); notify("Work reconciliation/resume requested; inspect /work status for progress."); }
      else if (action === "cleanup" && parts.length === 2) { getManager(ctx).cleanup(sub!); notify(`Retained local evidence; cleaned safe owned workspace for ${sub}.`); }
      else if (action === "skills" && parts.length === 2 && ["sync", "status"].includes(sub!)) notify(JSON.stringify(sub === "sync" ? source().sync() : source().status(), null, 2));
      else if (action === "roles" && parts.length === 1) notify(JSON.stringify(roles.list(), null, 2));
      else if (action === "role" && sub === "set" && tail.length >= 2) {
        const [role, ...selector] = tail;
        const spec = selector.join(" ");
        const found = await ctx.models.resolve(spec);
        if (!found || !ctx.models.list().some((model) => model.provider === found.provider && model.id === found.id)) throw new Error("That model selector is unavailable in this OMP session. Choose from the live model catalog.");
        roles.set(role!, spec); notify(`Local ${role} choice saved. Identity resolves at each dispatch; thinking inherits the live OMP setting.`);
      } else if (action === "role" && sub === "clear" && tail.length === 1) { roles.set(tail[0]!, undefined); notify(`Local ${tail[0]} choice cleared; the role inherits the live current model.`); }
      else throw new Error(help);
    } catch (error) { notify(`Work command: ${errorText(error)}`); }
  } });
  pi.on("session_shutdown", async () => { closing = true; await manager?.close(); });
}

export default async function workExtension(pi: WorkHost): Promise<void> {
  if (process.env.DOTDOTDOT_WORK_CHILD === "1") return;
  // The standalone binary supplies this module through its compatibility loader.
  // @ts-expect-error The installed OMP host supplies its package at extension load.
  const host = await import("@oh-my-pi/pi-coding-agent");
  registerWorkExtension(pi, { agentDir: host.getAgentDir() });
}
