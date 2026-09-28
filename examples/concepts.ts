/**
 * The program behind CONCEPTS.md. It is typechecked with the repository and
 * run by `packages/core/test/Concepts.test.ts`, so the guide cannot drift from
 * the API.
 */
import { Descriptor, Entity, Fx, Result, Schema } from "@bevy-ts/core"

// 1. Descriptors name the data a world can hold. Constructed descriptors carry
//    a validator, so values loaded from a save are checked; transient ones are
//    never saved. (Any Standard Schema validator works through
//    `Descriptor.fromStandardSchema(...)`.)
const Root = Schema.defineRoot("Concepts")
const isRecord = (raw: unknown): raw is Record<string, unknown> => typeof raw === "object" && raw !== null
const number = { result: (raw: unknown) => typeof raw === "number" ? Result.success(raw) : Result.failure("NotANumber" as const) }
const vector = {
  result: (raw: unknown) =>
    isRecord(raw) && typeof raw["x"] === "number" && typeof raw["y"] === "number"
      ? Result.success({ x: raw["x"], y: raw["y"] })
      : Result.failure("NotAVector" as const)
}
const Position = Descriptor.ConstructedComponent(vector)("Concepts/Position")
const Velocity = Descriptor.ConstructedComponent(vector)("Concepts/Velocity")
const Health = Descriptor.ConstructedComponent(number)("Concepts/Health")
const Target = Descriptor.ConstructedComponent({
  result: (raw: unknown) => {
    const enemy = Entity.decodeHandle(Root, isRecord(raw) ? raw["enemy"] : undefined, Health)
    return enemy.ok ? Result.success({ enemy: enemy.value }) : enemy
  }
})("Concepts/Target")
const DeltaTime = Descriptor.TransientResource<number>()("Concepts/DeltaTime")
const Score = Descriptor.ConstructedResource(number)("Concepts/Score")
const Hit = Descriptor.Event<{ readonly amount: number }>()("Concepts/Hit")
const Log = Descriptor.Service<{ readonly write: (line: string) => void }>()("Concepts/Log")
const { relation: ChildOf } = Descriptor.Hierarchy("Concepts/ChildOf", "Concepts/Children")

// 2. A schema closes the world; binding it gives the typed `Game` API.
export const Game = Schema.bind(Schema.fragment({
  components: { Position, Velocity, Health, Target },
  resources: { DeltaTime, Score },
  events: { Hit },
  relations: { ChildOf }
}), Root)

// 3. State machines model modes whose transitions matter.
const Flow = Game.StateMachine("Concepts/Flow", ["Playing", "Won"])

// 4. Systems declare everything they touch; the callback sees nothing else.
const Moving = Game.Query({
  selection: { position: Game.Query.write(Position), velocity: Game.Query.read(Velocity) }
})

const Move = Game.System("Concepts/Move", {
  queries: { moving: Moving },
  resources: { dt: Game.System.readResource(DeltaTime) }
}, ({ queries, resources }) => {
  const dt = resources.dt.get()
  for (const { data } of queries.moving.each()) {
    const velocity = data.velocity.get()
    data.position.update((position) => ({ x: position.x + velocity.x * dt, y: position.y + velocity.y * dt }))
  }
})

// 5. Structural changes are commands, applied at `applyDeferred()`.
const Spawn = Game.System("Concepts/Spawn", {}, ({ commands }) => {
  const enemy = commands.spawn(Game.Command.spawn([Health, 3], [Position, { x: 10, y: 0 }]))
  commands.spawn(Game.Command.spawn(
    [Position, { x: 0, y: 0 }],
    [Velocity, { x: 1, y: 0 }],
    [Target, { enemy: Game.Entity.handle(enemy, Health) }]
  ))
  commands.spawn(Game.Command.relate(Game.Command.spawn([Health, 1]), ChildOf, enemy))
})

// 6. Handles are storage-safe; resolving one is explicit and can fail.
const Attack = Game.System("Concepts/Attack", {
  queries: { attackers: Game.Query({ selection: { target: Game.Query.read(Target) } }) },
  events: { hit: Game.System.writeEvent(Hit) }
}, ({ queries, lookup, events }) => {
  for (const { data } of queries.attackers.each()) {
    const enemy = lookup.getHandle(data.target.get().enemy, Game.Query({ selection: { health: Game.Query.read(Health) } }))
    if (enemy.ok) {
      events.hit.emit({ amount: 1 })
    }
  }
})

// 7. Expected failures are typed and roll the system back.
const ApplyHits = Game.System("Concepts/ApplyHits", {
  events: { hit: Game.System.readEvent(Hit) },
  resources: { score: Game.System.writeResource(Score) },
  nextMachines: { flow: Game.System.nextState(Flow) }
}, ({ events, resources, nextMachines }) => {
  const total = events.hit.all().reduce((sum, hit) => sum + hit.amount, 0)
  if (total > 100) {
    return Fx.fail("ImpossibleDamage" as const)
  }
  resources.score.update((score) => score + total)
  if (resources.score.get() >= 3) {
    nextMachines.flow.set("Won")
  }
})

// 8. Change detection is per system: each run sees changes since its last run.
const Report = Game.System("Concepts/Report", {
  queries: { moved: Game.Query({ selection: { position: Game.Query.read(Position) }, filters: [Game.Query.changed(Position)] }) },
  machines: { flow: Game.System.machine(Flow) },
  services: { log: Game.System.service(Log) }
}, ({ queries, machines, services }) => {
  services.log.write(`${machines.flow.get()}: ${queries.moved.each().length} moved`)
})

// 9. Schedules order systems and make every visibility boundary explicit.
export const setup = Game.Schedule(Spawn, Game.Schedule.applyDeferred())
export const update = Game.Schedule(
  Move,
  Attack,
  ApplyHits,
  Game.Schedule.applyStateTransitions(),
  Report
)

// 10. The runtime owns the world; the host drives it.
export const runConcepts = (frames: number): { readonly log: ReadonlyArray<string>; readonly failure: string | undefined } => {
  const log: Array<string> = []
  // Constructed resources are validated here, so making the runtime can fail.
  const made = Game.Runtime.make({
    services: Game.Runtime.services(Game.Runtime.service(Log, { write: (line) => log.push(line) })),
    resources: { DeltaTime: 1, Score: 0 },
    machines: Game.Runtime.machines(Game.Runtime.machine(Flow, "Playing"))
  })
  if (!made.ok) {
    return { log, failure: "InvalidResources" }
  }
  const runtime = made.value

  runtime.tick(setup)
  for (let frame = 0; frame < frames; frame++) {
    const result = runtime.tick(update)
    if (!result.ok) {
      return { log, failure: `${result.error.system}: ${result.error.error}` }
    }
  }

  const saved = JSON.stringify(runtime.snapshot())
  const restored = runtime.restore(JSON.parse(saved))
  return { log, failure: restored.ok ? undefined : restored.error._tag }
}
