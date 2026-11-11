# Proposed implementation tickets

Draft for confirmation; publish as separate local ticket files after approval. The deliverable is one working manager, not a collection of independently installed frameworks.

| Ticket | Blocked by | What it delivers |
| --- | --- | --- |
| 01 — Create a protected local job | None | Submit a scoped job against an explicit repository/base/target branch, inspect it through the public work interface, create an owned worktree and durable record, and refuse conflicting ownership while preserving the original dirty checkout. |
| 02 — Execute one OMP worker in its assigned branch | 01 | Start an actual supported OMP worker in the job worktree, forward the live selected model, collect correlated lifecycle/result evidence, and expose honest status, cancellation, and failures. Verify the adapter with controlled protocol fixtures and isolated real OMP. |
| 03 — Run the ready work in parallel | 02 | Submit a dependency graph and execute independent jobs/tickets across branches under one shared budget, automatically reacting to worker completion, with useful queue status and no manual follow-up between tasks. |
| 04 — Require checked and reviewed results | 02 | Capture actual check outcomes and fresh independent Spec/Standards review for a candidate revision; refuse readiness for missing, stale, failed, skipped, or blocking evidence, while supporting appropriate lightweight validation for simple changes. |
| 05 — Integrate related tickets and repair failures | 03, 04 | Merge accepted related work into its own integration branch, verify the combined result, automatically repair findings within a bounded budget, and keep unrelated job branches separate and progressing. |
| 06 — Pause, reconcile, and resume interrupted work | 05 | Stop new dispatch deliberately, resume on instruction, reconcile unknown outcomes after a crash without duplicate integration, and clean up only owned reconciled work while retaining unfinished artifacts. |
| 07 — Use current skills and local role choices | 02 | Discover/update an unmodified upstream skills checkout, keep active-run instructions consistent, and allow machine-local role choices using actual available models, with no fixed skill release or model roster in shared configuration. |
| 08 — Operate the manager from OMP and adopt it through dotfiles | 05, 06, 07 | Expose the complete work loop through OMP's manager-facing tools/commands and local status, add repeatable opt-in setup/checks that preserve existing settings, and demonstrate end-to-end behavior plus independent final review. |

## Acceptance shared by the tickets

- Use the approved public behavior and OMP process/protocol interfaces for tests.
- Do not modify unrelated existing work, require work-data uploads, or publish issues/PRs.
- Each candidate includes the behavior it delivers, exact relevant revision, executed checks, and known limitations.
- Final readiness is enforced by the manager's recorded evidence conditions, not by the worker reporting success.
