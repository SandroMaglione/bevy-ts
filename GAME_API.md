# Building a game with `bevy-ts`

The library now has a small, renderer-independent gameplay core. A game is a
closed schema, systems with declared capabilities, explicit schedules, and one
runtime. Browser timing and rendering stay outside the ECS.

## 1. Define the world

```ts
import { Descriptor, Fx, Result, Schema } from "@bevy-ts/core"

const Position = Descriptor.Component<{ x: number; y: number }>()("Game/Position")
const Velocity = Descriptor.Component<{ x: number; y: number }>()("Game/Velocity")
const Health = Descriptor.Component<number>()("Game/Health")
const DeltaTime = Descriptor.Resource<number>()("Game/DeltaTime")
const Damage = Descriptor.Event<{ target: number; amount: number }>()("Game/Damage")

const Game = Schema.bind(Schema.fragment({
  components: { Position, Velocity, Health },
  resources: { DeltaTime },
  events: { Damage }
}))
```

The bound `Game` value is the authoring boundary. Queries, systems, schedules,
entity scopes, inspectors, and runtimes made from a different root do not fit.

## 2. Write systems with exact capabilities

```ts
const Moving = Game.Query({
  selection: {
    position: Game.Query.write(Position),
    velocity: Game.Query.read(Velocity)
  }
})

const Move = Game.System(
  "Game/Move",
  {
    queries: { moving: Moving },
    resources: { dt: Game.System.readResource(DeltaTime) }
  },
  ({ queries, resources }) => {
    const dt = resources.dt.get()
    for (const { data } of queries.moving.each()) {
      const position = data.position.get()
      const velocity = data.velocity.get()
      data.position.set({
        x: position.x + velocity.x * dt,
        y: position.y + velocity.y * dt
      })
    }
  }
)
```

The callback cannot access undeclared world data. A write query exposes writable
cells; a read query does not. Values returned by `get()` are deeply readonly;
changes go through `set`, `update`, or a validated write helper.

## 3. Keep expected failures in the type

```ts
const SpendHealth = Game.System(
  "Game/SpendHealth",
  {
    queries: {
      target: Game.Query({
        selection: { health: Game.Query.write(Health) }
      })
    }
  },
  ({ queries }) => {
    const target = queries.target.single()
    if (!target.ok) {
      return Fx.fail("TargetMissing" as const)
    }

    const health = target.value.data.health.get()
    if (health <= 0) {
      return Fx.fail("AlreadyDead" as const)
    }

    target.value.data.health.set(health - 1)
  }
)

const gameplay = Game.Schedule(Move, SpendHealth)
const runtime = Game.Runtime.make({
  services: Game.Runtime.services(),
  resources: { DeltaTime: 1 / 60 }
})

const update = runtime.tick(gameplay)
if (!update.ok) {
  // update.error is the exact named-system failure union:
  // SystemFailure<"Game/SpendHealth", "TargetMissing" | "AlreadyDead">
  console.error(update.error.system, update.error.error)
}
```

Component, resource, event, queued-machine, and deferred-command writes
from the failing system are rolled back or discarded. Earlier successful
systems remain committed. External service effects, such as network or audio
calls, cannot be rolled back by the ECS.

Thrown exceptions remain defects and are rethrown after ECS writes from that
system are rolled back. `Fx.fail` is for expected game outcomes.

## 4. Own scene entities as a group

Marker components are useful gameplay data, but they should not be required
only to delete a level. Entity scopes model ownership directly.

```ts
const Level = Game.EntityScope("Game/Level")

const LoadLevel = Game.System("Game/LoadLevel", {}, ({ commands }) =>
  {
    commands.spawnIn(Level, Game.Command.spawn(
      Game.Command.entry(Position, { x: 10, y: 20 }),
      Game.Command.entry(Health, 3)
    ))
  }
)

const UnloadLevel = Game.System("Game/UnloadLevel", {}, ({ commands }) =>
  { commands.despawnScope(Level) }
)
```

