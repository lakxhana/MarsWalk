# MARSWalk 1.5.4

## Run

Use Node.js **22.12 or newer**. Extract the ZIP, open Terminal in the extracted `MARSWalk-1.5.4` folder, and run:

```bash
npm start
```

Open **http://127.0.0.1:3000**. First start installs dependencies and builds the app. SQLite is created automatically; no account, API key or source edits are required. Internet is needed for first dependency installation and uncached globe tiles. The named-site 2D maps and weather snapshot are bundled for offline use after installation.

To keep older notes/messages/settings, stop the previous server and copy its `data` folder into this extracted project before starting. Keep a backup. The ZIP includes no personal database.

## Main workflow

Explore Mars → Plan route → Start walk. The planner offers Skinner Ridge, Wildcat Ridge, Three Forks depot and Octavia E. Butler Landing. The default short route is Skinner Ridge → Wildcat Ridge.

- The crew starts in a first-person 3D view. Drag to look around; the centered control bar switches between 3D and 2D without resetting movement. The map has its own unobstructed layout area. Temperature, oxygen and heart rate stay in the narrow left column. Health details expand inside that column.
- **Pause walk** is the single movement control. It stops walking and starts an investigation timer; mission time, oxygen use and communication delivery keep running. Resume walk continues from the saved position. There is no header Pause simulation button.
- **Record** opens the side editor for text, uploaded photos and microphone audio. Stop duration stays visible. Saving sends the observation through the delay queue; it does not restart movement. The photo and descriptive-note tasks complete when evidence is saved at the destination.
- **Return** follows the already-walked route in reverse. **End walk** saves the summary and queues a final Earth report. Field log retains previous notes and messages.
- Movement and report timing use the shared mission clock and continue while the Earth-team view is selected. Closing the app stops the simulation clock; on reopening, the clock resumes from the saved value. No offline elapsed time is invented.

## Mission timing

On Earth, open **Plan mission**. Before starting, set mission duration, mission reserve, planned observation-stop count and the limit per stop in the left sidebar. Edit each route task and its time estimate. Start demo mission begins the walk and returns Earth to tracking; switch to Mars crew to use the first-person view. Task stations are planned fractions of the recorded route, not claimed historical NASA science stops. Travel and return time are computed from recorded route distance divided by assumed walking speed; observation durations are editable planning estimates, not NASA measurements. Task checkboxes appear during the walk and their state reaches Earth through the selected communication mode. These shared preflight settings are not a delayed in-mission command protocol. The planner shows the observation allocation, travel/return estimate and the configured mission reserve, warning when the plan exceeds the budget. These are planning estimates, not enforced limits on the number of stops. During the walk, mission remaining, elapsed time, active stop time, total stopped time and remaining observation allowance stay in the sidebar. Observation allowance considers both mission time and simulated oxygen after return and reserves. Warnings appear as the stop limit approaches and is exceeded. Earth receives the same captured stop history and planned count through delayed reports.

## Earth monitoring

The tracking map fills the main workspace; progress, timestamps, health, activity and messages sit in the right sidebar. Earth shows the shared planned route immediately. The crew marker, trail, percentage/distance progress, stop duration and health values appear only after their reports arrive. The first-report countdown is explicit. New and upgraded sessions default to **Live demo (zero signal delay)**, with one-second crew reports. Earth’s Communication selector switches to **Mars delay (five simulated minutes)**; the selected mode is saved. Existing queued packets retain their original delivery time. This is shared-session simulation telemetry, not an actual video feed. In either mode, stopping the walk does not freeze it.

The Earth sidebar shows reported oxygen endurance, reserve threshold, tank ID, heart rate, stop alerts, other health readings and findings. All values are **as captured**, with capture/receipt times and report age. It never extrapolates old health values or positions as current measurements. A typed reply is delayed on its return to Mars.

The app currently runs one shared local mission with a role switch. This is not a deployed multi-user mission-control service. Browser locking prevents multiple tabs from advancing the same local mission clock independently.

## Data used

### Named sites and routes

