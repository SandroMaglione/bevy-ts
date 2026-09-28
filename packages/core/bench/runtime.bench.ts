/**
 * Runtime benchmark cases.
 *
 * Cases use only the public API so they keep measuring the same user-visible
 * work while the storage and scheduling internals change underneath.
 *
 * Every case is sized so one `run()` takes roughly 0.1–20 ms on a laptop. The
 * `calibration` case is plain JavaScript work used to normalize scores across
 * machines (see `scripts/bench.ts`).
 */
import { Descriptor, Fx, Schema } from "@bevy-ts/core"
import type * as Entity from "@bevy-ts/core/entity"
import type { BenchCase } from "./harness.ts"

const N = 10_000

type Vec = { x: number; y: number }

const Position = Descriptor.Component<Vec>()("Bench/Position")
const Velocity = Descriptor.Component<Vec>()("Bench/Velocity")
const Health = Descriptor.Component<number>()("Bench/Health")
const Static = Descriptor.Component<{}>()("Bench/Static")
const Player = Descriptor.Component<{}>()("Bench/Player")
const Hot = Descriptor.Component<{}>()("Bench/Hot")
const Marker = Descriptor.Component<{}>()("Bench/Marker")
const Sum = Descriptor.Resource<number>()("Bench/Sum")
const Ping = Descriptor.Event<number>()("Bench/Ping")
const { relation: ChildOf } = Descriptor.Hierarchy("Bench/ChildOf", "Bench/Children")

const Game = Schema.bind(Schema.fragment({
  components: { Position, Velocity, Health, Static, Player, Hot, Marker },
  resources: { Sum },
  events: { Ping },
  relations: { ChildOf }
}))

type Id = Entity.EntityId<typeof Game.schema, typeof Game.schema>

const makeRuntime = () => Game.Runtime.make({
  services: Game.Runtime.services(),
  resources: { Sum: 0 }
})

type BenchRuntime = ReturnType<typeof makeRuntime>

const spawnMovers = (count: number) => Game.System("Bench/SpawnMovers", {}, ({ commands }) => Fx.sync(() => {
  for (let index = 0; index < count; index++) {
    commands.spawn(Game.Command.spawnWith(
      [Position, { x: index, y: index }],
      [Velocity, { x: 1, y: 1 }],
      [Health, 100]
    ))
  }
}))

const spawnStatics = (count: number) => Game.System("Bench/SpawnStatics", {}, ({ commands }) => Fx.sync(() => {
  for (let index = 0; index < count; index++) {
    commands.spawn(Game.Command.spawnWith(
      [Position, { x: index, y: 0 }],
      [Static, {}]
    ))
  }
}))

const populate = (runtime: BenchRuntime, movers: number, statics: number): void => {
  runtime.runSchedule(Game.Schedule(
    spawnMovers(movers),
    spawnStatics(statics),
    Game.Schedule.applyDeferred()
  ))
}

const Movers = Game.Query({
  selection: {
    position: Game.Query.write(Position),
    velocity: Game.Query.read(Velocity)
  }
})

const ReadMovers = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    velocity: Game.Query.read(Velocity)
  }
})

const calibration: BenchCase = {
  name: "calibration",
  description: "Plain JS map/object/array work used to normalize scores across machines",
  setup: () => ({
    run: () => {
      const map = new Map<number, { value: number }>()
      for (let index = 0; index < 50_000; index++) {
        map.set(index, { value: index })
      }
      let total = 0
      for (let index = 0; index < 50_000; index++) {
        total += map.get(index)!.value
      }
      const values: Array<number> = []
      for (const entry of map.values()) {
        values.push(entry.value * 2)
      }
      if (total + values.length < 0) throw new Error("unreachable")
    }
  })
}

const spawn: BenchCase = {
  name: "spawn/10k-3c",
  description: "Spawn 10k entities with 3 components through commands + applyDeferred",
  setup: () => {
    const schedule = Game.Schedule(spawnMovers(N), Game.Schedule.applyDeferred())
    let runtime = makeRuntime()
    return {
      prepare: () => {
        runtime = makeRuntime()
      },
      run: () => runtime.runSchedule(schedule)
    }
  }
}

const despawn: BenchCase = {
  name: "despawn/10k",
  description: "Despawn 10k entities through commands + applyDeferred",
  setup: () => {
    const DespawnAll = Game.System("Bench/DespawnAll", { queries: { movers: ReadMovers } }, ({ queries, commands }) =>
      Fx.sync(() => {
        for (const match of queries.movers.each()) {
          commands.despawn(match.entity.id)
        }
      }))
    const schedule = Game.Schedule(DespawnAll, Game.Schedule.applyDeferred())
    let runtime = makeRuntime()
    return {
      prepare: () => {
        runtime = makeRuntime()
        populate(runtime, N, 0)
      },
      run: () => runtime.runSchedule(schedule)
    }
  }
}

