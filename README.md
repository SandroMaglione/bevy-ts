# `bevy-ts`

`bevy-ts` is a type-safe, game-loop-agnostic ECS runtime for TypeScript.

It keeps Bevy-style ECS concepts, but the public API is stricter and more explicit: closed schemas, declared system access, explicit schedule boundaries, typed services, and no user-facing casts for normal usage.

Documentation: https://sandromaglione.github.io/bevy-ts/

```ts
import { App, Descriptor, Fx, Schema } from "bevy-ts"

// Define the ECS world shape once.
const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.defineComponent<{ x: number; y: number }>()("Velocity")
const DeltaTime = Descriptor.defineResource<number>()("DeltaTime")

// Build a closed schema, then bind the runtime-facing API surface.
const Game = Schema.bind(Schema.build(Schema.fragment({ components: { Position, Velocity }, resources: { DeltaTime } })))

// Systems only receive the access they declare here.
const Move = Game.System.define("Move", {
  queries: { moving: Game.Query.define({ selection: { position: Game.Query.write(Position), velocity: Game.Query.read(Velocity) } }) },
  resources: { deltaTime: Game.System.readResource(DeltaTime) }
}, ({ queries, resources }) => Fx.sync(() => {
  for (const match of queries.moving.each()) {
    const position = match.data.position.get()
    const velocity = match.data.velocity.get()
    match.data.position.set({ x: position.x + velocity.x * resources.deltaTime.get(), y: position.y + velocity.y * resources.deltaTime.get() })
  }
}))

const app = App.makeApp(Game.Runtime.make({ resources: { DeltaTime: 1 / 60 } }))
app.update(Game.Schedule.define(Move))
```

Start with the docs homepage for the full step-by-step Pixi example:

- https://sandromaglione.github.io/bevy-ts/
