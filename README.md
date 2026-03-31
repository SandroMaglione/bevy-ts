# `bevy-ts`

A type-safe, game-loop-agnostic ECS runtime for TypeScript.

It keeps Bevy-style ECS concepts, but the public API is shaped more like Effect: explicit schemas, explicit system access, deferred mutation, and typed service dependencies. The runtime is still early, but the type model is already the main design surface.

## Quick start

Define descriptors first:

```ts
import { Descriptor } from "./src/index.ts"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.defineComponent<{ x: number; y: number }>()("Velocity")
const Time = Descriptor.defineResource<number>()("Time")
const Logger = Descriptor.defineService<{ readonly log: (message: string) => void }>()("Logger")
```

Build one closed schema and bind it once:

```ts
import { Schema } from "./src/index.ts"

const movement = Schema.fragment({
  components: { Position, Velocity },
  resources: { Time }
})

const schema = Schema.build(movement)
// `Game` is the only authoring surface for runtime-connected code.
const Game = Schema.bind(schema)
```

Define one system against that bound root:

```ts
import { Fx } from "./src/index.ts"

const MoveSystem = Game.System.define(
  "MoveSystem",
  {
    queries: {
      moving: Game.Query.define({
        selection: {
          position: Game.Query.write(Position),
          velocity: Game.Query.read(Velocity)
        }
      })
    },
    resources: {
      time: Game.System.readResource(Time)
    },
    services: {
      logger: Game.System.service(Logger)
    }
  },
  ({ queries, resources, services }) =>
    Fx.sync(() => {
      // Systems only see the access they declared in the spec above.
      const dt = resources.time.get()
      for (const match of queries.moving.each()) {
        const position = match.data.position.get()
        const velocity = match.data.velocity.get()

        match.data.position.set({
          x: position.x + velocity.x * dt,
          y: position.y + velocity.y * dt
        })
      }

      services.logger.log("movement step completed")
    })
)
```

Run that system through a schedule and a runtime:

```ts
import { App } from "./src/index.ts"

const update = Game.Schedule.define({
  systems: [MoveSystem]
})

const runtime = Game.Runtime.make({
  services: Game.Runtime.services(
    // Services are provided through their descriptors so runtime lookup
    // uses the same identity the system declared.
    Game.Runtime.service(Logger, {
      log(message) {
        console.log(message)
      }
    })
  ),
  resources: {
    // Resources are initialized by schema key from the closed schema.
    Time: 1 / 60
  }
})

const app = App.makeApp(runtime)
// This only type-checks if the runtime satisfies everything `update` requires.
app.update(update)
```

## Core flow

The normal flow is simple: define descriptors, group them into schema fragments, build one final schema, define systems against that schema, group systems into schedules, then run those schedules from your own loop. Rendering, input, physics, and timing stay outside the runtime unless you explicitly model them as resources or services.

Systems only see what they declare. Queries describe read and write access up front. Resources, events, states, and services are exposed as typed views. Mutation goes through deferred commands instead of direct world writes.

When choosing between the main ECS surfaces, the intended split is:

- resources for continuous world values such as delta time, counters, or animation clocks
- state machines for discrete phases where the transition boundary itself matters
- events for transient cross-system messages
- lifecycle reads for structural world changes that become visible only after `updateLifecycle()`

## Runtime requirements

Schedules now carry the runtime requirements implied by their systems. A runtime records which services it provides and which resources and states it initialized. You can only run a schedule when those two sides match.

```ts
const TickSystem = Game.System.define(
  "TickSystem",
  {
    resources: {
      time: Game.System.readResource(Time)
    },
    states: {
      phase: Game.System.readState(Phase)
    },
    services: {
      logger: Game.System.service(Logger)
    }
  },
  ({ resources, states, services }) =>
    Fx.sync(() => {
      services.logger.log(`${states.phase.get()}: ${resources.time.get()}`)
    })
)

const tick = Game.Schedule.define({ systems: [TickSystem] })

const runtime = Game.Runtime.make({
  services: Game.Runtime.services(
    // Services use their descriptors.
    Game.Runtime.service(Logger, {
      log(message) {
        console.log(message)
      }
    })
  ),
  resources: {
    // Resources use schema keys.
    Time: 1 / 60
  },
  states: {
    // States also use schema keys.
    Phase: "Running"
  }
})

App.makeApp(runtime).update(tick)
```

