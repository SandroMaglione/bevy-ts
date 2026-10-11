# `@typeonce/bevy-ts-math`

Validated, renderer-independent math for games: `Scalar`, `Vector2`, `Direction2`, `Angle`, `Size2`, `Aabb`, `InputAxis`, `Geometry2`, `Random`, and `Weighted`.

`Scalar.Positive` refines `NonNegative`, which refines `Finite`. `Fraction` is closed [0,1]; random draws are [0,1). Arithmetic that can overflow returns `Result`. Directions reject zero length; normalization handles subnormal numbers and large finite coordinates.

```sh
pnpm add @typeonce/bevy-ts-math @typeonce/bevy-ts
```

```ts
import { Geometry2, Random, Vector2, Weighted } from "@typeonce/bevy-ts-math"

const circle = Geometry2.Circle.result({ center: { x: 0, y: 0 }, radius: 0.2 })
const target = Geometry2.Circle.result({ center: { x: 4, y: 0 }, radius: 0.5 })
const delta = Vector2.result({ x: 8, y: 0 })
if (circle.ok && target.ok && delta.ok) {
  const sweep = Geometry2.sweepCircleCircle(circle.value, delta.value, target.value)
  if (sweep.ok && sweep.value.tag === "Geometry2/Contact") {
    console.log(sweep.value.time, sweep.value.normal)
  }
}

const initial = Random.result(42)
const choices = Weighted.result([
  { value: "small", weight: 3 },
  { value: "large", weight: 1 }
])
if (initial.ok && choices.ok) {
  const draw = Random.weighted(initial.value, choices.value)
  // Store draw.state explicitly for the next draw or for replay.
  console.log(draw.value, draw.state)
}
```

Geometry touching is inclusive. Sweeps distinguish misses, initial overlap, and later contact over a closed displacement interval [0,1]. They return the first impact and a normal, without moving a body or choosing a response. Circle/AABB sweeps include rounded corners. `circleBounds` and `sweptCircleBounds` provide conservative AABBs for broad-phase queries; unrepresentable bounds fail explicitly. Query intermediates outside the representable range return `NumericRange`; a point contact without a normal returns `UndefinedNormal`.

`Random` uses the versioned `mulberry32-v1` sequence with serializable unsigned 32-bit state. Integer ranges are half-open and use rejection sampling; floating ranges have documented endpoint rounding. `pick`, `shuffle`, and `weighted` neither mutate a caller's array nor read an ambient random source. Weight tables snapshot non-negative finite weights, ignore zero weights, and reject a zero or overflowing total. Generic selected values are retained by reference.

`Aabb` and `Direction2` operations use canonical snapshots. Spreading a value preserves its snapshot; overriding copied metadata does not transform it. Use constructors or `Aabb.translate` to make a changed shape. JSON saves their plain fields and `decode` reconstructs the snapshot.

Breaking changes in 0.5: `Scalar.clamp/lerp`, `Vector2.add/subtract/scale/length/lengthSquared`, and `Aabb.translate` return `Result`; `inverseLerp/remap` also report arithmetic overflow. Narrow `ok` before using the value. `Aabb.is` now returns a boolean without narrowing raw input to an AABB; use `result`, `option`, or `decode` to obtain the constructed value. No compatibility aliases remain.

See [the headless ECS example](../../examples/algorithms/), [API documentation](https://sandromaglione.github.io/bevy-ts/), and [source](https://github.com/SandroMaglione/bevy-ts). All packages release together with the same version.

Weight tables retain an opaque in-memory sampling snapshot. Persist the source choices and weights and reconstruct with `Weighted.result` after loading. `Random.decode` restores the explicit serializable random state.
