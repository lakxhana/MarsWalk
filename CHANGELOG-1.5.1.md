# MARSWalk 1.5.1

- Restored default 3D astronaut-follow walking presentation within the minimal field interface; one centered movement control bar and an explicit 2D/3D view switch. Switching views preserves the mission state. Drag rotates the view.
- Kept health, temperature and timing in the sidebar. Observation recording uses that same sidebar.
- Expanded Earth tracking to the available main workspace. Progress, report timestamps, health, activity and messages are in its right sidebar, using delivered reports only.
- Exposed mission duration, observation-stop count and stop-time limit before starting. The planner totals observation, travel, return and reserve estimates; starting a route preserves the chosen duration.
- Added remaining/elapsed mission time, current stop timer, total stopped time, observation allowance and approaching-limit warnings. Stopping movement still consumes time and simulated oxygen.
- Named-site 3D ground is explicitly flat orbital imagery because its elevation mesh is unavailable. Older cropped routes retain measured elevation. No invented landscape or live weather is introduced.
- Typecheck, lint, mounted React interaction tests, delayed-data tests, SQLite/API tests and production build pass. GPU rendering, tablet visual layout and media permissions still require browser verification on the user's device.
