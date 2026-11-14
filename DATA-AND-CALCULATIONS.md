# Data and calculations

All times below are minutes unless marked seconds. D = horizontal route distance (metres), v = speed (m/s), B = mission time remaining, E = simulated oxygen endurance remaining, Rt/Ro = time/oxygen reserves. Every estimate is conditional on its inputs.

| Calculation | Equation / operation | Implementation |
|---|---|---|
| Coordinate frame | Convert longitude/latitude linearly using existing crop bounds and metre extents | `jezeroHiRISE.ts: lonLatToCropMeters` |
| Recorded distance | Sum sqrt(dx² + dz²) along NASA rover segments | `jezeroRoutes.ts: namedRoute` |
| Travel | D / v / 60; preflight return assumes the same path and pace | `preflight.ts: preflight` |
| Required time | Outward + sum of selected task minutes + return + Rt | `preflight.ts` |
| Oxygen | q = metabolic g/h + extra losses; mass = q × minutes / 60 | `preflight.ts` |
| Oxygen checks | Route demand uses work + max(Rt,Ro); full-budget demand uses mission duration + Ro; inferred supply uses entered endurance | `preflight.ts` |
| Task capacity | max(0, min(B−Rt, E−Ro) − travel_minutes) | `adaptivePlanning.ts: taskCapacity` |
| Task optimiser | Maximise sum(priority_i × included_i), with summed task seconds <= capacity | `adaptivePlanning.ts: optimiseTasks` |
| Terrain alternative | Dijkstra cost per edge = length × (1 + 4 × abs(height difference)/length); reject unknown cells and over-limit slopes | `terrainAlternatives.ts: gentlerRoute` |
| Sampled slope | atan(abs(height difference)/horizontal distance), in degrees | `terrainAlternatives.ts: segmentSlope` |
| 3D height | Bilinear interpolation of four valid grid neighbours | `walkTerrain.ts: westElevation` |
| Pace | Moving metres / moving seconds, recent approximately 60 seconds; use assumed pace until at least 10 seconds observed | `adaptivePlanning.ts: estimatePace`, `FieldWalk.tsx` |
| Remaining budget | Initial budget − elapsed seconds / 60; same constant-use rule for oxygen endurance | `crewOperations.ts: oxygenRemaining`, `FieldWalk.tsx` |
| Return distance | Outbound: distance already travelled. Return leg: route length − distance travelled | `adaptivePlanning.ts: returnDistance` |
| Direct-return stop allowance | min(B−Rt, E−Ro) − return_distance / v / 60 | `FieldWalk.tsx` |
| Investigation | Subtract remaining full itinerary travel and requested extra time; optimise pending included tasks with the balance | `adaptivePlanning.ts: investigationOptions`, `InvestigationAdvisor.tsx` |
| Reachable path limit | On outbound path at distance d: min(D, (60v × min(B−Rt,E−Ro) + d)/2); no reachable highlight if direct return cannot fit | `adaptivePlanning.ts: reachableDistance` |
| Communication | Delivery = send + round(60 × one-way delay); earliest reply = twice one-way delay, plus operator review time | `commManager.ts`, `InvestigationAdvisor.tsx` |
| Policy comparison | C = min(B−Rt, E−Ro) − (outward+return)/pace_factor − extra_stop; fixed selects a fitting prefix, adaptive maximises priority | `planComparison.ts: compareMission` |
| Outcome estimates | Return in = travel + extra stop + retained task minutes; O₂ at return = E − return_in; margins subtract the respective reserve | `planComparison.ts` |
| Advice arrival | send_time + round(60 × delay_minutes) | `adviceTiming.ts: adviceArrival` |
| Advice expiry | Active stop: stop_start + stop_limit × 60; travelling: report_capture + 60 × (arrival_minutes + pending_task_minutes) | `adviceTiming.ts: adviceFromReport` |
| Advice review | Compare mission ID, plan version, destination, stop state and expiry against current Mars context | `adviceTiming.ts: assessAdvice` |
| Rendered route height | Piecewise-linear interpolation of the same terrain triangles, using the highest visible imagery layer at each ribbon vertex | `surfaceGuide.ts: groundHeight`, `routeGuideGeometry`; `WalkScene.tsx` |
| Health data age | now − measurement_capture; missing stays missing; sensor-age-at-report and communication age are separate | `CrewTelemetry.tsx`, `healthMonitoring.ts` |
| Earth information age | max(0, current simulated time − report capture time); only delivered reports visible | `earthMonitoring.ts`, `EarthTeamMonitoring.tsx` |
| Stop warning | Exceeded at stop limit; approaching within 60 seconds | `crewOperations.ts: stopLevel` |

