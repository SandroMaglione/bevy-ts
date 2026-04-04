import { describe, expect, it } from "vitest"
import { Descriptor, Fx, Schema } from "../src/index.ts"
import * as Entity from "../src/entity.ts"
import { readResourceValue } from "./utils/fixtures.ts"

const Position = Descriptor.Component<{ x: number; y: number }>()("LifecyclePosition")

const AddedBefore = Descriptor.Resource<number>()("AddedBefore")
const AddedAfter = Descriptor.Resource<number>()("AddedAfter")
const ChangedBefore = Descriptor.Resource<number>()("ChangedBefore")
const ChangedAfter = Descriptor.Resource<number>()("ChangedAfter")
const RemovedBefore = Descriptor.Resource<number>()("RemovedBefore")
const RemovedAfter = Descriptor.Resource<number>()("RemovedAfter")
const DespawnedBefore = Descriptor.Resource<number>()("DespawnedBefore")
const DespawnedAfter = Descriptor.Resource<number>()("DespawnedAfter")

const schema = Schema.build(Schema.fragment({
  components: {
    Position
  },
  resources: {
    AddedBefore,
    AddedAfter,
    ChangedBefore,
    ChangedAfter,
    RemovedBefore,
    RemovedAfter,
    DespawnedBefore,
    DespawnedAfter
  }
}))

const Game = Schema.bind(schema)

const makeRuntime = () => Game.Runtime.make({
  services: Game.Runtime.services(),
  resources: {
    AddedBefore: 0,
    AddedAfter: 0,
    ChangedBefore: 0,
    ChangedAfter: 0,
    RemovedBefore: 0,
    RemovedAfter: 0,
    DespawnedBefore: 0,
    DespawnedAfter: 0
  }
})

