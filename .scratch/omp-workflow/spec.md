# OMP parallel work manager

Approved 2026-11-11: local setup, specification, eight-ticket dependency order, and testing interfaces.

## Problem Statement

The user currently coordinates separate OMP sessions in tmux, noticing completion, following up, checking quality, and integrating work manually. They want to instruct one manager to handle multiple jobs and related tickets without reviewing unfinished or poorly checked results. The same repository may have independent jobs on different branches. Work artifacts cannot leave the work laptop for this chat or GitHub, and available model catalogs differ by machine.

## Solution

Provide an opt-in OMP work manager with a local queue and durable execution records. It launches workers in owned branch worktrees, schedules unblocked work within a configurable shared budget, collects completion events, arranges local validation and independent review, repairs failures within a bounded budget, and produces either a checked/reviewed result or a precise blocker.

Independent jobs retain separate branches and deliverables. Tickets for one feature integrate into that feature's own branch. Use existing OMP execution and supported process interfaces, keep upstream skills updateable, and select models from the live environment rather than a fixed roster.

## User Stories

1. As the user, I want to describe actionable work to one manager so I do not need to drive each worker session.
2. As the user, I want independent jobs on different branches of the same repository to proceed concurrently.
3. As the user, I want each editing worker to use the correct owned worktree on launch and resume.
4. As the user, I want my original branch and unfinished changes preserved.
5. As the user, I want related tickets to converge on a designated integration branch without combining unrelated jobs.
6. As the user, I want explicit dependencies so only actually unblocked tickets start.
7. As the user, I want the manager's workers to share a configurable concurrency budget across branch campaigns.
8. As the user, I want completed workers to trigger verification and the next available work automatically.
9. As the user, I want a deliberate pause to stop new dispatch until I resume.
10. As the user, I want interrupted work reconciled against surviving commits and artifacts before it is retried.
11. As the user, I want specs, tickets, execution records, and check evidence kept locally without automatic uploads.
12. As the user, I want new runs to benefit from current upstream skills without a fixed release requirement.
13. As the user, I want an active run to use consistent instructions while later runs can use updated skills.
14. As the user, I want workers to use my live model selection unless I have chosen a suitable local role override.
15. As the user, I want unsupported or unavailable model/transport behavior reported clearly rather than replaced by an invented fallback roster.
16. As the user, I want accepted requirements and appropriate validation chosen before implementation starts.
17. As the user, I want real check execution and results associated with the exact candidate revision.
18. As the user, I want independent Spec and Standards review, with focused failure-path review when the change warrants it.
19. As the user, I want required checks or reviews that fail, time out, or cannot run to prevent readiness.
20. As the user, I want changes after validation or review to invalidate stale evidence.
21. As the user, I want the combined integrated revision checked before I receive it as ready.
22. As the user, I want fix/check/review cycles to continue automatically within a visible repair budget.
23. As the user, I want an exhausted or genuinely blocked job reported honestly while independent jobs continue.
24. As the user, I want cleanup to preserve unfinished or unaccounted work and remove only owned workspaces.
25. As the user, I want concise status and final reports with branch, revision, checks, review outcome, and remaining limitations.
26. As the user, I want installation to preserve existing credentials, model choices, profiles, sessions, and unrelated settings.

## Implementation Decisions

