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

1. Schedule execution still needs a cheaper carried type shape after validation. Refactoring [`src/examples/smoke.ts`](./src/examples/smoke.ts) to the current explicit API worked cleanly at the system and schedule-definition level, but the direct `app.update(update)` / `runtime.runSchedule(update)` path can still hit TypeScript instantiation limits in a minimal example. That is a direct violation of the library's main user-facing constraint: users should not need casts, explicit generics, or artificial schedule splitting just to execute a valid schedule. The execution boundary should preserve exact validation, root safety, and runtime-requirement safety while carrying a much cheaper normalized schedule type into `App` and `Runtime`.

2. Host synchronization and lifecycle visibility still need a more guided API surface. Refactoring [`src/examples/pokemon.ts`](./src/examples/pokemon.ts), [`src/examples/space-invaders.ts`](./src/examples/space-invaders.ts), and the multi-machine [`src/examples/state-machine.ts`](./src/examples/state-machine.ts) example to current patterns was straightforward at the simulation level, but host sync still required hand-assembling `added(...)` and `changed(...)` query filters, `readRemoved(...)` and `readDespawned()` lifecycle reads, and an explicit `updateLifecycle()` boundary in exactly the right place. The current primitives are correct and explicit, but the canonical host-sync shapes are still too implicit:
   - incremental host sync: create on `added(...)`, then run one or more narrow update systems
   - authoritative host mirror: destroy, create, transform sync, and optional reconcile

   The API should make these flows easier to express without hiding lifecycle semantics, or the docs need much stronger guardrails around the common failure modes.

   ```ts
   // Current pattern
   Game.Schedule.updateLifecycle(),
   DestroyRenderNodesSystem,
   CreateRenderNodesSystem,
   SyncRenderableTransformsSystem
   ```

   ```ts
   // Possible direction
   Game.Schedule.syncHost(PixiHost, {
     afterLifecycle: true,
     destroy: DestroyRenderNodesSystem,
     create: CreateRenderNodesSystem,
     update: SyncRenderableTransformsSystem
   })
   ```

