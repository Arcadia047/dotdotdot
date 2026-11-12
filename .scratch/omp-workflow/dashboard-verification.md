# Dashboard acceptance

User request: a local browser dashboard for current status and required attention, without long agent summaries. Scope: [dashboard-spec.md](dashboard-spec.md), tickets 09–10. Reviewed code candidate: `68cdb0cfb70a678c91e294c1df2a0a10aaa54a17`.

## Result

`/work dashboard` opens browser access to the managing OMP instance's real local queue. Root blockers and recovery needs lead; prerequisite waiting, capacity, paused/idle dispatch, ready results and history remain distinct. Search, filtering, native job details and guarded controls work with keyboard and narrow screens. Related tickets expose separate branch/integration receipts and their actual failed outcomes. Full tasks, original blockers and local paths stay behind disclosures.

Per-job recovery is derived from each recorded owner against the live controller lease. A fresh dashboard after SIGKILL does not call orphaned records live; starting unrelated work cannot hide the orphan. Raw persisted state, scheduling, write limits and reconciliation rules are preserved. Terminal status is concise, and follow-through instructions ask for at most two short user-facing lines.

## Executed checks

- Full final `bun test workflow && bun run typecheck`: **123 passed, 0 failed, 753 assertions** across seven files; strict types passed.
- `./scripts/check`: passed, including all 29 Python tests and the existing shell/Lua/editor checks. Browser script syntax and full Git whitespace checks passed.
- Native OMP 18.18.6: production extension entry registered; isolated native dashboard authenticated status, pause/resume, stop, reopened access and session shutdown all passed with no model request. Reproduce with `python3 omp/workflow/fixtures/real-dashboard-smoke.py`. Final evidence: `/tmp/omp-dashboard-native-ype8jay7`.
- Browser integration used the actual WorkManager, disposable Git branches, real shell checks and runner-issued receipts. Search, live counts, pause/resume, branch/revision and separate review evidence, keyboard detail opening/Escape/focus return and disconnected controls were exercised. A stopped source retained clearly stale data and disabled actions.
- Desktop/tablet/phone inspection at 1440×900, 768×1024 and 390×844: **0 failures, 0 warnings**; screenshots inspected for hierarchy, framing, readable text, real totals and overflow. Local fonts loaded; connected browser had no console errors or external asset requests.
- Additional public browser cases: zero/loading/malformed/missing-token data; safe script-like text and very long content; current vs historical evidence; rejected and delayed actions inside open details; retained disclosure/focus on updates; integration target paths; paused satisfied dependencies; actual crash recovery; and orphan recovery alongside unrelated live work.

The native acceptance client explicitly bypasses system proxies. A failed early test was traced to macOS routing Python's default HTTP opener through a system proxy; the production listener worked in actual browsers/curl. This was corrected in the local harness, with no server workaround or added runtime dependency.

## Independent reviews

- [Standards](reviews/dashboard-standards.md): **0 remaining findings**.
- [Spec](reviews/dashboard-spec.md): **0 outstanding findings**.

Both axes replayed the relevant disposable reproductions after fixes. All review-driven integration-evidence, waiting-label, modal-error and crash/mixed-owner defects were corrected. The original runtime review/evidence remains in [verification.md](verification.md).

## Preview and limits

Reproduce the interactive synthetic queue with `bun omp/workflow/fixtures/dashboard-preview.ts`; Ctrl-C closes it. Controlled reviewers establish mechanics, not model judgment. Preview jobs contain no work source or credentials. Final screenshots are under the session's local visualization directory in `omp-dashboard/`; exercised synthetic UI states are preserved in `omp-dashboard-ui-states/` and `omp-dashboard-review-states/`.

The dashboard is opt-in and lives with the managing OMP session. It adds no OS service, model roster, mandatory settings or production package dependencies. Read-only viewing makes no model request; explicit resume can continue accepted model jobs using the laptop's configured provider route. No worktree deletion, arbitrary file service, publication or upload control is exposed. All work-laptop acceptance and model assessments must stay on that laptop. The actual work environment has not been reproduced here.
