# Parallel work with OMP: research and proposed adoption

Researched 2026-11-11. This is a proposal, not an installed workflow. Only this research document was added; runtime configuration, skills, credentials, sessions, and existing working changes were left alone. The work laptop was not inspected.

Updated after user clarification: skills should receive upstream updates without a fixed version requirement; work code, traces, and other artifacts cannot be uploaded here or to GitHub; independent jobs must be able to work in the same repository on different branches. Source revisions in this document identify the evidence inspected, not an installation pin.

## Recommendation

Replace manually managed sessions with **one managing OMP session that owns the work queue**, and separate branch-scoped campaigns beneath it. Give editing workers explicit branch worktrees and cwd-bound OMP sessions; use native subagents within a campaign where their workspace behavior fits. Keep Matt Pocock's installed skills current through an unmodified upstream checkout and a thin OMP compatibility adapter. Keep tmux as the place to view the manager and occasional worker details.

Start with the native runtime. Add a small campaign journal and ownership guard for reliable resumption and duplicate prevention. Add an external supervisor only if work must resume automatically after the OMP process or laptop stops. Do not build a model catalog, a tmux messaging system, or a second agent framework first.

There are two distinct parallel workflows: related tickets converge on their campaign's integration branch; unrelated jobs keep separate target branches and deliverables. A branch-aware dispatcher must bind each campaign to its own working directory. It must not implement this by switching branches in a shared checkout.

The central problem is ownership and verified progress: who owns each item, what makes it ready, what wakes the coordinator, and what evidence permits completion. Adding more sessions or stronger instructions alone does not answer those questions.

## What this repository and installation actually provide

- `zsh/omp.zsh` changes the image protocol for compatible tmux clients, then forwards arguments to OMP.
- `bootstrap.sh` links OMP themes and selects their appearance slots. It deliberately preserves other settings. No worker definitions, shared skills, campaign state, or coordination runtime are tracked here.
- This laptop also has a machine-local `~/.omp/agent/AGENTS.md`, a custom system template, and extensions. Those are outside this repository and cannot be assumed present on the work laptop. Existing delegation instructions do not provide a task queue.
- Installed OMP reports **18.18.6**. The repository's theme documentation references 18.4.1; it is not evidence of the current installed runtime. All OMP links below use the verified `v18.18.6` tag. Check the work laptop separately before relying on these features.

Local verification used the installed binary with a disposable home and agent directory under `/tmp`. `omp --help` succeeded there. Default settings read back as: `goal.enabled=true`, `goal.continuationModes=["interactive"]`, `async.enabled=true`, `task.maxConcurrency=32`, `task.isolation.enabled=false`, `task.isolation.apply=true`, `task.isolation.merge=patch`, and `modelRoleStorage=global`. These are fresh defaults, not the user's effective configuration. No model request was made. Launching against the real home initially hit a restricted-write error while extracting the native addon; the isolated retry resolved that without changing the installation.

## First-principles requirements

| Requirement | Consequence for the design |
| --- | --- |
| Work begins on instruction | An explicit campaign starts execution; unrelated backlog is not automatically authorized. |
| Independent work proceeds in parallel | Tickets need dependencies and acceptance criteria. Dispatch the ready frontier, rather than dividing arbitrarily by file or technical layer. |
| No repeated manual follow-up | Worker completion must wake the coordinator, which verifies, integrates, repairs, and dispatches newly ready work. |
| Concurrent edits remain usable | Give editing workers separate checkouts; serialize integration and rerun checks on the combined result. |
| Progress survives context loss | Store specs, ticket IDs, acceptance criteria, attempt/artifact pointers, and completion evidence outside conversational memory. |
| Work does not duplicate | One coordinator owns a campaign. Enforce ownership before allowing two sessions to act on the same graph. |
| Different laptops have different models | Keep concrete model selectors and credentials machine-local. Start with inheritance rather than automatic model ranking. |
| A worker can fail without stopping everything | Bound retries, preserve its output, mark a real blocker, and continue unrelated ready tickets. |
| Completion means a usable result | A worker's final message is a report. Completion requires the accepted artifact, integrated checks, and review appropriate to the change. |

## Skill updates without a fixed version requirement

Keep an upstream checkout outside the dotfiles repo and expose its skill directories through OMP's discovery mechanism. Do not vendor a frozen copy or fork the skill bodies to translate OMP tool names. Put that translation and the branch/workspace contract in a small separate adapter so upstream improvements remain available. Validate discovery and referenced helper skills after updating; directory moves, names, and assumptions can change. OMP documents both custom-directory discovery and collision behavior. [Skill discovery](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/skills.md).

