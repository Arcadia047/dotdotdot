# Agent roles and capability requirements

This document defines what each role must deliver and how to assess a model for that role. It contains no model names, provider preferences, fixed context-window sizes, or model configuration list. Use it with whichever catalog and model access are available on the machine doing the work.

This is the role contract for the [proposed parallel workflow](../docs/omp-agentic-workflow-research.md), not an installed agent system or a claim that any model has passed the assessments below.

## How to use this guide

1. Read the role's responsibilities, required capabilities, and failure conditions.
2. Identify a candidate from the machine's actual available models. The currently selected parent model is the initial candidate; a role does not automatically need a different model.
3. Verify the candidate through that machine's OMP tools and provider route, using a representative local task and a failure case. Catalog descriptions and advertised reasoning/context features are leads, not proof of capability.
4. Record the observed result locally. Assign the role only within the scope supported by that evidence, and repeat the assessment when behavior or the operating environment changes.
5. Compare latency, cost, and concurrency behavior among candidates that meet the role's quality requirements. A cheaper or faster result does not compensate for a critical failure.

Work-laptop tasks, model assignments, reports, and evidence stay in that environment; this guide requires no uploads here or to GitHub. It does not imply that models run on-device: use the model access already permitted in that environment.

## Roles are responsibilities, not a required number of agents

| Role | Accountable for | Required output | Most important capability |
| --- | --- | --- | --- |
| Work manager | Queue ownership, scheduling, follow-through, and completion decisions | Current job state, next action, evidence-backed ready proposal or precise blocker | Sustained coordination without losing constraints |
| Planner | Scope, acceptance criteria, and ticket dependencies | A buildable plan with self-contained tickets and an appropriate validation plan | Turning ambiguity into observable outcomes |
| Researcher | Codebase exploration and external facts | Relevant findings with source pointers and explicit uncertainty | Evidence selection and accurate synthesis |
| Implementer | A scoped change in its assigned worktree | Candidate commit, relevant checks, and remaining issues | Correct multi-step coding and debugging |
| Validation analyst | Choosing meaningful checks and interpreting their results | Coverage of acceptance criteria, check plan, and an honest result assessment | Finding false confidence and missing cases |
| Spec reviewer | Whether the result delivers the requested behavior | Requirement-by-requirement findings against the exact candidate | Detecting omissions and incorrect interpretations |
| Technical reviewer | Correctness, maintainability, and project standards | Concrete findings, with defects distinguished from style observations | Adversarial reasoning grounded in the actual change |
| Integrator | Combining related work and reconciling interrupted operations | Recorded integration result, final revision, checks, and unresolved conflicts | Git/worktree reasoning and preservation of work |

One model may serve every role. The manager may also plan, and research may be a brief step within another role. Keep review contexts separate from implementation even when they use the same model. Invoke extra specialists only when the task warrants them. A small configuration edit should not require eight simultaneous agents.

The manager schedules across independent jobs. Each job has a particular target branch/worktree. Related tickets converge on that job's integration branch; unrelated jobs keep separate deliverables.

## Capabilities every assigned model needs

- **Reliable tool use:** select the right tool, provide valid arguments, read its actual result, and recover from errors without fabricating execution or success. The combination of model, provider route, and OMP tool interface must work in practice.
- **Constraint retention:** keep the assigned repository, worktree, branch, acceptance criteria, and action scope intact through a multi-step task. Retrieve missing context instead of guessing or silently dropping requirements.
- **Evidence discipline:** distinguish observed facts, source claims, inferences, and unknowns. Do not turn “the command was requested” into “the command passed.”
- **Honest completion:** return a candidate or blocker when evidence is incomplete. Never describe skipped checks, missing access, or partial implementation as a finished result.
- **Useful handoffs:** leave exact artifact/source pointers, the candidate revision where relevant, unresolved issues, and a concrete next action. Another fresh session must be able to continue from those records.
- **Scope control:** do the assigned work, use existing project conventions, and avoid unrelated edits or unnecessary abstractions. Raise material product decisions; do not repeatedly ask for routine decisions already covered by the plan.

A model does not need built-in browsing, vision, or a particular reasoning mode for every role. It needs the relevant capabilities through the tools and transport actually available for its assignment. For example, visual acceptance requires a qualified image-inspection path or a separate visual reviewer; a large advertised context window does not establish careful spec review.

## 1. Work manager

**Responsibilities**

- Turn the user's authorized scope into identified jobs with clear target branches and owners.
- Dispatch the ready tickets, respect dependencies and a shared concurrency budget, and react to worker completion without manual prompting.
- Keep unrelated branches separate; prevent a second managed writer from taking a branch already owned by a campaign.
- Assign fixes, arrange fresh verification/review, and keep unaffected work moving when one job is blocked.
- Reconcile interrupted outcomes using recorded state and artifacts before proposing retries.
- Propose readiness only when the required evidence matches the current candidate revision. Report genuine blockers and the exact decision or access needed.

