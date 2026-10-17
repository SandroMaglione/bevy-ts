# ritmo in 5 minutes

This is the mental model, one concept at a time, for someone who knows ECS. Every snippet comes from [`examples/concepts.ts`](./examples/concepts.ts), a complete program that is typechecked and run by the test suite.

## 1. Descriptors name your data

```ts
const Position = Descriptor.ConstructedComponent(Decode.struct({ x: Decode.number, y: Decode.number }))("Concepts/Position")
const DeltaTime = Descriptor.TransientResource<number>()("Concepts/DeltaTime")
const Hit = Descriptor.Event<{ readonly amount: number }>()("Concepts/Hit")
const Log = Descriptor.Service<{ readonly write: (line: string) => void }>()("Concepts/Log")
const { relation: ChildOf } = Descriptor.Hierarchy("Concepts/ChildOf", "Concepts/Children")
```

- **Components** are per-entity data. **Resources** are world singletons. **Events** are messages between systems. **Services** are host capabilities (clock, audio, renderer) that live outside the world. **Relations** link entities.
- Identity is `(kind, name)`. A schema rejects two descriptors of one kind with the same name, so prefix names per game or package.
- `Descriptor.Component<T>()` declares a plain component. `Descriptor.ConstructedComponent(validator)` attaches a validating constructor (`{ result: (raw) => Result }`), used for raw input and when loading saves. `@typeonce/ritmo-math` provides `Vector2`, `Size2`, `Aabb` and `Scalar`. `Decode` has ready-made validators (`number`, `integer`, `string`, `boolean`, `literal`, `nullable`, `array`, `struct`, `handle`), `Descriptor.Tag("Player")` declares a marker component, and `Descriptor.fromStandardSchema(schema)` adapts any Standard Schema validator (ArkType, Effect Schema, Zod, Valibot).
- `Descriptor.TransientComponent<T>()` / `TransientResource<T>()` mark runtime-only state that saves skip.

## 2. A schema closes the world

```ts
const Root = Schema.defineRoot("Concepts")
const Game = Schema.bind(Schema.fragment({
  components: { Position, Velocity, Health, Target },
  resources: { DeltaTime, Score },
  events: { Hit },
  relations: { ChildOf }
}), Root)
```

- Everything else is built from `Game`: queries, systems, schedules, state machines and the runtime.
- Anything outside the schema, or from another `Game`, is a compile error.
- Split large games into several `Schema.fragment(...)` values.

## 3. Systems declare exactly what they touch

```ts
const Move = Game.System("Concepts/Move", {
  queries: { moving: Game.Query({ selection: { position: Game.Query.write(Position), velocity: Game.Query.read(Velocity) } }) },
  resources: { dt: Game.System.readResource(DeltaTime) }
}, ({ queries, resources }) => {
  for (const { data } of queries.moving.each()) { /* ... */ }
})
```

- The callback receives only what the spec declares.
- `read` slots are deeply readonly. `write` slots expose `set` / `update`.
- Values from `get()` are `ReadonlyValue<T>`. Type helpers that receive them as `ReadonlyValue<T>` (from `@typeonce/ritmo/Query`), not `T`, so a config resource or component value passes straight in without a cast: `const spawnRate = (tuning: ReadonlyValue<Tuning>) => ...`.
- Queries also take `with`, `without`, `optional(...)`, relation selections, and the change filters described in section 8.
- Query results come back in spawn order.

## 4. Structural changes are commands

```ts
const Spawn = Game.System("Concepts/Spawn", {
  commands: Game.System.commands(Game.System.spawns(Health, Position))
}, ({ commands }) => {
  const enemy = commands.spawn(Game.Command.spawn([Health, 3], [Position, { x: 10, y: 0 }]))
  commands.spawn(Game.Command.relate(Game.Command.spawn([Health, 1]), ChildOf, enemy))
})
```

