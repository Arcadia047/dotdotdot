import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

export interface WorkerModel { provider: string; id: string; thinking?: string }
export interface WorkerRequest {
  cwd: string;
  model: WorkerModel;
  /** Trusted host callback, resolved at the spawn boundary after queueing. */
  selectModel?: () => WorkerModel | Promise<WorkerModel>;
  prompt: string;
  sessionDir: string;
  role?: string;
  reportSchema?: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
  onSpawn?: (worker: { pid: number; sessionDir: string }) => void;
}
export interface WorkerResult {
  text: string;
  report?: unknown;
  sessionFile?: string;
  model: { provider: string; id: string };
  pid: number;
  promptId: string;
  stderrFile: string;
  transcriptFile: string;
}
/** Host configuration only. Never expose executable or environment options as model tools. */
export interface OmpWorkerOptions {
  command?: string[];
  env?: Record<string, string | undefined>;
  inheritEnv?: boolean;
  extraArgs?: string[];
  defaultTimeoutMs?: number;
  maxOutputBytes?: number;
  killGraceMs?: number;
}
export class WorkerError extends Error {
  constructor(public readonly code: string, message: string, public readonly stderrFile?: string) { super(message); this.name = "WorkerError"; }
}
type Frame = Record<string, any>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

/** One fresh, cwd-bound OMP process per role. Completion is evidence, never a prompt ACK. */
export class OmpWorker {
  constructor(private readonly options: OmpWorkerOptions = {}) {}

