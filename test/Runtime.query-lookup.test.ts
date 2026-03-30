import { describe, expect, it } from "vitest"
import { Descriptor, Entity, Fx, Schema } from "../src/index.ts"
import * as Command from "../src/command.ts"
import * as Query from "../src/query.ts"
import * as Runtime from "../src/runtime.ts"
import * as Schedule from "../src/schedule.ts"
import * as System from "../src/system.ts"
import { readResourceValue } from "./utils/fixtures.ts"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.defineComponent<{ x: number; y: number }>()("Velocity")
const Hidden = Descriptor.defineComponent<{ hidden: true }>()("Hidden")
const Count = Descriptor.defineResource<number>()("Count")
const LastX = Descriptor.defineResource<number>()("LastX")
const LastError = Descriptor.defineResource<string>()("LastError")

const schema = Schema.build(Schema.fragment({
  components: {
    Position,
    Velocity,
    Hidden
  },
  resources: {
    Count,
    LastX,
    LastError
  }
}))

const makeRuntime = () =>
  Runtime.makeRuntime({
    schema,
    services: Runtime.services(),
    resources: {
      Count: 0,
      LastX: -1,
      LastError: ""
    }
  })

describe("Runtime query and lookup", () => {
  it("each returns zero matches when nothing satisfies the query", () => {
    const observe = System.define(
      "RuntimeQuery/ObserveEmpty",
      {
        schema,
        queries: {
          positions: Query.define({
            selection: {
              position: Query.read(Position)
            }
          })
        },
        resources: {
          count: System.writeResource(Count)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          resources.count.set(queries.positions.each().length)
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Schedule.define({
      schema,
      systems: [observe]
    }))

    expect(readResourceValue(runtime, schema, Count)).toBe(0)
  })

  it("single returns NoEntities when no entity matches", () => {
    const observe = System.define(
      "RuntimeQuery/SingleNoEntities",
      {
        schema,
        queries: {
          positions: Query.define({
            selection: {
              position: Query.read(Position)
            }
          })
        },
        resources: {
          lastError: System.writeResource(LastError)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          const result = queries.positions.single()
          resources.lastError.set(result.ok ? "" : result.error._tag)
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Schedule.define({
      schema,
      systems: [observe]
    }))

    expect(readResourceValue(runtime, schema, LastError)).toBe("NoEntities")
  })

  it("single returns MultipleEntities when multiple entities match", () => {
    const spawn = System.define(
      "RuntimeQuery/SpawnMultiple",
      {
        schema
      },
      ({ commands }) =>
        Fx.sync(() => {
          commands.spawn(Command.spawnWith<typeof schema>([Position, { x: 1, y: 1 }] as const))
          commands.spawn(Command.spawnWith<typeof schema>([Position, { x: 2, y: 2 }] as const))
        })
    )

    const observe = System.define(
      "RuntimeQuery/ObserveMultiple",
      {
        schema,
        queries: {
          positions: Query.define({
            selection: {
              position: Query.read(Position)
            }
          })
        },
        resources: {
          lastError: System.writeResource(LastError)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          const result = queries.positions.single()
          resources.lastError.set(result.ok ? "" : result.error._tag)
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.define({
        schema,
        systems: [spawn]
      }),
      Schedule.define({
        schema,
        systems: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, LastError)).toBe("MultipleEntities")
  })

  it("lookup returns MissingEntity and QueryMismatch for the expected cases", () => {
    let existingId: import("../src/entity.ts").EntityId<typeof schema> | undefined

    const spawn = System.define(
      "RuntimeQuery/SpawnOneForLookup",
      {
        schema
      },
      ({ commands }) =>
        Fx.sync(() => {
          existingId = commands.spawn(Command.spawnWith<typeof schema>(
            [Position, { x: 1, y: 1 }] as const
          ))
        })
    )

    const observe = System.define(
      "RuntimeQuery/ObserveLookupFailures",
      {
        schema,
        resources: {
          lastError: System.writeResource(LastError)
        }
      },
      ({ lookup, resources }) =>
        Fx.sync(() => {
          if (!existingId) {
            resources.lastError.set("MissingSetup")
            return
          }
          const missing = lookup.get(Entity.makeEntityId<typeof schema>(9999), Query.define({
            selection: {
              position: Query.read(Position)
            }
          }))
          const mismatch = lookup.get(existingId, Query.define({
            selection: {
              velocity: Query.read(Velocity)
            }
          }))
          resources.lastError.set(`${missing.ok ? "ok" : missing.error._tag}/${mismatch.ok ? "ok" : mismatch.error._tag}`)
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.define({
        schema,
        systems: [spawn]
      }),
      Schedule.define({
        schema,
        systems: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, LastError)).toBe("MissingEntity/QueryMismatch")
  })

  it("with and without filters refine matching entities", () => {
    const spawn = System.define(
      "RuntimeQuery/SpawnFiltered",
      {
        schema
      },
      ({ commands }) =>
        Fx.sync(() => {
          commands.spawn(Command.spawnWith<typeof schema>(
            [Position, { x: 1, y: 1 }] as const
          ))
          commands.spawn(Command.spawnWith<typeof schema>(
            [Position, { x: 2, y: 2 }] as const,
            [Hidden, { hidden: true }] as const
          ))
        })
    )

    const observe = System.define(
      "RuntimeQuery/ObserveFilters",
      {
        schema,
        queries: {
          visible: Query.define({
            selection: {
              position: Query.read(Position)
            },
            with: [Position] as const,
            without: [Hidden] as const
          })
        },
        resources: {
          count: System.writeResource(Count)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          resources.count.set(queries.visible.each().length)
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.define({
        schema,
        systems: [spawn]
      }),
      Schedule.define({
        schema,
        systems: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, Count)).toBe(1)
  })

  it("optional component slots do not affect matching and stay explicit in results", () => {
    const spawn = System.define(
      "RuntimeQuery/SpawnOptional",
      {
        schema
      },
      ({ commands }) =>
        Fx.sync(() => {
          commands.spawn(Command.spawnWith<typeof schema>(
            [Position, { x: 1, y: 1 }] as const
          ))
          commands.spawn(Command.spawnWith<typeof schema>(
            [Position, { x: 2, y: 2 }] as const,
            [Velocity, { x: 4, y: 0 }] as const
          ))
        })
    )

    const observe = System.define(
      "RuntimeQuery/ObserveOptional",
      {
        schema,
        queries: {
          moving: Query.define({
            selection: {
              position: Query.read(Position),
              velocity: Query.optional(Velocity)
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
          let totalX = 0
          for (const match of queries.moving.each()) {
            if (match.data.velocity.present) {
              totalX += match.data.velocity.get().x
            }
          }

          resources.count.set(queries.moving.each().length)
          resources.lastX.set(totalX)
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.define({
        schema,
        systems: [spawn]
      }),
      Schedule.define({
        schema,
        systems: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, Count)).toBe(2)
    expect(readResourceValue(runtime, schema, LastX)).toBe(4)
  })

  it("lookup does not fail when only optional components are missing", () => {
    let existingId: import("../src/entity.ts").EntityId<typeof schema> | undefined

    const spawn = System.define(
      "RuntimeQuery/SpawnLookupOptional",
      {
        schema
      },
      ({ commands }) =>
        Fx.sync(() => {
          existingId = commands.spawn(Command.spawnWith<typeof schema>(
            [Position, { x: 3, y: 7 }] as const
          ))
        })
    )

    const observe = System.define(
      "RuntimeQuery/ObserveLookupOptional",
      {
        schema,
        resources: {
          lastX: System.writeResource(LastX),
          lastError: System.writeResource(LastError)
        }
      },
      ({ lookup, resources }) =>
        Fx.sync(() => {
          if (!existingId) {
            resources.lastError.set("MissingSetup")
            return
          }

          const result = lookup.get(existingId, Query.define({
            selection: {
              position: Query.read(Position),
              velocity: Query.optional(Velocity)
            }
          }))

          if (!result.ok) {
            resources.lastError.set(result.error._tag)
            return
          }

          resources.lastError.set(result.value.data.velocity.present ? "Present" : "Missing")
          resources.lastX.set(result.value.data.position.get().x)
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.define({
        schema,
        systems: [spawn]
      }),
      Schedule.define({
        schema,
        systems: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, LastError)).toBe("Missing")
    expect(readResourceValue(runtime, schema, LastX)).toBe(3)
  })

  it("writable query cells update component values", () => {
    const spawn = System.define(
      "RuntimeQuery/SpawnWritable",
      {
        schema
      },
      ({ commands }) =>
        Fx.sync(() => {
          commands.spawn(Command.spawnWith<typeof schema>(
            [Position, { x: 1, y: 1 }] as const
          ))
        })
    )

    const write = System.define(
      "RuntimeQuery/WriteThroughCell",
      {
        schema,
        queries: {
          positions: Query.define({
            selection: {
              position: Query.write(Position)
            }
          })
        }
      },
      ({ queries }) =>
        Fx.sync(() => {
          const result = queries.positions.single()
          if (result.ok) {
            result.value.data.position.update((position) => ({
              ...position,
              x: 9
            }))
          }
        })
    )

    const read = System.define(
      "RuntimeQuery/ReadWrittenCell",
      {
        schema,
        queries: {
          positions: Query.define({
            selection: {
              position: Query.read(Position)
            }
          })
        },
        resources: {
          lastX: System.writeResource(LastX)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          const result = queries.positions.single()
          resources.lastX.set(result.ok ? result.value.data.position.get().x : -1)
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.define({
        schema,
        systems: [spawn]
      }),
      Schedule.define({
        schema,
        systems: [write, read]
      })
    )

    expect(readResourceValue(runtime, schema, LastX)).toBe(9)
  })
})