Persistent entities can still use `commands.spawn(...)`. Scope cleanup uses the
normal deferred-command boundary, so removal readers and renderer cleanup
systems see the same despawns as any other entity removal.

## 5. Read the world without making a diagnostic system

Inspectors are reusable read-only projections for tests, saves, debugging, UI
bridges, and host code.

```ts
const WorldSummary = Game.Inspector(
  "Game/WorldSummary",
  {
    queries: {
      actors: Game.Query({
        selection: {
          position: Game.Query.read(Position),
          health: Game.Query.read(Health)
        }
      })
    }
  },
  ({ queries }) => queries.actors.each().map(({ entity, data }) => ({
    id: entity.id,
    position: data.position.get(),
    health: data.health.get()
  }))
)

const summary = runtime.inspect(WorldSummary)
```

An inspector cannot declare write queries, write resources, commands, event
writers, or state-transition writers. Runtime provisioning is checked at the
call. Like a system, an inspector's `added`/`changed` filters and event
reads report what was published since its previous evaluation.

## Save and load

```ts
localStorage.setItem("save", JSON.stringify(runtime.snapshot()))

const loaded = runtime.restore(JSON.parse(localStorage.getItem("save") ?? "null"))
if (!loaded.ok) {
  // loaded.error: InvalidSnapshot | UnknownComponent | InvalidComponent | ...
  console.error(loaded.error)
}
```

