# Local work dashboard

Requested 2026-11-11 after the runtime build. The user chose a local browser dashboard and wants to know current status and required actions without reading long agent summaries.

## Outcome

Open `/work dashboard` in the managing OMP session. It returns a local browser URL for the same queue and manager, without starting another controller or requesting a model. `/work dashboard stop` closes the dashboard. Closing OMP also stops the server.

The first view answers **what needs me now?** Show actionable blocked/interrupted jobs first, with a short literal reason and next action. Jobs merely waiting for a failed prerequisite belong in Waiting rather than multiplying the attention queue. Show active, waiting, ready and archived work with real counts derived from the jobs. Do not invent percentages, activity history, costs, or quality scores.

Each job exposes its repository, branch, candidate, stage, attempts, dependencies and last update. Details reveal the original blocker, accepted task, check and separate review outcomes, and local evidence/workspace paths. Historical or unavailable evidence is identified clearly. Long details remain collapsed by default. Search/filtering and a selected-job detail view work with keyboard and narrow screens.

For related tickets, show branch validation and integration validation as separate scopes with their own branch/revision. An earlier branch pass must not stand in for the failed integration outcome. Waiting labels distinguish unresolved prerequisites from paused dispatch or worker capacity. Delayed manager control failures remain visible inside an open job detail view.

The browser can pause dispatch, resume dispatch, or explicitly resume one blocked/interrupted job through the existing manager guards. It cannot submit arbitrary code/commands, rewrite acceptance, mark work ready, delete worktrees, or publish. Controls have pending/error states and do not claim success before acceptance. Normal status updates and completion notices stay short and point to details.

## Runtime constraints

- No production dependencies, remote assets, external data services, uploads or model configuration.
- Opt-in server bound to `127.0.0.1` on an available ephemeral port. One server per managing extension instance.
- Random per-start browser capability in the URL fragment, sent as an Authorization header for API requests. Do not put private job data in initial HTML or use arbitrary filesystem routes.
- Strict Host/Origin validation, no CORS access, restrictive content security policy, no caching of private API responses, escaped/text-only rendering of task and blocker content.
- Live refresh reads the real manager state. Connection loss shows stale/disconnected data and disables controls. Hidden tabs avoid unnecessary polling; the freshness time is honest.
- Pause/resume reuse the existing instance and process/recovery rules. No separate scheduler, background OS service, or new mandatory settings file.

## Public verification

The user selected the browser interface. Check this public HTTP/browser boundary alongside the already approved WorkManager interface: actual queue data and counts, attention vs dependency waiting, current vs historical evidence, missing/empty/error states, authenticated bounded controls, rejected foreign origins/hosts, shutdown, and safe rendering of long/untrusted text. Use disposable local state and controlled workers. Exercise the actual browser at desktop, tablet and phone widths, including keyboard navigation, filtering, details, controls and disconnection. Re-run appropriate runtime regression checks and independent Spec/Standards review before delivery.

## Interface

Shared status types are in `omp/workflow/dashboard-types.ts`. `GET /api/status` returns `DashboardSnapshot`. `POST /api/control` accepts exactly `{action:"pause"|"resume", id?:string}`; an ID is allowed only for resume. Success returns `{accepted:true}`; errors return `{error:string}`. Both require `Authorization: Bearer <capability>`. Assets are `/`, `/app.css`, `/app.js`, and explicit bundled font assets if any. No generic file endpoint.

Tickets 09 and 10 extend the accepted eight-ticket runtime build. Both may build against this shared interface; final adoption depends on their integration and public browser verification.