If one of those inputs is missing, the schedule should fail in typecheck before it can fail at runtime.

Services are provisioned through descriptors so runtime lookup follows the same
identity the system spec declared. Resources and states stay keyed by schema
property names because they come from the closed schema registry.

## Spawning entities

Use `Game.Command.spawnWith(...)` as the default way to create typed drafts without nested insert chains:

```ts
import { Fx } from "./src/index.ts"

const SpawnProjectileSystem = Game.System.define(
  "SpawnProjectileSystem",
  {
    services: {
      logger: Game.System.service(Logger)
    }
  },
  ({ commands, services }) =>
    Fx.sync(() => {
      const projectile = Game.Command.spawnWith(
        [Position, { x: 0, y: 0 }],
        [Velocity, { x: 4, y: 0 }]
      )

      // Commands are deferred. The world changes after the schedule reaches
      // its apply phase, not immediately in this callback.
      commands.spawn(projectile)
      services.logger.log("queued projectile spawn")
    })
)
```

`Game.Command.spawn()` and single-step `Game.Command.insert(...)` still exist, but `spawnWith(...)` is the intended authoring path.

## Ordering systems

Direct system references are the default ordering mechanism. Reusable sets stay explicit and typed.

```ts
import { Label } from "./src/index.ts"

const MovementSet = Label.defineSystemSetLabel("Movement")

const InputSystem = Game.System.define("Input", {
  inSets: [MovementSet]
}, ({}) => Fx.sync(() => {}))

const MoveSystem = Game.System.define("Move", {
  inSets: [MovementSet],
  after: [InputSystem]
}, ({}) => Fx.sync(() => {}))

const update = Game.Schedule.define({
  systems: [InputSystem, MoveSystem],
  sets: [
    Game.Schedule.configureSet({
      label: MovementSet,
      chain: true
    })
  ]
})
```

No runtime-relevant references are open strings. Systems are referenced directly. Reusable sets use typed labels. Schedules only need labels when some other API must refer to them externally.

## State machines

Finite state machines are a dedicated API, separate from generic `states`. They follow the useful part of Bevy's `States` model, but keep the transition boundary explicit in user schedules: systems queue the next state, the current state stays stable until an explicit transition marker runs, and enter/exit/transition handlers are attached locally to that marker.

Use machines when the discrete state itself is meaningful and should change only at an explicit boundary. Continuous progression such as timers, cooldown values, or animation elapsed time should still stay in resources.

### Define machines

Define machines from the bound schema root:

```ts
const AppState = Game.StateMachine.define(
  "AppState",
  ["Menu", "Playing", "Paused"] as const
)

const ModalState = Game.StateMachine.define(
  "ModalState",
  ["None", "Inventory", "Map"] as const
)
```

### Read and queue state

Read the current state, queue the next one, and gate systems with typed conditions:

```ts
const PauseInputSystem = Game.System.define(
  "PauseInput",
  {
    nextMachines: {
      app: Game.System.nextState(AppState)
    }
  },
  ({ nextMachines }) =>
    Fx.sync(() => {
      nextMachines.app.set("Paused")
    })
)

const GameplaySystem = Game.System.define(
  "Gameplay",
  {
    when: [
      Game.Condition.and(
        Game.Condition.inState(AppState, "Playing"),
        Game.Condition.inState(ModalState, "None")
      )
    ]
  },
  () => Fx.sync(() => {
    // Runs only while the committed state is "Playing".
  })
)
```

### Apply transitions explicitly

Bundle transition handlers explicitly and attach them to the transition marker:

```ts
const appTransitions = Game.Schedule.transitions(
  Game.Schedule.onExit(AppState, "Playing", {
    systems: [StopGameplayAudioSystem]
  }),
  Game.Schedule.onTransition(AppState, { from: "Playing", to: "Paused" }, {
    systems: [PersistCheckpointSystem]
  }),
  Game.Schedule.onEnter(AppState, "Paused", {
    systems: [ShowPauseOverlaySystem]
  })
)

const update = Game.Schedule.define({
  systems: [PauseInputSystem, GameplaySystem],
  steps: [
    PauseInputSystem,
    // Pending state only becomes committed at this exact marker.
    Game.Schedule.applyStateTransitions(appTransitions),
    GameplaySystem
  ]
})
```

This means a queued `set("Paused")` is invisible before `applyStateTransitions()`, and visible after it. That makes same-schedule behavior predictable.

The three main explicit schedule boundaries are:

- `applyStateTransitions()` for queued machine state
- `updateEvents()` for emitted events
- `updateLifecycle()` for added / changed / removed / despawned visibility

Transition schedules are pure values. They only run when bundled into the exact marker that should execute them:

```ts
const OnEnterPaused = Game.System.define(
  "OnEnterPaused",
  {
    transitions: {
      app: Game.System.transition(AppState)
    }
  },
  ({ transitions }) =>
    Fx.sync(() => {
      const { from, to } = transitions.app.get()
      console.log(`entered ${to} from ${from}`)
    })
)

const pauseTransitions = Game.Schedule.transitions(
  Game.Schedule.onExit(AppState, "Playing", {
    systems: [StopGameplayAudioSystem]
  }),
  Game.Schedule.onTransition(AppState, { from: "Playing", to: "Paused" }, {
    systems: [PersistCheckpointSystem]
  }),
  Game.Schedule.onEnter(AppState, "Paused", {
    systems: [OnEnterPaused]
  })
)
```

The current order is:

1. `onExit(previous)`
2. `onTransition({ from, to })`
3. commit the new current state
4. `onEnter(current)`

### React later through transition events

If code outside the transition bundle needs to react later, read the machine's committed transition events after `updateEvents()`:

```ts
const ObserveTransitions = Game.System.define(
  "ObserveTransitions",
  {
    transitionEvents: {
      app: Game.System.readTransitionEvent(AppState)
    }
  },
  ({ transitionEvents }) =>
    Fx.sync(() => {
      for (const event of transitionEvents.app.all()) {
        console.log(`${event.from} -> ${event.to}`)
      }
    })
)

const update = Game.Schedule.define({
  systems: [PauseInputSystem, ObserveTransitions],
  steps: [
    PauseInputSystem,
    Game.Schedule.applyStateTransitions(appTransitions),
    Game.Schedule.updateEvents(),
    ObserveTransitions
  ]
})
```

This unlocks the common orchestration cases that are awkward without a typed FSM layer: menus, pause screens, turn phases, battle phases, cutscenes, and editor vs play mode.

## Renderer integration

The intended renderer pattern is to keep host objects outside ECS, inject them as services, and synchronize ECS data into them from a dedicated system.

```ts
const PixiHost = Descriptor.defineService<{
  readonly application: Application
  readonly sprites: Map<number, Sprite>
}>()("PixiHost")

const SyncPixiSceneSystem = Game.System.define(
  "SyncPixiSceneSystem",
  {
    queries: {
      renderables: Game.Query.define({
        selection: {
          position: Game.Query.read(Position),
          renderable: Game.Query.read(Renderable)
        }
      })
    },
    services: {
      pixi: Game.System.service(PixiHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      for (const match of queries.renderables.each()) {
        const entityId = match.entity.id.value

        // The Pixi host has to be present in the runtime before this schedule can run.
        let sprite = services.pixi.sprites.get(entityId)
        if (!sprite) {
          sprite = new Sprite(Texture.WHITE)
          services.pixi.application.stage.addChild(sprite)
          services.pixi.sprites.set(entityId, sprite)
        }

        const position = match.data.position.get()
        sprite.position.set(position.x, position.y)
      }
    })
)
```

This is the same pattern used in [`src/examples/pixi.ts`](./src/examples/pixi.ts).

For richer browser examples, the preferred pattern is still the same:

- keep host objects like Pixi sprites, textures, and containers outside ECS
- use `Game.Query.optional(...)` to keep mixed render queries compact when several renderable kinds share one sync loop
- use lifecycle reads to create and destroy host-owned objects incrementally when that produces a clearer sync boundary