const iterateRead: BenchCase = {
  name: "query/iterate-read-10k-of-20k",
  description: "Read 2 components on 10k matching entities in a 20k-entity world",
  setup: () => {
    const runtime = makeRuntime()
    populate(runtime, N, N)
    const SumPositions = Game.System("Bench/SumPositions", {
      queries: { movers: ReadMovers },
      resources: { sum: Game.System.writeResource(Sum) }
    }, ({ queries, resources }) => Fx.sync(() => {
      let total = 0
      for (const { data } of queries.movers.each()) {
        total += data.position.get().x + data.velocity.get().x
      }
      resources.sum.set(total)
    }))
    const schedule = Game.Schedule(SumPositions)
    return { run: () => runtime.runSchedule(schedule) }
  }
}

const iterateWrite: BenchCase = {
  name: "query/iterate-write-10k",
  description: "Integrate velocity into position on 10k entities",
  setup: () => {
    const runtime = makeRuntime()
    populate(runtime, N, 0)
    const Move = Game.System("Bench/Move", { queries: { movers: Movers } }, ({ queries }) => Fx.sync(() => {
      for (const { data } of queries.movers.each()) {
        const velocity = data.velocity.get()
        data.position.update((position) => ({ x: position.x + velocity.x, y: position.y + velocity.y }))
      }
    }))
    const schedule = Game.Schedule(Move)
    return { run: () => runtime.runSchedule(schedule) }
  }
}

const sparseSingle: BenchCase = {
  name: "query/single-in-20k-x10",
  description: "Resolve a single player entity among 20k entities, 10 schedule runs",
  setup: () => {
    const runtime = makeRuntime()
    populate(runtime, N, N)
    const SpawnPlayer = Game.System("Bench/SpawnPlayer", {}, ({ commands }) => Fx.sync(() => {
      commands.spawn(Game.Command.spawnWith([Position, { x: 0, y: 0 }], [Player, {}]))
    }))
    runtime.runSchedule(Game.Schedule(SpawnPlayer, Game.Schedule.applyDeferred()))
    const PlayerQuery = Game.Query({
      selection: { position: Game.Query.write(Position) },
      with: [Player]
    })
    const MovePlayer = Game.System("Bench/MovePlayer", { queries: { player: PlayerQuery } }, ({ queries }) =>
      Fx.sync(() => {
        const player = queries.player.single()
        if (player.ok) {
          player.value.data.position.update((position) => ({ x: position.x + 1, y: position.y }))
        }
      }))
    const schedule = Game.Schedule(MovePlayer)
    return {
      run: () => {
        for (let index = 0; index < 10; index++) {
          runtime.runSchedule(schedule)
        }
      }
    }
  }
}

const changedFilter: BenchCase = {
  name: "query/changed-100-of-10k",
  description: "Write 100 of 10k positions, advance lifecycle, read the changed set",
  setup: () => {
    const runtime = makeRuntime()
    populate(runtime, N, 0)
    const TagHot = Game.System("Bench/TagHot", { queries: { movers: ReadMovers } }, ({ queries, commands }) =>
      Fx.sync(() => {
        let tagged = 0
        for (const match of queries.movers.each()) {
          if (tagged++ >= 100) break
          commands.insert(match.entity.id, Hot, {})
        }
      }))
    runtime.runSchedule(Game.Schedule(TagHot, Game.Schedule.applyDeferred(), Game.Schedule.updateLifecycle()))
    const Writer = Game.System("Bench/WriteHot", {
      queries: { hot: Game.Query({ selection: { position: Game.Query.write(Position) }, with: [Hot] }) }
    }, ({ queries }) => Fx.sync(() => {
      for (const { data } of queries.hot.each()) {
        data.position.update((position) => ({ x: position.x + 1, y: position.y }))
      }
    }))
    const Reader = Game.System("Bench/ReadChanged", {
      queries: {
        changed: Game.Query({
          selection: { position: Game.Query.read(Position) },
          filters: [Game.Query.changed(Position)]
        })
      },
      resources: { sum: Game.System.writeResource(Sum) }
    }, ({ queries, resources }) => Fx.sync(() => {
      let total = 0
      for (const { data } of queries.changed.each()) {
        total += data.position.get().x
      }
      resources.sum.set(total)
    }))
    const schedule = Game.Schedule(Writer, Game.Schedule.updateLifecycle(), Reader)
    return { run: () => runtime.runSchedule(schedule) }
  }
}

const churn: BenchCase = {
  name: "structural/insert-remove-1k",
  description: "Toggle a marker component on 1k of 10k entities per run",
  setup: () => {
    const runtime = makeRuntime()
    populate(runtime, N, 0)
    const TagHot = Game.System("Bench/TagChurn", { queries: { movers: ReadMovers } }, ({ queries, commands }) =>
      Fx.sync(() => {
        let tagged = 0
        for (const match of queries.movers.each()) {
          if (tagged++ >= 1_000) break
          commands.insert(match.entity.id, Hot, {})
        }
      }))
    runtime.runSchedule(Game.Schedule(TagHot, Game.Schedule.applyDeferred()))
    const Toggle = Game.System("Bench/ToggleMarker", {
      queries: {
        unmarked: Game.Query({ selection: { hot: Game.Query.read(Hot) }, without: [Marker] }),
        marked: Game.Query({ selection: { hot: Game.Query.read(Hot), marker: Game.Query.read(Marker) } })
      }
    }, ({ queries, commands }) => Fx.sync(() => {
      for (const match of queries.unmarked.each()) {
        commands.insert(match.entity.id, Marker, {})
      }
      for (const match of queries.marked.each()) {
        commands.remove(match.entity.id, Marker)
      }
    }))
    const schedule = Game.Schedule(Toggle, Game.Schedule.applyDeferred())
    return { run: () => runtime.runSchedule(schedule) }
  }
}

