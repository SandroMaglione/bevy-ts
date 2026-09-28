# `bevy-ts`

`bevy-ts` is a type-safe, game-loop-agnostic ECS runtime for TypeScript.

It keeps Bevy-style ECS concepts, but the public API is stricter and more explicit: closed schemas, declared system access, explicit schedule boundaries, typed services, and no user-facing casts for normal usage.

Documentation: https://sandromaglione.github.io/bevy-ts/

New to the library? Start with [CONCEPTS.md](./CONCEPTS.md) (the model in five
minutes), then [GAME_API.md](./GAME_API.md). Type architecture and storage are
documented in [ARCHITECTURE.md](./ARCHITECTURE.md).

```sh
pnpm add @typeonce/bevy-ts
```

| Package | Contents |
|---|---|
| `@typeonce/bevy-ts` | The ECS runtime |
| `@typeonce/bevy-ts-math` | Validated vectors, sizes, and bounding boxes |
| `@typeonce/bevy-ts-browser` | Fixed-step loop, keyboard actions, input capture |
| `@typeonce/bevy-ts-pixi` | Entity to Pixi node sync |
| `@typeonce/bevy-ts-devtools` | Headless debug sessions and trace reports ([README](./packages/devtools/README.md)) |

All packages are released together with the same version.

```ts
import { Descriptor, Schema } from "@typeonce/bevy-ts"

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
}, ({ queries, resources }) => {
  for (const match of queries.moving.each()) {
    const position = match.data.position.get()
    const velocity = match.data.velocity.get()
    match.data.position.set({ x: position.x + velocity.x * resources.deltaTime.get(), y: position.y + velocity.y * resources.deltaTime.get() })
  }
})

const runtime = Game.Runtime.make({
  services: Game.Runtime.services(),
  resources: { DeltaTime: 1 / 60 }
})
runtime.tick(Game.Schedule(Move))
```

Start with the docs homepage for the full step-by-step Pixi example:

- https://sandromaglione.github.io/bevy-ts/

## Runtime semantics

- Descriptor identity is `(kind, name)`. A bound schema rejects two descriptors of one kind with the same name at compile time, and a look-alike descriptor with a different value type is not accepted in place of the registered one.
- Structural changes are never applied implicitly. Queued commands and machine transitions stay pending, across schedule runs if needed, until a schedule reaches `applyDeferred()` or `applyStateTransitions(...)`.
- Reads are per system: `added(...)`/`changed(...)` filters, removed/despawned reads, events, transition events, and relation failures show each system what was published since its own previous run, exactly once.
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