- Separate the reasoning roles from runtime enforcement. Models propose plans and assessments; the runtime owns branch claims, command outcomes, evidence freshness, limits, and readiness checks.
- Provide a small public work interface usable by the OMP manager and by a local verification harness. Keep scheduling, state persistence, process execution, and recovery behind that interface.
- Identify repositories through their canonical Git common directory. Track campaign, ticket, branch, worktree, attempt, worker process/session, and candidate revision explicitly.
- Launch editing sessions with their working directory bound to an owned Git worktree. Do not simulate branch targeting by switching a shared checkout or by placing a branch name in a prompt.
- Use supported OMP process/protocol entry points and explicit capability checks. Respect actual terminal completion/settlement events, request correlation, cancellation, and errors.
- Resolve the live parent model and any explicitly selected local role mapping at dispatch. Forward the selected identity into child sessions; do not assume a separate process inherits live model state automatically.
- Keep branch ownership exclusive among managed writers, while allowing independent branches to proceed concurrently. Worker branch checks do not substitute for integrated-result checks.
- Persist execution state and evidence outside shared dotfiles. Make interrupted outcomes explicit and reconcile before resuming or repeating actions.
- Require acceptance criteria and a validation plan for each job. A small job may use a short checklist rather than a long spec.
- Capture runner-issued validation records and independent reviewer findings against the candidate revision and accepted plan. Worker claims alone cannot promote readiness.
- Keep Spec and Standards reports distinct. Material defects, unfulfilled acceptance criteria, missing required evidence, or unresolved blocking findings prevent readiness. Heuristic style observations are not automatically material defects.
- Bound automatic repair, retain artifacts, and expose precise blockers. Do not weaken acceptance criteria or required checks to get a pass.
- Keep upstream skill bodies unmodified and independently updateable; bridge OMP invocation/workspace behavior separately. Record actual run inputs for diagnosis without imposing an installation pin.
- Avoid a mandatory shared settings overlay. Expose required runtime choices and preserve machine-local performance/model settings.
- This first delivery runs while the manager process is alive and supports explicit recovery after an interruption. It does not install a persistent operating-system service.

## Testing Decisions

The primary verification interface is the public work manager: submit, start/status, pause/resume, verification/review/integration, and completion behavior. Test through that interface using disposable real Git repositories and controlled worker responses. This catches externally visible scheduling, ownership, recovery, and readiness failures without coupling tests to internal storage details.

The second verification interface is the supported OMP process/protocol adapter. Exercise framing, correlated replies, genuine completion events, failures, cancellation, and model/directory forwarding with controlled fixtures. Also use the installed real OMP binary in an isolated home against a loopback-only fixture provider to verify actual extension loading and protocol compatibility without work credentials or paid external model calls.

Required behavior cases:

- Independent same-repository branches can edit the same filename without cross-editing or changing the original dirty checkout.
- Duplicate managed branch ownership and invalid/cyclic dependency graphs are refused with actionable errors.
- A dependency starts only after its prerequisite reaches the required accepted state; failure does not stop unrelated work.
- The shared worker budget holds across campaigns; completion automatically advances available work.
- A worker saying done, a missing/failed/skipped/timed-out check, a blocking review, or stale evidence cannot produce ready.
- Individually green workers whose combined result fails stay unready until repaired and revalidated.
- A deliberate pause differs from a crash; recovery inspects surviving work and avoids duplicate integration.
- Dirty or unknown work is retained and cleanup touches only owned artifacts.
- Upstream skill updates affect new runs while active runs keep consistent instructions.
- Different simulated model catalogs and a single usable model work without changing shared model lists.
- Installation and reload preserve existing authentication, model settings, sessions, profiles, and unrelated user configuration.

Use independently known expected outcomes and planted defects. New tests should verify public behavior; do not mirror internal methods, require company data, or treat a model's narrative as test evidence. Run the repository's existing relevant checks and final regression checks; record unrelated baseline failures separately rather than silently counting them as passes.

## Out of Scope

- Automatic execution while the laptop is asleep or powered off.
- An installed always-on daemon or remote execution host.
- A distributed queue coordinating claims across laptops.
- A public model catalog snapshot, automatic quality ranking, or a fixed fallback roster.
- Automatic uploads, telemetry, GitHub issue publication, PR publication, or deployment.
- A security sandbox or a guarantee that all defects are found.
- A compulsory collection of eight simultaneous model agents for every small task.
- Unrelated changes to the shell, editor, terminal themes, or existing user work.

## Further Notes

The role capability guide and research proposal remain design context, not proof of implementation. Readiness claims require the executable acceptance evidence above. All work-machine acceptance runs and evidence remain on that machine; manually reported permitted behavior can guide synthetic reproductions here.
