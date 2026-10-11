---
"@typeonce/bevy-ts-math": minor
---

Add hot-path game helpers, lifted from a shipped top-down game: `Vec2` plain vector arithmetic (accepts validated `Vector2` values), `Box2` edge boxes, `Collide2` swept circle collision with sliding (no tunneling through thin walls, rounded corners), a `SpatialGrid` broad phase that allocates nothing per step, a `FlowField` that leads bodies around walls with clearance, and a deterministic `Random` whose whole state is one integer.
