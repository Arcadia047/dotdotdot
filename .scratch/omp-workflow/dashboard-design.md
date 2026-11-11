# Browser attention dashboard

## Design truth

- Product: **OMP Work**, scoped to one local OMP profile and the existing manager.
- Main question: **What needs me now?** The attention count and literal root blocker lead. Dependency waiting remains a separate lane.
- Detail question: **Why is this job held, and what was validated for its candidate?** The selected job shows its next action, branch, candidate, attempts, prerequisites, separate check/review outcomes and local paths.
- Objects: jobs with stable IDs; protected repositories and workspaces; branches and candidate revisions; implementation/integration kinds; runtime stages; root blockers; prerequisite jobs; attempts; checks; Spec and Standards reviews; revision-bound receipts; archived work.
- Magnitudes and units: real job/attempt counts, literal statuses and local timestamps. The UI derives filtered counts from returned jobs and rejects inconsistent API totals. No invented history, percentages, cost or performance figures.
- Typical use: a quick check in the managing session, followed by one recovery action or a look at evidence. Desktop and phone share that task; phone details occupy the viewport.

## Direction

Dealt with `draw.mjs --app --kind devtools --screens overview,detail` using the specific local-manager brief. Chosen style: **framed-sheet**, seed **97404186**. No redraws.

The frame suits a quiet local operational tool and gives the queue a clear working surface. Its face is a green-grey frame, IBM Plex Sans for the interface, and IBM Plex Mono for branch/ID/revision/path values only. The product mark is a small forked branch rather than an icon tile. Its signature is each work lane's **branch → current stage**, tied to the actual protected branch and manager state.

The desktop grid closes: `1440 = 228 frame + 1204 sheet + 8 inset`; `1204 = 2 × 565 lanes + 24 gutter + 2 × 24 padding + 2 border`. The sidebar folds at tablet width; phone lanes stack and the native detail dialog becomes a full-screen view. The first attention job begins within the top 60% of the phone screen.

Bundled fonts are from IBM's Plex repository, unchanged, under the included SIL Open Font License 1.1. Source: `https://github.com/IBM/plex`, `packages/plex-sans/fonts/complete/woff2/` and `packages/plex-mono/fonts/complete/woff2/`; license in `dashboard/fonts/OFL.txt`. No font request or other external asset is made at runtime.

## Behavior and API boundary

- Uses the fixed `DashboardSnapshot` contract at `GET /api/status` and `{action: "pause" | "resume", id?: string}` at `POST /api/control`.
- Reads `#token=…`, retains the capability in origin-scoped session storage when available, clears the fragment, and sends it only in the local Authorization header. No capability is rendered in the page.
- Polls every four seconds while visible. Hidden tabs do not poll; returning tabs reconnect before enabling controls. Connection loss or a response older than twelve seconds disables actions and retains an explicitly stale snapshot, including inside an open detail dialog.
- No optimistic state changes. An action is described as accepted only after `{accepted:true}`; the displayed queue/dispatch state follows a fresh status response. Pending and rejected actions remain visible, including in details.
- The global paused control says **Resume all work** because the existing manager resumes dispatch and reconciles blocked/interrupted jobs. A paused per-job control says **Resume job & dispatch** because per-job recovery also unpauses dispatch. The manager retains all recovery guards.
- Known raw runtime phases are presented as readable stage labels. `checking` is **Checks & reviews**, because the current runtime stage may encompass both; custom phase text remains literal. Dependency waiting and history are labeled from their bucket.
- All task, blocker, title, branch, error and evidence values use text nodes/textContent. Full task and original blocker are closed disclosures by default; overview titles/reasons stay concise under long input. No HTML injection or arbitrary filesystem navigation is used.
- Evidence is clearly **Current validation** only for the matching ready candidate. Other available evidence is labeled **Last validation attempt / Historical evidence**. Unavailable evidence and missing review axes are explicit. The client rejects inconsistent current-evidence/candidate associations.
- Native dialog behavior provides focus trapping and Escape. Closing returns to the originating job, including after it moves lanes. Live changes preserve open disclosures, drawer scroll and keyboard focus. Local paths have explicit Copy actions with a selection fallback.

## Browser evidence

Validated against an isolated temporary synthetic HTTP preview at `127.0.0.1:43127`, using the actual assets and restrictive same-origin CSP. The preview profile is visibly **Synthetic UI preview**. Initial data: seven jobs — two attention, two active, one waiting, one ready and one archived. Recovery moves a job between buckets without changing the total. No synthetic data or preview branch is shipped in the production assets. Integration with the actual WorkManager/server is a separate adoption check by the coordinator.

Tools: installed Brave through Playwright CLI in a disposable profile, and the design inspector's native browser driver. No app dependency was added.

Passed browser assertions:

- Search by branch, coherent result counts, no-results recovery, Waiting filtering, History and Overview navigation.
- Correct selected-job details; initially closed long disclosures; separate check/Spec/Standards outcomes; historical evidence labeling; literal SVG/script-like text with no injected nodes.
- Native dialog initial focus, Shift+Tab containment, Escape, focus return, full-width phone layout and no horizontal document overflow.
- Authenticated pause/resume round trips; accepted recovery refreshes counts and removes the obsolete recovery control. Recovery rejection is shown in the drawer.
- Accurate paused labels (**Resume all work**, **Resume job & dispatch**) fit the phone. Raw runtime phases are humanized. A live response change preserves focused/open task disclosures, and a mismatched current evidence revision disables controls until a valid response returns.
- Disconnection retains the last snapshot, disables global/job actions and warns both in the queue and immediately when opening details. Reconnection restores actions from a successful status response.
- Empty queue produces five honest zero counts. Missing authorization, initial malformed data and subsequent malformed data fail without a false ready state. Loading keeps its structure with controls disabled.
- Very long unbroken titles, long literal failure reports and a large task disclosure remain safe and fit the phone viewport.

One defect found and fixed by these checks: opening a detail dialog after a connection failure initially omitted its stale warning until the next refresh. Details now synchronize all notices immediately on open.

Screenshots and reports are local, uncommitted artifacts in this worker checkout:

- `output/playwright/dashboard-inspect-final/{desktop,tablet,mobile}-fold.jpg` at 1440×900, 768×1024 and 390×844.
- `output/playwright/dashboard-inspect-final/report.json`: **0 FAIL, 0 WARN**. The final data shows a successfully recovered job in Active and a remaining interrupted job in Needs you.
- `output/playwright/dashboard-mobile-{detail,disconnected,long-text,empty,loading,paused}.png` and `dashboard-desktop.png` record exercised states. Full-page dialog captures include background content beyond the viewport; the phone dialog itself is exactly 390×844.

Rendered critique: the largest count answers the attention question; all lanes share the sheet edges; status carries the chroma; actual counts reconcile before and after recovery; unknown/empty data is explicit; phone navigation folds, the first job stays prominent, and details contain the secondary paths/task text. Later passes tightened desktop attention padding and increased phone metadata to 13px. A context-row line-height fix prevents cutting through wrapped metadata.

Source checks: `node --check omp/workflow/dashboard/app.js` passes. Design lint: **0 FAIL**, three monospace warnings defended by the explicit branch/ID/path/revision use and the font declaration itself; the browser inspector confirms the actual dealt fonts load.