A snapshot is plain data keyed by descriptor, relation, and machine names.
`restore` takes `unknown`, validates it against the schema (every component
and resource value runs through its descriptor's constructor), and leaves the
world untouched on failure.

Both methods only exist when every component and resource is either
transient (never saved) or constructed with a validator that accepts
untrusted input: a `result(raw: unknown)`, or a `decode(raw: unknown)` next to
a typed `result` (every `@bevy-ts/math` module exports one). Otherwise calling
them fails to compile, and the error lists each descriptor to fix:

```ts
const Position = Descriptor.ConstructedComponent(Vector2)("Position")
const Stats = Descriptor.ConstructedComponent(Decode.struct({ level: Decode.integer, name: Decode.string }))("Stats")
const Target = Descriptor.ConstructedComponent(Decode.struct({ enemy: Decode.handle(Root, Health) }))("Target")
const Player = Descriptor.Tag("Player")
const Label = Descriptor.ConstructedComponent(Descriptor.fromStandardSchema(type("string")))("Label")
const Sprite = Descriptor.TransientComponent<{ frame: number }>()("Sprite") // rebuilt after load
```

Restored entities come back without transient components, and transient
resources keep their current values. Entity ids are kept, so stored handles still resolve. A restore reads
as despawns and spawns to change detection, so renderer sync rebuilds itself.

## Debug a run

A runtime made with `debug: true` carries a read-only `debug` handle:
`describe()` for schedules and declared access, `dump()` for the current
world, `observe(listener)` for a trace of every system run, applied command,
and transition, and `streams()` for event retention. Runtimes made without it
have no handle.

`@bevy-ts/devtools` wraps the handle in a session that runs schedules headless
and answers questions as text:

```ts
const runtime = Game.Runtime.make({ services, resources, debug: true })
const session = Session.make(runtime, { schedules: { setup, update }, invariants: [HealthNeverNegative] })

session.run("setup")
console.log(session.run("update", { frames: 300 }))  // stops at the first violated invariant
console.log(session.why(12, Health))                 // latest changes and the systems that made them
console.log(session.journal({ frames: [180, 185], entity: 12 }))
```

Keep the simulation schedules free of renderer services so they run in Node,
and feed input through `Keyboard.scripted(...)`. See
[`packages/devtools/README.md`](./packages/devtools/README.md).

## 6. Drive fixed updates from any renderer

`@bevy-ts/browser` supplies timing policy without owning the ECS or renderer.

```ts
import { FixedLoop } from "@bevy-ts/browser"

const source = FixedLoop.animationFrames(window)
const loop = FixedLoop.start({
  source,
  stepSeconds: 1 / 60,
  maxFrameSeconds: 0.1,
  maxStepsPerFrame: 5,
  update: (stepSeconds) => {
    // A capture system can copy this host value into DeltaTime first.
    hostClock.deltaSeconds = stepSeconds
    return runtime.tick(gameplay)
  },
  render: ({ alpha, droppedSeconds }) => {
    renderer.render({ alpha })
    if (droppedSeconds > 0) {
      metrics.recordDroppedTime(droppedSeconds)
    }
  },
  onFailure: (failure) => {
    if (failure.kind === "UpdateFailure") {
      showGameError(failure.error)
    }
  }
})

if (!loop.ok) {
  throw new Error(`Invalid timing option: ${loop.error.field}`)
}

// Later:
loop.value.stop()
```

Pixi, Three, Canvas, DOM, tests, and server simulations can provide another
`TickSource`. The gameplay schedules do not change.

Keyboard input is exposed the same way: bind named actions once, and let
`InputCapture` copy one snapshot per update into a resource that gameplay
systems read like any other world data.

```ts
import { InputCapture, Keyboard } from "@bevy-ts/browser"

const bindings = { left: ["ArrowLeft", "a"], right: ["ArrowRight", "d"], jump: [" ", "ArrowUp", "w"] } as const

const KeyboardInput = Descriptor.Service<Keyboard.Actions<typeof bindings>>()("Game/Keyboard")
const Input = Descriptor.TransientResource<Keyboard.Snapshot<typeof bindings>>()("Game/Input")

const CaptureInput = InputCapture.system(Game, { name: "Game/CaptureInput", source: KeyboardInput, resource: Input })

const Jump = Game.System("Game/Jump", { resources: { input: Game.System.readResource(Input) } }, ({ resources }) => {
  const input = resources.input.get()
  input.jump.pressed // true once per capture, even for taps shorter than a frame
  input.left.held
})

const keyboard = Keyboard.actions(window, bindings)
const runtime = Game.Runtime.make({
  services: Game.Runtime.services(Game.Runtime.service(KeyboardInput, keyboard)),
  resources: { Input: Keyboard.idle(bindings) }
})
const update = Game.Schedule(CaptureInput, Jump)

keyboard.dispose() // on teardown
```

The source can be any service with `snapshot()`, so a game that merges
keyboard, pointer, and gamepad input captures its own adapter the same way.
The resource's value type must match the snapshot type exactly.

## 7. Mirror entities into Pixi

`@bevy-ts/pixi` owns the node bookkeeping; what a node looks like stays yours.

```ts
import { NodeRegistry, RenderSync } from "@bevy-ts/pixi"

const RenderNodes = Descriptor.Service<NodeRegistry.NodeRegistry<Container>>()("Game/RenderNodes")

const render = RenderSync.system(Game, {
  name: "Game/Render",
  renderable: Renderable,
  transform: Position,
  registry: RenderNodes,
  create: ({ renderable }) => makeNode(renderable),
  apply: (node, { transform }) => node.position.set(transform.x, transform.y)
})

const runtime = Game.Runtime.make({
  services: Game.Runtime.services(
    Game.Runtime.service(RenderNodes, NodeRegistry.inContainer(actorLayer))
  )
})

const update = Game.Schedule(Gameplay, Game.Schedule.applyDeferred(), render)
```

The registry service is a normal requirement: ticking the render system on a
runtime that does not provide it is a compile error. `select`, `resources`,
and `services` pass extra read-only data to the callbacks, and `redrawOn`
lists components whose changes re-run `apply` (animation frames, tints,
interpolation).

## What remains adapter code

The core deliberately does not choose an asset loader, renderer, audio engine,
physics engine, networking stack, or save format. Those integrations should be
small packages built from services, systems, lifecycle readers, and inspectors.
The next renderer package should be based on at least two real games so its API
captures a repeated pattern instead of one demo's object model.