  async run(request: WorkerRequest): Promise<WorkerResult> {
    if (!request.prompt?.trim()) throw new WorkerError("prompt", "A worker prompt is required");
    const timeoutMs = request.timeoutMs ?? this.options.defaultTimeoutMs ?? 30 * 60 * 1000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new WorkerError("timeout", "Worker timeout must be a positive finite duration");
    if (request.signal?.aborted) throw new WorkerError("cancelled", "Worker cancelled before spawn");
    const sessionDir = resolve(request.sessionDir);
    mkdirSync(sessionDir, { recursive: true });
    const artifactId = `worker-${randomUUID()}`;
    const stderrFile = join(sessionDir, `${artifactId}.stderr.log`);
    const transcriptFile = join(sessionDir, `${artifactId}.stdout.jsonl`);
    writeFileSync(stderrFile, "", { flag: "wx", mode: 0o600 });
    writeFileSync(transcriptFile, "", { flag: "wx", mode: 0o600 });
    const command = this.options.command ?? ["omp"];
    if (!command.length) throw new WorkerError("process", "OMP executable is required", stderrFile);
    const tools = /review|research|analyst|planner/i.test(request.role ?? "") ? "read,grep,glob" : "read,grep,glob,edit,write,bash";
    const model = { ...await (request.selectModel?.() ?? request.model) };
    if (!model.provider?.trim() || !model.id?.trim()) throw new WorkerError("model", "A host-selected provider and model ID are required", stderrFile);
    if (request.signal?.aborted) throw new WorkerError("cancelled", "Worker cancelled before spawn", stderrFile);
    const args = [...command.slice(1), ...(this.options.extraArgs ?? []), "--mode", "rpc", "--no-ui", "--cwd", resolve(request.cwd),
      "--model", `${model.provider}/${model.id}`, "--session-dir", sessionDir, "--tools", tools];
    if (model.thinking !== undefined) args.push("--thinking", model.thinking);
    const child = spawn(command[0], args, { cwd: resolve(request.cwd), detached: true,
      env: { ...(this.options.inheritEnv === false ? {} : process.env), ...this.options.env, DOTDOTDOT_WORK_CHILD: "1" }, stdio: "pipe" });
    const fatal = deferred<never>();
    let failure: WorkerError | undefined;
    const fail = (code: string, message: string) => {
      failure ??= new WorkerError(code, message, stderrFile);
      // Resolve an error separately from promises to avoid unobserved rejection races.
      fatal.resolve(failure as never);
    };
    const step = async <T>(promise: Promise<T>): Promise<T> => {
      if (failure) throw failure;
      const value = await Promise.race([promise, fatal.promise]);
      if (failure) throw failure;
      return value;
    };
    const ready = deferred<Frame>();
    const completed = deferred<Frame>();
    const settled = deferred<void>();
    const closed = deferred<{ code: number | null; signal: string | null }>();
    const pending = new Map<string, { command: string; accept: (frame: Frame) => void }>();
    let closing = false;
    let sawReady = false;
    let promptId: string | undefined;
    let promptCompleted = false;
    let report: unknown;
    let sequence = 0;
    let frameLimit = 1024 * 1024;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let buffer = Buffer.alloc(0);
    const maxOutput = this.options.maxOutputBytes ?? 32 * 1024 * 1024;
    const write = (frame: Frame) => {
      const line = JSON.stringify(frame) + "\n";
      if (Buffer.byteLength(line) > frameLimit) throw new WorkerError("protocol", "RPC input frame exceeded transport limit", stderrFile);
      child.stdin.write(line, (error) => { if (error && !closing) fail("process", `OMP stdin failed: ${error.message}`); });
    };
    const rpc = async (type: string, payload: Frame = {}): Promise<Frame> => {
      const id = `work-${++sequence}`;
      const reply = deferred<Frame>();
      pending.set(id, { command: type, accept: reply.resolve });
      if (type === "prompt") promptId = id;
      write({ id, type, ...payload });
      return step(reply.promise);
    };
    const receive = (frame: Frame) => {
      if (!frame || Array.isArray(frame) || typeof frame.type !== "string") throw new Error("RPC stdout frame must be a typed JSON object");
      if (frame.type === "rpc_chunk") throw new Error("Unexpected rpc_chunk: this adapter uses protocol v1; v2 reassembly is unsupported");
      if (frame.type === "rpc_frame_error") throw new Error("RPC frame exceeded transport limit");
      if (frame.type === "ready") {
        if (sawReady || frame.protocolVersion !== 1) throw new Error("Unsupported or duplicate RPC ready frame (requires protocol v1)");
        sawReady = true;
        if (Number.isInteger(frame.maxFrameBytes) && frame.maxFrameBytes > 0) frameLimit = Math.min(frameLimit, frame.maxFrameBytes);
        ready.resolve(frame);
      } else if (frame.type === "response") {
        const waiter = pending.get(frame.id);
        if (!frame.success && (waiter || frame.id === promptId || frame.command === "parse")) fail("protocol", `OMP ${frame.command} failed: ${frame.error ?? "unknown RPC error"}`);
        if (waiter) {
          if (frame.command !== waiter.command) throw new Error("RPC response command does not match its request ID");
          pending.delete(frame.id);
          waiter.accept(frame);
        }
      } else if (frame.type === "prompt_result" && frame.id === promptId) {
        if (frame.agentInvoked !== true || frame.status !== "completed") fail("prompt", `OMP prompt ${frame.status ?? "invalid"}: ${frame.error ?? "no successful model completion"}`);
        promptCompleted = true;
        completed.resolve(frame);
      } else if (frame.type === "session_settled" && promptCompleted) settled.resolve();
      else if (frame.type === "host_tool_call") {
        if (!request.reportSchema || frame.toolName !== "finish_report" || typeof frame.id !== "string") throw new Error("Unexpected host tool request");
        report = frame.arguments;
        write({ type: "host_tool_result", id: frame.id, result: { content: [{ type: "text", text: "Report captured by host; continue to completion." }], details: { captured: true } } });
      } else if (frame.type === "extension_error") fail("protocol", `OMP extension failed: ${frame.error ?? frame.extensionPath}`);
    };
    child.on("error", (error) => fail("process", `OMP process failed: ${error.message}`));
    child.stdin.on("error", (error) => { if (!closing) fail("process", `OMP stdin failed: ${error.message}`); });
    child.on("close", (code, signal) => {
      closed.resolve({ code, signal });
      if (!closing) fail("process", `OMP exited before completion (${signal ?? code})`);
    });
    child.stdout.on("data", (chunk: Buffer) => {
      try {
        stdoutBytes += chunk.length;
        if (stdoutBytes > maxOutput) { fail("output", "OMP stdout exceeded output limit"); return; }
        appendFileSync(transcriptFile, chunk);
        buffer = Buffer.concat([buffer, chunk]);
        let end: number;
        while ((end = buffer.indexOf(10)) !== -1) {
          if (end + 1 > frameLimit) throw new Error("RPC stdout frame exceeded transport limit");
          const line = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, end));
          buffer = buffer.subarray(end + 1);
          if (line.trim()) receive(JSON.parse(line));
        }
        if (buffer.length >= frameLimit) throw new Error("RPC stdout frame exceeded transport limit");
      } catch (error) { fail("protocol", `Invalid OMP RPC stdout: ${(error as Error).message}`); }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      try {
        const remaining = Math.max(0, maxOutput - stderrBytes);
        if (remaining) appendFileSync(stderrFile, chunk.subarray(0, remaining));
        stderrBytes += chunk.length;
        if (stderrBytes > maxOutput) fail("output", "OMP stderr exceeded output limit");
      } catch (error) { fail("process", `Cannot preserve OMP stderr: ${(error as Error).message}`); }
    });
    const timer = setTimeout(() => fail("timeout", `OMP worker exceeded deadline (${timeoutMs}ms)`), timeoutMs);
    const cancel = () => { try { write({ id: `abort-${++sequence}`, type: "abort" }); } catch {} fail("cancelled", "OMP worker cancelled"); };
    request.signal?.addEventListener("abort", cancel, { once: true });
    try {
      if (request.signal?.aborted) cancel();
      if (child.pid) request.onSpawn?.({ pid: child.pid, sessionDir });
      await step(ready.promise);
      const verifyModel = (state: Frame) => {
        if (state?.model?.provider !== model.provider || state?.model?.id !== model.id) throw new WorkerError("model", "OMP did not select the exact requested provider/model", stderrFile);
      };
      verifyModel((await rpc("get_state")).data);
      // Avoid large redundant streamed snapshots; completion side channels are unaffected.
      await rpc("set_event_filter", { events: [] });
      if (request.reportSchema) await rpc("set_host_tools", { tools: [{ name: "finish_report", label: "Finish Report", description: "Submit structured assignment findings to the host", loadMode: "essential", parameters: request.reportSchema }] });
      const ack = await rpc("prompt", { message: request.prompt });
      if (ack.data?.agentInvoked === false) throw new WorkerError("prompt", "OMP prompt completed locally without invoking a model", stderrFile);
      await step(completed.promise);
      await step(settled.promise);
      const state = (await rpc("get_state")).data;
      verifyModel(state);
      if (state.isSettled !== true || state.hasPendingAsyncWork !== false || state.isStreaming !== false || state.isCompacting === true || (state.queuedMessageCount ?? 0) !== 0) throw new WorkerError("protocol", "OMP final state is not quiet and settled", stderrFile);
      const last = (await rpc("get_last_assistant_text")).data;
      if (typeof last?.text !== "string") throw new WorkerError("protocol", "OMP final assistant text is unavailable", stderrFile);
      closing = true;
      child.stdin.end();
      const exit = await step(closed.promise);
      if (buffer.length) throw new WorkerError("protocol", "OMP stdout ended with an incomplete RPC frame", stderrFile);
      if (exit.code !== 0) throw new WorkerError("process", `OMP exited unsuccessfully (${exit.signal ?? exit.code})`, stderrFile);
      return { text: last.text, ...(report === undefined ? {} : { report }), sessionFile: state.sessionFile,
        model: { provider: model.provider, id: model.id }, pid: child.pid!, promptId: promptId!, stderrFile, transcriptFile };
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", cancel);
      closing = true;
      await this.stop(child, closed.promise);
    }
  }

  private async stop(child: ChildProcessWithoutNullStreams, closed: Promise<unknown>): Promise<void> {
    if (!child.pid) return;
    const signal = (name: NodeJS.Signals) => { try { process.kill(-child.pid!, name); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") child.kill(name); } };
    // Kill the owned group even if its leader has exited, so grandchildren do not escape.
    signal("SIGTERM");
    await Promise.race([closed, Bun.sleep(this.options.killGraceMs ?? 250)]);
    signal("SIGKILL");
    await Promise.race([closed, Bun.sleep(1000)]);
  }
}

export function runWorker(request: WorkerRequest): Promise<WorkerResult> { return new OmpWorker().run(request); }
