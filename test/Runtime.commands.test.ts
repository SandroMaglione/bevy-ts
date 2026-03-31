import { describe, expect, it } from "vitest"
import { Descriptor, Fx, Schema } from "../src/index.ts"
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
const Game = Schema.bind(schema)

const makeRuntime = () =>
  Game.Runtime.make({
    services: Game.Runtime.services(),
    resources: {
      Count: 0,
      LastX: -1
    }
  })

describe("Runtime commands", () => {
  it("insertMany applies entries in order with last-write-wins semantics", () => {
    const spawn = Game.System.define(
      "RuntimeCommands/SpawnInsertMany",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          const id = commands.spawn(Game.Command.spawnWith(
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

    const observe = Game.System.define(
      "RuntimeCommands/ObserveLastWriteWins",
      {
        queries: {
          moving: Game.Query.define({
            selection: {
              position: Game.Query.read(Position),
              velocity: Game.Query.read(Velocity)
            }
          })
        },
        resources: {
          count: Game.System.writeResource(Count),
          lastX: Game.System.writeResource(LastX)
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
      Game.Schedule.define({
        systems: [spawn]
      }),
      Game.Schedule.define({
        systems: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, Count)).toBe(1)
    expect(readResourceValue(runtime, schema, LastX)).toBe(2)
  })

  it("remove causes later queries to stop matching", () => {
    const spawn = Game.System.define(
      "RuntimeCommands/SpawnForRemove",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          const id = commands.spawn(Game.Command.spawnWith(
            [Position, { x: 1, y: 1 }] as const,
            [Velocity, { x: 1, y: 1 }] as const
          ))
          commands.remove(id, Velocity)
        })
    )

    const observe = Game.System.define(
      "RuntimeCommands/ObserveRemove",
      {
        queries: {
          moving: Game.Query.define({
            selection: {
              position: Game.Query.read(Position),
              velocity: Game.Query.read(Velocity)
            }
          })
        },
        resources: {
          count: Game.System.writeResource(Count)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          resources.count.set(queries.moving.each().length)
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Game.Schedule.define({
        systems: [spawn]
      }),
      Game.Schedule.define({
        systems: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, Count)).toBe(0)
  })

  it("despawn removes the entity and exact lookup reports MissingEntity", () => {
    let storedId: import("../src/entity.ts").EntityId<typeof schema, typeof schema> | undefined

    const spawn = Game.System.define(
      "RuntimeCommands/SpawnAndStoreId",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          const id = commands.spawn(Game.Command.spawnWith(
            [Position, { x: 1, y: 2 }] as const
          ))
          storedId = id
          commands.despawn(id)
        })
    )

    const lookup = Game.System.define(
      "RuntimeCommands/LookupDespawned",
      {
        resources: {
          count: Game.System.writeResource(Count)
        }
      },
      ({ lookup, resources }) =>
        Fx.sync(() => {
          const id = storedId
          if (!id) {
            resources.count.set(-1)
            return
          }
          const result = lookup.get(id, Game.Query.define({
            selection: {
              position: Game.Query.read(Position)
            }
          }))
          resources.count.set(result.ok ? 0 : result.error._tag === "MissingEntity" ? 1 : -1)
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Game.Schedule.define({
        systems: [spawn]
      }),
      Game.Schedule.define({
        systems: [lookup]
      })
    )

    expect(readResourceValue(runtime, schema, Count)).toBe(1)
  })

  it("insert on an existing entity becomes visible after explicit applyDeferred in the same schedule", () => {
    let storedId: import("../src/entity.ts").EntityId<typeof schema, typeof schema> | undefined

    const spawn = Game.System.define(
      "RuntimeCommands/SpawnStoreForInsert",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          const id = commands.spawn(Game.Command.spawnWith(
            [Position, { x: 0, y: 0 }] as const
          ))
          storedId = id
        })
    )

    const insertVelocity = Game.System.define(
      "RuntimeCommands/InsertVelocity",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          const id = storedId
          if (id) {
            commands.insert(id, Velocity, { x: 4, y: 5 })
          }
        })
    )

    const observe = Game.System.define(
      "RuntimeCommands/ObserveInsertedVelocity",
      {
        queries: {
          moving: Game.Query.define({
            selection: {
              position: Game.Query.read(Position),
              velocity: Game.Query.read(Velocity)
            }
          })
        },
        resources: {
          count: Game.System.writeResource(Count)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          resources.count.set(queries.moving.each().length)
        })
    )

    const runtime = makeRuntime()
    const spawnSchedule = Game.Schedule.define({
      systems: [spawn]
    })
    const observeSchedule = Game.Schedule.define({
      systems: [insertVelocity, observe],
      steps: [insertVelocity, Game.Schedule.applyDeferred(), observe]
    })

    const tick = runtime.tick as (...schedules: ReadonlyArray<never>) => void
    tick(spawnSchedule as never, observeSchedule as never)

    expect(readResourceValue(runtime, schema, Count)).toBe(1)
  })
})
