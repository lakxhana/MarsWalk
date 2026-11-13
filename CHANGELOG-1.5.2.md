# MARSWalk 1.5.2

- First-person 3D camera; removed the avatar. Smooths positional updates and removes the former 30 fps cap. Actual GPU performance remains device dependent and unmeasured here.
- Live demo is the default for new/upgraded sessions: zero signal delay, one-second reports. Earth can choose five-minute delay; mode persists and old packets keep their original delivery schedule.
- Mission, astronaut, tank, stop and health setup moved to the planning sidebar.
- Earth Plan mission supports named routes, editable mission/reserve time, stop count, per-stop task descriptions and observation time estimates. Travel/return estimates use NASA recorded route distance with assumed walking speed; total adds task estimates and reserve.
- Route tasks are proposed evenly spaced fieldwork locations, not historical NASA activities. Crew sees distance/estimate/due status and can mark tasks complete; Earth receives that state with reports.
- Existing source coverage limitations remain: regional 3D ground is flat orbital imagery, no connected health sensors, and oxygen is simulated.
