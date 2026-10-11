---
"@typeonce/bevy-ts-math": minor
"@typeonce/bevy-ts-spatial": minor
"@typeonce/bevy-ts-navigation": minor
---

Add checked vector operations, directions and angles, pure 2D overlap and sweep queries, and explicit seeded random and weighted sampling. Add optional spatial hashing and multi-goal grid distance-field packages with bounded work and explicit rebuilds. Include a deterministic headless ECS example showing their schedule boundaries.

Replace arithmetic APIs that could brand non-finite outputs with Result-returning APIs. Scalar clamp rejects reversed bounds; interpolation, vector arithmetic, and AABB translation report overflow. No compatibility aliases are retained.

AABB and direction helpers use immutable canonical snapshots so copied metadata cannot bypass their invariants. Aabb.is now checks raw validity without narrowing to a constructed AABB; use result, option, or decode for reusable values.
