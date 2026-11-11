# 01: Create a protected local job

**What to build:** Submit a scoped job against an explicit repository/base/target branch, inspect it through the public work interface, create an owned worktree and durable record, and refuse conflicting ownership while preserving the original dirty checkout.

**Blocked by:** None

**Status:** ready-for-agent

**Resolution:** completed

- [x] Deliver the behavior described above through the approved public work interface.
- [x] Exercise the relevant acceptance scenarios in the approved spec.
- [x] Record actual validation and remaining limitations.
- [x] Preserve unrelated work and keep all artifacts local.

## Validation

Completed on `codex/omp-work-manager`; see [runtime acceptance](../verification.md) and the separate [Standards](../reviews/runtime-standards.md) and [Spec](../reviews/runtime-spec.md) reports.
