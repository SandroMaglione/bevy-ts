# bevy-ts in 5 minutes

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
- `Descriptor.Component<T>()` declares a plain component. `Descriptor.ConstructedComponent(validator)` attaches a validating constructor (`{ result: (raw) => Result }`), used for raw input and when loading saves. `@typeonce/bevy-ts-math` provides `Vector2`, `Size2`, `Aabb` and `Scalar`. `Decode` has ready-made validators (`number`, `integer`, `string`, `boolean`, `literal`, `nullable`, `array`, `struct`, `handle`), `Descriptor.Tag("Player")` declares a marker component, and `Descriptor.fromStandardSchema(schema)` adapts any Standard Schema validator (ArkType, Effect Schema, Zod, Valibot).
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
- Split large games into several `Schema.fragment(...)` values, or use `Schema.Feature` to bundle a fragment with its schedules.

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
- Values from `get()` are `ReadonlyValue<T>`. Type helpers that receive them as `ReadonlyValue<T>` (from `@typeonce/bevy-ts/Query`), not `T`, so a config resource or component value passes straight in without a cast: `const spawnRate = (tuning: ReadonlyValue<Tuning>) => ...`.
- Queries also take `with`, `without`, `optional(...)`, relation selections, and the change filters described in section 8.
- Query results come back in spawn order.

## 4. Structural changes are commands

```ts
const Spawn = Game.System("Concepts/Spawn", {}, ({ commands }) => {
  const enemy = commands.spawn(Game.Command.spawn([Health, 3], [Position, { x: 10, y: 0 }]))
  commands.spawn(Game.Command.relate(Game.Command.spawn([Health, 1]), ChildOf, enemy))
})
```

- `commands` covers spawn, insert, remove, despawn, relate, and scope-based cleanup (`spawnIn` / `despawnScope`).
- Commands are applied only when a schedule reaches `applyDeferred()`. `commands.spawn` returns the entity id immediately.
- `Game.Command.spawn(...)` returns a draft, or a `Result` of one if any entry can fail validation (for example `Game.Command.entryRaw(Position, raw)`).

## 5. Handles outlive frames; resolving them is explicit

```ts
const Target = Descriptor.Component<{ readonly enemy: Entity.Handle<typeof Root, typeof Health> }>()("Concepts/Target")
// ...
const enemy = lookup.getHandle(data.target.get().enemy, HealthQuery)
if (enemy.ok) { /* the entity still exists and has Health */ }
```

- A handle is safe to store in components, resources and events, but it doesn't prove the entity is still alive.
- `lookup.getHandle` returns a `Result`.
- A handle with an intent (`Health` here) can only be resolved through a query that proves that component.

## 6. Events are read once per reader

- A system's events are published when it completes; a failed system publishes nothing.
- Each reader sees the events published since its own previous run, once, in order: from earlier systems in this schedule, and from anything that ran after it last time.
- Events wait for every system that reads them, so a fixed-rate schedule ticked less often than rendering still sees everything. A system skipped by its run conditions discards the events published meanwhile. If a reader stops running long enough to overflow the stream's capacity, it sees `lagged() === true`.

## 7. Expected failures are typed and roll back

```ts
if (total > 100) {
  return Fx.fail("ImpossibleDamage" as const)
}
resources.score.update((score) => score + total)
```

- A system that can't fail returns nothing. A system that returns `Fx.fail(...)` has its ECS writes rolled back and its commands dropped.
- `runtime.tick(...)` returns `Result<void, SystemFailure<"Concepts/ApplyHits", "ImpossibleDamage">>`, a union built from every system in the schedule.
- Thrown exceptions are treated as bugs: the system's writes are rolled back and the exception is rethrown.

## 8. Change detection is per system

```ts
filters: [Game.Query.changed(Position)]
```

- `added(...)` and `changed(...)` match what happened since this system's previous run. Every system sees each change exactly once, independently of other systems.
- A system's first run sees everything that already exists as added.
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
Game.Schedule.when([Game.Condition.not(frozen)], Move, Attack)
```

Per-entity modes (an enemy's attack phase, a door's open/closed) are components, not machines. `Descriptor.State` makes one from a closed set of states and an optional graph of allowed moves:

```ts
const Phase = Descriptor.State("Phase", ["ready", "windup", "active"] as const, {
  transitions: { ready: ["windup"], windup: ["active", "ready"], active: ["ready"] }
})
Game.Command.spawn([Phase, "ready"])
// write slot `phase`:
const moved = data.phase.transition("windup", "active") // "ready" -> "active" does not compile
if (!moved.ok) moved.error.actual // some earlier write already changed the phase
```

- It is an ordinary component: queried, change-detected, rolled back, and validated on restore (unknown states are rejected).
- `transition(from, to)` writes immediately, and only while the state is still `from`. Otherwise it returns `StateMismatch` and writes nothing. The graph lists every state (`[]` for one with no way out), and it is checked at compile time only. `set` still writes any state.
- There are no per-state schedules or filters. Branch on `get()` in the system that owns the component, and emit an event on a transition that other systems react to.

## 10. Schedules make every boundary visible

```ts
const update = Game.Schedule(Move, Attack, ApplyHits, Game.Schedule.applyStateTransitions(), Report)
```

- Steps run in the order written. Nested schedules are flattened in place.
- Only markers apply queued work: `applyDeferred` (commands) and `applyStateTransitions` (commands, then machine transitions). Reads (change detection, events, relation failures) are per system and need no marker.
- Nothing is flushed when a schedule ends.

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

- Ticking a schedule whose systems need a resource, service or machine the runtime wasn't given is a compile error. `tryTick` is the checked-at-runtime path for schedules whose types were lost.
- Resources with constructed descriptors take raw input, and `make` then returns a `Result`.
- Snapshots are plain data. `restore` validates untrusted input and leaves the world unchanged on failure.
- `snapshot` and `restore` only compile when every component and resource is transient or constructed with a validator that accepts untrusted input (`result(raw: unknown)`, or a `decode` such as `Vector2.decode`), so nothing unvalidated can load. Stored handles are validated with `Decode.handle(Root, Intent)`.

## Packages

| Package | What it owns |
|---|---|
| `@typeonce/bevy-ts` | Schema, systems, schedules, runtime, snapshots |
| `@typeonce/bevy-ts-math` | Validated `Scalar`, `Vector2`, `Size2`, `Aabb`, `InputAxis` |
| `@typeonce/bevy-ts-browser` | `FixedLoop` timing, `Keyboard` action input, `InputCapture` into resources |
| `@typeonce/bevy-ts-pixi` | `NodeRegistry` and `RenderSync` (with `redrawOn`) for mirroring entities into Pixi |

Next: [GAME_API.md](./GAME_API.md) for a larger walkthrough, [ARCHITECTURE.md](./ARCHITECTURE.md) for how the types and storage work.