- A system has `commands` only when its spec declares them, and only for what it names: `spawns(...)` (every component of the draft), `inserts(...)`, `removes(...)`, `despawns(...)`, `despawnsScope(scope)`, and `relates(...)`. Without the declaration, `commands` is a type naming the fix.
- `despawn` takes `match.entity` from a query that proves one of the `despawns` components, never a raw id. With only an id, resolve it first: `const enemy = queries.enemies.get(id); if (enemy.ok) commands.despawn(enemy.value.entity)`.
- `Game.Command.extend(draft, ...entries)` adds entries to a draft before it is spawned; `commands.insert` changes an entity that already exists.
- Commands are applied only when a schedule reaches `applyDeferred()`. `commands.spawn` returns the entity id immediately.
- `Game.Command.spawn(...)` returns a draft, or a `Result` of one if any entry can fail validation (for example `Game.Command.entryRaw(Position, raw)`).

## 5. Handles outlive frames; resolving them is explicit

```ts
const Target = Descriptor.Component<{ readonly enemy: Entity.Handle<typeof Root, typeof Health> }>()("Concepts/Target")
// ...
// `enemies` is a query the system declares: queries: { enemies: HealthQuery }
const enemy = queries.enemies.getHandle(data.target.get().enemy)
if (enemy.ok) { /* the entity still exists and has Health */ }
```

- A handle is safe to store in components, resources and events, but it doesn't prove the entity is still alive.
- `queries.x.getHandle` returns a `Result`. Every read and write goes through a query the system declares (`get`, `getHandle`, `children`, `descendants` are on the query handle); `lookup` only returns ids along relations.
- A handle with an intent (`Health` here) can only be resolved through a query that proves that component.
- Entity ids and handles are branded numbers. Use them directly as `Map` or `Set` keys. `Decode.handle` validates positive integer handles, and snapshots write numbers.

### Lookups and reading the world

When you already have a declared query, use its handle to look up one entity.
`get` returns a `Result`: the entity may be gone or no longer match. Use
`singleOptional` when zero or one match is expected; more than one is still
an explicit error.

```ts
const found = queries.moving.get(id)
if (found.ok) found.value.data.position.get()

const only = queries.moving.singleOptional()
if (only.ok && only.value !== undefined) only.value.data.position.get()
```

Helpers can take the exact cells of a query without spelling out cell types
or passing a schema parameter:

```ts
import type { Query } from "@typeonce/ritmo/Query"

const positionOf = (data: Query.Cells<typeof Moving>) => data.position.get()
```

Access declarations are plain values. Share and spread them into specs;
their query types and requirements are preserved.

```ts
const ReadMoving = Game.Query({
  selection: { position: Game.Query.read(Position), velocity: Game.Query.read(Velocity) }
})
const movementAccess = { queries: { moving: ReadMoving } }
const InspectPosition = Game.Inspector("Concepts/InspectPosition", {
  ...movementAccess,
  machines: { flow: Game.System.machine(Flow) }
}, ({ queries, machines }) => ({
  position: queries.moving.each().map(({ data }) => data.position.get()),
  flow: machines.flow.get()
}))
runtime.inspect(InspectPosition)
```

An inspector's queries must be read-only; systems can spread writable access too.
Inspectors also read machines, so tests and UI can project the current mode
without changing it or parsing a debug dump.

## 6. Events are read once per reader

- A system's events are published when it completes; a failed system publishes nothing.
- Each reader sees the events published since its own previous run, once, in order: from earlier systems in this schedule, and from anything that ran after it last time.
- Events wait for every system that reads them, so a fixed-rate schedule ticked less often than rendering still sees everything. A system skipped by its run conditions discards the events published meanwhile. If a reader stops running long enough to overflow the stream's capacity, it sees `lagged() === true`.
- `runtime.send(Hit, { amount: 1 })` publishes a host event immediately at a fresh tick. It is forbidden during a tick; systems use their declared event writers. Unread host messages survive restore, with each reader's position preserved. Simulation messages are cleared on restore.

## 7. Expected failures are typed and roll back

```ts
if (total > 100) {
  return Result.failure("ImpossibleDamage" as const)
}
resources.score.update((score) => score + total)
```

- A system that can't fail returns nothing. A system that returns `Result.failure(error)` has its ECS writes rolled back and its commands and events dropped. There is no effect type: a system returns nothing or a `Result`.
- `runtime.tick(...)` returns `Result<void, SystemFailure<"Concepts/ApplyHits", "ImpossibleDamage">>`, a union built from every system in the schedule.
- Thrown exceptions are treated as bugs: the system's writes are rolled back and the exception is rethrown.

