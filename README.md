# `bevy-ts`

`bevy-ts` is a type-safe, game-loop-agnostic ECS runtime for TypeScript.

It keeps Bevy-style ECS concepts, but the public API is stricter and more explicit: closed schemas, declared system access, explicit schedule boundaries, typed services, and no user-facing casts for normal usage.

Documentation: https://sandromaglione.github.io/bevy-ts/

The carried-type design is documented in [ARCHITECTURE.md](./ARCHITECTURE.md).

```ts
import { App, Descriptor, Fx, Schema } from "@bevy-ts/core"

// Define the ECS world shape once.
const Position = Descriptor.Component<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.Component<{ x: number; y: number }>()("Velocity")
const DeltaTime = Descriptor.Resource<number>()("DeltaTime")

// Compose one or more fragments and bind the runtime-facing API surface.
const Game = Schema.bind(Schema.fragment({ components: { Position, Velocity }, resources: { DeltaTime } }))

// Systems only receive the access they declare here.
const Move = Game.System("Move", {
  queries: { moving: Game.Query({ selection: { position: Game.Query.write(Position), velocity: Game.Query.read(Velocity) } }) },
  resources: { deltaTime: Game.System.readResource(DeltaTime) }
}, ({ queries, resources }) => Fx.sync(() => {
  for (const match of queries.moving.each()) {
    const position = match.data.position.get()
    const velocity = match.data.velocity.get()
    match.data.position.set({ x: position.x + velocity.x * resources.deltaTime.get(), y: position.y + velocity.y * resources.deltaTime.get() })
  }
}))

const app = App.makeApp(Game.Runtime.make({ services: Game.Runtime.services(), resources: { DeltaTime: 1 / 60 } }))
app.update(Game.Schedule(Move))
```

Start with the docs homepage for the full step-by-step Pixi example:

- https://sandromaglione.github.io/bevy-ts/

## Runtime semantics

- Descriptor identity is `(kind, name)`. A bound schema rejects two descriptors of one kind with the same name at compile time, and a look-alike descriptor with a different value type is not accepted in place of the registered one.
- Nothing becomes visible implicitly. Queued commands, events, lifecycle records, and relation failures stay pending, across schedule runs if needed, until a schedule reaches `applyDeferred()`, `updateEvents()`, `updateLifecycle()`, `updateRelationFailures()`, or `applyStateTransitions(...)`.
- Query results come back in spawn order.

## Performance

Queries only visit entities that carry their rarest required component, cache their match set until a component or relation they depend on changes membership, and reuse match objects between runs. See [ARCHITECTURE.md](./ARCHITECTURE.md#storage).

The benchmark suite in [`packages/core/bench`](./packages/core/bench) covers spawn/despawn, query iteration, change detection, structural churn, schedule overhead, lookups, events, relations, and type-checker cost:

```sh
pnpm bench          # run and print
pnpm bench:check    # compare with packages/core/bench/baseline.json (exit 1 on regression)
pnpm bench:update   # record a new baseline
```

CI measures every pull request against its base commit on the same runner and fails on runtime regressions over 35%, or type-checker growth over 5%.