## Architecture

Descriptors define nominal identities for components, resources, events, states, and services. Schemas close the world. Systems declare ECS access and service dependencies explicitly. Schedules order execution, define apply/event phases, and carry their runtime requirements. The runtime owns world state, but not the outer loop, and the app/runtime execution boundary is where those requirements are checked.

The important rule is simple: if TypeScript cannot prove something honestly, the public API should not pretend it can. Internals may erase types when needed, but that should not leak through the external surface.

## Examples

The repo currently includes:

- [`src/examples/smoke.ts`](./src/examples/smoke.ts) for the smallest end-to-end setup
- [`src/examples/state-machine.ts`](./src/examples/state-machine.ts) for multiple machines, explicit transition bundles, and transition events
- [`src/examples/top-down.ts`](./src/examples/top-down.ts) for a browser proof of concept with free movement, wall collision, camera follow, and proximity-based collection
- [`src/examples/pixi.ts`](./src/examples/pixi.ts) for renderer/service integration
- [`src/examples/pokemon.ts`](./src/examples/pokemon.ts) for ordered movement and collision
- [`src/examples/snake.ts`](./src/examples/snake.ts) for events, lookup, spawn, and despawn flow
- [`src/examples/space-invaders.ts`](./src/examples/space-invaders.ts) for a larger browser example with Pixi rendering and headless Matter-backed collision

## Project organization

For a larger game, the most readable structure so far is the same one used by [`src/examples/top-down/`](./src/examples/top-down/):

- keep `schema.ts` as the single place for descriptors, bound `Game`, and state machines
- keep authored content and constants separate from systems, for example in `content.ts` and `constants.ts`
- group systems by behavior such as input, movement, interaction, animation, camera, and HUD instead of keeping one large file
- keep queries in one module when several systems share them, so query semantics stay easy to inspect
- keep renderer and browser host code outside ECS in dedicated modules like `host.ts` and `render/*`
- keep `main.ts` thin: create the host, create the runtime, boot schedules, connect the outer loop

This keeps the ECS side focused on simulation and orchestration, and the host side focused on rendering, input, assets, and browser lifecycle.

## Relationships and hierarchy

Relationships are explicit schema entries. General relations and hierarchy use separate paired constructors so the relation kind stays typed through commands, queries, and lookup.

```ts
const { relation: ChildOf } = Descriptor.defineHierarchy("ChildOf", "Children")
const { relation: Targeting } = Descriptor.defineRelation("Targeting", "TargetedBy")

const schema = Schema.build(Schema.fragment({
  components: {
    Position,
    Unit
  },
  relations: {
    ChildOf,
    Targeting
  }
}))

const Game = Schema.bind(schema)

const RelationQuery = Game.Query.define({
  selection: {
    parent: Game.Query.optionalRelation(ChildOf),
    children: Game.Query.optionalRelated(ChildOf)
  }
})
```

Hierarchy traversal is only available for hierarchy relations and stays explicit through `lookup`:

```ts
const result = lookup.descendants(rootId, ChildOf, { order: "depth" })
if (result.ok) {
  for (const childId of result.value) {
    // ...
  }
}
```

Relationships express current world structure and ownership. They are not a substitute for durable handles: relations model structural links in the world, while handles are for storing long-lived targets across frames and resolving them later through checked lookup.

## Current limits

This is still an early implementation. The public types are stricter than the runtime internals, and the project is not aiming for full Bevy parity yet. Dependency closure happens at the runtime and app execution boundary, not through Effect-style local `provide` or layer graphs. Performance-oriented storage, observers, richer state transitions, and parallel scheduling are not the current focus.

At this point the main pressure is less "missing ECS capability" and more "choosing the right existing abstraction clearly" as the public API grows.

One important implementation rule for this library is how type optimization works. The public API is intentionally strict, root-bound, and explicit, but TypeScript and `tsgo` do have practical instantiation limits on very large composed values.

The current codebase follows this rule:

1. validate exact structure at the constructor boundary
2. derive and carry the normalized runtime-facing type once
3. widen only internal post-validation structure when that precision is no longer user-meaningful
4. keep the public guarantees exact