Updates apply to new campaigns. An active campaign should finish with a consistent set of instructions, for example by taking a local snapshot at its start. This is run consistency, not a fixed installation version: subsequent campaigns use the updated skills. Record the revision actually used for diagnosis; it is evidence, not a lockfile requirement. Do not modify the upstream checkout while active campaigns read from it.

If an upstream change conflicts with the adapter's assumptions, report the specific incompatibility and update the adapter rather than silently using obsolete skill behavior. The mechanism for obtaining public updates on the work laptop must fit that laptop's allowed inbound installation process; it does not require uploading work artifacts.

## Parallel work in one repository on different branches

**Independent jobs:** each job has its own target branch and worktree, such as job A on `feature/a` and job B on `feature/b`. Each produces its own checked branch/diff. There is no automatic integration of B into A or of either into the default branch.

**Tickets for one feature:** the campaign has a dedicated integration worktree and branch. Each ticket gets its own editing workspace. The campaign merges accepted work into its own integration branch, then checks the combined result. This is the scope of Matt's `implement-spec`; it does not make unrelated jobs part of one spec. [Current skill source](https://github.com/mattpocock/skills/blob/main/skills/engineering/implement-spec/SKILL.md).

The proposed branch/workspace contract is:

1. Resolve the canonical repository identity through Git's common directory, so linked worktrees are recognized as the same repository. Record the job, full target branch, base commit, worktree directory, and owning OMP session.
2. Give each active editing job an exclusive branch/worktree ownership record. Two different branches can run concurrently; a second writer for the same branch must join its existing campaign or wait. These ownership records govern our managed sessions, not arbitrary external shell commands.
3. Start the campaign's OMP session **in its assigned worktree**. All relative file tools and shell commands must resolve there. A tmux title or a prompt saying “use branch A” is not directory binding. On launch and resumption, check directory, branch, and expected revision before editing.
4. Do not switch the user's original checkout, stash/reset its changes, or force a branch into another worktree. Ordinary Git worktrees supply separate working files and indexes, while sharing repository objects and refs. [Git worktree documentation](https://git-scm.com/docs/git-worktree).
5. Serialize writers to a given integration/target branch, not all work across the repository. Record which revision was checked; if the target moves before integration, reconcile and rerun the affected checks. Conflicts become repair work confined to the owning campaign.
6. Keep unrelated branches separate unless explicitly instructed to combine them. Dependent feature branches need an explicit dependency and a chosen base; “same repo” is not a dependency.
7. Clean up only workspaces the run owns and only after confirming their work is recorded or intentionally retained. Preserve dirty workspaces and unknown outcomes for reconciliation. Shared ports, databases, and other non-file resources need separate allocation or scheduling.

OMP's native task schema supports isolated work based on the parent's checkout, but has no arbitrary target-branch/cwd field. Therefore a manager cannot assume a task spawned from the default checkout is correctly bound to another existing feature branch. The branch-aware dispatcher should start one OMP campaign at the intended worktree using the supported `--cwd`/RPC entry point, and use native tasks inside that campaign. This can be a small in-process extension managing child processes; it does not require an always-on service. Source/schema: [task inputs and execution](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/tools/task.md), [RPC startup](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/rpc.md).

For branch-based editing tickets, use that same cwd-bound dispatcher to launch the implementer in its explicit ticket worktree. This retains Matt's branch/commit/integration workflow and avoids nesting native filesystem isolation inside an already separate worktree. Native tasks remain useful for exploration, review, and other work whose effective workspace matches their parent. The earlier native patch-capture variant is an alternative requiring further adaptation, not the preferred baseline after the user's branch/update clarification.

Concurrency limits need to cover the manager's children collectively. OMP's native `task.maxConcurrency` is session-scoped; three workers in each of three branch campaigns can mean nine workers. Do not present a per-session number as a host-wide cap.

An isolated synthetic Git fixture was run locally with Git 2.56.0. Two worktrees concurrently edited and committed the same file on different branches; each retained its own content, branch, and clean index, and the original dirty checkout was unchanged. Git refused a second normal worktree checkout of an active branch. A deliberate cherry-pick conflict on a third integration branch left both worker branches intact; normal cleanup refused a worktree containing unfinished work. All five checks passed. This verifies Git mechanics only; it does **not** verify a not-yet-built OMP dispatcher, campaign lock, or work-laptop environment.

## What OMP already does, and where its guarantees end

