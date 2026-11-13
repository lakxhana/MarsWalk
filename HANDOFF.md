> Historical notes from the supplied project. For this release, see README.md and UPDATE-NOTES.md.

# MARSWalk Project Handoff Documentation

## 1. Product Purpose & Overview
MARSWalk is an interactive exploration planner and fieldwork coordinator for Jezero Crater, Mars. It enables a simulated Mars explorer to conduct geological traversals, record multiple scientific observations at authentic NASA Perseverance sites, and coordinate with a remote Earth-based Science Team across simulated communication delays (5 or 10 minutes each way).

All NASA mission evidence (Mastcam-Z mosaics, WATSON micro-images, PDS MEDA atmospheric data, HiRISE stereo DTMs), user observations, and modelled simulation assumptions are explicitly distinguished.

---

## 2. Completed Work

### 1. Archival NASA Site Evidence & Spatial Boundaries
- **Source-linked archival evidence**: Skinner Ridge (`skinner-ridge`) and Wildcat Ridge (`wildcat-ridge`) retain NASA-linked site descriptions and archival photographs.
- **No unsupported map coordinates**: These catalogue records are not navigation waypoints. Their previous rover and local staging coordinates have been removed from the station catalogue; new notes do not inherit a fictional map position.
- **Catalogue-Only Petrological Study**: Abrasion Comparison (`abrasion-comparison`) is a comparative study of two WATSON micro-images taken across two separate Sols (Sols 482 & 504); it is explicitly catalogued without an arbitrary physical map coordinate (`locationStatus: 'catalog_only'`).
- **Visible provenance limits**: The notebook labels site entries as archival associations without mapped coordinates and distinguishes local simulated positions from Mars geographic coordinates.

### 2. Observation Records & Structured Persistence
- **Multiple Observations per Site**: Explorers can log multiple observations per site with stable unique IDs, timestamps, image references, notes, and questions.
- **Audit History**: Editing an observation retains earlier versions in `editHistory` with timestamps and previous text preserved.
- **IndexedDB Storage**: Implemented `src/lib/storage.ts` storing `observations`, `messages`, and `tasks` in browser IndexedDB.
- **Safe Legacy Migration**: `migrateLegacyNotebook()` imports existing `localStorage` keys (`marswalk_field_notebook_v1`) into IndexedDB without deleting original records.

### 3. Delayed Communication Demonstration
- **Role Switcher**: Switch between **Explorer View** and **Science Team Ground Support Console**.
- **State Machine**: Message lifecycle transitions through `in_transit` (uplink) -> `delivered` (to Earth) -> `in_transit` (downlink) -> `replied` (delivered to astronaut).
- **Configurable Propagation Delay**: Default 5.0 minutes one-way delay with simulated mission clock (LMST). Includes an instant step control (`+5m`) for accelerated testing.
- **Plan Discrepancy Detection**: If the user modifies traverse targets or parameters while a question is in transit, the system detects `currentPlanVersion !== originalPlanVersion` and displays a visible alert ("Plan changed since request"), preventing auto-application of stale advice.

### 4. Task Management
- **Task Blocked on Advice**: Questions sent to Science Team mark the active task as `blocked_on_advice`.
- **Independent Task Fallback**: While waiting for Earth's response, explorers are offered independent tasks (Tau optical depth survey, pebble grain-size quadrant count, thermal baseline).
- **Modelled Estimates**: Time budgets and pacing are clearly labelled as modelled estimates based on editable assumptions (1.1 m/s nominal speed, 15° slope limit).

### 5. Data Portability & Honesty
- **Validated JSON Export / Import**: Full export to `marswalk_data_v1` JSON. Import validates schemas and surfaces explicit error alerts if payloads are malformed.
- **Atmospheric Data Honesty**: MEDA readings for Sols 12, 492, and 518 are cited to the NASA PDS Atmospheres Node as historical point measurements, not ambient weather predictions.
- **Research Prototype Disclaimer**: Distinct header badge: *"Research Prototype · Not NASA Certified"*.

### 6. Shared Mission Clock & Return Planning
- **One Simulation Clock**: Walk movement, mission elapsed time, stop/observation time, and uplink/downlink delivery all use the same LMST simulation clock. Stopping movement does not stop time; “Pause simulation” freezes movement and message delivery. Manual demo time jumps are disabled during an active mission so they cannot fast-forward communications while leaving the walker stationary. No accelerated mode is enabled.
- **Paused Restore**: The mission clock, route, base, plan version, walk pose, budget, reserve, and communication-delay setting persist in localStorage. Reload restores the session paused and does not accrue time while closed.
- **Compact Time Status**: Walk reports remaining budget, direct return estimate, protected reserve, and available stop time. A terrain route that cannot be computed yields “Return time unavailable” and no stop-time allowance.
- **Live Itinerary**: Throttled terrain route estimates update after meaningful movement or plan changes. The single-stop itinerary includes remaining travel, remaining planned observation duration, return travel, and reserve. Return routes are recalculated unless the EVA route endpoints and assumptions still match.
- **Advice Timing**: Questions record the earliest possible round-trip reply time assuming immediate Earth review and link availability. Tasks are blocked only when they explicitly require Earth advice. The 5/10-minute delay selector is in More.
- **Timing Test**: `scripts/test_mission_timing.ts` covers the controlled 60-minute / 12-minute elapsed / 21-minute return / 10-minute reserve scenario and the 10-minute one-way reply-window case.