const scheduleOverhead: BenchCase = {
  name: "schedule/100-systems-x10",
  description: "Run a schedule of 100 small systems (one resource read each) 10 times",
  setup: () => {
    const runtime = makeRuntime()
    const systems = Array.from({ length: 100 }, (_, index) =>
      Game.System(`Bench/Tiny${index}`, { resources: { sum: Game.System.readResource(Sum) } }, ({ resources }) =>
        Fx.sync(() => {
          if (resources.sum.get() < 0) throw new Error("unreachable")
        })))
    const schedule = Game.Schedule(...systems)
    return {
      run: () => {
        for (let index = 0; index < 10; index++) {
          runtime.runSchedule(schedule)
        }
      }
    }
  }
}

const lookupGet: BenchCase = {
  name: "lookup/get-10k",
  description: "Resolve 10k stored entity ids through lookup.get with a 2-component query",
  setup: () => {
    const runtime = makeRuntime()
    const ids: Array<Id> = []
    const SpawnTracked = Game.System("Bench/SpawnTracked", {}, ({ commands }) => Fx.sync(() => {
      for (let index = 0; index < N; index++) {
        ids.push(commands.spawn(Game.Command.spawnWith([Position, { x: index, y: 0 }], [Velocity, { x: 1, y: 0 }])))
      }
    }))
    runtime.runSchedule(Game.Schedule(SpawnTracked, Game.Schedule.applyDeferred()))
    const Resolve = Game.System("Bench/Resolve", { resources: { sum: Game.System.writeResource(Sum) } }, ({ lookup, resources }) =>
      Fx.sync(() => {
        let total = 0
        for (const id of ids) {
          const match = lookup.get(id, ReadMovers)
          if (match.ok) total += match.value.data.position.get().x
        }
        resources.sum.set(total)
      }))
    const schedule = Game.Schedule(Resolve)
    return { run: () => runtime.runSchedule(schedule) }
  }
}

const events: BenchCase = {
  name: "events/emit-read-10k",
  description: "Emit 10k events, advance the event buffer, read them back",
  setup: () => {
    const runtime = makeRuntime()
    const Emit = Game.System("Bench/Emit", { events: { ping: Game.System.writeEvent(Ping) } }, ({ events }) =>
      Fx.sync(() => {
        for (let index = 0; index < N; index++) events.ping.emit(index)
      }))
    const Read = Game.System("Bench/Read", {
      events: { ping: Game.System.readEvent(Ping) },
      resources: { sum: Game.System.writeResource(Sum) }
    }, ({ events, resources }) => Fx.sync(() => {
      let total = 0
      for (const value of events.ping.all()) total += value
      resources.sum.set(total)
    }))
    const schedule = Game.Schedule(Emit, Game.Schedule.updateEvents(), Read)
    return { run: () => runtime.runSchedule(schedule) }
  }
}

const hierarchy: BenchCase = {
  name: "relations/descendants-100x100",
  description: "Traverse descendants of 100 roots with 100 children each",
  setup: () => {
    const runtime = makeRuntime()
    const roots: Array<Id> = []
    const SpawnRoots = Game.System("Bench/SpawnRoots", {}, ({ commands }) => Fx.sync(() => {
      for (let index = 0; index < 100; index++) {
        roots.push(commands.spawn(Game.Command.spawnWith([Position, { x: index, y: 0 }])))
      }
    }))
    const SpawnChildren = Game.System("Bench/SpawnChildren", {}, ({ commands }) => Fx.sync(() => {
      for (const root of roots) {
        for (let index = 0; index < 100; index++) {
          commands.spawn(Game.Command.relate(Game.Command.spawnWith([Health, index]), ChildOf, root))
        }
      }
    }))
    runtime.runSchedule(Game.Schedule(
      SpawnRoots,
      Game.Schedule.applyDeferred(),
      SpawnChildren,
      Game.Schedule.applyDeferred()
    ))
    const Traverse = Game.System("Bench/Traverse", { resources: { sum: Game.System.writeResource(Sum) } }, ({ lookup, resources }) =>
      Fx.sync(() => {
        let total = 0
        for (const root of roots) {
          const descendants = lookup.descendants(root, ChildOf)
          if (descendants.ok) total += descendants.value.length
        }
        resources.sum.set(total)
      }))
    const schedule = Game.Schedule(Traverse)
    return { run: () => runtime.runSchedule(schedule) }
  }
}

export const cases: ReadonlyArray<BenchCase> = [
  calibration,
  spawn,
  despawn,
  iterateRead,
  iterateWrite,
  sparseSingle,
  changedFilter,
  churn,
  scheduleOverhead,
  lookupGet,
  events,
  hierarchy
]