## Boundaries of the algorithms

- The task optimiser is 0/1 knapsack over up to 30 tasks. Durations round UP to whole seconds; capacity rounds DOWN. It maximises integer priorities (1–5), then prefers lower time on ties. Capacity is capped at 24 hours. Priority is a mission-team preference, not NASA's judgement of scientific value.
- Tasks remain on the chosen route. This is not a multi-destination travelling-salesperson solver. Completed tasks are preserved when an investigation revises the pending plan. Skipped tasks remain visible to Earth in received task reports.
- Investigation time means time from now in addition to pending tasks. Applying extends the current stop allowance if needed; it does not freeze the clock or guarantee remaining time. Future tasks keep their full estimated duration unless marked complete. This is conservative when partially finished tasks are not marked complete.
- Terrain search uses 8-connected neighbours on the bundled 385 × 257 west DTM, checks edges at intervals of at most 4 m using interpolation, prevents diagonal passage through missing cells, and validates exact endpoint connections. The coefficient 4 and slope choices 10/15/20° are scenario settings, not physiological or safety laws. The algorithm minimises its weighted cost over this graph; endpoint snapping and grid resolution limit the result. A modelled alternative need not have a lower maximum slope than the recorded path. Speed remains an assumption; this is not a metabolic-workload predictor.
- Reachability is along the selected path only, with no extra observations. It is not a free-roaming safe-area polygon. On the return leg it shows the route if the remaining path fits the budget. Historical terrain does not certify present traversability.
- Visible comparison uses `planComparison.ts`: Original = all selected, unfinished tasks at baseline pace, with no added stop. It can exceed reserves; negative spare time is shown. Adjusted = selected scenario pace and extra stop, with exact 0/1 knapsack selecting tasks within both reserves. The original card does not change with dropdowns. These are scenario estimates, not measurements. Fixed-prefix calculations remain in the library for regression tests, but are no longer the left-hand UI card.
- The walk is still a simulation: “observed pace” measures simulated positions over moving time. A collapsed test-pace control demonstrates changes without changing the simulation clock. No GPS feed is connected. Human motion prediction needs separate validation.
- Earth receives estimates and decisions captured on Mars. It does not recompute them using current crew state before packet arrival.

## Actual sources and files

