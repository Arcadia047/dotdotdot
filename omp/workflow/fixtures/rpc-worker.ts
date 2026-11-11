/** Controlled external OMP executable for tests of the public RPC adapter. */
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const option = (name: string) => args[args.indexOf(name) + 1];
const scenario = process.env.RPC_FIXTURE_SCENARIO ?? "success";
const model = option("--model").split("/");
const send = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");
const hang = () => new Promise(() => { setInterval(() => {}, 1000); });
let stateCount = 0;
let reportRegistered = false;
let promptId: string;
const finish = () => {
  send({ type: "prompt_result", id: promptId, agentInvoked: true, status: "completed", sessionSettled: true });
  send({ type: "session_settled" });
};

if (scenario === "no-ready") await hang();
if (scenario === "exit") { process.stderr.write("Fixture startup failed\n"); process.exit(23); }
if (scenario === "bad-json") { process.stdout.write("not json\n"); await hang(); }
if (scenario === "chunk") { send({ type: "rpc_chunk", chunkId: "1", index: 0, count: 1, byteLength: 2, data: "e30=" }); await hang(); }
if (scenario === "invalid-utf8") process.stdout.write(Buffer.concat([Buffer.from('{"type":"fixture","text":"'), Buffer.from([0xff]), Buffer.from('"}\n')]));
send({ type: "ready", protocolVersion: 1, maxFrameBytes: 1048576 });
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  const respond = (data?: unknown) => send({ type: "response", id: request.id, command: request.type, success: true, data });
  if (request.type === "get_state") {
    stateCount++;
    respond({ model: { provider: scenario === "wrong-model" || (scenario === "changed-model" && stateCount > 1) ? "wrong" : model[0], id: model.slice(1).join("/") }, thinkingLevel: option("--thinking"),
      isStreaming: false, isSettled: true, hasPendingAsyncWork: scenario === "busy" && stateCount > 1, queuedMessageCount: 0,
      isCompacting: scenario === "compacting" && stateCount > 1,
      sessionFile: option("--session-dir") + "/session.jsonl" });
  } else if (request.type === "set_host_tools") {
    reportRegistered = request.tools.some((t: any) => t.name === "finish_report" && t.loadMode === "essential");
    respond({ toolNames: ["finish_report"] });
  } else if (request.type === "prompt") {
    promptId = request.id;
    respond(scenario === "local" ? { agentInvoked: false } : undefined);
    if (scenario === "local") await hang();
    if (scenario === "report" || scenario === "report-only") {
      if (!reportRegistered) process.exit(41);
      send({ type: "host_tool_call", id: "host-request-1", toolCallId: "different-model-call-1", toolName: "finish_report", arguments: { verdict: "blocked", findings: ["Planted defect"] } });
      continue;
    }
    send({ type: "prompt_result", id: "unrelated", agentInvoked: true, status: "completed", sessionSettled: true });
    send({ type: "session_settled" });
    if (scenario === "ack-only") await hang();
    if (scenario === "tree") {
      const descendant = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio: "ignore" });
      process.stderr.write(`grandchild:${descendant.pid}\n`);
      await hang();
    }
    if (scenario === "aborted" || scenario === "error") { send({ type: "prompt_result", id: promptId, agentInvoked: true, status: scenario, error: "Fixture failure" }); await hang(); }
    if (scenario === "early-settled") { send({ type: "prompt_result", id: promptId, agentInvoked: true, status: "completed", sessionSettled: true }); await hang(); }
    if (scenario === "async-settle") { send({ type: "prompt_result", id: promptId, agentInvoked: true, status: "completed", sessionSettled: false }); await Bun.sleep(70); send({ type: "session_settled" }); continue; }
    if (scenario === "late-error") { send({ type: "response", id: promptId, command: "prompt", success: false, error: "Late provider failure" }); await hang(); }
    await Bun.sleep(30);
    finish();
  } else if (request.type === "host_tool_result") {
    if (request.id !== "host-request-1") process.exit(42);
    if (scenario === "report-only") await hang();
    finish();
  } else if (request.type === "get_last_assistant_text") {
    if (scenario === "v1-overflow") { send({ type: "response", id: request.id, command: request.type, success: false, error: "RPC response exceeded the transport limit" }); continue; }
    if (scenario === "huge-frame") { respond({ text: "x".repeat(1024 * 1024) }); continue; }
    if (scenario === "huge-stderr") process.stderr.write("x".repeat(1024 * 1024));
    respond({ text: JSON.stringify({ cwd: process.cwd(), args, child: process.env.DOTDOTDOT_WORK_CHILD, stateCount, reportRegistered }) });
  } else respond();
}
