# Walk and control fixes — 1.3.1

- Replaced inherited dark-theme action controls with explicit light-background, dark-text buttons and a contrasting primary action. Darkened pale waypoint and warning labels.
- Start new valid walks in automatic route-following mode. Resuming an investigation explicitly returns to route following rather than restoring an idle manual mode.
- Separate stop/investigate, clock pause, destination arrival and return-route actions. Saving observations keeps the astronaut stationary; time and messages continue unless the simulation is paused.
- Destination arrival requires both proximity and negligible route distance remaining. At arrival, stop and offer investigation/return review rather than a nonfunctional Continue action.
- Advance intermediate waypoints in 2D and remove obsolete waypoint arrows at arrival.
- Freeze the initial spawn pose for each route session, avoid restarting the 2D loop on every clock tick, and remount only for a new route/session. Return-route changes reset navigation state correctly.
- Checkpoint moving position every second and report actual current position and motion state to Earth, including stationary investigations.
- Retain SQLite persistence, globe-first entry, existing imagery/coverage checks and observation attachments.

Validation: TypeScript, lint, automated tests (including 18 new walk lifecycle assertions), HTTP/database tests and production build pass. Full browser/WebGL and microphone/camera interactions are not verified here; the earlier browser launch was blocked by the environment. The existing large 3D bundle warning remains. This release does not claim ground-level photographic realism or flight-certified navigation.

Upgrade: stop the old server, extract this version, copy your old data folder into the new folder, then run npm start. Your personal SQLite database is not included in the download.
