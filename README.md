# MARSWalk 1.9.10

A Mars exploration prototype with a shared Earth/Mars mission.

## Run
Use Node.js 24. In this folder:
```bash
npm start
```
Open **http://127.0.0.1:3000**. SQLite starts empty; no previous database is imported or deleted.

## Features
- **Earth:** globe → plan route, crew, tasks and budgets → send plan.
- **Mars:** review the plan → preparation checks → start the first-person walk.
- **Walk:** visible terrain, geology, history, observations, temperature and pressure. Time, oxygen and task progress stay above the view. **Tasks & crew** opens detailed controls.
- **Record:** stop, write a note, attach a photo or record audio. Mission time and modelled oxygen continue during stops.
- **Mission control:** moving map, received health/suit readings, tasks and messages. Only available during a started mission.
- **Mission log:** completed walks, findings and filters. Only one pending/active expedition at a time.
- **Chat:** bottom-right icon; badge for delivered unread messages.

## Data and calculations
| Data | Source | Use |
|---|---|---|
| Globe | NASA/USGS Viking mosaic | Global overview |
| Surface | HiRISE imagery + elevation | 3D reconstruction, elevation and slope |
| Route/history | NASA Perseverance traverse | Named sites and route distance |
| Geology | NASA site descriptions | Nearest documented site; not ground classification |
| Temperature/pressure | Bundled MEDA sol 1133 (27 Apr 2024) | Archived daily summary, not live weather |
| Observations | Crew entries | Notes, photos and audio with position/time |
| Health | Manual input / generated demo / optional BIDMC hospital replay | Source-labelled readings; no actual suit connected |

Travel time = distance ÷ pace. Plan time = travel + tasks + return + reserve.
O₂ endurance = configured minutes − elapsed minutes, including stops. Slope uses neighbouring elevations. Unknown readings stay unknown.

Exact sources, units, equations and code locations: [DATA-AND-CALCULATIONS.md](DATA-AND-CALCULATIONS.md). Bundled data and licenses: `research-data/`. Health/model details: [HEALTH-AND-MODEL.md](HEALTH-AND-MODEL.md).

## Shared database and deployment
Open the **same server URL** on both devices and select Earth/Mars. Progress, tasks, messages and reports share one database; updates poll each second.

- Local: SQLite. Hosted SQLite needs a persistent disk and one server instance.
- Online: **Vercel + Supabase Postgres**. Deploy the whole project and set `DATABASE_URL`, `PUBLIC_ORIGIN` and the team login. Follow [DEPLOY.md](DEPLOY.md). A persistent Node host is also supported.
- Keep a controller browser open. Another client can take over after disconnect; the walk resumes paused for review. Roles are views in one team workspace.
- Live mode: 1× / no delay. Mars delay: 1× / five-minute delay. Demo: 5× / no delay. Earth shows delivered reports.

No database, credentials or active mission is included. Cloud setup is required. Vercel API functions are included; static files alone cannot save missions. Vercel uploads: up to 4 MB per JSON request, including encoded media.

## Checks
```bash
npm run typecheck
npm run lint
npm run build
npm test
```
