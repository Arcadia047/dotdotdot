# Baseline verification

Recorded before runtime implementation on 2026-11-11.

`./scripts/check` passed on the current working tree, including all 26 Python unit tests and the script's shell, formatting, and editor checks. This working tree includes pre-existing unrelated modifications; they have not been changed by preparing the workflow drafts.

Earlier synthetic Git checks confirmed parallel same-file edits on different branches, preservation of an original dirty checkout, refusal of duplicate active branch checkout, containment of an integration conflict, and refusal to remove unfinished work. Those checks exercised Git mechanics only.

The proposed dispatcher, readiness enforcement, and OMP worker adapter have not been implemented or tested. Their required acceptance cases are recorded in the draft spec. This baseline is not evidence that the proposed workflow works.
