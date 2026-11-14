# MARSWalk 1.9.7

## Run
Use Node.js 22.12+ and run this inside the extracted folder:

```bash
npm start
```

Open http://127.0.0.1:3000. Dependencies install and SQLite starts automatically. Stop the previous server first. The new database starts empty. Your old database is not imported or deleted.

## Mission flow
1. **Earth:** Explore Mars → Plan mission → choose route, crew, tasks and budgets → Send plan.
2. **Mars:** Missions → review delivered tasks and preparation → complete three review checks → Start walk.
3. **Walk:** first-person view, compact conditions sidebar, stop/resume, observations, photos, audio and messages. Stopping movement still uses mission time and modelled oxygen.
4. **Earth:** Mission control opens with a moving map and body telemetry. Click the map or **Open 3D view** for the reconstructed crew perspective. **Suit monitoring** opens health markers and details. **Split view** restores both panels.
5. **End walk:** saves the report in **Mission log**. Filter by astronaut, destination, task completion or field records. Only one pending/active mission is allowed; Earth waits for the delivered end report before sending another.

Add astronauts in **Crew & stops → Crew**. They share the route and clock, with separate tank and health readings. Previous walks reopen paused and require an explicit resume.

## Display and timing
- Normal: 1× walking/clock, no delay. Mars delay: 1× with five-minute communication delay. Fast demo: 5×, no delay.
- Earth map, POV, health, completed tasks and history use delivered reports. A reconstructed POV is not live video. Opening it does not move the astronaut or bypass delay.
- Surface rows show archived MEDA temperature and available HiRISE elevation/slope. Sources remain in a collapsed section. Unmeasured hazards and current weather stay unknown.
- Fast demo automatically generates changing health and suit readings for each astronaut. **Demo · generated** identifies them. Stopping reduces the activity load smoothly; resumed walking increases it. Live/delay modes restore manual readings; an optional hospital reference replay remains available. These are not medical predictions. Tank endurance remains a separate model.
- Inspect a body dot/label for a metric and received trend. The NASA reference suit sits below. WebGL-unavailable devices retain a 2D body/health fallback and the route map.
- Rubik is self-hosted throughout the interface, with its OFL license included.
- Animations respect reduced-motion preferences. Detailed views scroll inside their panels.

## Shared mission
Local SQLite or optional Supabase Postgres stores plans, progress, tasks, messages, observations and reports. Tabs/devices on the same server share them. One active browser advances the simulation; keep it open. If its connection is lost, another controller restores the walk paused. Roles are workspace views, not authentication permissions.

## Sources and deployment
- [TEAM-GUIDE.md](TEAM-GUIDE.md): features in plain language.
- [DATA-AND-CALCULATIONS.md](DATA-AND-CALCULATIONS.md): data, equations and code locations.
- [HEALTH-AND-MODEL.md](HEALTH-AND-MODEL.md): health data, models and permissions.
- `research-data/`: source files and notices.
- [DEPLOY.md](DEPLOY.md): recommended Supabase Postgres + Node deployment, or persistent local SQLite. This ZIP is not a public deployment.

## Checks
```bash
npm run typecheck
npm run lint
npm run build
npm test
```
Tests cover calculations, checklist gating, shared SQLite clients, Postgres transactions and controller leases, generated demo telemetry, delayed reports, movement, tasks, mission history, view transitions and health sources. Browser checks cover the main flow and panel layout. The preview browser disables WebGL, so GPU rendering and performance remain unverified. Test touch, microphone and 3D on the target device.

Sidebars use independent dropdowns. Open chat with the bottom-right message icon; its badge counts delivered unread messages. Drafts stay in this browser session. Earth Mission control opens only after crew Start and closes when the walk ends; the delayed final report remains in Mission log.
