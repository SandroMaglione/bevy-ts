---
"@typeonce/bevy-ts": minor
---

Add `Game.Schedule.when(conditions, ...entries)` (and `Schedule.when`): a schedule whose systems run only while every condition passes, in addition to their own `when`. It gates a whole group, nested schedules included, so a game-wide mode (playing, paused, hit-stop) no longer has to be repeated on each system. Marker steps in the group still run. The machines the conditions read become requirements of the schedule, so a runtime without them is rejected at compile time. A gated system shares change detection and event cursors with the original (`SystemDefinition.base`), so it is still one reader.
