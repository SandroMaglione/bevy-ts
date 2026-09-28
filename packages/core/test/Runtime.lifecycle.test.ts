import { describe, expect, it } from "vitest"
import { Descriptor, Fx, Schema } from "@typeonce/bevy-ts"
import type * as Entity from "@typeonce/bevy-ts/Entity"

const Position = Descriptor.Component<{ x: number }>()("Lifecycle/Position")
const Tag = Descriptor.Component<{}>()("Lifecycle/Tag")

const Game = Schema.bind(Schema.fragment({ components: { Position, Tag } }))

type Id = Entity.EntityId<typeof Game.schema, typeof Game.schema>

const makeRuntime = () => Game.Runtime.make({ services: Game.Runtime.services() })

const Added = Game.Query({ selection: { position: Game.Query.read(Position) }, filters: [Game.Query.added(Position)] })
const Changed = Game.Query({ selection: { position: Game.Query.read(Position) }, filters: [Game.Query.changed(Position)] })
const Positions = Game.Query({ selection: { position: Game.Query.write(Position) } })

/**
 * A system that records what its `added` and `changed` queries saw on each run.
 */
const observer = (name: string) => {
  const runs: Array<{ added: Array<number>; changed: Array<number> }> = []
  const system = Game.System(name, { queries: { added: Added, changed: Changed } }, ({ queries }) => {
    runs.push({
      added: queries.added.each().map((match) => match.data.position.get().x),
      changed: queries.changed.each().map((match) => match.data.position.get().x)
    })
  })
  return { system, runs }
}

const spawner = (values: ReadonlyArray<number>, ids: Array<Id> = []) =>
  Game.System("Lifecycle/Spawn", {}, ({ commands }) => {
    for (const x of values) {
      ids.push(commands.spawn(Game.Command.spawn([Position, { x }])))
    }
  })

