# MARSWalk 1.5.3 — walking view only

Restores the original grey sky and ambient/tone-mapped lighting in the first-person renderer. Replaces flat regional ground with real USGS HiRISE mosaic elevations, registered to the existing orbital imagery. The camera and narrower route guide follow that surface. Increases anisotropic texture filtering to the device-supported limit (up to 16).

No generated concept image is included in the renderer. No other workflow, tasks, timer, Earth monitoring or sidebar changes. Package/header version and these source notes identify the fix.

New elevation crop: 385×257 resampled cells; zero missing cells in the bundled footprint. Original 1 m DTM is resampled for browser rendering; this does not create close-up rock detail. Source URL, bounds, datum and sampling notes are embedded in src/lib/jezeroWestElevation.json. Missing terrain is not invented.
