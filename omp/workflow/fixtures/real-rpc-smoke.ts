/** Invoked by real-rpc-smoke.py with a credential-free, isolated environment. */
import { OmpWorker } from "../rpc";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const worker = new OmpWorker({ command: [process.argv[3]], defaultTimeoutMs: 30000,
  extraArgs: ["--no-extensions", "--extension", join(root, "probe.ts"), "--no-skills", "--no-rules", "--no-context-files", "--no-lsp", "--no-pty", "--no-title"] });
const result = await worker.run({ cwd: join(root, "cwd"), sessionDir: join(root, "sessions"),
  role: "spec-reviewer", model: { provider: "rpc-fixture", id: "fixture", thinking: "off" },
  prompt: "Call finish_report with the requested report, then return the report as JSON.",
  reportSchema: { type: "object", properties: { verdict: { type: "string" }, summary: { type: "string" } }, required: ["verdict", "summary"], additionalProperties: false } });
const report = { verdict: "blocked", summary: "Loopback fixture planted defect" };
if (JSON.stringify(result.report) !== JSON.stringify(report)) throw new Error("Structured report mismatch");
if (JSON.stringify(JSON.parse(result.text)) !== JSON.stringify(report)) throw new Error("Final text mismatch");
const marker = JSON.parse(readFileSync(join(root, "agent", "extension-loaded.json"), "utf8"));
if (marker.child !== "1" || marker.value !== 42 || marker.parsed !== "loaded") throw new Error("Extension load failed");
writeFileSync(join(root, "result.json"), JSON.stringify({ ...result, marker }, null, 2));
console.log(JSON.stringify({ root, model: result.model, sessionFile: result.sessionFile, report: result.report }));
