# MARSWalk — team guide

**Purpose:** help a Mars crew complete useful science while time, oxygen and Earth-message delays limit its choices.

**Flow stays:** globe → plan → first-person walk → record and communicate.

| What to show | What it does |
|---|---|
| Compare plans | Tests an extra investigation or slower walking. The original stays fixed; the adjusted plan uses the changed pace and investigation time. |
| Original plan | Keeps the sent tasks and planned pace as a fixed reference, even when they exceed the budget. |
| Adaptive selection | Chooses the greatest total priority that fits. The crew decides whether to apply it. |
| Earth crew panel | Shows heart rate, breathing, oxygen endurance and received suit readings, with age and source. |
| Plan-linked advice | Earth sees expected arrival versus departure; Mars flags changed plans, ended stops and expired advice. |
| How calculated | Small expansions show the actual inputs, arithmetic and result. |
| Navigation | A contrasting ribbon follows rendered terrain; 3D and 2D remain available. |

**Try it:** plan a route and open **Compare plans**. Change priorities, observation minutes and the scenario delay. Choose **Fast demo · 5×** before starting to generate labelled health readings automatically. In normal/delay modes, manually entered readings reach Earth after the configured delay. In Earth Messages, select **Link advice to reported plan**. End that stop before the message arrives to show the crew's review warning.

## What is real?

- NASA/JPL named locations and rover paths; NASA/USGS images and elevation.
- MEDA historical temperature summaries, not live weather.
- The oxygen calculation starts with NASA's 86 g/person/hour metabolic reference. Endurance, additional losses, speed, tasks and reserves are editable model assumptions.
- Health readings are manual, licensed reference replay or explicitly generated demo values. No medical sensors are connected; breathing is not inferred from heart rate.
- SQLite stores shared state locally; optional Supabase Postgres stores it for a deployed Node service. Personal databases are excluded from the ZIP.

## Explain the mathematics

Time = distance ÷ pace. Observation budget = the smaller time/O₂ allowance, minus travel and reserves. The optimiser selects the highest sum of task priorities within that budget. The adjusted plan protects the configured reserves; the original shows whether the unchanged mission would exceed them.

Example: a 43-minute mission with 10 minutes reserved leaves 33 minutes for work and travel. With 20 minutes travelling and tasks taking 4/6/5 minutes, the original plan takes 35 minutes and exceeds the available time by 2. Add a 5-minute investigation: only 8 minutes remain for tasks. The adjusted plan keeps the 6-minute task with priority 5, returns after 31 minutes, and leaves 2 minutes above the reserve.

Advice arrival = sending time + one-way delay. Advice validity uses the last received stop/plan, then is checked against the crew's current context on arrival.

**Evidence:** `npm test` regenerates `research-data/planner-validation.json` and `revision-validation.json`. These prove consistency for the tested calculations—not human performance, medical accuracy or operational safety on Mars. Sources, equations and code locations are in `DATA-AND-CALCULATIONS.md`.

### Who plans?
Earth prepares the route, tasks and budgets. Mars reviews and starts the walk, or requests changes. Drafts do not overwrite active missions. Earth sees only delivered position reports; its arrow points along the reported heading. Live demo has no signal delay.

Interface: dropdown sections keep details out of the way. Chat is the bottom-right icon; a badge appears only for arrived messages. Mission control is available during an active walk only. Ended missions are in Mission log.
