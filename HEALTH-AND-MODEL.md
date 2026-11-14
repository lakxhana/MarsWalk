# Suit monitoring: what is real?

**The map is a simulated crew position. The suit is a reference model. Neither is a live astronaut feed.**

## Use it

Open **Earth → Mission control**. Map and suit share the main area. Select **Suit monitoring** for the body map and detail inspector; **Split view** returns to both. Messages, conditions and tasks stay in the sidebar. Pick an astronaut, then tap a body dot or adjacent label. Suit and tank readings sit below. The inspector shows received values, timestamps and a short trend. The Inspect menu includes suit pressure, oxygen/CO₂ partial pressure and body temperature. Details stay within the panel.

Start a mission in **Fast demo · 5×** to generate readings automatically. Every value is labelled **Demo · generated**. Live/delay modes use manual entries unless you explicitly start the licensed hospital **Reference data replay**. Switching modes restores original manual values; generated measurements do not overwrite them.

## Generated demo: transparent assumptions

This is illustrative telemetry, not a validated physiology simulator. Editable coefficients are in `research-data/demo-vitals-model.json`; generation is in `src/lib/healthDemo.ts`.

- Activity target = 1 when walking; 0 during investigation stops. Load approaches the target: `next = target + (previous − target) × exp(−seconds / 45)`.
- Each metric = configured rest value + activity change × load + small deterministic sine variation. Values are rounded to the configured precision and sampled once per mission second.
- Phase depends on crew ID and mission start, so all clients agree and astronauts have distinct traces. No random value is generated on a page render.
- The mission clock controls generation: 5× demo, frozen during a simulation pause, frozen at mission end. A movement stop still consumes time and oxygen while demo heart/breathing values gradually settle.
- No clinical alarm thresholds are generated. Tank warnings still use entered endurance/reserve. All coefficients are demo assumptions, not scientific evidence of astronaut health. NASA references justify separate monitored quantities, not these generated values.

## Scientific basis

[NASA suit guidance](https://www.nasa.gov/reference/11-0-spacesuits-vol-2/) includes biomedical information and suit pressure, oxygen partial pressure and CO₂ monitoring (§11023, §11036). These are different measurements. The app provides separate fields; it does not infer one from another or claim compliance with a certified suit design.

| Display | Where its numbers come from |
|---|---|
| Heart rate, breathing, blood oxygen | Generated demo values, manual entries, or the explicitly enabled BIDMC reference recording |
| Suit pressure, suit O₂/CO₂, body temperature | Generated demo values or manual entries; no connected sensor |
| Tank endurance | Entered starting endurance minus elapsed mission minutes, including stops; bounded at zero |
| Alerts | Entered per-metric limits or the configured tank reserve; no universal medical thresholds |

The [BIDMC dataset](https://physionet.org/content/bidmc/1.0.0/) contains hospital patient recordings. Record 01 supplies ECG-derived heart rate, impedance-derived breathing rate and pulse-oximeter SpO₂ at one-second intervals. It is **not astronaut data**, an EVA exertion model, or a healthy reference range. Blood oxygen saturation is **not** oxygen remaining in the tank. No ECG waveform or diagnosis is shown. Generated demo trends are explicitly separate from the measured reference record.

## Timing and files

- Source index = `min(480, floor(missionTime − replayStart))`. The corresponding source timestamp is retained after playback ends.
- Earth receives the same captured report for the map and suit, after the configured communication delay. Graphs contain only delivered samples up to the selected report. Recorded values are not advanced to the present.
- Selecting replay is a shared test-data control, not a radio instruction. Its configuration persists in the selected shared database; observations still use the normal message delivery path.
- `src/lib/healthReplay.ts`: replay selection. `suitMetrics.ts`: received values/history. `crewOperations.ts`: tank calculation and capture. `SuitMonitor.tsx`: interface. `BodyHealthMap.tsx`: original illustrative body diagram and marker buttons. `SuitModel.tsx`: model rendering.
- Original data, source notices and hashes: `research-data/health/`. Rebuild the numeric extract with `node scripts/prepare_health_data.mjs`.

## Model and data permission

The body silhouette and organ highlights are original SVG code, drawn for this project. Reference screenshots were used for layout inspiration only. Dots identify a metric, not a verified sensor position; the graphic is not an anatomical model or medical scan. No third-party body artwork is bundled.

The astronaut is credited to **DigitalSpace Corporation**, supplied through [NASA 3D Resources](https://science.nasa.gov/3d-resources/astronaut/). NASA's [repository notice](https://github.com/nasa/NASA-3D-Resources/blob/master/README.md) states its assets are free and without copyright; [NASA usage guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/) applies. Credit and the original notice are included. No NASA endorsement is implied. This is an educational reference model, not a verified Mars suit or body scan.

`astronaut-original.glb` preserves the download. `scripts/prepare_suit_model.mjs` unpacks its Draco geometry into the bundled `public/assets/models/astronaut.glb`; textures are retained. The runtime needs no external model service or decoder. The focus ring is illustrative, not a measured sensor location. Reduced-motion preferences suppress its animation.

The BIDMC extract is made available under the [Open Data Commons Attribution License v1.0](https://opendatacommons.org/licenses/by/1-0/). Retain attribution, license and source notices when redistributing. The derived JSON changes format and represents missing values with null; it does not change measured values.

Cite: Pimentel M.A.F. et al., *Towards a Robust Estimation of Respiratory Rate from Pulse Oximeters*, IEEE TBME 64(8), 1914–1923, DOI [10.1109/TBME.2016.2613124](https://doi.org/10.1109/TBME.2016.2613124). Dataset DOI [10.13026/C2208R](https://doi.org/10.13026/C2208R). PhysioNet platform: Pollard T. et al. (2026), *PhysioNet as a global platform for biomedical research*, DOI [10.1038/s44360-026-00096-z](https://doi.org/10.1038/s44360-026-00096-z).

## Verification limits

Generated-demo tests check time, stopping/recovery, member isolation, manual restoration, shared reports and end freezing. Automated reference tests check every extracted sample against the raw CSV, timestamps, missing data, end-of-record behavior, crew isolation, oxygen separation, delayed disclosure, metric selection and shared SQLite updates. Model tests verify the NASA download hash, embedded assets and upright Three.js geometry. These are not clinical validation. Browser checks cover planning, the Start checklist, split/expanded views and health replay. WebGL is disabled in the test browser, so GPU appearance and performance remain unverified. A 2D body fallback keeps health readings accessible; tablet and microphone interaction still need device testing.

## Typeface
Rubik Variable is bundled from Fontsource; no external font request is needed. SIL Open Font License: `research-data/fonts/Rubik-OFL.txt`. Source: https://github.com/google/fonts/tree/main/ofl/rubik .
