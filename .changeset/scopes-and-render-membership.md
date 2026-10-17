---
"@typeonce/ritmo": minor
"@typeonce/ritmo-render": patch
---

Two fixes:

- **Snapshots keep entity scopes.** `snapshot()` now saves scope membership (`scopes`: per scope name, its members' ids) and `restore()` rebuilds it, so `despawnScope` finds restored entities. The format moves to version 2. Version 1 snapshots had no scopes and are rejected with `UnsupportedVersion` instead of being restored with every scoped entity loose. Invalid membership (an id that is not a saved entity, or one in two scopes) fails with `InvalidScope`.
- **RenderSync follows membership.** A node now exists exactly while its entity has the renderable, the transform, and every required `select` slot. It is created whichever of them arrives last, and destroyed when any of them is removed (before, only the renderable's arrival and removal counted). The redundant despawn read is gone, because despawns are recorded as removals.