---

## 3. Changed Files

| File | Changes Made |
|---|---|
| `src/lib/storage.ts` | Complete IndexedDB persistence layer, types, CRUD, legacy migration, and validated JSON export/import. |
| `src/lib/scienceStations.ts` | NASA-linked archival site/photo associations; no rover or demo staging coordinates; catalogue-only status. |
| `src/lib/commManager.ts` | Simulated mission clock (LMST), delay propagation math, message state transitions, and plan discrepancy checking. |
| `src/components/FieldNotebookView.tsx` | Multiple observations per site, note editing with audit history, communication log, task manager, and JSON export/import UI. |
| `src/components/FieldNotebookModal.tsx` | Avoids offering navigation to archival sites that are not positioned in the local map. |
| `src/components/ScienceTeamConsole.tsx` | Ground support role view with inbound transmissions, plan discrepancy alerts, scientific guidance templates, and downlink transmission. |
| `src/components/Header.tsx` | Explorer vs Science Team role switcher, sim clock & delay indicator, and research prototype badge. |
| `src/components/MarsPlan.tsx` | Default 2D fieldwork start, plan versioning hooks, and cleaned up unused variable warnings. |
| `src/App.tsx` | Shared clock ticker, paused mission restore/persistence, delay configuration, message update loop, and IndexedDB bootstrap. |
| `src/components/MarsSurface.tsx` | Shared-clock movement gating, return/itinerary estimates, budget status, and reply timing warnings. |
| `src/lib/missionTiming.ts` | Pure mission-budget, itinerary, reply-window, communication-stage, and clock helpers. |
| `src/lib/routePlanner.ts` | Route summary includes the maximum allowed incline assumption. |
| `scripts/test_mission_timing.ts` | Controlled-clock timing and reply-window scenario checks. |
| `metadata.json` & `index.html` | Aligned app descriptions, OG metadata, and title. |
| `scripts/test_marswalk_workflow.ts` | Automated test suite verifying 25 workflow and data integrity assertions. |

---

## 4. Verification Commands

```bash
# Compile and build applet
npm run build

# Run TypeScript linter
npm run lint

# Run workflow & data integrity test suite (25/25 tests passing)
npx tsx scripts/test_marswalk_workflow.ts

# Controlled-clock scenario checks (compile to a temporary CommonJS directory, then run)
npx tsc scripts/test_mission_timing.ts src/lib/missionTiming.ts --target ES2020 --module commonjs --moduleResolution node --outDir /tmp/marswalk-mission-timing --skipLibCheck --strict
node /tmp/marswalk-mission-timing/scripts/test_mission_timing.js

# Run terrain hazard verification suite (10/10 tests passing)
npx tsx scripts/verify_terrain_hazards.ts
```

---

## 5. Known Constraints & Notes
1. **Network Imagery**: HiRISE orbital basemaps and NASA photographic assets require network access on first load; metadata, notes, and communication logs persist completely offline in IndexedDB.
2. **Terrain Representation**: The 2D walk map is primary and uses the bundled HiRISE orbital image with the measured DTM (`DTEEC_048842_1985_048908_1985_U01`) for local terrain analysis. The optional 3D view is an orbital-data reconstruction, not a ground-level photograph. The displayed crop boundary is mapped-data coverage, not a crater rim.
3. **Coverage limits**: Internal image no-data gaps are inferred from exact-zero pixels grouped in the bundled JPEG; lossy compression may hide source nulls. The crop projection and DTM metadata were checked against their product labels, but independent landmark alignment and a complete visual gap-mask audit remain outstanding.
4. **Performance limits**: A comparable post-change frame-time sample could not be collected because the integrated browser did not run animation-frame callbacks. Do not claim a measured performance improvement; CPU/GPU attribution remains unverified.
3. **No Certification Claim**: The application is an educational prototype and does not claim NASA operational certification.

---

## 7. Known Mission-Time Model Limits
1. Walking speed is a fixed nominal 1.1 m/s by default; slope limit comes from the current route assumptions. Estimates are modelled values, not safety guarantees.
2. Communication delay is configurable to 5 or 10 simulated minutes each way. Transmission size, link outages, and Earth review time are not modelled.
3. Only the existing single-stop mission is estimated. Optional-stop management and multi-stop itinerary scheduling are not implemented.
4. An observation save consumes actual mission time through the shared clock, but does not automatically complete a science task.

## 8. Next Bounded Task
Implement offline image blob caching in IndexedDB (`blobs` object store) via Service Worker or `fetch()` cache so that once archival photos and HiRISE tiles are viewed once, they remain accessible in disconnected field simulations.
