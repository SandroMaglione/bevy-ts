import { describe, expect, it } from "vitest"
import { Command, Descriptor, Fx, Label, Query, Runtime, Schedule, Schema, System } from "../src/index.ts"
import { readResourceValue } from "./utils/fixtures.ts"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.defineComponent<{ x: number; y: number }>()("Velocity")
const Count = Descriptor.defineResource<number>()("Count")
const LastX = Descriptor.defineResource<number>()("LastX")

const schema = Schema.build(Schema.fragment({
  components: {
    Position,
    Velocity
  },
  resources: {
    Count,
    LastX
  }
}))

const makeRuntime = () =>
  Runtime.makeRuntime({
    schema,
    services: {},
    resources: {
      Count: 0,
      LastX: -1
    }
  })

describe("Runtime commands", () => {
  it("insertMany applies entries in order with last-write-wins semantics", () => {
    const spawn = System.define(
      "RuntimeCommands/SpawnInsertMany",
      {
        schema
      },
      ({ commands }) =>
        Fx.sync(() => {
          const id = commands.spawn(Command.spawnWith<typeof schema>(
            [Position, { x: 0, y: 0 }] as const
          ))
          commands.insertMany(
            id,
            [Position, { x: 1, y: 1 }] as const,
            [Position, { x: 2, y: 2 }] as const,
            [Velocity, { x: 9, y: 9 }] as const
          )
        })
    )

    const observe = System.define(
      "RuntimeCommands/ObserveLastWriteWins",
      {
        schema,
        queries: {
          moving: Query.define({
            selection: {
              position: Query.read(Position),
              velocity: Query.read(Velocity)
            }
          })
        },
        resources: {
          count: System.writeResource(Count),
          lastX: System.writeResource(LastX)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          const result = queries.moving.single()
          resources.count.set(result.ok ? 1 : 0)
          resources.lastX.set(result.ok ? result.value.data.position.get().x : -1)
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.define({
        label: Label.defineScheduleLabel("RuntimeCommands/SpawnInsertManySchedule"),
        schema,
        systems: [spawn]
      }),
      Schedule.define({
        label: Label.defineScheduleLabel("RuntimeCommands/ObserveLastWriteWinsSchedule"),
        schema,
        systems: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, Count)).toBe(1)
    expect(readResourceValue(runtime, schema, LastX)).toBe(2)
  })

  it("remove causes later queries to stop matching", () => {
    const spawn = System.define(
      "RuntimeCommands/SpawnForRemove",
      {
        schema
      },
      ({ commands }) =>
        Fx.sync(() => {
          const id = commands.spawn(Command.spawnWith<typeof schema>(
            [Position, { x: 1, y: 1 }] as const,
            [Velocity, { x: 1, y: 1 }] as const
          ))
          commands.remove(id, Velocity)
        })
    )

    const observe = System.define(
      "RuntimeCommands/ObserveRemove",
      {
        schema,
        queries: {
          moving: Query.define({
            selection: {
              position: Query.read(Position),
              velocity: Query.read(Velocity)
            }
          })
        },
        resources: {
          count: System.writeResource(Count)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          resources.count.set(queries.moving.each().length)
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.define({
        label: Label.defineScheduleLabel("RuntimeCommands/SpawnRemoveSchedule"),
        schema,
        systems: [spawn]
      }),
      Schedule.define({
        label: Label.defineScheduleLabel("RuntimeCommands/ObserveRemoveSchedule"),
        schema,
        systems: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, Count)).toBe(0)
  })

  it("despawn removes the entity and exact lookup reports MissingEntity", () => {
    let storedId: import("../src/entity.ts").EntityId<typeof schema> | undefined

    const spawn = System.define(
      "RuntimeCommands/SpawnAndStoreId",
      {
        schema
      },
      ({ commands }) =>
        Fx.sync(() => {
          const id = commands.spawn(Command.spawnWith<typeof schema>(
            [Position, { x: 1, y: 2 }] as const
          ))
          storedId = id
          commands.despawn(id)
        })
    )

    const lookup = System.define(
      "RuntimeCommands/LookupDespawned",
      {
        schema,
        resources: {
          count: System.writeResource(Count)
        }
      },
      ({ lookup, resources }) =>
        Fx.sync(() => {
          const id = storedId
          if (!id) {
            resources.count.set(-1)
            return
          }
          const result = lookup.get(id, Query.define({
            selection: {
              position: Query.read(Position)
            }
          }))
          resources.count.set(result.ok ? 0 : result.error._tag === "MissingEntity" ? 1 : -1)
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.define({
        label: Label.defineScheduleLabel("RuntimeCommands/SpawnStoreIdSchedule"),
        schema,
        systems: [spawn]
      }),
      Schedule.define({
        label: Label.defineScheduleLabel("RuntimeCommands/LookupDespawnedSchedule"),
        schema,
        systems: [lookup]
      })
    )

    expect(readResourceValue(runtime, schema, Count)).toBe(1)
  })

  it("insert on an existing entity becomes visible after explicit applyDeferred in the same schedule", () => {
    let storedId: import("../src/entity.ts").EntityId<typeof schema> | undefined

    const spawn = System.define(
      "RuntimeCommands/SpawnStoreForInsert",
      {
        schema
      },
      ({ commands }) =>
        Fx.sync(() => {
          const id = commands.spawn(Command.spawnWith<typeof schema>(
            [Position, { x: 0, y: 0 }] as const
          ))
          storedId = id
        })
    )

    const insertVelocity = System.define(
      "RuntimeCommands/InsertVelocity",
      {
        schema
      },
      ({ commands }) =>
        Fx.sync(() => {
          const id = storedId
          if (id) {
            commands.insert(id, Velocity, { x: 4, y: 5 })
          }
        })
    )

    const observe = System.define(
      "RuntimeCommands/ObserveInsertedVelocity",
      {
        schema,
        queries: {
          moving: Query.define({
            selection: {
              position: Query.read(Position),
              velocity: Query.read(Velocity)
            }
          })
        },
        resources: {
          count: System.writeResource(Count)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          resources.count.set(queries.moving.each().length)
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.define({
        label: Label.defineScheduleLabel("RuntimeCommands/SpawnBeforeInsert"),
        schema,
        systems: [spawn]
      }),
      Schedule.define({
        label: Label.defineScheduleLabel("RuntimeCommands/InsertThenObserve"),
        schema,
        systems: [insertVelocity, observe],
        steps: [insertVelocity, Schedule.applyDeferred(), observe]
      })
    )

    expect(readResourceValue(runtime, schema, Count)).toBe(1)
  })
})