**Required capabilities:** global reasoning over a changing task graph; prioritization; tracking multiple independent constraints; interpreting structured worker results; recognizing stale or missing evidence; concise communication over long-running work.

**Assessment:** give it two independent jobs on different branches and a third ticket that depends on only one of them. Make a worker fail and another claim completion without required evidence. It should keep independent work moving, withhold readiness, and request the correct repair/verification. On an interrupted operation, it should inspect evidence before scheduling a duplicate.

**Unacceptable outcomes:** accidentally combining unrelated jobs, launching a blocked ticket, abandoning available work without cause, treating a worker's report as a verified pass, or closing an incomplete job because its repair budget ran out.

## 2. Planner

**Responsibilities**

- Inspect existing project behavior and conventions before designing the change.
- Define the user's observable outcome and acceptance criteria, including material failure behavior.
- Divide substantial work into self-contained, verifiable tickets and identify genuine dependencies.
- Specify the intended branch/integration structure and shared-resource constraints.
- Choose appropriate validation interfaces and required checks; use existing coverage when sufficient.
- Surface decisions that require user judgment early, while resolving facts through inspection.

**Required capabilities:** reasoning under ambiguity; architectural judgment; decomposition; distinguishing facts from choices; balancing quality against unnecessary process.

**Assessment:** give it an incomplete request with an existing project convention, two independently buildable changes, and one shared-resource restriction. It should inspect the convention, ask only the material unanswered question, and produce tickets whose dependencies and acceptance criteria match the actual behavior.

**Unacceptable outcomes:** inventing requirements, treating every file touch as a dependency, creating tickets that require the original conversation to understand, or promising green isolated tickets when only an integrated result can be validated.

## 3. Researcher

**Responsibilities**

- Answer a concrete question about the codebase, a dependency, or an external interface.
- Follow claims to the owning source, including version-specific behavior when it matters.
- Return enough detail for a decision, with file/line or primary-source pointers and remaining uncertainties.
- Save reusable findings where subsequent sessions can access them, according to the project's conventions.

**Required capabilities:** effective search and navigation; source evaluation; careful reading; distinguishing current behavior from examples, historical notes, and assumptions.

**Assessment:** provide a plausible assumption contradicted by the actual source. It should find and explain the contradiction, identify which version/environment the evidence describes, and avoid filling unverified gaps with confident prose.

**Unacceptable outcomes:** invented citations, obsolete documentation presented as current behavior, a broad information dump without answering the question, or changing implementation while assigned only to investigate.

Mechanical lookup is a narrower assignment than open-ended research. A model shown to extract paths or facts accurately is not thereby qualified to resolve ambiguous architectural questions.

## 4. Implementer

**Responsibilities**

- Confirm its assigned worktree, branch, and starting revision before editing.
- Implement the ticket against its acceptance criteria and existing project patterns.
- Add behavior-level tests where needed; reproduce a regression before fixing it when applicable.
- Run relevant checks while working, diagnose failures, and report actual results.
- Keep unrelated work intact and return a candidate commit with artifact/check pointers.
- Repair concrete findings without weakening acceptance criteria or disabling required checks.

**Required capabilities:** repository navigation; multi-file coding; debugging from actual feedback; language/tool fluency appropriate to the project; keeping edits within scope; identifying meaningful tests rather than tests that mirror the implementation.

**Assessment:** use a small multi-file bug with a known behavioral expectation and an existing test interface. Require the candidate to reproduce the defect, fix it, pass relevant checks, and preserve an unrelated dirty checkout. Include a tool error to assess recovery rather than only the happy path.

**Unacceptable outcomes:** editing the wrong worktree, modifying unrelated work, changing the expected behavior to match the bug, removing checks to obtain a pass, or reporting tests that were not run.

An implementation report is a candidate handoff. The implementer does not certify its own result ready for the user.

## 5. Validation analyst

**Responsibilities**

- Map acceptance criteria to appropriate observable checks and identify uncovered behavior.
- Select existing tests, propose meaningful new cases where necessary, and arrange real workflow inspection when automated checks are insufficient.
- Distinguish a product defect from a fixture/environment problem using evidence.
- Interpret runner-issued results accurately, including failures, skipped checks, timeouts, and baseline failures.
- Assess the final integrated revision rather than relying only on worker-branch passes.

**Required capabilities:** test design; edge-case and failure-path reasoning; understanding what a check proves and misses; diagnosing misleading green results; honest treatment of uncertainty.

**Assessment:** present a candidate that passes a happy-path suite but violates an explicit recovery requirement. Include an unavailable required check and an unrelated pre-existing failure. It should expose the missing coverage, keep unavailable validation distinct from success, and report the baseline failure without silently exempting it.