## 8. Change detection is per system

```ts
filters: [Game.Query.changed(Position)]
filters: [Game.Query.anyOf(Game.Query.changed(Position), Game.Query.changed(Sprite))]
resources: { score: Game.System.changedResource(Score) }   // resources.score.changed()
```

- `added(...)` and `changed(...)` match what happened since this system's previous run. Every system sees each change exactly once, independently of other systems.
- Filters listed side by side must all pass; `anyOf(...)` matches when any one of its `added`/`changed` filters does.
- A system's first run sees everything that already exists as added.
- `changedResource(...)` reads a resource and reports `changed()`: whether a committed write left a different value since this system's previous run. Unlike component `changed`, a write of an equal value is not a change. Use it to redraw a HUD label only when its value moves.
- `readRemoved(...)` and `readDespawned()` work the same way.
- Nothing needs a marker. Removal records are kept until every system that reads them has run, so a render schedule ticked after several fixed updates still sees every despawn.

## 9. State machines model modes

```ts
const Flow = Game.StateMachine("Concepts/Flow", ["Playing", "Won"])
// nextMachines: { flow: Game.System.nextState(Flow) } → nextMachines.flow.set("Won")
// when: [Game.Condition.inState(Flow, "Playing")]      → gate a system
// Game.Schedule.when([Game.Condition.inState(Flow, "Playing")], Move, Attack) → gate a group
```

- Transitions are queued and committed at `applyStateTransitions(bundle)`. That step runs the bundle's `onExit` / `onTransition` / `onEnter` schedules.
- `Game.Schedule.when(conditions, ...entries)` gates every system in a group (nested schedules included) without repeating `when` on each. Marker steps in the group still run, and the machines the conditions read are requirements of the schedule.
- `Game.Condition.check(name, access, predicate)` gates on anything else with ordinary code. It declares its reads like a system (resources, machines, read-only queries), and they become requirements of what it gates. Reads that consume a per-reader cursor (events, `added`/`changed`, removed/despawned) and services are compile errors, so a check can run before every gated system without side effects. It sees writes made earlier in the same run.

```ts
const frozen = Game.Condition.check("frozen", { resources: { stop: Game.System.readResource(HitStop) } }, ({ resources }) => resources.stop.get().remaining > 0)
Game.Schedule.when([Game.Condition.inState(Flow, "Playing")],
  Game.Schedule.pauseWhen([Game.Condition.not(frozen)], Move, Attack)
)
```

`when` discards event messages across mode changes. `pauseWhen` holds them
while a condition is false, up to the normal stream capacity. All `when`
conditions are checked before pause conditions, regardless of nesting order.
Marker steps still run. Debug traces distinguish held pauses from skips.

For reusable scratch buffers or caches, a system can declare
`local: () => ({ buffer: new Array<number>() })` and receive `local` in its callback.
The value belongs to one runtime, is shared by gated copies, is not rolled
back on failure or saved in snapshots, and is rebuilt after restore. Keep
gameplay state in components and resources.

The factory allocates fresh state synchronously, without side effects. It runs
when the runtime first encounters the system, even if a gate skips execution.
Pauses and mode changes preserve the value; restore replaces it. Buffers should
be cleared at the start of a run, so a failed run cannot leave partial work for
the next one. Caches must validate all inputs against the current world. Timers,
RNG state, and progress that changes gameplay belong in resources. GPU objects,
listeners, and other values needing cleanup belong in host-managed services.

A state each entity has on its own (an enemy's attack windup, a door's open/closed) is an entity state, a component, not a machine. Use `Game.StateMachine` for one game-wide mode (menu, playing, paused); use `Descriptor.EntityState` for per-entity states. It is built from a closed set of states and an optional graph of allowed moves:

```ts
const Attack = Descriptor.EntityState("Attack", ["ready", "windup", "active"] as const, {
  transitions: { ready: ["windup"], windup: ["active", "ready"], active: ["ready"] }
})
Game.Command.spawn([Attack, "ready"])
// write slot `attack`:
const moved = data.attack.transition("windup", "active") // "ready" -> "active" does not compile
if (!moved.ok) moved.error.actual // some earlier write already changed the state
```

