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

The normal flow is: define descriptors, group them into schema fragments, build one final schema, define systems, group them into schedules, then run those schedules from your own loop. Rendering, input, physics, and timing stay outside the runtime unless you model them explicitly as resources or services.

When choosing between the main ECS surfaces, the intended split is:

- resources for continuous world values such as delta time, counters, or animation clocks
- state machines for discrete phases where the transition boundary itself matters
- events for transient cross-system messages
- lifecycle reads for structural world changes that become visible only after `updateLifecycle()`

In practice, let runtime construction own initial resource and machine values, and keep setup systems focused on spawning world content.

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

If one of those inputs is missing, the schedule should fail in typecheck before it can fail at runtime. Services use descriptors; resources and states stay keyed by schema property names from the closed schema.

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

`Game.Command.spawn()` and single-step `Game.Command.insert(...)` still exist, but `spawnWith(...)` is the default authoring path.

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

No runtime-relevant references are open strings. Systems are referenced directly, and reusable sets use typed labels.

## State machines

Finite state machines are a dedicated API for discrete state with explicit transition boundaries. Systems queue the next state, the current state stays stable until `applyStateTransitions(...)`, and continuous values such as timers or animation elapsed time still stay in resources. When some local resource needs to react to machine changes, prefer `Game.Condition.stateChanged(...)` or transition handlers over storing "last state" fields manually.

### Define machines

Define machines from the bound schema root:

```ts
const AppState = Game.StateMachine.define(
  "AppState",
  ["Menu", "Playing", "Paused"]
)

const ModalState = Game.StateMachine.define(
  "ModalState",
  ["None", "Inventory", "Map"]
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

Queued state is invisible before `applyStateTransitions()` and visible after it.

The three main explicit schedule boundaries are:

- `applyStateTransitions()` for queued machine state
- `updateEvents()` for emitted events
- `updateLifecycle()` for added / changed / removed / despawned visibility

Transition schedules are pure values and only run when bundled into the exact marker that should execute them:

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

This covers the common orchestration cases that are awkward without a typed FSM layer: menus, pause screens, turn phases, and similar mode-driven flows.

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

Relationships model current world structure and ownership. They are not a substitute for durable handles, which are for storing long-lived targets across frames and resolving them later through checked lookup. For single-target gameplay state such as a focused interactable, a durable handle in a resource is usually the simpler model.

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

This is the same pattern used in [`src/examples/pixi.ts`](./src/examples/pixi.ts). For richer browser examples:

- keep host objects like Pixi sprites, textures, and containers outside ECS
- use `Game.Query.optional(...)` when several renderable kinds genuinely fit one sync loop
- use lifecycle reads to create and destroy host-owned objects incrementally

For larger scenes, it is often clearer to split host sync into a few small systems:

- one system to apply camera or world-container transforms
- one lifecycle-driven system to create host nodes
- one lifecycle-driven system to destroy host nodes
- one or more narrow sync systems for transforms, sprite frame selection, or host-only presentation

`optional(...)` is useful, but it should not force everything back into one mixed render pass if smaller changed- or lifecycle-driven systems are easier to reason about.

## Feature Composition

Typed feature composition is now implemented as a strict pre-bind layer under `Schema.Feature`.

```ts
const Root = Schema.defineRoot("Game")

const Core = Schema.Feature.define("Core", {
  schema: coreFragment,
  build: (Game) => ({
    bootstrap: [coreBootstrap]
  })
})

const Combat = Schema.Feature.define("Combat", {
  schema: combatFragment,
  requires: [Core],
  build: (Game) => ({
    update: [combatUpdate]
  })
})

const project = Schema.Feature.compose({
  root: Root,
  features: [Core, Combat]
})

const app = project.App.make({
  services: project.Game.Runtime.services(...)
})