**Unacceptable outcomes:** treating compilation as proof of runtime/UI behavior, counting a skipped check as passed, producing tautological tests, or deciding that an unverified requirement is unnecessary merely because it is difficult to test.

For documentation or low-impact configuration changes, the correct plan may consist of consistency, schema/syntax, and targeted smoke checks. More test code is not itself evidence of better validation.

## 6. Spec reviewer

**Responsibilities**

- Read the accepted requirements and actual diff independently of the implementer's explanation.
- Identify omitted or partial requirements, incorrect behavior, and unintended scope expansion.
- Check negative cases and nonfunctional requirements that are part of acceptance.
- Report concrete findings against the exact reviewed revision, with requirement and code/artifact pointers.

**Required capabilities:** comparing several sources consistently; detecting omissions; reasoning about behavior across files; separating agreed requirements from personal preferences.

**Assessment:** provide a clean-looking implementation and passing tests that omit one explicit requirement and add an unrequested behavior. It should identify both with evidence, without inventing additional obligations.

**Unacceptable outcomes:** approving based on the worker summary, missing an explicit acceptance criterion, or marking the review passed when no usable requirements were available.

Small tasks may use an explicit acceptance checklist instead of a long specification. Missing paperwork is not the same as missing intent; the reviewer still needs a recorded basis for its verdict.

## 7. Technical reviewer

**Responsibilities**

- Examine correctness, failure behavior, maintainability, and the project's documented standards.
- Look for interactions tests may miss: races, state ownership, invalid assumptions, partial failures, and loss of work.
- Distinguish reproducible defects and documented-standard violations from heuristic style observations.
- Provide a concrete location/scenario, expected versus actual behavior, impact, and supporting reasoning for each finding.
- Return findings without rewriting the candidate during the review; repairs get their own checked revision.

**Required capabilities:** adversarial code reasoning; domain/language understanding; multi-file causal analysis; calibrated severity; ability to substantiate or withdraw an initial suspicion.

**Assessment:** seed a real ownership/recovery bug and a superficially unusual implementation that follows project conventions. It should find the defect and explain its failure scenario while avoiding an unsupported style rewrite. Include a corrected candidate to check that it can recognize a genuine fix.

**Unacceptable outcomes:** vague “looks good,” speculative defects without a plausible path, missing a demonstrated critical issue, or treating personal style preferences as mandatory blockers.

Keep the Standards report separate from Spec review, consistent with Matt's flow. For changes involving substantial concurrency, security, data handling, performance, or visual behavior, use an additional focused reviewer when the ordinary review does not cover the necessary expertise. Do not require every specialty for every change.

## 8. Integrator

**Responsibilities**

- Check repository identity, worktree/branch ownership, and current source/target revisions.
- Integrate only related, accepted candidate work into the intended target branch.
- Resolve routine conflicts within the assigned scope; request clarification only for a material intent conflict.
- Preserve worker commits, unrelated dirty work, and unresolved recovery artifacts.
- Arrange verification on the combined result and invalidate evidence made stale by integration or repair.
- Reconcile interrupted integration against existing commits/artifacts before retrying.

**Required capabilities:** Git history/worktree reasoning; dependency awareness; interpreting conflict semantics; understanding the difference between syntactic merge success and correct combined behavior; conservative recovery from unknown outcomes.

**Assessment:** use two individually passing changes whose combination fails, an unrelated feature branch, and an existing dirty checkout. It should integrate only the related changes, detect the combined failure, preserve the other work, and arrange repair. In a second case, an interrupted integration already landed; it should recognize that fact instead of blindly repeating the operation.

**Unacceptable outcomes:** merging an unrelated branch, resetting/stashing the user's original checkout, forcing a second writer onto an occupied branch, deleting unfinished work, or certifying the integrated result using only pre-merge checks.

This role can be a bounded task within a campaign. It does not require another permanent coordinating session.

## Runtime responsibilities that no model assignment replaces

The dispatcher, runner, and readiness gate must implement the following behavior. Prompting a more capable model is insufficient to enforce it.

| Runtime responsibility | Required behavior |
| --- | --- |
| Ownership and workspace binding | Record and check job, canonical repository, branch, worktree, owner, and expected revision; refuse conflicting managed writers. |
| Check execution | Run the required commands in the intended environment and capture their actual outcomes. An agent's pasted log is not a runner-issued result. |
| Evidence freshness | Associate checks/reviews with candidate revision and acceptance/check plan. Detect changes that invalidate them. |
| Readiness | Accept promotion only with required applicable checks/reviews completed and no unresolved blocking findings. Keep blocked jobs out of the ready queue. |
| Limits and recovery | Enforce the configured shared concurrency/repair budgets, retain artifacts, and expose interrupted outcomes for reconciliation. |