- It is an ordinary component: queried, change-detected, rolled back, and validated on restore (unknown states are rejected).
- `transition(from, to)` writes immediately, and only while the state is still `from`. Otherwise it returns `EntityStateMismatch` and writes nothing. The graph lists every state (`[]` for one with no way out), and it is checked at compile time only. `set` still writes any state.
- There are no per-state schedules or filters. Branch on `get()` in the system that owns the component, and emit an event on a transition that other systems react to.

## 10. Schedules make every boundary visible

```ts
const update = Game.Schedule(Move, Attack, ApplyHits, Game.Schedule.applyStateTransitions(), Report)
```

- Steps run in the order written. Nested schedules are flattened in place.
- Only markers apply queued work: `applyDeferred` (commands) and `applyStateTransitions` (commands, then machine transitions). Reads (change detection, events, relation failures) are per system and need no marker.
- Nothing is flushed when a schedule ends.
- `Game.System.thisTick(Game.System.readEvent(Damage))` (or `readResource` / `changedResource`) declares that a read needs this tick's data: every system writing it must run earlier in the same `runtime.tick(...)` call. The library never reorders; `tick` rejects at compile time a writer after the reader ("ApplyDamage needs Damage from this tick, but its writer UpdateFrostFields runs after it: move ...") and a call whose order is not statically known. A read with no writer in the call compiles (`event-never-written` reports data nobody writes). `tryTick` checks the same at runtime; the `this-tick-order` lint reports it for named schedules. Plugin systems with erased specs (render sync, input capture) are not counted as writers.
- `Game.System.thisTick(Query)` declares that a query needs this tick's command changes. Its writers are systems whose declared commands can change what it matches (`spawns` covering every component it requires, or `inserts` / `removes` of a component it names); each must run earlier with an `applyDeferred()` before the reader ("AimAtNewest needs this tick's commands for queries.enemies, but SpawnWave queues them with no applyDeferred() in between"). `despawns` never count: a despawned entity stays visible until the next `applyDeferred()`. A transition bundle counts at its `applyStateTransitions(...)` step, as if every schedule in it runs.

## 11. The runtime is driven by your host

```ts
const runtime = Game.Runtime.make({
  services: Game.Runtime.services(Game.Runtime.service(Log, { write: console.log })),
  resources: { DeltaTime: 1 / 60, Score: 0 },
  machines: Game.Runtime.machines(Game.Runtime.machine(Flow, "Playing"))
})

runtime.tick(setup)
runtime.tick(update)                 // once per frame, e.g. from FixedLoop
runtime.inspect(SomeInspector)       // read-only projection for UI, tests, debugging
runtime.restore(JSON.parse(JSON.stringify(runtime.snapshot())))
```

- Ticking a schedule whose systems need a resource, service or machine the runtime wasn't given is a compile error. `tryTick` is the checked-at-runtime path for tools (devtools sessions) that hold schedules whose types were erased; games use `tick`.
- Resources with constructed descriptors take raw input, and `make` then returns a `Result`.
- Snapshots are plain data. `restore` validates untrusted input and leaves the world unchanged on failure.
- `snapshot` and `restore` only compile when every component and resource is transient or constructed with a validator that accepts untrusted input (`result(raw: unknown)`, or a `decode` such as `Vector2.decode`), so nothing unvalidated can load. Stored handles are validated with `Decode.handle(Root, Intent)`.

## Packages

| Package | What it owns |
|---|---|
| `@typeonce/ritmo` | Schema, systems, schedules, runtime, snapshots |
| `@typeonce/ritmo-math` | Validated `Scalar`, `Vector2`, `Size2`, `Aabb`, `InputAxis`; hot-path `Vec2`, `Box2`, `Collide2`, `SpatialGrid`, `FlowField`, `Random` |
| `@typeonce/ritmo-browser` | `FixedLoop` timing, `Keyboard` action input, `InputCapture` into resources |
| `@typeonce/ritmo-render` | `NodeRegistry` and `RenderSync` (with `redrawOn`) for mirroring entities into any renderer |
| `@typeonce/ritmo-pixi` | `PixiNodeRegistry.make` for Pixi containers |

Next: [GAME_API.md](./GAME_API.md) for a larger walkthrough, [ARCHITECTURE.md](./ARCHITECTURE.md) for how the types and storage work.