- Named locations and traverse: `src/lib/jezeroNamedData.json`; https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json and https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json . Pins are rover positions at named locations, not exact individual rocks.
- Regional imagery: `public/assets/nasa/jezero-west.jpg` and `jezero-delta-detail.jpg`; source and bounds in `src/lib/jezeroWestImagery.json` and `jezeroDetailImagery.json`. Orbital imagery textures the terrain, not ground photography.
- Elevation: `src/lib/jezeroWestElevation.json`; USGS/NASA HiRISE DTM resampled to 385 × 257. The source is nominally 1 m; bundled spacing is roughly 11–13 m. See source URL in `research-data/data-catalog.json`.
- Weather: `src/lib/verifiedWeather.json`; selected last valid bundled row is MEDA Sol 1133, 2024-04-27, −79.3 to −24.7 °C. Already Celsius. No live prediction or temperature-to-oxygen calculation.
- Oxygen: [NASA BVAD Rev2 Table 4-70, printed p135](https://ntrs.nasa.gov/api/citations/20210024855/downloads/BVAD_2.15.22-final.pdf#page=149), 0.086 kg/person/hour = 86 g/person/hour. Additional losses default zero. Model supply is inferred from endurance, not measured usable tank contents; no tank-fill or pressure-sizing prescription.
- Destination science: [Skinner Ridge cores](https://science.nasa.gov/resource/rock-cores-from-skinner-ridge/) and [Wildcat Ridge samples](https://science.nasa.gov/resource/meet-the-mars-samples-hazeltop-and-bearwallow-samples-12-and-13/). Context is sourced; proposed observation tasks and their durations/priorities are our editable scenario choices. Other sites use the general Perseverance science link rather than invented site-specific claims.
- Globe: NASA/USGS Viking mosaic from Mars Trek, fetched online. The displayed 4096 × 2048 texture is coarser than the source's nominal 232 m/pixel.
- Health: manual entries, explicit synthetic fixtures, or optional BIDMC reference replay (hospital data, not astronaut data). See `HEALTH-AND-MODEL.md` for source/license, units, timing and model credit. Breathing rate is a separate input in breaths/min, never estimated from heart rate. Sample values are handcrafted demonstration fixtures (82 bpm, 16 breaths/min, 29.6 kPa suit pressure, 20 kPa O₂ partial pressure, 0.3 kPa CO₂ partial pressure), not recommended operating settings. Input bounds only reject implausible numeric entries; they are not alarm limits. No medical prediction or sensors are connected. [NASA suit monitoring reference](https://www.nasa.gov/reference/11-0-spacesuits-vol-2/) informs the choice of suit measurements, not a claim of certified compliance.
- Storage: SQLite database created in `data/`; frontend settings and migration code also use browser storage. Data snapshots under `research-data/` are public reference exports, not personal mission records.

Existing east-crop terrain/A* modules are retained for compatibility but are not the new western terrain search. Distances use the existing local affine projection, not survey-grade geodesics. Unknown elevation stays unknown; historical images and grids do not resolve small obstacles. No trained AI or language model is required for these recommendations.

## Worked example and validation

For 660 m at 1.1 m/s: outward = 10 min and return = 10 min. Three 5-minute observations plus a 10-minute reserve require 45 min. At 86 g/h, a full 60-minute mission plus 15-minute oxygen reserve corresponds to 107.5 g of model oxygen demand.

Tests independently enumerate all 256 subsets for each of 80 optimiser cases and another 120 eight-task comparison cases, checking optimum priority, tie-break duration and common reserve constraints. They also check zero capacity, missing terrain, return completion, pace excluding stops, investigation application, delayed Earth visibility and SQLite. `research-data/planner-validation.json` and `revision-validation.json` contain actual test output, including independent Three.js ray intersections and named-route triangle samples. These are finite geometry samples, not an exhaustive rendering proof. This verifies algorithm behaviour, not suited human performance. Tablet/browser rendering remains to be checked on hardware because local Chromium cannot launch in this environment.


## Advice and display details

Earth derives advice deadlines only from delivered snapshots. With no departure estimate, the UI says unknown. A stop limit is a review deadline, not a promise that the crew will leave then. Transit, review time, new stops and changing tasks can invalidate predictions; Mars rechecks local context. Task selection/time, mission budget/reserves, O₂ endurance and investigation replanning changes increment the active plan version. No message automatically changes the mission. General chat remains available without a plan link. Reply metadata is withheld until the reply itself arrives and retained by SQLite.

The guidance ribbon samples every 0.5 m on ordinary routes, preserving route corners; sampling is capped near 20,000 steps for long routes. Each edge uses the rendered mesh height plus 0.19 m; the wider outline uses 0.16 m. These offsets and colours are display choices, not new terrain elevations. Depth testing remains enabled, so hills still occlude distant guidance. No-data sections are omitted. [Three.js material documentation](https://threejs.org/docs/pages/Material.html) explains the depth/polygon-offset controls.

Comparison example: outward 10 + return 10 + extra stop 5; mission 43, time reserve 10, O₂ endurance 90, O₂ reserve 15. Capacity = min(43−10,90−15)−20−5 = 8 min. Task times/priorities are 4/2, 6/5, 5/3. Fixed keeps the 4-minute task, returns in 29 min, and retains priority 2. Adaptive keeps the 6-minute task, returns in 31 min, and retains priority 5 with 2 min above the time reserve and 59 min O₂ endurance left. This example is a fixture, not a NASA mission outcome.

Displayed estimates are rounded; JSON validation fixtures retain unrounded results. Negative observation allowances and exhausted endurance are explicitly clamped at zero.

## Shared timing
`App.tsx` advances elapsed wall-clock seconds once per shared controller. Mars delay forces multiplier 1 and the route's nominal walking pace. Fast demo uses a 5× mission clock, including observation time and oxygen endurance. `server/session.mjs` leases one controller, stores commands in SQLite and commits command acknowledgements with mission snapshots; viewers poll every second. Handover pauses saved missions. Role views are not security boundaries.

## Crew, mission log and walk context

- One mission contains a lead astronaut plus optional teammates. Everyone follows the same simulated route; separate movement is not implemented. Each person has their own entered tank endurance/reserve and manual or explicitly simulated readings.
- Per-person O₂ minutes remaining = max(0, entered endurance − elapsed mission minutes). Team spendable O₂ time = min across crew of (remaining − personal reserve). Travel, stops and task selection use this minimum. No reserve is transferred between people.
- Team oxygen demand = sum across crew of (metabolic + configured losses) × required minutes / 60. The entered rate is a common planning baseline, not individual physiological prediction. NASA BVAD Rev 2, Table 4-70 gives 0.086 kg/person/hour for typical EVA metabolic oxygen consumption; 86 g/hour alone does not include all suit losses. This is not validated Mars suit capacity.
- Ending calls `archiveMission` in `crewOperations.ts`: closes stops, freezes tasks/findings/crew/report, assigns a mission ID and delivery time, and stores history with the shared SQLite mission checkpoint. Duplicate end commands do not create duplicate history. A server disconnect is surfaced; the simulator requires a connected controller. On restart the saved mission is paused.
- `MessageNotice` displays received chat/questions/replies only. `messageNotices.ts` applies delivery times. Dismissal is local to the browser and workspace; mission/messages remain in SQLite.
- `surfaceContext.ts`: local grid slope = atan(sqrt((dh/dx)^2 + (dh/dz)^2)), in degrees, with central differences one bundled grid cell apart. Bilinear height interpolation and grid resolution limit precision. Missing neighbour samples yield unknown, never zero slope.
- Destination geology and abrasion history for Skinner Ridge and Wildcat Ridge come from NASA's [Two Abrasion Patches](https://science.nasa.gov/resource/two-abrasion-patches-from-perseverance-at-jezero-delta/). They are site context, not a full geological polygon layer or an identification of the ground beneath the crew. Other sites show missing geology explicitly.
- Terrain/elevation: bundled NASA HiRISE images and DTM, with source URLs inside `jezeroWestElevation.json`, `jezeroWestImagery.json` and measured-crop metadata. A reported slope does not establish human traversability; small obstacles, soil bearing strength and current dust are not measured here.
- Scientific observations: actual saved user records sorted by distance from their stored local coordinates. These are simulation observations, not newly acquired NASA science.
- Previous activity: named rover locations/sols from `jezeroNamedData.json`; this is a rover path, not an astronaut GPS measurement.
- Environmental temperature and available pressure: `verifiedWeather.json`, the existing NASA Mars 2020 weather archive. Displayed date/sol identify historical coverage. No equation is used to pretend these measurements are live. [MEDA archive](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html).
- Meteomatics is not integrated: its documented models (ECMWF, GFS and others) concern Earth; no documented Mars dataset was found. [Published sources](https://www.meteomatics.com/en/api/request/optional-parameters/data-source/).
- Defaults (60-minute mission, 5-minute stops, tank endurance, reserve, 1.1 m/s walking pace) are editable scenario inputs, not scientific observations or NASA-approved limits. Walking speed is now editable in Time & oxygen. All predictions remain conditional; measured terrain does not prove a human completion time.

## Generated health demo
`src/lib/healthDemo.ts` uses the coefficients in `research-data/demo-vitals-model.json`: smooth activity load = target + (previous − target) × exp(−elapsed/45); metric = rest + activity change × load + small deterministic sine variation. These are illustrative assumptions, not validated astronaut physiology. Tank endurance still uses the separate elapsed-time model. See HEALTH-AND-MODEL.md.

## Shared database
`server/index.mjs` selects SQLite by default or Postgres when DATABASE_URL is set. `server/postgres.mjs` handles transactions and a database-backed simulator lease. `server/schema.sql` creates an empty private schema. `src/main.tsx` loads this database without importing old browser records. Operational identities are entered by the user; scientific source files and editable planning assumptions are retained.

## Walking readouts (1.9.8)
- `walkReadings.ts` samples the existing elevation grid at the crew's current local coordinates. Slope is the arctangent of the central-difference gradient; unavailable neighbours yield no reading.
- The closest bundled named-site coordinate supplies **site context** for geology and rover history. Distance is shown; this does not classify the surface at the astronaut's feet. `SITE_SCIENCE` retains the NASA source links.
- Observations count saved crew records with finite positions and timestamps no later than the current simulation clock. Nearest-record distance uses the same local metre frame.
- Temperature is the last valid archived daily air range: MEDA sol 1133, 2024-04-27, −79.3 to −24.7 °C. Pressure is **778.9 Pa from that same record**, unchanged. Neither is a live reading, a spatial weather map or an equation-based forecast.
- `WalkReadings.tsx` renders these values directly on the walk. `SourcesAndCoverageView.tsx` lists sources and limits. Full source product metadata remains in `dataManifest.ts` and `research-data/data-catalog.json`.