3. Schedule composition across headless gameplay and host-specific integration should be easier to reuse. The refactored pokemon example now has one headless update schedule and one browser update schedule, but the browser schedule still repeats the same core gameplay systems so it can wrap them with frame capture and render sync. The same pattern appears in [`src/examples/snake.ts#L939-L1008`](./src/examples/snake.ts#L939-L1008) and [`src/examples/space-invaders.ts`](./src/examples/space-invaders.ts). A typed way to extend one core schedule with host-only prefix or suffix phases would reduce duplication while preserving explicit boundaries and runtime requirement checking.

   ```ts
   // Possible direction
   const gameplay = Game.Schedule.define({
     systems: [InputSystem, PlanMovementSystem, CollisionSystem, AdvanceMovementSystem]
   })

   const browserUpdate = Game.Schedule.extend(gameplay, {
     before: [CaptureFrameInputSystem],
     after: [
       Game.Schedule.applyDeferred(),
       Game.Schedule.updateLifecycle(),
       DestroyRenderNodesSystem,
       CreateRenderNodesSystem,
       SyncRenderableTransformsSystem
     ]
   })
   ```

4. The split between descriptor-backed `states` and `StateMachine` needs clearer guidance, and possibly a narrower intended role for plain states. The smoke example naturally wanted `StateMachine` for a simple running/paused phase because the discrete mode boundary is the meaningful part of the model. The refactored [`src/examples/state-machine.ts`](./src/examples/state-machine.ts) example naturally wanted two cooperating machines for session flow and round-local flow, which reinforces that gameplay phases are usually better modeled as machines when transition timing matters. The current README still teaches descriptor-backed `states` prominently in the Quick Start and Runtime Requirements sections, which makes the intended choice less clear than it should be. Either the docs need a sharper "when to use which" rule, or the API should become more opinionated if `StateMachine` is now the intended default for gameplay phases.

5. The docs should show one full explicit-boundary game-loop example. The README explains what `applyDeferred()`, `updateEvents()`, `updateLifecycle()`, and `applyStateTransitions()` do, but it still leaves users to infer where those markers belong in an actual browser loop. A small worked example should explain how to separate simulation, transitions, events, lifecycle visibility, and host sync, and why lifecycle-driven rendering fails when the boundary is misplaced.

6. The docs should present one canonical multi-machine orchestration pattern. The refactored [`src/examples/state-machine.ts`](./src/examples/state-machine.ts) example now shows a clear shape for cooperating machines: one machine for session flow, one for round-local flow, transition bundles on one machine, cross-machine `inState(...)` gating, and later observation through `readTransitionEvent(...)`. The README should explain when two smaller machines are clearer than one larger machine, and how to combine them without hiding transition boundaries.

7. Reset and restart flow should become a more first-class gameplay capability, or at least have one clearly documented canonical pattern. The snake example still requires a fairly manual teardown-and-rebuild system across [`ResetGameSystem`](./src/examples/snake.ts#L331-L389), [`QueueRestartSystem`](./src/examples/snake.ts#L391-L408), and [`phaseTransitions`](./src/examples/snake.ts#L933-L937). The refactored state-machine example uses the same general shape through a transition bundle that resets resources, repositions entities, and respawns pickups on countdown entry. A stronger reset helper, or a clearly bounded transition-driven reset utility, would reduce repetitive despawn, respawn, and resource-reset orchestration while keeping explicit schedule boundaries intact.

8. The docs should present the smallest modern end-to-end pattern more directly. The current README still mixes older and newer idioms in a way that makes the intended default harder to infer than it should be. The smallest canonical example should align around the current recommended shape:
   - `StateMachine` for discrete phases when the boundary itself matters
   - writable-cell `update(...)` for incremental mutation instead of older `get()` + `set(...)` examples where that adds noise
   - explicit `applyDeferred()` / `updateEvents()` boundaries when the example depends on deferred visibility
   - `bootstrap(...)` plus update-schedule separation when setup is responsible for initial spawning

9. The docs should present the two canonical host-sync patterns directly in the Renderer Integration section. The current section explains the minimal renderer/service bridge well, but after refactoring pokemon, space-invaders, and state-machine the practical split is clearer:
   - small incremental pattern: `added(...)` create plus narrow sync after `updateLifecycle()`, as in [`src/examples/pixi.ts`](./src/examples/pixi.ts) and [`src/examples/pokemon.ts`](./src/examples/pokemon.ts)
   - richer authoritative pattern: destroy, create, transform sync, and optional reconcile, as in [`src/examples/snake.ts#L742-L856`](./src/examples/snake.ts#L742-L856), [`src/examples/space-invaders.ts`](./src/examples/space-invaders.ts), and [`src/examples/state-machine.ts`](./src/examples/state-machine.ts)

   The README should show both as first-class patterns and explain when each one is the right choice.

10. Explicit transient entity references across boundaries still need a more ergonomic pattern. The refactored space-invaders example still has to emit `Handle` values into an event and then re-resolve them later with checked lookup after `updateEvents()`, even though the intent is simply "despawn these entities later in the same update". That is semantically correct and should stay fallible, but the library could do better at making this pattern obvious and less noisy. The first step may be documentation that treats "emit handles, re-resolve later" as canonical. If the ergonomics still feel too heavy after that, a narrowly scoped helper for same-runtime transient entity references may be justified, but only if it preserves explicit failure and does not blur the line between `EntityId` and long-lived storage-safe handles.

11. The docs should show a clearer pattern for reusable typed drafts and spawn factories. The snake example repeatedly builds the same entity shapes in [`ResetGameSystem`](./src/examples/snake.ts#L331-L389), [`GrowSnakeSystem`](./src/examples/snake.ts#L576-L634), and [`EnsureFoodSystem`](./src/examples/snake.ts#L679-L739). A short documented pattern for small draft factories would improve readability and reduce repeated tuple construction without compromising strict public typing.

   ```ts
   const makeTailDraft = (parent: Entity.Handle<typeof Root>, position: GridPosition) =>
     Game.Command.spawnWith(
       [Position, position],
       [PreviousPosition, position],
       [SnakeBody, { parent, isTail: true }]
     )
   ```

12. A first-class randomness story is still a worthwhile feature addition. The snake example currently carries its own seed resource and local stepping logic in [`src/examples/snake.ts#L679-L739`](./src/examples/snake.ts#L679-L739), which keeps failure explicit but still leaves each gameplay example to invent its own RNG shape. A canonical typed RNG service, with one endorsed runtime-provisioning path, would make procedural gameplay code easier to author without weakening explicit dependencies.

13. The query surface could use a dedicated zero-or-one singleton read for the common "maybe present, but never many" case. The pattern now appears not only in [`src/examples/snake.ts`](./src/examples/snake.ts), but also in [`src/examples/top-down.ts`](./src/examples/top-down.ts) and [`src/examples/state-machine.ts`](./src/examples/state-machine.ts), where `single()` is often followed by an explicit early return because absence is acceptable even if multiplicity is not. A small `singleOptional()`-style helper would improve ergonomics for that exact case without broadening semantics or hiding failure.

14. Some gameplay code needs explicit stable traversal ordering, and today that is awkward to express directly. The snake example keeps ordering safe by storing parent handles and previous positions in [`MoveBodySystem`](./src/examples/snake.ts#L492-L512) and [`GrowSnakeSystem`](./src/examples/snake.ts#L576-L634), which is valid but indirect. A small ordered-query or ordered-iteration helper would keep order-dependent logic explicit instead of forcing users into structural workarounds whenever gameplay correctness depends on processing order.

## Out of scope for now

Some additions are intentionally not near-term because they do not match the current goals.

Built-in time, timers, fixed-step helpers, and engine-owned loop phases are out of scope because cadence is meant to stay owned by external hosts like Pixi or Matter, not by the ECS runtime.

Built-in camera systems, renderer scene graphs, asset pipelines, or sprite management layers are also out of scope. The ECS should model simulation state and explicit orchestration; host libraries should continue to own rendering, camera transforms, and asset concerns.

Full Effect-style local `provide` or layer graphs are also out of scope because dependency closure currently belongs at the runtime and app boundary, not at arbitrary local execution sites.

Full Bevy plugin parity, full observer parity, asset pipeline abstractions, and advanced parallel scheduler work remain useful future references, but they are not current priorities.
