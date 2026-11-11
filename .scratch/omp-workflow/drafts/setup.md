# Proposed project setup

Draft for confirmation before these instructions become active. User choices: local Markdown tracker, standard triage labels, and AGENTS.md. No tracker or runtime has been installed by this draft.

## Proposed AGENTS.md

```markdown
# Project instructions

Preserve unrelated working changes. Keep work local unless the user explicitly asks for publication. Follow existing repository conventions and use the documented checks relevant to a change.

## Agent skills

### Issue tracker

Specs and tickets are local Markdown under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the standard status vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context glossary and architectural decisions. See `docs/agents/domain.md`.

## OMP workflow

Use `omp/roles-and-capabilities.md` for role contracts and `docs/omp-agentic-workflow-research.md` for the accepted design context. Shared configuration must not contain a fixed model roster or freeze upstream skills to a release. Keep machine-specific model assignments and work artifacts local.
```

## Proposed docs/agents/issue-tracker.md

Specs and tickets live locally under `.scratch/<feature>/`. Publishing to the tracker means writing a local file, never creating a GitHub issue or uploading artifacts.

- Spec: `.scratch/<feature>/spec.md`.
- Tickets: one file per ticket under `.scratch/<feature>/issues/<NN>-<slug>.md`, numbered in dependency order.
- Every ticket records what to build, explicit blockers, its triage status, and acceptance criteria.
- Fetching a ticket means reading the referenced local file. Comments append under `## Comments`.
- A ticket is available when its blockers are completed and it is not already owned.
- Triage labels describe planning readiness. Runtime `ready` means checked and reviewed completion; these are different concepts.
- Ticket status edits are not a concurrency lock. The workflow runtime owns execution claims, branch ownership, attempt records, and completion evidence.
- Wayfinding, when needed, uses `.scratch/<effort>/map.md` and one child file per decision ticket; blockers are explicit local ticket references.
- Worker sessions receive accessible snapshots/pointers for the accepted spec and ticket. They must not depend on an untracked planning file appearing automatically in another worktree.

## Proposed docs/agents/triage-labels.md

| Role | Local status | Meaning |
| --- | --- | --- |
| needs-triage | needs-triage | Needs evaluation |
| needs-info | needs-info | Needs clarification |
| ready-for-agent | ready-for-agent | Specified and available for agent work |
| ready-for-human | ready-for-human | Requires human implementation |
| wontfix | wontfix | Will not be pursued |

## Proposed docs/agents/domain.md

Use the single-context layout: `GLOSSARY.md` and `docs/adr/` at the repository root. Read relevant entries when present; proceed silently when they do not exist. Create them lazily when terms or consequential decisions are actually settled. Keep the glossary free of implementation details. Surface a conflicting architectural decision before overriding it.

