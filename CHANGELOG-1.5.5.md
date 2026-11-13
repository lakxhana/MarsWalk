# MARSWalk 1.5.5

- Removed the Walk navigation tab. A new mission starts only from valid plan submission. An existing mission has a Return to active walk action; opening a view cannot start a walk from an old saved route.
- Replaced nested planning panels with independently expandable crew, tasks, time/oxygen and optional health sections in the same sidebar. Closing crew no longer hides tasks or health. Health uses a separate form and cannot accidentally submit the mission.
- Added required-field and range checks, task-name/time checks, mission-budget validation, and model oxygen-endurance validation. Invalid fields expand their containing section on submission.
- Preserved editable defaults and added an explicit calculated time/endurance suggestion. Nothing is silently presented as an AI-generated scientific recommendation.
- Added cited NASA BVAD Rev2 typical EVA metabolic oxygen baseline (86 g/person/hour), editable additional loss rate and mass-demand estimates. Distinguishes route reserves, full-budget requirement and model supply. Does not infer actual tank pressure, capacity, or medical safety.
- Existing renderer, imagery and communication modes retained. No user database included.