describe("Runtime lifecycle", () => {
  it("added and changed filters become visible only after updateLifecycle()", () => {
    const SpawnSystem = Game.System(
      "Lifecycle/Spawn",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          commands.spawn(Game.Command.spawnWith(
            [Position, { x: 1, y: 2 }]
          ))
        })
    )

    const ObserveBeforeSystem = Game.System(
      "Lifecycle/ObserveBefore",
      {
        queries: {
          added: Game.Query({
            selection: {
              position: Game.Query.read(Position)
            },
            filters: [Game.Query.added(Position)] as const
          }),
          changed: Game.Query({
            selection: {
              position: Game.Query.read(Position)
            },
            filters: [Game.Query.changed(Position)] as const
          })
        },
        resources: {
          addedBefore: Game.System.writeResource(AddedBefore),
          changedBefore: Game.System.writeResource(ChangedBefore)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          resources.addedBefore.set(queries.added.each().length)
          resources.changedBefore.set(queries.changed.each().length)
        })
    )

    const ObserveAfterSystem = Game.System(
      "Lifecycle/ObserveAfter",
      {
        queries: {
          added: Game.Query({
            selection: {
              position: Game.Query.read(Position)
            },
            filters: [Game.Query.added(Position)] as const
          }),
          changed: Game.Query({
            selection: {
              position: Game.Query.read(Position)
            },
            filters: [Game.Query.changed(Position)] as const
          })
        },
        resources: {
          addedAfter: Game.System.writeResource(AddedAfter),
          changedAfter: Game.System.writeResource(ChangedAfter)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          resources.addedAfter.set(queries.added.each().length)
          resources.changedAfter.set(queries.changed.each().length)
        })
    )

    const runtime = makeRuntime()
    const lifecycleSchedule = Game.Schedule(
      SpawnSystem,
      Game.Schedule.applyDeferred(),
      ObserveBeforeSystem,
      Game.Schedule.updateLifecycle(),
      ObserveAfterSystem
    )
    runtime.runSchedule(lifecycleSchedule)

    expect(readResourceValue(runtime, schema, AddedBefore)).toBe(0)
    expect(readResourceValue(runtime, schema, ChangedBefore)).toBe(0)
    expect(readResourceValue(runtime, schema, AddedAfter)).toBe(1)
    expect(readResourceValue(runtime, schema, ChangedAfter)).toBe(1)
  })

  it("removed and despawned streams become visible only after updateLifecycle()", () => {
    let removableId: number | undefined
    let doomedId: number | undefined

    const SpawnSystem = Game.System(
      "Lifecycle/SpawnForRemoval",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          removableId = commands.spawn(Game.Command.spawnWith(
            [Position, { x: 1, y: 1 }]
          )).value
          doomedId = commands.spawn(Game.Command.spawnWith(
            [Position, { x: 2, y: 2 }]
          )).value
        })
    )

    const CleanupSystem = Game.System(
      "Lifecycle/Cleanup",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          if (!removableId || !doomedId) {
            return
          }
          commands.remove(
            Entity.makeEntityId<typeof schema, typeof schema>(removableId),
            Position
          )
          commands.despawn(
            Entity.makeEntityId<typeof schema, typeof schema>(doomedId)
          )
        })
    )

    const ObserveBeforeSystem = Game.System(
      "Lifecycle/ObserveRemovalBefore",
      {
        removed: {
          positions: Game.System.readRemoved(Position)
        },
        despawned: {
          entities: Game.System.readDespawned()
        },
        resources: {
          removedBefore: Game.System.writeResource(RemovedBefore),
          despawnedBefore: Game.System.writeResource(DespawnedBefore)
        }
      },
      ({ removed, despawned, resources }) =>
        Fx.sync(() => {
          resources.removedBefore.set(removed.positions.all().length)
          resources.despawnedBefore.set(despawned.entities.all().length)
        })
    )

    const ObserveAfterSystem = Game.System(
      "Lifecycle/ObserveRemovalAfter",
      {
        removed: {
          positions: Game.System.readRemoved(Position)
        },
        despawned: {
          entities: Game.System.readDespawned()
        },
        resources: {
          removedAfter: Game.System.writeResource(RemovedAfter),
          despawnedAfter: Game.System.writeResource(DespawnedAfter)
        }
      },
      ({ removed, despawned, resources }) =>
        Fx.sync(() => {
          resources.removedAfter.set(removed.positions.all().length)
          resources.despawnedAfter.set(despawned.entities.all().length)
        })
    )

    const runtime = makeRuntime()
    const spawnSchedule = Game.Schedule(SpawnSystem, Game.Schedule.applyDeferred(), Game.Schedule.updateLifecycle())
    const observeSchedule = Game.Schedule(
      CleanupSystem,
      Game.Schedule.applyDeferred(),
      ObserveBeforeSystem,
      Game.Schedule.updateLifecycle(),
      ObserveAfterSystem
    )
    runtime.tick(spawnSchedule, observeSchedule)

    expect(readResourceValue(runtime, schema, RemovedBefore)).toBe(0)
    expect(readResourceValue(runtime, schema, DespawnedBefore)).toBe(0)
    expect(readResourceValue(runtime, schema, RemovedAfter)).toBe(2)
    expect(readResourceValue(runtime, schema, DespawnedAfter)).toBe(1)
  })

  it("refreshes readable lifecycle buffers instead of accumulating stale entries", () => {
    const SpawnSystem = Game.System(
      "Lifecycle/SpawnRefresh",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          commands.spawn(Game.Command.spawnWith(
            [Position, { x: 3, y: 4 }]
          ))
        })
    )

    const ObserveChanged = Game.System(
      "Lifecycle/ObserveRefresh",
      {
        queries: {
          added: Game.Query({
            selection: {
              position: Game.Query.read(Position)
            },
            filters: [Game.Query.added(Position)] as const
          }),
          changed: Game.Query({
            selection: {
              position: Game.Query.read(Position)
            },
            filters: [Game.Query.changed(Position)] as const
          })
        },
        resources: {
          addedAfter: Game.System.writeResource(AddedAfter),
          changedAfter: Game.System.writeResource(ChangedAfter)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          resources.addedAfter.set(queries.added.each().length)
          resources.changedAfter.set(queries.changed.each().length)
        })
    )

    const runtime = makeRuntime()
    const spawnSchedule = Game.Schedule(SpawnSystem, Game.Schedule.applyDeferred(), Game.Schedule.updateLifecycle())
    const clearSchedule = Game.Schedule(ObserveChanged)
    runtime.tick(spawnSchedule, clearSchedule)

    expect(readResourceValue(runtime, schema, AddedAfter)).toBe(1)
    expect(readResourceValue(runtime, schema, ChangedAfter)).toBe(1)

    const refreshSchedule = Game.Schedule(Game.Schedule.updateLifecycle(), ObserveChanged)
    runtime.runSchedule(refreshSchedule)

    expect(readResourceValue(runtime, schema, AddedAfter)).toBe(0)
    expect(readResourceValue(runtime, schema, ChangedAfter)).toBe(0)
  })

  it("treats overwrite inserts on existing components as changed after updateLifecycle()", () => {
    let existingId: number | undefined

    const SpawnSystem = Game.System(
      "Lifecycle/SpawnForOverwrite",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          existingId = commands.spawn(Game.Command.spawnWith(
            [Position, { x: 1, y: 1 }]
          )).value
        })
    )

    const OverwriteSystem = Game.System(
      "Lifecycle/OverwriteExisting",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          if (!existingId) {
            return
          }
          commands.insert(
            Entity.makeEntityId<typeof schema, typeof schema>(existingId),
            Position,
            { x: 9, y: 9 }
          )
        })
    )

    const ObserveBeforeSystem = Game.System(
      "Lifecycle/ObserveOverwriteBefore",
      {
        queries: {
          changed: Game.Query({
            selection: {
              position: Game.Query.read(Position)
            },
            filters: [Game.Query.changed(Position)] as const
          })
        },
        resources: {
          changedBefore: Game.System.writeResource(ChangedBefore)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          resources.changedBefore.set(queries.changed.each().length)
        })
    )

    const ObserveAfterSystem = Game.System(
      "Lifecycle/ObserveOverwriteAfter",
      {
        queries: {
          changed: Game.Query({
            selection: {
              position: Game.Query.read(Position)
            },
            filters: [Game.Query.changed(Position)] as const
          })
        },
        resources: {
          changedAfter: Game.System.writeResource(ChangedAfter)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          resources.changedAfter.set(queries.changed.each().length)
        })
    )

    const runtime = makeRuntime()
    const spawnSchedule = Game.Schedule(SpawnSystem, Game.Schedule.applyDeferred(), Game.Schedule.updateLifecycle())
    const observeSchedule = Game.Schedule(
      Game.Schedule.updateLifecycle(),
      OverwriteSystem,
      Game.Schedule.applyDeferred(),
      ObserveBeforeSystem,
      Game.Schedule.updateLifecycle(),
      ObserveAfterSystem
    )
    runtime.tick(spawnSchedule, observeSchedule)

    expect(readResourceValue(runtime, schema, ChangedBefore)).toBe(0)
    expect(readResourceValue(runtime, schema, ChangedAfter)).toBe(1)
  })
})
