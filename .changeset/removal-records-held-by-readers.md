---
"@typeonce/bevy-ts": minor
---

Removed-component and despawned-entity records are now kept until every system that reads them has run, like events. A render schedule ticked once after several fixed updates sees every despawn instead of only those from the last two `tick(...)` calls, so renderer mirrors such as `RenderSync` no longer leak nodes when the simulation catches up. A system skipped by its run conditions keeps its position and sees the removals when it runs again, matching `added`/`changed`. Each log is capped at `Runtime.streamCapacity` entries; the debug trace reports a `missed` read only when entries were dropped at that cap.