| Need | Verified OMP 18.18.6 behavior | What remains |
| --- | --- | --- |
| Parallel workers | Native `task` supports batch fan-out, concurrency control, and async results delivered to the parent. | The campaign workflow must decide which tickets are ready and supply self-contained assignments. |
| Automatic follow-up | Async results wake the parent; `wait` can wait for an owned job or peer message. Existing agents can be messaged for follow-up work. | The coordinator must verify results and advance the graph. |
| Keep working toward an outcome | Goal mode provides continuation; its default continuation mode is interactive. | It can stop on no tool progress or all-blocked todos. It is not proof of correctness or an infinite keepalive. |
| Saved todos | Todo snapshots are restored on resume, fork, branch rehydration, and compaction. | Todos have no stable task IDs or dependency/claim fields. Use them as the session's progress display, not a multi-session queue. |
| Separate edits | Per-task `isolated: true` is available when `task.isolation.enabled` is enabled. Changes can be retained instead of automatically applied. | Enabling the setting does **not** force each worker to request isolation. The dispatcher must require it for editing work. |
| Recovery | Interactive `--restore` resumes qualifying interrupted parent turns and revivable subagents. | Its documented cold recovery excludes **isolated** subagents. It does not restart the process itself and does not automatically continue failed, completed, or user-interrupted turns. |
| Visibility | Agent Hub (`Alt+A`) shows worker status, activity, model, age, usage, and transcripts. | Add campaign-level ticket state only where this view is insufficient. |