app.bootstrap()
app.update()
```

The important constraints are:

- features are pure typed values, not imperative plugins
- composition happens before `Schema.bind(...)`
- dependencies are structural only: a feature can require another feature's schema slice, but does not receive that feature's built outputs directly
- runtime requirements still come from schedules, so there is no second dependency declaration surface to keep in sync

This keeps modular gameplay assembly inside the same guarantees as the rest of the library: schema closure, root flow, runtime requirements, and no user-facing casts or compiler-workaround scaffolding.

## Architecture

Descriptors define nominal identities for components, resources, events, states, and services. Schemas close the world. Systems declare ECS access and service dependencies explicitly. Schedules order execution, define apply/event phases, and carry their runtime requirements. The runtime owns world state, but not the outer loop, and the app/runtime execution boundary is where those requirements are checked.

The important rule is simple: if TypeScript cannot prove something honestly, the public API should not pretend it can. Internals may erase types when needed, but that should not leak through the external surface.

## Project organization

For a larger game, the most readable structure so far is the same one used by [`src/examples/top-down/`](./src/examples/top-down/):

- keep `schema.ts` as the single place for descriptors, bound `Game`, and state machines
- keep authored content and constants separate from systems, for example in `content.ts` and `constants.ts`
- group systems by behavior such as input, movement, interaction, animation, camera, and HUD instead of keeping one large file
- keep queries in one module when several systems share them, so query semantics stay easy to inspect
- keep renderer and browser host code outside ECS in dedicated modules like `host.ts` and `render/*`
- keep `main.ts` thin: create the host, create the runtime, boot schedules, connect the outer loop
- keep `runtime.ts` as the single source of initial resources and machine values
- keep schedules explicit even when the project is modular; composition should not hide `applyDeferred()`, `applyStateTransitions()`, or `updateLifecycle()`

This keeps the ECS side focused on simulation and orchestration, and the host side focused on rendering, input, assets, and browser lifecycle.

## Examples

The repo currently includes:

- [`src/examples/smoke.ts`](./src/examples/smoke.ts) for the smallest end-to-end setup
- [`src/examples/state-machine.ts`](./src/examples/state-machine.ts) for multiple machines, explicit transition bundles, and transition events
- [`src/examples/top-down.ts`](./src/examples/top-down.ts) for a browser proof of concept with free movement, wall collision, camera follow, and proximity-based collection
- [`src/examples/pixi.ts`](./src/examples/pixi.ts) for renderer/service integration
- [`src/examples/pokemon.ts`](./src/examples/pokemon.ts) for ordered movement and collision
- [`src/examples/snake.ts`](./src/examples/snake.ts) for events, lookup, spawn, and despawn flow
- [`src/examples/space-invaders.ts`](./src/examples/space-invaders.ts) for a larger browser example with Pixi rendering and headless Matter-backed collision

## Current limits

This is still an early implementation. The public types are stricter than the runtime internals, and the project is not aiming for full Bevy parity yet. Dependency closure happens at the runtime and app execution boundary, not through Effect-style local `provide` or layer graphs. Performance-oriented storage, observers, richer state transitions, and parallel scheduling are not the current focus.

At this point the main pressure is less "missing ECS capability" and more "choosing the right existing abstraction clearly" as the public API grows.

One important implementation rule is how type optimization works. The public API stays strict, root-bound, and explicit, but TypeScript and `tsgo` do have practical instantiation limits on very large composed values.

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

After optimization, the important guarantees still need to hold:

- `B` really points to the exact `A` value in `after: [A]`
- invalid direct references are rejected when defining the schedule
- carried requirements stay correct
- the bound root stays correct
- runtime compatibility is still checked later on

The main thing allowed to relax internally is that a schedule value does not need to preserve the full tuple-exact identity of every system and step forever through every internal layer.

If a similar compiler hotspot appears again, the acceptable fix is:

- keep exact validation at the edge where the value is created
- collapse the carried value to a cheaper normalized shape immediately afterward
- preserve root safety, requirement safety, and explicit runtime failure semantics

What is not an acceptable fix:

- requiring user-facing casts
- requiring explicit generic arguments in normal examples
- requiring users to split schedules or features into pieces only to satisfy the compiler
- weakening cross-root rejection or runtime requirement validation

This is an internal compiler-cost tradeoff, not a user-meaningful loss of safety.

## Roadmap

### New features

1. A first-class randomness story is the highest-priority feature addition. The snake example currently carries its own seed resource and local stepping logic in [`src/examples/snake.ts#L679-L739`](./src/examples/snake.ts#L679-L739), which keeps failure explicit but still leaves each gameplay example to invent its own RNG shape. A canonical typed RNG service, with one endorsed runtime-provisioning path, would make procedural gameplay code easier to author without weakening explicit dependencies.

   ```ts
   // Current example-level pattern
   const SpawnSeed = Descriptor.defineResource<number>()("Snake/SpawnSeed")

   const EnsureFoodSystem = Game.System.define("Snake/EnsureFood", {
     resources: {
       seed: Game.System.writeResource(SpawnSeed)
     }
   }, ({ resources }) => ...)
   ```

   ```ts
   // Better public pattern
   const Random = Descriptor.defineService<{
     readonly nextInt: (maxExclusive: number) => number
   }>()("Random")

   const EnsureFoodSystem = Game.System.define("Snake/EnsureFood", {
     services: {
       random: Game.System.service(Random)
     }
   }, ({ services }) => ...)
   ```

2. Reset and restart flow should become a more first-class gameplay capability. In the snake example, restarting through [`QueueRestartSystem`](./src/examples/snake.ts#L391-L408) and [`phaseTransitions`](./src/examples/snake.ts#L933-L937) still requires a fairly manual teardown-and-rebuild system in [`ResetGameSystem`](./src/examples/snake.ts#L331-L389). A stronger reset helper, or a clearly bounded transition-driven reset utility, would reduce repetitive despawn, respawn, and resource-reset orchestration while keeping explicit schedule boundaries intact.

   ```ts
   // Current restart path
   const phaseTransitions = Game.Schedule.transitions(
     Game.Schedule.onEnter(GamePhase, "Playing", {
       systems: [ResetGameSystem]
     })
   )
   ```

   ```ts
   // Possible direction
   const phaseTransitions = Game.Schedule.transitions(
     Game.Schedule.onEnter(GamePhase, "Playing", {
       reset: Game.Reset.world({
         resources: [Score, PendingGrowth, GameOverReason],
         systems: [SpawnInitialSnakeSystem, SpawnInitialFoodSystem]
       })
     })
   )
   ```

3. The query surface could use a dedicated zero-or-one singleton read for the common "maybe present, but never many" case. The snake example uses `single()` repeatedly in places like [`CapturePreviousPositionsSystem`](./src/examples/snake.ts#L410-L433), [`MoveHeadSystem`](./src/examples/snake.ts#L468-L490), and [`DetectSelfCollisionSystem`](./src/examples/snake.ts#L636-L677), where absence is handled explicitly but is not always a true error. A small `singleOptional()`-style helper would improve ergonomics for that exact case without broadening semantics or hiding failure.

### API improvements

1. Renderer synchronization is the clearest current API-usage rough edge. The snake example now needs four separate systems for destroy, create, transform sync, and final reconciliation in [`src/examples/snake.ts#L742-L856`](./src/examples/snake.ts#L742-L856), plus an explicit lifecycle boundary in [`browserUpdateSchedule`](./src/examples/snake.ts#L967-L1008). That is correct and explicit, but it asks users to assemble several low-level pieces before the safe host-sync pattern becomes obvious. The API should make the authoritative create, update, destroy, and reconcile flow easier to express directly.

   ```ts
   // Current pattern
   Game.Schedule.updateLifecycle(),
   DestroySnakeNodesSystem,
   CreateSnakeNodesSystem,
   SyncSnakeNodeTransformsSystem,
   ReconcileSnakeNodesSystem
   ```

   ```ts
   // Possible direction
   Game.Schedule.syncHost(PixiHost, {
     create: CreateSnakeNodesSystem,
     update: SyncSnakeNodeTransformsSystem,
     destroy: DestroySnakeNodesSystem,
     reconcile: ReconcileSnakeNodesSystem
   })
   ```

2. Schedule composition across headless gameplay and host-specific integration could be clearer at the API level. The snake example has a clean split between pure gameplay in [`updateSchedule`](./src/examples/snake.ts#L939-L965) and browser-specific orchestration in [`browserUpdateSchedule`](./src/examples/snake.ts#L967-L1008), but the host schedule still repeats most of the core simulation steps. A better pattern for extending one core schedule with host-only input and sync layers would improve reuse while preserving strict runtime requirement validation.

3. Some gameplay code needs explicit stable traversal ordering, and today that is awkward to express directly. The snake refactor keeps ordering safe by storing parent handles and previous positions in [`MoveBodySystem`](./src/examples/snake.ts#L492-L512) and [`GrowSnakeSystem`](./src/examples/snake.ts#L576-L634), which is valid but indirect. A small ordered-query or ordered-iteration helper would keep order-dependent logic explicit instead of forcing users into structural workarounds whenever gameplay correctness depends on processing order.

### Better docs

1. The docs should explicitly show the full authoritative host-sync pattern, not only the minimal incremental one. The renderer section currently explains the separation of responsibilities well, but the snake example shows the richer reality: lifecycle-driven destroy, create, transform sync, and a final reconciliation pass in [`src/examples/snake.ts#L742-L856`](./src/examples/snake.ts#L742-L856). That exact pattern should be documented as the recommended host-sync approach for restart-heavy browser examples.

2. State-machine-driven reset and restart should have one documented pattern that the repo treats as canonical. The snake example already demonstrates the pieces across [`QueueRestartSystem`](./src/examples/snake.ts#L391-L408), [`ResetGameSystem`](./src/examples/snake.ts#L331-L389), and [`phaseTransitions`](./src/examples/snake.ts#L933-L937), but the README currently stops at transition semantics rather than gameplay-loop reset. A concrete walkthrough based on that example would make the machine API easier to apply in actual game loops.

3. The docs should show a clearer pattern for reusable typed drafts and spawn factories. The snake example repeatedly builds the same entity shapes in [`ResetGameSystem`](./src/examples/snake.ts#L331-L389), [`GrowSnakeSystem`](./src/examples/snake.ts#L576-L634), and [`EnsureFoodSystem`](./src/examples/snake.ts#L679-L739). A short documented pattern for small draft factories would improve readability and reduce repeated tuple construction without compromising strict public typing.

   ```ts
   // Current pattern
   commands.spawn(
     Game.Command.spawnWith(
       [Position, INITIAL_TAIL_POSITION],
       [PreviousPosition, INITIAL_TAIL_POSITION],
       [SnakeBody, { parent: headId, isTail: true }]
     )
   )
   ```

   ```ts
   // Better documented pattern
   const makeTailDraft = (parent: Entity.Handle<typeof Root>, position: GridPosition) =>
     Game.Command.spawnWith(
       [Position, position],
       [PreviousPosition, position],
       [SnakeBody, { parent, isTail: true }]
     )
   ```

## Out of scope for now

Some additions are intentionally not near-term because they do not match the current goals.

Built-in time, timers, fixed-step helpers, and engine-owned loop phases are out of scope because cadence is meant to stay owned by external hosts like Pixi or Matter, not by the ECS runtime.

Built-in camera systems, renderer scene graphs, asset pipelines, or sprite management layers are also out of scope. The ECS should model simulation state and explicit orchestration; host libraries should continue to own rendering, camera transforms, and asset concerns.

Full Effect-style local `provide` or layer graphs are also out of scope because dependency closure currently belongs at the runtime and app boundary, not at arbitrary local execution sites.

Full Bevy plugin parity, full observer parity, asset pipeline abstractions, and advanced parallel scheduler work remain useful future references, but they are not current priorities.
