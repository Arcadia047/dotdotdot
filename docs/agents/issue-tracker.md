Specs and tickets live locally under `.scratch/<feature>/`. Publishing to the tracker means writing a local file, never creating a GitHub issue or uploading artifacts.

- Spec: `.scratch/<feature>/spec.md`.
- Tickets: one file per ticket under `.scratch/<feature>/issues/<NN>-<slug>.md`, numbered in dependency order.
- Every ticket records what to build, explicit blockers, its triage status, and acceptance criteria.
- Fetching a ticket means reading the referenced local file. Comments append under `## Comments`.
- A ticket is available when its blockers are completed, it is not already owned, and it has no completed resolution.
- Close an implementation ticket by setting `Resolution: completed`, checking its acceptance items, and linking its local validation record. Retain its `Status:` triage label; triage readiness does not reopen completed work.
- Triage labels describe planning readiness. Runtime `ready` means checked and reviewed completion; these are different concepts.
- Ticket status edits are not a concurrency lock. The workflow runtime owns execution claims, branch ownership, attempt records, and completion evidence.
- Wayfinding, when needed, uses `.scratch/<effort>/map.md` and one child file per decision ticket; blockers are explicit local ticket references.
- Worker sessions receive accessible snapshots/pointers for the accepted spec and ticket. They must not depend on an untracked planning file appearing automatically in another worktree.