- NASA waypoint feed: https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json
- NASA traverse feed: https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json
- Snapshot retrieved 12 November 2026. Relevant geometry is bundled in `public/assets/nasa/jezero-named-sites.json`.
- Site associations use rover workspaces: Skinner Ridge Sol 477 / RMC 26_1004; Wildcat Ridge Sol 502 / RMC 26_1222; Three Forks vicinity Sol 652 / RMC 32_148; landing location Sol 13 / RMC 3_0. These are rover positions near the named features, not exact individual core/tube coordinates.
- Site science references: https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/ and https://science.nasa.gov/resource/perseverances-three-forks-sample-depot-map/
- Routes follow a connected graph of **recorded rover traverse segments**. Crew movement assumes 1.1 m/s. This is not a validated human walking route, a new shortest-path solution, or a slope-safety assessment. Legacy slope fields are unused in this mode. Longer recorded rover routes may exceed the configured mission budget.

### Map imagery

NASA Mars Trek HiRISE layer `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd`, equirectangular WMTS. The western Jezero overview and higher-resolution delta inset are stitched at zoom levels 14 and 17. Exact tile-derived bounds and URLs accompany both bundled images. Credit: NASA / JPL / University of Arizona. Imagery is orbital grayscale, not astronaut eye-level photography.

The named-site 3D walk now drapes these images over the USGS Mars 2020 HiRISE DTM mosaic, cropped to the same geographic bounds. Elevations are bilinearly resampled to a 385×257 cell-centred grid (approximately 12–13 m source-projection spacing); source elevations are metres, with the MOLA topography/delta-geoid reference specified by the original product. Missing-data triangles are omitted. The camera follows measured ground height. No procedural hills or generated image are used. It remains an orbital reconstruction and cannot show rocks finer than its imagery or elevation grid. Source: https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif . The terrain change is presentation-only: route planning and its traversability limitations are unchanged. There is no visible astronaut avatar. Camera movement is simulated and smoothed between position reports. The older eastern HiRISE crop and DTM remain available for earlier saved routes. They are **not** relocated to the new sites. New named routes use the western mosaic and recorded rover geometry.

### Temperature

Source: https://mars.nasa.gov/rss/api/?feed=weather&category=mars2020&feedtype=json

The bundled unmodified response contains a last valid temperature record for **Sol 1133, 27 April 2024: −79.3 to −24.7 °C**. This is a **recorded daily air-temperature range at Perseverance**, not live weather at the simulated astronaut. Missing rows are filtered. No prediction equation is applied. Source date and meaning are available beside the reading. Original response/retrieval metadata are bundled in `public/assets/nasa/perseverance-weather.json`.

### Crew health and oxygen

Heart rate, body temperature, suit pressure and O₂/CO₂ partial pressure support **manual timestamped entries** with optional configured warning limits. There are no connected wearable sensors and no invented heartbeat readings. Pre-walk entries are retained. Entries become stale after 60 simulated seconds. Earth sees the values and freshness state recorded in each delivered report.

Oxygen is a clearly labelled constant-endurance scenario: configured endurance minus elapsed mission minutes, including stops. It is not tank-pressure telemetry or a physiological model. Default endurance is 120 min and reserve is 15 min; configure these under Crew & fieldwork setup. Local and delayed Earth reserve warnings are supported. Medical warning limits are not pre-assumed.

NASA monitoring reference: https://www.nasa.gov/reference/11-0-spacesuits-vol-2/

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Tests cover named-route connectivity, source coordinates and weather values, actual mounted React walking/pause/resume/arrival behavior, movement while the Earth view is active, delayed health/progress visibility, stop timers, evidence completion, SQLite persistence and running HTTP APIs. Dependency installation was checked with `npm ci --ignore-scripts --dry-run`.

Chromium cannot launch in this execution environment because local socket creation is blocked. Visual browser/tablet rendering and camera/microphone permission flows require checking on your device. The new interaction tests exercise React state/effects but do not substitute for browser layout tests.

## Layout update (1.5.4)

Route selection and crew/fieldwork settings share one scrollable left sidebar. The map occupies the remaining width. The walking sidebar (including observation recording) is also on the left. Functions and terrain rendering are unchanged.
