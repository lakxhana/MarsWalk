# MARSWalk 1.4.0

Implemented investigation timers, per-stop limits, warning states, persisted stop histories, previous-walk summaries, and delayed Earth reporting of captured duration. Timer is visible both on the walking screen and inside the observation panel. Saving/reopening notes does not restart it.

Added crew name/tank configuration, a labelled constant-endurance O₂ scenario and local reserve/return-margin alerts. Health panel records manual heart rate, body temperature, suit pressure, O₂/CO₂ partial pressures and outside air temperature, with optional configured limits and stale-data states. There is no sensor connection or medical threshold preset.

Created destination-specific photo/note tasks automatically and linked their completion to saved evidence at the endpoint. Added NASA-backed Skinner Ridge and Wildcat Ridge study profiles. These profiles do not imply verified outcrop coordinates within the current map crop. Existing notes and attachments remain accessible.

Fixed the dark Sources row hover state and strengthened control contrast. Expanded cards scroll on small screens and health details stay collapsed.

Removed unverified legacy MEDA numeric readings from rendered outputs. A temperature forecast requires the user's intended equation and valid inputs; it was not available in the supplied code. The app shows unavailable/manual temperature honestly rather than fabricating a live feed.

Validation: TypeScript, ESLint, production build, automated timing/lifecycle/delayed-message/render tests, SQLite and running HTTP API tests. Chromium launch was blocked by the environment; interactive browser and hardware-media tests remain device checks.
