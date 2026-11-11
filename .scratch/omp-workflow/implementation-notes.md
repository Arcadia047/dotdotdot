# Implementation notes

Approved public seams: work-manager behavior and supported OMP process/RPC adapter. User approved local tracker, default statuses, AGENTS.md, spec, all eight tickets and tests. Original checkout has unrelated modifications; build only in /tmp/dotdotdot-omp-work-manager on codex/omp-work-manager. Initial spec/setup commit 8fd5783; original base 2543722.

## Runtime direction

Use TypeScript with the Bun runtime already embedded in OMP and built-in bun:sqlite; no runtime package dependencies. Use the live extension host (pi.zod) for tool schemas. getAgentDir is exported by @oh-my-pi/pi-coding-agent and resolves the actual profile. A callable default factory may import that host package dynamically; ordinary test imports of pure runtime modules must not require an installed package.

WorkRepository owns job creation/persistence and Git worktrees. Job kind is implementation or integration; integrationTarget is a job ID distinct from dependsOn. Group parent is integration-kind and dependsOn all child IDs; children point to parent integrationTarget, but do not depend on parent. A dependent unstarted child must fast-forward its still-clean untouched branch to the current integration branch before implementation. Child ready requires successful local checks/review plus integration; group parent finalizes against the combined result. Independent jobs retain separate target branches.

Worker adapter: fresh cwd-bound OMP RPC process per role run; no fixed model selections. Carry selected live {provider,id,thinking?}. Use get_available_models/set_model as required, get_state verifies actual identity; no invented fallback list. Register a strict finish_report host tool for structured review results; completion requires correlated prompt_result plus session_settled, never prompt ack alone. Keep native child task spawning out of managed worker toolset so shared worker-slot accounting remains meaningful. Preserve other ambient extensions; set DOTDOTDOT_WORK_CHILD=1 so our own extension does not register a nested manager.

Manager: one active controller per profile/state directory, shared model-worker semaphore across campaigns/stages, durable state/evidence, background completion notification through host sendMessage. Each job pipeline implements, runs actual validation commands, runs independent Spec and Technical/Standards reviewers, repairs within bounded local budget, integrates related work, and finalizes only with fresh passing receipts. Reviewer output schema should distinguish verdict, concrete blocking findings, and nonblocking observations. No user tool may directly set arbitrary job states or inject pass records. Runner/host owns validation receipts; worker messages are candidate evidence only.

Pause stops new work; explicit resume starts again. Session shutdown stops owned active processes and persists interrupted state; no always-on daemon. Recovery must inspect known live worker processes and actual Git revisions before dispatching again. Preserve unfinished work; do not delete dirty worktrees or reset originals. Evidence must bind candidate revision plus accepted plan/check definition.

## Verified groundwork

Full original working-tree scripts/check passed (26 Python tests and shell/Lua checks) before implementation. An exploration agent proved real OMP18.18.6 RPC against a loopback-only provider, finish_report-style host tool, and extension imports getAgentDir/pi.zod/bun:sqlite. Notes will be /tmp/omp-workflow-rpc-notes.md and probe /tmp/omp-workflow-rpc-probe.py. All fixture homes/credentials isolated; no external model request.