Primary sources: [task execution and isolation](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/tools/task.md), [wait](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/tools/wait.md), [goal and todo lifecycle](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/rpc.md), [todo persistence](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/tools/todo.md), [restore limitations](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/session-operations-export-share-fork-resume.md#cli---restore), [Agent Hub](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/task-agent-discovery.md#watch-running-agents).

This distinction matters: **normal unattended execution** is largely available already; **reliable unattended recovery** needs a campaign record and reconciliation. Neither tmux restoration nor a saved transcript guarantees that a partially executed command is safe to repeat.

## Proposed operating loop

1. **Prepare while the user is available.** Use Matt's `to-spec` and `to-tickets` when scope is substantial. Resolve product decisions, define acceptance checks, identify dependencies, and record the permitted outcome. A small, clear task can skip the full specification ceremony.
2. **Start one campaign for the requested branch/outcome.** Create or use its owned worktree from a recorded base. Take campaign and branch ownership, record its OMP session, and initialize the native todos from the ticket graph. Existing unrelated working changes stay outside that checkout. Unrelated jobs use different campaigns and retain different target branches.
3. **Dispatch ready work.** Initially permit two or three workers. Each assignment gets a ticket ID, current integration base, spec reference, relevant context, expected artifact, checks, and any shared-resource restrictions. The coordinator schedules; workers do not independently claim the next backlog item.
4. **Use one explicit branch worktree per editing worker.** Launch its OMP session with cwd bound to that directory. Preserve the upstream branch/commit workflow; avoid a second layer of native isolation. A worker reports its branch, resulting commit, and checks. Only owned workspaces may be reset or cleaned, and dirty/unknown work must be reconciled first.
5. **Verify and integrate serially within a campaign.** Check each result against its ticket, merge accepted changes into that campaign's integration branch, then run relevant checks against the combined state. A conflict or failed integration check becomes bounded repair work. Integration order follows dependencies, not merely finish time. Independent campaigns retain independent branches and can integrate concurrently when they do not share other resources.
6. **Advance automatically.** Mark the ticket integrated only after its checks pass; dispatch newly ready tickets. A blocked item stops its dependents, while independent items continue. Native async wakeups and goal continuation drive this while the session lives.
7. **Close on evidence.** Run final spec/standards review and the required integrated checks. Produce the branch/diff or other requested deliverable and report remaining blockers. Retain recovery artifacts until the run is reconciled and changes are safely recorded. Publishing or other external actions follow the campaign's actual authorization.

## Local review and validation before a result is ready

The manager should present the user with a checked, independently reviewed candidate or an explicit blocker. A worker's “done,” a commit, or a successful model turn must not itself promote a job to ready. The completion gates below are proposed behavior for the dispatcher, not functionality installed by this research.

### Agree the outcome and evidence before dispatch

Each job carries acceptance criteria, its target branch/base, and an appropriate validation plan. Derive routine checks from existing repository conventions and tooling. Resolve material product decisions and test interfaces during planning; workers reuse those decisions without repeatedly asking the user. Changes to a required check, acceptance criterion, or validation exclusion must be visible rather than silently weakening the plan to achieve a pass.

Validation scales to the change. Code review is required for meaningful implementations; writing new automated tests depends on what behavior changed and whether an existing check already covers it.

| Change | Appropriate local evidence |
| --- | --- |
| Documentation or simple configuration | Relevant consistency/schema/syntax checks and an actual smoke check when runtime behavior changes. Do not invent low-value unit tests. |
| New behavior or a bug fix | Relevant existing tests plus behavior-level coverage where needed; for a regression, demonstrate the new test fails for the original defect and passes with the fix. |
| Parallel workers and integration | Checks on each worker result and on the resulting integration revision; include conflicts, ownership, and shared-resource behavior. |
| UI or interactive workflow | Exercise the real flow and inspect its output or screenshots where appearance is part of acceptance. Compilation alone is insufficient. |
| Changes with migration, security, data-loss, or recovery implications | Targeted failure/recovery checks and an additional focused review appropriate to the actual risk. |

Matt's `tdd` already asks for tests of behavior through agreed interfaces. His `code-review` provides separate Standards and Spec review. These supply useful review discipline; the manager still needs to enforce evidence and readiness. [TDD](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md), [code review](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md).

### Separate implementation, verification, and review

The implementer runs fast checks while working. After it reports a candidate commit, a runner executes the required checks against that exact revision in the correct worktree and captures commands, exit status, results, and environment notes locally. Worker-written summaries or pasted logs are pointers, not proof of a check result. A skipped, unavailable, timed-out, or failed required check cannot count as a pass. Record inapplicable checks with a reason; do not infer that passing unrelated tests covers missing validation.

Fresh review contexts inspect the actual diff and acceptance criteria, rather than approving only the implementer's explanation. Keep Matt's Standards and Spec reports separate. Also require explicit correctness/failure-path examination appropriate to the change: missing cases, races, branch mistakes, loss of work, and recovery behavior can matter even when formatting and happy-path tests pass. A separate model is optional; fresh context and independent evidence are the baseline, using models already available on that machine.

Review findings need a concrete location or scenario, expected versus actual behavior, impact, and basis in the spec, project rules, or observable behavior. Reproducible defects, incomplete acceptance criteria, failed required checks, and material documented-standard violations block readiness. Heuristic style observations remain distinguishable from defects and must not drive an endless rewrite loop.

The manager assigns fixes automatically, reruns affected checks, and gets the changed result reviewed again as needed. Use a bounded repair budget; exhaustion becomes a blocker, not a declaration of success. Continue unrelated jobs while one is blocked. Do not ask the user to perform first-pass debugging when the agents can reproduce and fix the problem themselves.

### Validate the integrated revision and enforce promotion

For related tickets, passing worker branches are candidates for integration. After merging, validate the combined revision and complete final review of that integrated result. Any subsequent code change or conflict resolution invalidates evidence whose checked/reviewed revision no longer matches. Revalidate and review affected areas before promotion; do not reuse pre-merge passes to certify a new result. Unrelated jobs are assessed independently on their own target branches.

The manager owns a structured ready decision requiring: accepted scope, correct branch/workspace, a recorded candidate revision without unaccounted working changes, all required applicable checks passed, completed required reviews, no unresolved blocking findings, and final integration evidence when applicable. A missing spec or review is an explicit missing requirement, not an implicit pass. The runner's validation records and reviewer results are bound to the candidate revision and the acceptance/check plan used.

The local user-facing result should be brief: what changed; branch and revision; checks actually run; review outcome; and remaining limitations. Keep detailed reports and logs on the laptop that owns the work. A blocked result must clearly state what failed and what input or access is needed, and remain outside the ready queue. Passing these gates improves confidence; tests and agent reviews cannot prove that every defect has been found.

### Prove the completion gates before relying on them

Use synthetic fixtures to demonstrate that readiness is refused when a worker merely says “done,” required evidence is missing, one review reports a blocker, a required check is skipped, or the code changes after checks/review. Also demonstrate a worker-only pass followed by a failing integrated result, a bounded repair that reaches ready after fresh evidence, and a repair budget that ends blocked without falsely closing tickets. A known planted defect must reach repair or blocked, rather than ready. These are acceptance tests for the manager's public behavior, not tests that copy its internal implementation.

For the workflow being built here, these checks should cover concurrent jobs on separate branches, duplicate ownership, wrong-directory resume, conflicting integration, stale validation, and cleanup preserving unfinished work. Passing the earlier Git fixture alone does not satisfy this dispatcher-level acceptance.

Separate checkouts do not separate databases, ports, remote resources, or credentials. Put shared-resource constraints in assignments and serialize tasks that share those resources. This is a concrete issue for parallel integration tests, even when source files do not overlap.

OMP's documented child execution forces `tools.approvalMode=yolo` because headless workers have no confirmation UI. Parent confirmation settings therefore cannot be assumed to constrain child actions. Worker tool access and external side effects must be addressed in the actual runner configuration and work environment; a worktree is file isolation, not a security sandbox. [Execution flow](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/tools/task.md).

## Model selection without a shared model list

The [roles and capability requirements](../omp/roles-and-capabilities.md) define
each role's responsibilities, required outputs, assessment scenarios, and local
selection process independently of the available model catalog. Use that guide
to reassess machine-local assignments; it contains no model roster and does not
imply that the workflow has been installed.

**Default: inherit the live parent model.** Define our worker agent types without a `model` frontmatter field and without a `task.agentModelOverrides` entry. OMP's documented precedence is agent override, then agent frontmatter model, then the parent's active model. This gives a working baseline on either laptop without any model IDs in dotfiles. A separate review context remains useful even when it uses the same model. [Selection precedence](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/task-agent-discovery.md#model-and-structured-output-precedence).

Do not assume the bundled `task`, `scout`, or `reviewer` inherit identically: bundled agents carry role selectors (`task` uses `@task`; `reviewer` uses `@slow`). Omitting `model` from a *task call* is different from omitting it from the *agent definition*. [Bundled definitions](https://github.com/can1357/oh-my-pi/blob/v18.18.6/packages/coding-agent/src/task/agents.ts), [reviewer definition](https://github.com/can1357/oh-my-pi/blob/v18.18.6/packages/coding-agent/src/prompts/agents/reviewer.md).

**Optional optimization: local role assignments.** Later, choose implementation/research/review roles through OMP's model UI on each machine and route agent overrides to those role aliases. Keep `modelRoleStorage=global` in the active profile so concrete selectors are not written into shared project files. Use the current profile; creating a new work profile also separates authentication and is not necessary merely to load this workflow. [Model roles](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/models.md#role-aliases-and-settings), [settings scopes and profiles](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/settings.md).

If discovery is needed, use `omp models --json`, the extension's `ctx.models.list()`, or RPC `get_available_models`. These inspect the models available in that OMP environment, including its configured providers. A public OpenRouter list would not answer that question. Availability reflects configured credential sources; it does not prove working credentials, company permission, remaining quota, or coding quality. Cost/context metadata cannot reliably identify the best coding model. Do not invent an automatic quality ranking from names or prices. [Available models and CLI JSON](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/models.md#model-availability-vs-all-models), [extension model queries](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/extensions.md#model-selection-ctxmodels), [RPC discovery](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/rpc.md#model).

Use inheritance first; add local role choices only when measured throughput or review quality justifies them. Record the actual model used for each attempt. No catalog synchronization, fixed fallback roster, per-call model selection, or custom model router is required for the first version.

This inheritance rule describes **native subagents**. A separately launched RPC process does not automatically inherit the manager's live model selection. For cwd-bound campaign/worker sessions, the dispatcher must explicitly pass or set the parent's resolved model identity (and supported thinking choice) before submitting work, unless a machine-local role choice was requested. That identity comes from the live OMP environment, not a hardcoded model list. Validate it against the child's available models and report an unavailable choice clearly. [RPC model commands](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/rpc.md#model).

## Durable state and restart behavior

Use the existing repo tracker if there is one. A spec and ticket files can hold durable intent, with native todos mirroring progress. Add a small machine-local campaign journal for execution facts rather than turning a Markdown status line into a concurrent database:

- campaign ID, repository identity, scope/spec, base and integration branch, coordinator session;
- ticket ID and dependencies, state, current attempt, worker/session ID, checkout/artifact references;
- tested revision and check results, review result, integrated commit;
- retry count, blocker, and last reconciled event.

For one manager, an atomic journal/snapshot and campaign/branch ownership locks are sufficient design targets. Store machine paths and runtime state outside the shared dotfiles repo. Keep specs/tickets in the project only according to that project's conventions. All work-laptop state remains there. Do not create a second independent status authority: the coordinator owns transitions, and the todo display is derived from the campaign state.

After a crash, reconcile journal, transcripts, checkouts, patches, and integration commits **before** rerunning a ticket. A dispatched item with no recorded completion has an unknown outcome, not an automatic failure. If its change already landed, record it; if an artifact survives, verify it; otherwise launch a bounded replacement attempt. Isolated workers' recovery needs this explicit path because native `--restore` does not cold-revive them. External side effects cannot generally be made exactly-once by replaying an agent prompt.

The journal/lock adapter is proposed work, not a feature claimed for Matt's skills or an implementation verified here. Start with it only as large as the single-coordinator recovery cases require. Move to SQLite or another shared queue only if independent coordinators genuinely need to claim from one backlog. A local file lock does not coordinate two laptops.

If execution must continue after the process exits, introduce a supervisor using OMP's supported RPC interface, not tmux `send-keys` or transcript scraping. It must explicitly configure async/isolation settings and enable RPC goal continuation where needed: protocol defaults differ, and RPC continuation is not on by default. Observe `session_settled`/terminal state rather than assuming every `agent_end` means completion. `--restore` itself is interactive-only. OMP can also be hosted through an extension, which has persistence and wakeup hooks, but an in-process extension alone cannot restart a dead process. [RPC lifecycle](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/rpc.md), [extension state and runtime](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/extensions.md).

A sleeping or powered-off laptop does not execute work. A requirement for that availability belongs on an approved always-on development machine, with its own environment and model access. It is separate from choosing skills.

## Concrete changes to dotdotdot

These are proposed paths, not files installed by this investigation.

| Proposed change | Purpose |
| --- | --- |
| Upstream skill installation/discovery support and provenance | Use a separately updateable upstream checkout with no fixed version requirement. Keep skill bodies unmodified; validate the actual discovered inventory and referenced helpers after updates. Record observed versions only for diagnosis. |
| `omp/agents/` | Add small named implementation, research, and review agents without concrete model selections. State each worker's assignment/result contract and delegation limits. |
| Settings checks and an optional example recipe | Check the capabilities the chosen execution path needs. Keep concurrency, budgets, and model choices locally configurable; do not silently load an overlay that overrides project preferences. |
| `omp/extensions/` or a small companion launcher | Own the queue, branch-aware campaign launch/status/pause/resume, ownership checking, the journal, and reconciliation. Bind each campaign to its worktree and delegate within-campaign execution to OMP. Enforce any shared worker cap at manager level. |
| `bootstrap.sh` and its checks | Link only our owned skills/agents/workflow artifacts into the chosen agent directory. Back up collisions, preserve auth/model/session files, and validate actual skill discovery. Handle named profiles explicitly; current theme bootstrap intentionally targets the default profile. |
| `omp/README.md` | Explain one coordinator per campaign, skill invocation, model inheritance/local overrides, saved state, restart limits, and recovery commands. Keep `zsh/omp.zsh`'s terminal behavior independent. |

### Does an optional settings file help or constrain?

It helps as an explicit, inspectable recipe for the selected runtime path: asynchronous results must reach the coordinator, editing workers need isolated workspaces, and captured changes must be integrated by their owner. It can prevent surprising runtime defaults and avoid changing the user's global configuration just to run one workflow.

It constrains when it overrides machine/project choices unnecessarily. In OMP, a `--config` overlay has higher precedence than project and global settings, although environment and runtime overrides can outrank it. A shared `maxConcurrency=3` can be too high on one machine and too low on another; `task.eager` is prompt guidance, not a correctness guarantee; native isolation settings are irrelevant if a path already uses dedicated branch worktrees. An overlay also does not enforce that every task requests isolation. [Settings precedence](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/settings.md#precedence).

Revised recommendation: no mandatory `omp/workflow.yml`. The dispatcher checks and explains prerequisites for the execution path actually selected. Offer an example recipe for optional use, keep performance knobs local, and enforce branch/workspace ownership in the dispatcher. The preferred explicit-worktree path does not require turning on native task isolation or changing its apply policy. If the alternative native-isolation path is later used, its dispatcher must request `isolated:true` for editing workers and arrange coordinator-owned integration rather than relying on the user's automatic-apply default. Any scoped setting override should be explicit and confined to that managed session. [Task settings](https://github.com/can1357/oh-my-pi/blob/v18.18.6/packages/coding-agent/src/task/settings.ts).

## Validation with no work-data transfer

Develop and verify the generic workflow here using disposable repositories: parallel edits on different branches, related tickets converging on an integration branch, duplicate ownership, merge conflicts, dirty checkouts, pause/resume, and interrupted workers. It needs no company source, work prompts, traces, credentials, or GitHub uploads. Local Markdown tracking or a machine-local journal is sufficient; the work environment does not need a cloud tracker.

The work laptop then performs its own local acceptance run. It keeps its code, tickets, sessions, logs, model choices, and diagnostics there. The user can manually report a permitted behavioral description, such as “job B edited job A's directory after resume.” A work-side check can present a short, local pass/fail summary for the user to inspect; it does not transmit anything. Such reports guide diagnosis but do not prove the work environment was reproduced here. Provider, proxy, filesystem, and tool-version differences may still require local verification.

For a bug, first try to express the same behavior in a synthetic fixture here. Do not request proprietary code or assume that redacting an original log makes it transferable. Do not build automatic telemetry, uploads, or issue publication into the workflow.

## Route from ask-matt

The design decisions under discussion fit `grill-with-docs`. Once settled, `to-spec` and `to-tickets` prepare the build; `implement-spec` is the execution flow for related tickets in one spec, not a cross-branch queue manager. Read skill files before using them; the router's summaries are not their full contracts. The engineering setup precondition should configure the actual local tracker/doc conventions before that build flow is run. No setup flow or tracker publication was performed by this research.

## Adoption order and acceptance experiment

1. Check OMP versions and effective feature availability locally on each laptop. Use a disposable fixture repo, the intended local model environment, and an explicitly authorized bounded run before changing daily workflows. Work artifacts stay on the work laptop.
2. Expose the current upstream skills and build the compatibility/dispatch adapter. Run a small graph: two independent changes, a third depending on both, and final review. Verify automatic wakeups, correct dependency ordering, cwd-bound editing workspaces, serialized integration within the campaign, and checks on the combined result.
3. Make one worker fail a check and another hit an unavailable model/credential. Confirm bounded repair, retained evidence, and continued independent work. The latter should be a controlled fixture failure, not an unnecessary paid provider probe.
4. Interrupt the coordinator and a worktree worker. Reconcile and resume without duplicate integration or lost changes. Distinguish a deliberate pause from a crash. Add the smallest journal/ownership adapter needed for this to work reliably. If testing the alternative native-isolation path, verify its separate recovery limitation rather than assuming RPC or `--restore` handles it.
5. Exercise a second concurrent campaign launch against the same graph, a worktree with unrelated dirty changes, a merge conflict, and cleanup after failure. Ownership conflicts must be visible; cleanup must preserve work it does not own.
   Also run two unrelated jobs from the same repository against different target branches; confirm worktree/cwd binding on every launch and resume, separate results, no accidental cross-merge, and a shared concurrency cap when requested.
6. Repeat model inheritance with two different available model sets, including only one usable model. A stale optional role must produce a clear, recoverable outcome without requiring changes to shared dotfiles.
7. Only add unattended process restart, an aggregate multi-repo queue, or automatic model optimization when those become demonstrated requirements. For RPC, include a terminal-event and process-restart test; an interactive demo does not verify RPC defaults.

Success means the user supplies an actionable scope once and later receives an integrated, checked result or a precise blocker, without needing to prompt each worker. The first implementation should prove that loop before expanding the system.

## Alternatives considered

| Approach | Assessment |
| --- | --- |
| Skills copied into every current tmux session | Improves individual work discipline but keeps the user as scheduler and integration coordinator. Multiple leaders can still race. |
| One manager + cwd-bound branch/worktree sessions + current upstream skills | Recommended baseline after branch clarification. Reuses OMP sessions, model discovery, and available native workers, while explicitly supplying workspace binding and campaign state. |
| Custom tmux session mesh | Adds pane lifecycle, text parsing, focus, and synchronization problems without strengthening the task model. RPC is the better interface if independent processes become necessary. |
| Full standalone agent factory/shared queue immediately | Justified later for multiple independent coordinators or always-on execution; premature for proving this laptop workflow. Matt's in-progress factory notes are useful vocabulary, not a production runtime to install. |

## Matt's skills: detailed source assessment

Researched 2026-11-11 against primary source. Matt's repository was inspected at [`4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`](https://github.com/mattpocock/skills/commit/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d), committed 2026-10-31 14:23:30 UTC. These revision-specific citations preserve the research evidence; they do not specify the version to install. Its [plugin manifest](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/.claude-plugin/plugin.json) reports version 1.3.2. OMP compatibility below uses the [v18.18.6 skills documentation](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/skills.md), matching the installed version reported during this investigation.

## Finding

Matt's skills are useful workflow instructions for turning an understood goal into implementable tickets and orchestrating subagents. The current `implement-spec` already describes parallel implementation; advice based only on the older `write-a-prd` / `prd-to-issues` collection misses it. The [1.3 changelog](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/CHANGELOG.md) documents its graduation into the engineering bundle and the earlier naming changes.

They do not themselves install a durable worker service. The repository describes them as composable, editable skills that work with any model; the documented installation for other agents copies skill files. OMP explicitly classifies skills as passive prompt content, separate from executable tools and event-driven hooks. Thus a workflow prompt can direct available task tools, but cannot supply missing runtime coordination. [Matt README](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/README.md), [OMP skills](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/skills.md).

## Relevant skills

| Skill | Verified behavior | Fit for this use |
| --- | --- | --- |
| `grill-with-docs` / `grilling` | Align requirements and vocabulary before coding. | Resolve product choices while the user is available. [README](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/README.md). |
| `to-spec` | Synthesizes the conversation, explores the repo, proposes testing seams for user confirmation, and publishes a spec to the configured tracker. | Written scope and acceptance context before unattended execution. [Source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/to-spec/SKILL.md). |
| `to-tickets` | Produces independently verifiable vertical slices, each small enough for a fresh context, with explicit blockers. Asks the user to approve the breakdown. Supports expand–contract for wide refactors. | Prepare a dependency graph, not a flat personal todo list. [Source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/to-tickets/SKILL.md). |
| `implement` | Fetches a ticket, uses TDD where possible, runs checks and review, then commits to the current branch. | One assigned ticket; unsuitable as a global scheduler. [Source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/implement/SKILL.md). |
| `implement-spec` | Runs each ready ticket in a fresh implementer subagent and its own worktree/branch. A merger integrates results into one integration branch; newly unblocked tickets start. Final review and fixes precede closeout and worktree cleanup. | Closest existing match for one supervising OMP session. [Source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/implement-spec/SKILL.md). |
| `code-review` | Uses separate Standards and Spec subagents against a pinned comparison point; aggregates their reports independently. | Review after integration, with a known base and spec pointer. [Source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/code-review/SKILL.md). |
| `handoff` | Writes a compact document with artifact pointers and suggested skills into OS temporary storage. | Context transfer; not automatic restart or durable queue state. [Source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/productivity/handoff/SKILL.md). |

The selected planning/implementation/review skill files do not prescribe specific model IDs. Preserving machine-local model selection is compatible with their instructions. This is a scoped observation about those files, not a claim that every optional skill or future revision is model-independent.

## OMP 18.18.6 compatibility

Matt's files use `SKILL.md`, `name`, `description`, and often `disable-model-invocation: true`. OMP supports these and normalizes the last field into manual-only visibility. Hidden skills remain explicitly accessible.

OMP loads skill content through `read` at `skill://<name>`, with interactive invocation through `/skill:<name>`. Matt's literal “Call the Skill tool” instructions therefore need an OMP translation or a clear adapter instruction; compatible Markdown alone does not make that tool exist.

Discovery is one directory deep. Copy selected complete skill folders into an OMP skills root, or point `skills.customDirectories` at Matt's `skills/engineering` and `skills/productivity` directories. Simply nesting the whole repository under a skills root is insufficient. Preserve sibling references/templates inside each selected folder.

Foreign user skill providers are opt-in, so existing Codex/Claude copies cannot be assumed visible. Confirm the resulting inventory and paths on each machine rather than assuming installation succeeded. These are documented behaviors, not a live end-to-end execution result. [OMP v18.18.6 skills](https://github.com/can1357/oh-my-pi/blob/v18.18.6/docs/skills.md).

## Adaptations before unattended use

1. **Use one coordinator for each task graph.** Matt's orchestration assumes one agent sees the ready frontier. It does not define cross-session exclusion, atomic ticket claiming, leases, stale-worker recovery, retry limits, or a durable ledger. Separate tmux windows following the same prompt can race. This is an inference from the complete [`implement-spec` source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/implement-spec/SKILL.md), not a claim that OMP lacks other coordination facilities.

2. **Preserve branch and worktree ownership.** `implement` commits to whatever branch is current. `implement-spec` tells workers to confirm their base, reset onto the integration branch if necessary, and clean up worker worktrees. An adaptation should create a new owned worktree for every worker, serialize integration, verify green checks on the integrated result, and remove only worktrees created for that run after confirming no uncommitted work remains. The skill does not specify safe reset commands, dirty-tree checks, or cleanup ownership. [Implementation source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/implement/SKILL.md), [orchestration source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/implement-spec/SKILL.md).

3. **Do setup and product decisions before leaving.** Setup is explicitly prompt-driven: it confirms tracker/doc choices, writes steering files and tracker instructions, may create labels, and can initialize/wire a remote when one is missing. Use the established repository workflow rather than applying these defaults blindly. [Setup source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/setup-matt-pocock-skills/SKILL.md).

4. **Local tickets need coordination beyond text edits.** The local tracker template uses one Markdown file per ticket and a status line. Its wayfinding claim operation is “set claimed and save”; it specifies no atomic lock or compare-and-set. That convention is readable planning state, not proven multi-process exclusion. [Local tracker template](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/setup-matt-pocock-skills/issue-tracker-local.md).

5. **Do not assume every optional skill is portable.** The in-progress `claude-handoff` launches `claude --bg`; the misc Git guardrail skill configures Claude `PreToolUse` hooks and `.claude/settings.json`. Neither belongs in an OMP installation unchanged. Neither appears in the inspected core plugin's skill list. [Claude handoff](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/in-progress/claude-handoff/SKILL.md), [guardrails](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/misc/git-guardrails-claude-code/SKILL.md), [manifest](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/.claude-plugin/plugin.json).

## Durable automation distinction

Matt also has an explicitly **in-progress** `software-factory` skill. It defines tasks, triggers, runs, runners, an orchestrator that records queued/in-flight/finished runs, and a tracker as persistent memory. It asks what prevents duplicate work and recommends bounded retry loops and review. This is a glossary/design reference, not an installed factory. Its existence reinforces the distinction between composing coding skills inside a session and building a service that continues reliably across independent sessions or restarts. [Source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/in-progress/software-factory/SKILL.md).

A practical adoption is to keep the planning and review disciplines, bridge `implement-spec` to OMP's actual task/worktree APIs, and separately decide whether session-local supervision is enough or whether cross-session durable claiming and recovery are required. Follow upstream updates without a fixed version requirement, keep the compatibility layer separate, and record the revision used by a run for diagnosis. No runtime, model configuration, tracker, remote, or installed skill was changed by this research.