Concretely, the tradeoff looks like this:

```ts
const A = Game.System.define("A", { schema }, ...)
const B = Game.System.define("B", { schema, after: [A] }, ...)

const schedule = Game.Schedule.define({
  systems: [A, B, /* many more systems */],
  steps: [A, Game.Schedule.applyDeferred(), B, /* many more steps */]
})
```

The parts that still matter after optimization are:

- `B` really points to the exact `A` value in `after: [A]`
- invalid direct references are rejected when defining the schedule
- the carried requirements are correct
- the bound root is preserved exactly
- runtime compatibility is still checked later on

What is allowed to relax internally is only this:

- the schedule value does not need to preserve the full tuple-exact identity of every system and step forever through every later internal layer

That is the type-optimization pattern to reuse in future work. If a similar compiler hotspot appears again, the acceptable fix is:

- keep exact validation at the edge where the value is created
- collapse the carried value to a cheaper normalized shape immediately afterward
- preserve root safety, requirement safety, and explicit runtime failure semantics

What is not an acceptable fix:

- requiring user-facing casts
- requiring explicit generic arguments in normal examples
- requiring users to split schedules or features into pieces only to satisfy the compiler
- weakening cross-root rejection or runtime requirement validation

This is best understood as an internal compiler-cost tradeoff, not as a user-meaningful loss of safety.

## Roadmap

The next meaningful additions are the ones that improve type safety, explicitness, and feature reach without turning the runtime into an engine. If TypeScript cannot prove a behavior honestly, the public API should not pretend it can.

The browser examples, especially the top-down proof of concept, confirmed that the current ECS core is already enough to drive real gameplay loops. They also exposed the next pressure points clearly: long-lived entity references, relationships, and higher-level feature composition.

The order below is based on how much each addition strengthens the ECS authoring model, not on implementation ease.

### 1. Typed feature or module composition

This is the longer-term architectural piece. Larger games eventually need a first-class way to assemble optional gameplay features, server/client/editor variants, and reusable modules. Bevy plugins are the reference for the problem being solved, not the intended API shape.

It would unlock things like:

```ts
const Combat = Game.Feature.define({
  schema: combatFragment,
  schedules: [combatUpdate],
  services: [DamageResolver]
})

const app = Game.App.make({
  features: [Core, Combat, Dialogue]
})
```

### Relationship follow-ups

The first relationship milestone is now in place: explicit paired relation definitions, relation-aware queries, reverse reads, hierarchy traversal, linked hierarchy despawn, live deferred relation mutation, and explicit typed relation-failure streams. That is enough to cover trees, ownership, attachments, targeting, and runtime retargeting safely.

Another likely follow-up is explicit hierarchy child reordering. The current hierarchy model already preserves child order on reads, which is enough for many gameplay and UI uses. If later examples need deterministic reordering, it should still be exposed through a separate hierarchy-specific API rather than a generic mutable collection surface, so the type system can keep “ordered tree only” behavior distinct from general relations.

These follow-ups fit the same explicit, type-safe, runtime-safe model that defines the current relationship feature:

- relations stay separate from components in the public API
- hierarchy-only behavior stays restricted to hierarchy relations
- all relation values remain schema-bound and root-bound
- if a guarantee depends on current world state, it must be reflected in a result type rather than hidden behind an exception

### Out of scope for now

Some additions are intentionally not near-term because they do not match the current goals.

Built-in time, timers, fixed-step helpers, and engine-owned loop phases are out of scope because cadence is meant to stay owned by external hosts like Pixi or Matter, not by the ECS runtime.

Built-in camera systems, renderer scene graphs, asset pipelines, or sprite management layers are also out of scope. The ECS should model simulation state and explicit orchestration; host libraries should continue to own rendering, camera transforms, and asset concerns.

Full Effect-style local `provide` or layer graphs are also out of scope because dependency closure currently belongs at the runtime and app boundary, not at arbitrary local execution sites.

Full Bevy plugin parity, full observer parity, asset pipeline abstractions, and advanced parallel scheduler work remain useful future references, but they are not current priorities.
