# 1.5.0 — map-first walking and real Jezero locations

- Replaced floating status/health overlays with an allocated side column. Recording uses that side column too. The map never sits behind an automatically opened health panel.
- Removed the redundant header pause control. Movement pause is distinct from the running mission and communication clock.
- Replaced the active planner's arbitrary point presets with four NASA-linked named sites and connected historical rover routes. Added a bundled georeferenced western HiRISE mosaic and a sharp delta inset; retained old data for older saved routes.
- Replaced blank temperature status in the active walking view with a verified archived NASA daily temperature range, with date and source.
- Reworked walking to advance on the shared clock, including when Earth is selected. Added explicit delayed-report countdown, reported distance/percentage progress and a separate Earth health/oxygen/stop panel. Shared plans appear immediately; private undelivered crew measurements remain hidden.
- Preserved investigation limits, stop logs, photo/note task completion, text/photo/audio recording, return routing, prior notes, typed messages and SQLite storage.
- Added mounted React workflow tests for movement, stopping, background progression, endpoint arrival and delayed Earth visibility. Existing checks, build and dependency-lock validation pass.

Limits: measured medical sensors are not connected; manual readings are labelled. Oxygen is simulated endurance. Archived temperature is not live weather. Historical rover tracks are not certified human traversability routes. Browser visual QA remains unavailable in this execution environment.
