import { describe, expect, it } from "vitest"
import { Descriptor, Fx, Result, Schema } from "../src/index.ts"
import * as Vector2 from "../src/Vector2.ts"
import { readResourceValue } from "./utils/fixtures.ts"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.defineComponent<{ x: number; y: number }>()("Velocity")
const Count = Descriptor.defineResource<number>()("Count")
const LastX = Descriptor.defineResource<number>()("LastX")
const SafePosition = Descriptor.defineConstructedComponent(Vector2)("SafePosition")

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

const constructedSchema = Schema.build(Schema.fragment({
  components: {
    SafePosition
  }
}))
const ConstructedGame = Schema.bind(constructedSchema)

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
        entries: [spawn]
      }),
      Game.Schedule.define({
        entries: [observe]
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
        entries: [spawn]
      }),
      Game.Schedule.define({
        entries: [observe]
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
        entries: [spawn]
      }),
      Game.Schedule.define({
        entries: [lookup]
      })
    )

    expect(readResourceValue(runtime, schema, Count)).toBe(1)
  })

  it("entryRaw and insertRaw validate constructed component input explicitly", () => {
    const invalidEntry = ConstructedGame.Command.entryRaw(SafePosition, { x: Number.NaN, y: 0 })
    expect(invalidEntry.ok).toBe(false)

    const spawned = ConstructedGame.Command.spawnWithMixed(
      ConstructedGame.Command.entryRaw(SafePosition, { x: 1, y: 2 })
    )

    expect(spawned.ok).toBe(true)
    if (!spawned.ok) {
      return
    }

    const inserted = ConstructedGame.Command.insertRaw(
      spawned.value,
      SafePosition,
      { x: 3, y: 4 }
    )

    expect(inserted.ok).toBe(true)
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
      entries: [spawn]
    })
    const observeSchedule = Game.Schedule.define({
      entries: [insertVelocity, Game.Schedule.applyDeferred(), observe]
    })

    runtime.tick(spawnSchedule, observeSchedule)

    expect(readResourceValue(runtime, schema, Count)).toBe(1)
  })

  it("spawnWithResult returns tuple-shaped failures and applies successful drafts", () => {
    const spawn = Game.System.define(
      "RuntimeCommands/SpawnWithResult",
      {
        resources: {
          count: Game.System.writeResource(Count),
          lastX: Game.System.writeResource(LastX)
        }
      },
      ({ commands, resources }) =>
        Fx.sync(() => {
          const invalidDraft = Game.Command.spawnWithResult(
            Game.Command.entryResult(Position, Result.success({ x: 1, y: 2 })),
            Game.Command.entryResult(Velocity, Result.failure("bad-velocity"))
          )

          expect(invalidDraft).toEqual(Result.failure([null, "bad-velocity"]))

          const validDraft = Game.Command.spawnWithResult(
            Game.Command.entryResult(Position, Result.success({ x: 4, y: 5 })),
            Game.Command.entryResult(Velocity, Result.success({ x: 6, y: 7 }))
          )

          if (!validDraft.ok) {
            resources.count.set(-1)
            return
          }

          commands.spawn(validDraft.value)
          resources.count.set(1)
          resources.lastX.set(4)
        })
    )

    const observe = Game.System.define(
      "RuntimeCommands/ObserveSpawnWithResult",
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
        entries: [spawn]
      }),
      Game.Schedule.define({
        entries: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, Count)).toBe(1)
    expect(readResourceValue(runtime, schema, LastX)).toBe(4)
  })

  it("spawnWithMixed accepts plain and validated entries together", () => {
    const spawn = Game.System.define(
      "RuntimeCommands/SpawnWithMixed",
      {
        resources: {
          count: Game.System.writeResource(Count),
          lastX: Game.System.writeResource(LastX)
        }
      },
      ({ commands, resources }) =>
        Fx.sync(() => {
          const invalidDraft = Game.Command.spawnWithMixed(
            Game.Command.entry(Position, { x: 1, y: 2 }),
            Game.Command.entryResult(Velocity, Result.failure("bad-velocity"))
          )

          expect(invalidDraft).toEqual(Result.failure([null, "bad-velocity"]))

          const validDraft = Game.Command.spawnWithMixed(
            Game.Command.entry(Position, { x: 4, y: 5 }),
            Game.Command.entryResult(Velocity, Result.success({ x: 6, y: 7 }))
          )

          if (!validDraft.ok) {
            resources.count.set(-1)
            return
          }

          commands.spawn(validDraft.value)
          resources.count.set(1)
          resources.lastX.set(4)
        })
    )

    const observe = Game.System.define(
      "RuntimeCommands/ObserveSpawnWithMixed",
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
        entries: [spawn]
      }),
      Game.Schedule.define({
        entries: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, Count)).toBe(1)
    expect(readResourceValue(runtime, schema, LastX)).toBe(4)
  })
})