Models propose plans, actions, findings, and assessments. The runtime checks whether a proposed transition satisfies its recorded conditions. This separation improves reliability; it is not a security sandbox or proof that the checks/reviews catch every defect.

## Matching candidates from a different catalog

### Establish suitability before comparing quality

Check the actual route and assignment: working access, permitted use, successful tool calls, supported input types when needed, and enough usable context for the scoped task. A provider's model entry may be available while a request still fails. Do not treat catalog membership as a successful trial.

No universal size, context-window threshold, price tier, or advertised reasoning label qualifies a model for these roles. The relevant question is whether it performs the role's observable work under the actual tools and environment.

### Run bounded local trials

Start with the active parent model and a small nominated shortlist if necessary; there is no need to benchmark the entire catalog. Use synthetic or otherwise permitted fixtures with independently known expected outcomes. Keep the initial trials small, then include harder cases and representative concurrent load for roles that will coordinate or run in parallel.

For each role, exercise both a successful path and a failure/uncertainty case. Repeat enough to expose obvious inconsistency and record the number and variety of trials. One successful example is provisional evidence, not general qualification. If a known case fails, repair the assignment/tooling or try a different candidate, then rerun the affected assessment before trusting that use.

Observe these dimensions separately:

- **Outcome correctness:** did it deliver the requested behavior or identify the planted defect?
- **Constraint compliance:** did it preserve scope, ownership, and unrelated work?
- **Tool reliability:** did it execute valid calls and recover from errors appropriately?
- **Evidence honesty:** did the report match what actually ran and was observed?
- **Follow-through:** did it repair or report a real blocker without repeated user prompting?
- **Operational fit:** how much elapsed time, usage, concurrency pressure, and repair work did it require?

Classify each as demonstrated, inconsistent, failed, or unmeasured, with scope and evidence. Do not collapse them into a single score that hides a critical failure. A candidate that falsely claims success, damages unrelated work, or misses a required readiness condition is unsuitable for that assignment until the failure is resolved and reassessed.

### Make the local assignment

Keep concrete model selections and any alternatives in the active machine/profile's local configuration. This shared document specifies responsibilities, not those selectors. Native subagents can inherit the live parent model when their definitions/overrides permit it; a separately launched worker process needs the selected model forwarded or set explicitly. See the [workflow's model-selection design](../docs/omp-agentic-workflow-research.md#model-selection-without-a-shared-model-list).

The same candidate can fill several roles, but implementer and reviewer should have separate contexts. A different reviewing model is an option to assess, not a requirement or a guarantee of independence. Use known role-qualified alternatives only; if no suitable candidate is available, expose a blocker or narrow the assignment with an explicit recorded decision. Do not silently lower the completion standard.

Optimize for a successfully checked and reviewed job, including repair effort. Fast individual responses can be a poor trade if they cause repeated fixes or require the user to intervene.

### Reassess when the evidence may no longer apply

Revisit assignments after a model/route changes, a catalog addition offers a useful alternative, tool or skill behavior changes, a new language/task exceeds the evaluated scope, or observed failures/latency/quota behavior deteriorate. When a provider silently changes behavior, operational observations are the signal to reassess.

Skill updates remain unpinned. Record what a trial/run actually used for diagnosis, and assess any changed responsibilities that matter to the role. Updating a skill does not automatically qualify an existing model for new work it has never demonstrated.

## Local assessment record

Use this as a template in machine-local storage. Fill in the actual model route there; do not turn this portable guide into a shared model roster or upload work artifacts.

| Field | Record |
| --- | --- |
| Role and evaluated assignment | Responsibilities and task class actually exercised |
| Candidate route | Exact locally selected identity, relevant settings, and date |
| Environment | OMP/tool versions, relevant runtime settings, and observed skill revision |
| Fixtures and trials | Local references, expected outcomes, trial count, and limitations |
| Quality observations | Separate outcomes for correctness, constraints, tools, honesty, and follow-through |
| Critical failures | Reproduction/evidence and whether the failure has been resolved and rerun |
| Operational observations | Elapsed time, observed usage/cost if available, concurrency behavior, and repair effort |
| Assignment decision | Suitable scope, provisional/established evidence, restrictions, or not yet suitable |
| Review trigger | What change or failure should cause reassessment |

## Completion evidence expected from role handoffs

Every handoff should identify the job/ticket and relevant scope, point to the artifacts it used or produced, and state what is observed versus pending. Code-producing and reviewing handoffs also identify the exact candidate revision. Missing evidence is a next action or blocker, not an implicit pass.

The final user-facing result remains short: what changed, target branch/revision, checks actually completed, review outcome, and remaining limitations. The detailed role records support that conclusion locally so the user does not become the first debugger or integrator.
