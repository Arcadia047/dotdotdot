# 06: Pause, reconcile, and resume interrupted work

**What to build:** Stop new dispatch deliberately, resume on instruction, reconcile unknown outcomes after a crash without duplicate integration, and clean up only owned reconciled work while retaining unfinished artifacts.

**Blocked by:** 05

**Status:** ready-for-agent

**Resolution:** completed

- [x] Deliver the behavior described above through the approved public work interface.
- [x] Exercise the relevant acceptance scenarios in the approved spec.
- [x] Record actual validation and remaining limitations.
- [x] Preserve unrelated work and keep all artifacts local.

## Validation

Completed on `codex/omp-work-manager`; see [runtime acceptance](../verification.md) and the separate [Standards](../reviews/runtime-standards.md) and [Spec](../reviews/runtime-spec.md) reports.
