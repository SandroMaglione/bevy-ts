import { describe, expect, it } from "vitest"
import { Descriptor, Fx, Schema } from "../src/index.ts"
import * as Entity from "../src/entity.ts"
import { readResourceValue } from "./utils/fixtures.ts"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("LifecyclePosition")

const AddedBefore = Descriptor.defineResource<number>()("AddedBefore")
const AddedAfter = Descriptor.defineResource<number>()("AddedAfter")
const ChangedBefore = Descriptor.defineResource<number>()("ChangedBefore")
const ChangedAfter = Descriptor.defineResource<number>()("ChangedAfter")
const RemovedBefore = Descriptor.defineResource<number>()("RemovedBefore")
const RemovedAfter = Descriptor.defineResource<number>()("RemovedAfter")
const DespawnedBefore = Descriptor.defineResource<number>()("DespawnedBefore")
const DespawnedAfter = Descriptor.defineResource<number>()("DespawnedAfter")

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
    const SpawnSystem = Game.System.define(
      "Lifecycle/Spawn",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          commands.spawn(Game.Command.spawnWith(
            [Position, { x: 1, y: 2 }]
          ))
        })
    )

    const ObserveBeforeSystem = Game.System.define(
      "Lifecycle/ObserveBefore",
      {
        queries: {
          added: Game.Query.define({
            selection: {
              position: Game.Query.read(Position)
            },
            filters: [Game.Query.added(Position)] as const
          }),
          changed: Game.Query.define({
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

    const ObserveAfterSystem = Game.System.define(
      "Lifecycle/ObserveAfter",
      {
        queries: {
          added: Game.Query.define({
            selection: {
              position: Game.Query.read(Position)
            },
            filters: [Game.Query.added(Position)] as const
          }),
          changed: Game.Query.define({
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
    runtime.runSchedule(Game.Schedule.define({
      systems: [SpawnSystem, ObserveBeforeSystem, ObserveAfterSystem],
      steps: [
        SpawnSystem,
        Game.Schedule.applyDeferred(),
        ObserveBeforeSystem,
        Game.Schedule.updateLifecycle(),
        ObserveAfterSystem
      ]
    }))

    expect(readResourceValue(runtime, schema, AddedBefore)).toBe(0)
    expect(readResourceValue(runtime, schema, ChangedBefore)).toBe(0)
    expect(readResourceValue(runtime, schema, AddedAfter)).toBe(1)
    expect(readResourceValue(runtime, schema, ChangedAfter)).toBe(1)
  })

  it("removed and despawned streams become visible only after updateLifecycle()", () => {
    let removableId: number | undefined
    let doomedId: number | undefined

    const SpawnSystem = Game.System.define(
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

    const CleanupSystem = Game.System.define(
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

    const ObserveBeforeSystem = Game.System.define(
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

    const ObserveAfterSystem = Game.System.define(
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
    runtime.tick(
      Game.Schedule.define({
        systems: [SpawnSystem],
        steps: [SpawnSystem, Game.Schedule.applyDeferred(), Game.Schedule.updateLifecycle()]
      }),
      Game.Schedule.define({
        systems: [CleanupSystem, ObserveBeforeSystem, ObserveAfterSystem],
        steps: [
          CleanupSystem,
          Game.Schedule.applyDeferred(),
          ObserveBeforeSystem,
          Game.Schedule.updateLifecycle(),
          ObserveAfterSystem
        ]
      })
    )

    expect(readResourceValue(runtime, schema, RemovedBefore)).toBe(0)
    expect(readResourceValue(runtime, schema, DespawnedBefore)).toBe(0)
    expect(readResourceValue(runtime, schema, RemovedAfter)).toBe(2)
    expect(readResourceValue(runtime, schema, DespawnedAfter)).toBe(1)
  })
})