describe("Runtime change detection", () => {
  it("shows each addition to each system exactly once, after the commands are applied", () => {
    const before = observer("Lifecycle/Before")
    const after = observer("Lifecycle/After")
    const runtime = makeRuntime()

    runtime.tick(Game.Schedule(before.system, spawner([1]), Game.Schedule.applyDeferred(), after.system))
    runtime.tick(Game.Schedule(before.system, after.system))

    // `before` ran ahead of the flush on the first tick, so it sees the addition on its next run.
    expect(before.runs.map((run) => run.added)).toEqual([[], [1]])
    expect(after.runs.map((run) => run.added)).toEqual([[1], []])
  })

  it("gives independent readers their own view of the same changes", () => {
    const first = observer("Lifecycle/First")
    const second = observer("Lifecycle/Second")
    const Move = Game.System("Lifecycle/Move", { queries: { positions: Positions } }, ({ queries }) => {
      for (const { data } of queries.positions.each()) {
        data.position.update((position) => ({ x: position.x + 10 }))
      }
    })
    const runtime = makeRuntime()
    runtime.tick(Game.Schedule(spawner([1]), Game.Schedule.applyDeferred(), first.system))

    runtime.tick(Game.Schedule(Move, first.system))
    runtime.tick(Game.Schedule(second.system))
    runtime.tick(Game.Schedule(first.system, second.system))

    expect(first.runs.map((run) => run.changed)).toEqual([[1], [11], []])
    // `second` first runs after the move: everything that exists counts as added and changed.
    expect(second.runs.map((run) => run.changed)).toEqual([[11], []])
    expect(second.runs.map((run) => run.added)).toEqual([[11], []])
  })

  it("counts an insert over an existing component as changed, not added", () => {
    const ids: Array<Id> = []
    const reader = observer("Lifecycle/Reader")
    const Overwrite = Game.System("Lifecycle/Overwrite", {}, ({ commands }) => {
      commands.insert(ids[0]!, [Position, { x: 9 }])
    })
    const runtime = makeRuntime()
    runtime.tick(Game.Schedule(spawner([1], ids), Game.Schedule.applyDeferred(), reader.system))
    runtime.tick(Game.Schedule(Overwrite, Game.Schedule.applyDeferred(), reader.system))

    expect(reader.runs[1]).toEqual({ added: [], changed: [9] })
  })

  it("does not report writes from a system whose run failed", () => {
    const reader = observer("Lifecycle/FailureReader")
    const Failing = Game.System("Lifecycle/Failing", { queries: { positions: Positions } }, ({ queries }) => {
      for (const { data } of queries.positions.each()) {
        data.position.set({ x: 100 })
      }
      return Fx.fail("Rejected" as const)
    })
    const runtime = makeRuntime()
    runtime.tick(Game.Schedule(spawner([1]), Game.Schedule.applyDeferred(), reader.system))

    const result = runtime.tick(Game.Schedule(Failing))
    runtime.tick(Game.Schedule(reader.system))

    expect(result.ok).toBe(false)
    expect(reader.runs[1]).toEqual({ added: [], changed: [] })
  })

  it("shows removed components and despawned entities to each reader once", () => {
    const ids: Array<Id> = []
    const seen: Array<{ removed: Array<number>; despawned: Array<number> }> = []
    const Reader = Game.System("Lifecycle/RemovalReader", {
      removed: { positions: Game.System.readRemoved(Position) },
      despawned: { entities: Game.System.readDespawned() }
    }, ({ removed, despawned }) => {
      seen.push({
        removed: removed.positions.all().map((id) => id.value),
        despawned: despawned.entities.all().map((id) => id.value)
      })
    })
    const Cleanup = Game.System("Lifecycle/Cleanup", {}, ({ commands }) => {
      commands.remove(ids[0]!, Position)
      commands.despawn(ids[1]!)
    })
    const runtime = makeRuntime()
    runtime.tick(Game.Schedule(spawner([1, 2], ids), Game.Schedule.applyDeferred(), Reader))

    runtime.tick(Game.Schedule(Cleanup, Reader))
    runtime.tick(Game.Schedule(Game.Schedule.applyDeferred(), Reader))
    runtime.tick(Game.Schedule(Reader))

    expect(seen).toEqual([
      { removed: [], despawned: [] },
      // The cleanup commands stay pending until the next applyDeferred().
      { removed: [], despawned: [] },
      { removed: [ids[0]!.value, ids[1]!.value], despawned: [ids[1]!.value] },
      { removed: [], despawned: [] }
    ])
  })

  it("holds removal records until every reading system has run, for schedules ticked at different rates", () => {
    const ids: Array<Id> = []
    const seen: Array<{ removed: Array<number>; despawned: Array<number> }> = []
    const Reader = Game.System("Lifecycle/SlowReader", {
      removed: { positions: Game.System.readRemoved(Position) },
      despawned: { entities: Game.System.readDespawned() }
    }, ({ removed, despawned }) => {
      seen.push({
        removed: removed.positions.all().map((id) => id.value),
        despawned: despawned.entities.all().map((id) => id.value)
      })
    })
    let next = 0
    const DespawnNext = Game.System("Lifecycle/DespawnNext", {}, ({ commands }) => {
      commands.despawn(ids[next++]!)
    })
    const runtime = makeRuntime()
    runtime.tick(Game.Schedule(spawner([1, 2, 3, 4], ids), Game.Schedule.applyDeferred(), Reader))

    // A fixed update despawning once per tick, ticked four times per render.
    const fixed = Game.Schedule(DespawnNext, Game.Schedule.applyDeferred())
    for (let step = 0; step < 4; step++) runtime.tick(fixed)
    runtime.tick(Game.Schedule(Reader))
    runtime.tick(Game.Schedule(Reader))

    const all = ids.map((id) => id.value)
    expect(seen).toEqual([
      { removed: [], despawned: [] },
      { removed: all, despawned: all },
      { removed: [], despawned: [] }
    ])
  })

  it("keeps removal records while a reader is skipped by its run conditions", () => {
    const Flow = Game.StateMachine("Lifecycle/Flow", ["On", "Off"])
    const ids: Array<Id> = []
    const seen: Array<Array<number>> = []
    const Reader = Game.System("Lifecycle/GatedReader", {
      despawned: { entities: Game.System.readDespawned() },
      when: [Game.Condition.inState(Flow, "On")]
    }, ({ despawned }) => {
      seen.push(despawned.entities.all().map((id) => id.value))
    })
    const Toggle = Game.System("Lifecycle/Toggle", { machines: { flow: Game.System.machine(Flow) }, nextMachines: { flow: Game.System.nextState(Flow) } }, ({ machines, nextMachines }) => {
      nextMachines.flow.set(machines.flow.get() === "On" ? "Off" : "On")
    })
    const Despawn = Game.System("Lifecycle/DespawnAll", {}, ({ commands }) => {
      for (const id of ids) commands.despawn(id)
    })
    const runtime = Game.Runtime.make({
      services: Game.Runtime.services(),
      machines: Game.Runtime.machines(Game.Runtime.machine(Flow, "On"))
    })
    runtime.tick(Game.Schedule(spawner([1], ids), Game.Schedule.applyDeferred(), Reader))
    runtime.tick(Game.Schedule(Toggle, Game.Schedule.applyStateTransitions()))
    runtime.tick(Game.Schedule(Despawn, Game.Schedule.applyDeferred(), Reader))
    runtime.tick(Game.Schedule(Reader))
    runtime.tick(Game.Schedule(Reader))
    runtime.tick(Game.Schedule(Toggle, Game.Schedule.applyStateTransitions(), Reader))

    expect(seen).toEqual([[], [ids[0]!.value]])
  })
})
