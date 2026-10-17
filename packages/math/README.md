# `@typeonce/ritmo-math`

Math for ritmo games, in two kinds:

- **Validated values**: `Scalar`, `Vector2`, `Size2`, `Aabb`, and `InputAxis`. Every one exports constructors that validate untrusted input, so they work as `Descriptor.ConstructedComponent(...)` constructors and survive snapshot restore.
- **Hot-path helpers** on plain numbers, for code that runs every step: `Vec2` vector arithmetic (validated `Vector2` values pass straight in), `Box2` edge boxes, `Collide2` swept circle collision that slides along walls and never tunnels through them, a `SpatialGrid` broad phase that allocates nothing per step, a `FlowField` that leads bodies around walls, and a deterministic `Random` whose whole state is one integer (keep it in a resource, so runs replay).

```ts
import { Collide2, FlowField, Random, SpatialGrid, Vec2 } from "@typeonce/ritmo-math"

// Each step: chase the player around the walls, sliding along them.
paths.setWalls(walls, radius)
paths.setGoal(player)
const way = paths.way(enemy) ?? Vec2.normalizeOr(Vec2.subtract(player, enemy), Vec2.zero)
const moved = Collide2.moveCircle(enemy, Vec2.scale(way, speed * dt), radius, walls)
```

```sh
pnpm add @typeonce/ritmo-math @typeonce/ritmo
```

Released together with [`@typeonce/ritmo`](https://www.npmjs.com/package/@typeonce/ritmo), always with the same version.

Source: https://github.com/typeonce-dev/ritmo
