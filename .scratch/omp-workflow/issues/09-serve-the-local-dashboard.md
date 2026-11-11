# 09: Serve the real local queue to the browser

**What to build:** The loopback-only dashboard server, real queue/evidence projection, bounded pause/resume controls, extension lifecycle/command adoption and concise status notices described in [dashboard-spec.md](../dashboard-spec.md).

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] Use the same WorkManager with no new scheduler or runtime dependencies.
- [ ] Verify real status, attention/evidence projection, authenticated controls, Host/Origin boundaries and shutdown through the public server/extension interfaces.
- [ ] Preserve all existing ownership, review, repair and local-data rules.
- [ ] Record validation and operating limits locally.
