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
const HandleRoot = Schema.defineRoot("RuntimeQueryHandle")
const StoredHandle = Descriptor.defineResource<Entity.Handle<typeof HandleRoot, typeof Position> | null>()("StoredHandle")
const FollowTarget = Descriptor.defineEvent<{ target: Entity.Handle<typeof HandleRoot, typeof Position> }>()("FollowTarget")
const Followed = Descriptor.defineComponent<{
  target: Entity.Handle<typeof HandleRoot, typeof Position> | null
}>()("Followed")

const schema = Schema.build(Schema.fragment({
  components: {
    Position,
    Velocity,
    Hidden,
    Followed
  },
  resources: {
    Count,
    LastX,
    LastError,
    StoredHandle
  },
  events: {
    FollowTarget
  }
}))

const makeRuntime = () =>
  Runtime.makeRuntime({
    schema,
    services: Runtime.services(),
    resources: {
      Count: 0,
      LastX: -1,
      LastError: "",
      StoredHandle: null
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
      entries: [observe]
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
      entries: [observe]
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
        entries: [spawn]
      }),
      Schedule.define({
        schema,
        entries: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, LastError)).toBe("MultipleEntities")
  })

  it("singleOptional returns undefined when no entity matches", () => {
    const observe = System.define(
      "RuntimeQuery/SingleOptionalNoEntities",
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
          lastX: System.writeResource(LastX),
          lastError: System.writeResource(LastError)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          const result = queries.positions.singleOptional()
          resources.lastError.set(result.ok ? "" : result.error._tag)
          resources.lastX.set(result.ok && result.value ? result.value.data.position.get().x : -1)
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Schedule.define({
      schema,
      entries: [observe]
    }))

    expect(readResourceValue(runtime, schema, LastError)).toBe("")
    expect(readResourceValue(runtime, schema, LastX)).toBe(-1)
  })

  it("singleOptional returns the match when exactly one entity matches", () => {
    const spawn = System.define(
      "RuntimeQuery/SpawnOneForSingleOptional",
      {
        schema
      },
      ({ commands }) =>
        Fx.sync(() => {
          commands.spawn(Command.spawnWith<typeof schema>([Position, { x: 7, y: 3 }] as const))
        })
    )

    const observe = System.define(
      "RuntimeQuery/SingleOptionalOneEntity",
      {
        schema,
        queries: {
          positions: Query.define({
            selection: {
              position: Query.write(Position)
            }
          })
        },
        resources: {
          lastX: System.writeResource(LastX),
          lastError: System.writeResource(LastError)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          const result = queries.positions.singleOptional()
          resources.lastError.set(result.ok ? "" : result.error._tag)
          if (!result.ok || !result.value) {
            resources.lastX.set(-1)
            return
          }

          result.value.data.position.update((position) => ({
            ...position,
            x: position.x + 1
          }))
          resources.lastX.set(result.value.data.position.get().x)
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.define({
        schema,
        entries: [spawn]
      }),
      Schedule.define({
        schema,
        entries: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, LastError)).toBe("")
    expect(readResourceValue(runtime, schema, LastX)).toBe(8)
  })

  it("singleOptional returns MultipleEntities when multiple entities match", () => {
    const spawn = System.define(
      "RuntimeQuery/SpawnMultipleForSingleOptional",
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
      "RuntimeQuery/SingleOptionalMultipleEntities",
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
          const result = queries.positions.singleOptional()
          resources.lastError.set(result.ok ? "" : result.error._tag)
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.define({
        schema,
        entries: [spawn]
      }),
      Schedule.define({
        schema,
        entries: [observe]
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
        entries: [spawn]
      }),
      Schedule.define({
        schema,
        entries: [observe]
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
        entries: [spawn]
      }),
      Schedule.define({
        schema,
        entries: [observe]
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
        entries: [spawn]
      }),
      Schedule.define({
        schema,
        entries: [observe]
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
        entries: [spawn]
      }),
      Schedule.define({
        schema,
        entries: [observe]
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
        entries: [spawn]
      }),
      Schedule.define({
        schema,
        entries: [write, read]
      })
    )

    expect(readResourceValue(runtime, schema, LastX)).toBe(9)
  })

  it("getHandle resolves durable handles explicitly and reports stale handles safely", () => {
    const Game = Schema.bind(schema, HandleRoot)
    let currentHandle: Entity.Handle<typeof HandleRoot, typeof Position> | null = null

    const spawn = Game.System.define(
      "RuntimeQuery/SpawnHandle",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          const target = commands.spawn(Game.Command.spawnWith([Position, { x: 5, y: 9 }] as const))
          currentHandle = Game.Entity.handleAs(Position, target)
        })
    )

    const observe = Game.System.define(
      "RuntimeQuery/ObserveHandle",
      {
        resources: {
          lastX: Game.System.writeResource(LastX),
          lastError: Game.System.writeResource(LastError)
        }
      },
      ({ lookup, resources }) =>
        Fx.sync(() => {
          if (!currentHandle) {
            resources.lastError.set("MissingSetup")
            return
          }

          const result = lookup.getHandle(currentHandle, Game.Query.define({
            selection: {
              position: Game.Query.read(Position)
            }
          }))

          if (!result.ok) {
            resources.lastError.set(result.error._tag)
            return
          }

          resources.lastX.set(result.value.data.position.get().x)
          resources.lastError.set("")
        })
    )

    const destroy = Game.System.define(
      "RuntimeQuery/DestroyHandleTarget",
      {},
      ({ lookup, commands }) =>
        Fx.sync(() => {
          if (!currentHandle) {
            return
          }
          const result = lookup.getHandle(currentHandle, Game.Query.define({
            selection: {
              position: Game.Query.read(Position)
            }
          }))
          if (result.ok) {
            commands.despawn(result.value.entity.id)
          }
        })
    )

    const runtime = Game.Runtime.make({
      services: Game.Runtime.services(),
      resources: {
        Count: 0,
        LastX: -1,
        LastError: "",
        StoredHandle: null
      }
    })

    runtime.tick(
      Game.Schedule.define({
        entries: [spawn]
      }),
      Game.Schedule.define({
        entries: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, LastX)).toBe(5)
    expect(readResourceValue(runtime, schema, LastError)).toBe("")

    runtime.tick(
      Game.Schedule.define({
        entries: [destroy]
      }),
      Game.Schedule.define({
        entries: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, LastError)).toBe("MissingEntity")
  })

  it("resolves handles stored in resources and events with the same explicit failure semantics", () => {
    const Game = Schema.bind(schema, HandleRoot)
    let spawnedTarget: Entity.EntityId<typeof schema, typeof HandleRoot> | undefined

    const spawn = Game.System.define(
      "RuntimeQuery/SpawnStoredHandle",
      {
        resources: {
          storedHandle: Game.System.writeResource(StoredHandle)
        },
        events: {
          followTarget: Game.System.writeEvent(FollowTarget)
        }
      },
      ({ resources, events, commands }) =>
        Fx.sync(() => {
          spawnedTarget = commands.spawn(Game.Command.spawnWith([Position, { x: 12, y: 8 }] as const))
          const handle = Game.Entity.handleAs(Position, spawnedTarget)
          resources.storedHandle.set(handle)
          events.followTarget.emit({ target: handle })
        })
    )

    const observe = Game.System.define(
      "RuntimeQuery/ObserveStoredHandle",
      {
        resources: {
          storedHandle: Game.System.readResource(StoredHandle),
          lastX: Game.System.writeResource(LastX),
          lastError: Game.System.writeResource(LastError)
        },
        events: {
          followTarget: Game.System.readEvent(FollowTarget)
        }
      },
      ({ lookup, resources, events }) =>
        Fx.sync(() => {
          const resourceHandle = resources.storedHandle.get()
          const eventHandle = events.followTarget.all().at(0)?.target

          if (!resourceHandle || !eventHandle) {
            resources.lastError.set("MissingSetup")
            return
          }

          const resourceResult = lookup.getHandle(resourceHandle, Game.Query.define({
            selection: {
              position: Game.Query.read(Position)
            }
          }))
          const eventResult = lookup.getHandle(eventHandle, Game.Query.define({
            selection: {
              position: Game.Query.read(Position)
            }
          }))

          if (!resourceResult.ok || !eventResult.ok) {
            resources.lastError.set(`${resourceResult.ok ? "ok" : resourceResult.error._tag}/${eventResult.ok ? "ok" : eventResult.error._tag}`)
            return
          }

          resources.lastX.set(resourceResult.value.data.position.get().x + eventResult.value.data.position.get().x)
          resources.lastError.set("")
        })
    )

    const destroy = Game.System.define(
      "RuntimeQuery/DestroyStoredHandleTarget",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          if (spawnedTarget) {
            commands.despawn(spawnedTarget)
          }
        })
    )

    const emitStored = Game.System.define(
      "RuntimeQuery/EmitStoredHandleAgain",
      {
        resources: {
          storedHandle: Game.System.readResource(StoredHandle)
        },
        events: {
          followTarget: Game.System.writeEvent(FollowTarget)
        }
      },
      ({ resources, events }) =>
        Fx.sync(() => {
          const handle = resources.storedHandle.get()
          if (handle) {
            events.followTarget.emit({ target: handle })
          }
        })
    )

    const runtime = Game.Runtime.make({
      services: Game.Runtime.services(),
      resources: {
        Count: 0,
        LastX: -1,
        LastError: "",
        StoredHandle: null
      }
    })

    runtime.tick(
      Game.Schedule.define({
        entries: [spawn, Game.Schedule.applyDeferred(), Game.Schedule.updateEvents(), observe]
      })
    )

    expect(readResourceValue(runtime, schema, LastX)).toBe(24)
    expect(readResourceValue(runtime, schema, LastError)).toBe("")

    runtime.tick(
      Game.Schedule.define({
        entries: [destroy]
      }),
      Game.Schedule.define({
        entries: [emitStored, Game.Schedule.updateEvents(), observe]
      })
    )

    expect(readResourceValue(runtime, schema, LastError)).toBe("MissingEntity/MissingEntity")
  })
})
