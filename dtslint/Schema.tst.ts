import { App, Descriptor, Fx, Schema } from "../src/index.ts"
import * as Public from "../src/index.ts"
import { describe, expect, it } from "tstyche"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Time = Descriptor.defineResource<number>()("Time")
const Phase = Descriptor.defineState<"Running" | "Paused">()("Phase")
const TickEvent = Descriptor.defineEvent<{ dt: number }>()("TickEvent")
const Velocity = Descriptor.defineComponent<{ dx: number; dy: number }>()("Velocity")

describe("Schema", () => {
  it("does not export top-level runtime authoring namespaces from the public barrel", () => {
    // @ts-expect-error!
    Public.System
    // @ts-expect-error!
    Public.Schedule
    // @ts-expect-error!
    Public.Runtime
    // @ts-expect-error!
    Public.Query
    // @ts-expect-error!
    Public.Command
    // @ts-expect-error!
    Public.StateMachine
  })

  it("preserves exact fragment registries", () => {
    const fragment = Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      },
      events: {
        Tick: TickEvent
      },
      states: {
        CurrentPhase: Phase
      }
    })

    expect(fragment).type.toBe<Schema.SchemaDefinition<
      { readonly Position: typeof Position },
      { readonly DeltaTime: typeof Time },
      { readonly Tick: typeof TickEvent },
      { readonly CurrentPhase: typeof Phase }
    >>()
  })

  it("build merges fragment registries into one final schema", () => {
    const left = Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      }
    })

    const right = Schema.fragment({
      events: {
        Tick: TickEvent
      },
      states: {
        CurrentPhase: Phase
      }
    })

    const schema = Schema.build(left, right)

    expect(schema).type.toBe<Schema.SchemaDefinition<
      { readonly Position: typeof Position },
      { readonly DeltaTime: typeof Time },
      { readonly Tick: typeof TickEvent },
      { readonly CurrentPhase: typeof Phase }
    >>()
  })

  it("rejects duplicate schema keys", () => {
    const left = Schema.fragment({
      resources: {
        DeltaTime: Time
      }
    })

    const right = Schema.fragment({
      resources: {
        DeltaTime: Descriptor.defineResource<number>()("OtherTime")
      }
    })

    // @ts-expect-error!
    Schema.merge(left, right)
  })

  it("bind closes the schema over systems, schedules, and runtimes", () => {
    const schema = Schema.build(Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      },
      states: {
        CurrentPhase: Phase
      }
    }))

    const Game = Schema.bind(schema)

    const MoveSystem = Game.System.define(
      "Move",
      {
        queries: {
          moving: Game.Query.define({
            selection: {
              position: Game.Query.write(Position)
            }
          })
        },
        resources: {
          time: Game.System.readResource(Time)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          resources.time.get()
          for (const match of queries.moving.each()) {
            match.data.position.get()
          }
        })
    )

    const update = Game.Schedule.define({
      systems: [MoveSystem]
    })

    const runtime = Game.Runtime.make({
      services: Game.Runtime.services(),
      resources: {
        DeltaTime: 1 / 60
      },
      states: {
        CurrentPhase: "Running"
      }
    })

    App.makeApp(runtime).update(update)
  })

  it("supports explicit optional component access without widening entity proofs", () => {
    const schema = Schema.build(Schema.fragment({
      components: {
        Position,
        Velocity
      }
    }))

    const Game = Schema.bind(schema)

    const ObserveSystem = Game.System.define(
      "ObserveOptional",
      {
        queries: {
          moving: Game.Query.define({
            selection: {
              position: Game.Query.read(Position),
              velocity: Game.Query.optional(Velocity)
            }
          })
        }
      },
      ({ queries }) =>
        Fx.sync(() => {
          for (const match of queries.moving.each()) {
            expect(match.data.velocity).type.toBe<import("../src/query.ts").OptionalReadCell<{ dx: number; dy: number }>>()
            expect(match.entity.proof).type.toBe<{
              readonly position: { x: number; y: number }
            }>()

            // @ts-expect-error!
            match.data.velocity.get()

            if (match.data.velocity.present) {
              expect(match.data.velocity.get()).type.toBe<{ dx: number; dy: number }>()
            }
          }
        })
    )

    const runtime = Game.Runtime.make({
      services: Game.Runtime.services()
    })

    App.makeApp(runtime).update(Game.Schedule.define({
      systems: [ObserveSystem]
    }))
  })

  it("rejects non-component descriptors in query selection and structural filters", () => {
    const schema = Schema.build(Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      }
    }))

    const Game = Schema.bind(schema)

    // @ts-expect-error!
    Game.Query.read(Time)
    // @ts-expect-error!
    Game.Query.optional(Time)
    Game.Query.define({
      selection: {
        position: Game.Query.read(Position)
      },
      with: [
        // @ts-expect-error!
        Time
      ]
    })
    Game.Query.define({
      selection: {
        position: Game.Query.read(Position)
      },
      without: [
        // @ts-expect-error!
        Time
      ]
    })
  })

  it("supports explicit lifecycle query filters and lifecycle readers", () => {
    const schema = Schema.build(Schema.fragment({
      components: {
        Position,
        Velocity
      },
      resources: {
        DeltaTime: Time
      }
    }))

    const Game = Schema.bind(schema)

    const ObserveLifecycleSystem = Game.System.define(
      "ObserveLifecycle",
      {
        queries: {
          moved: Game.Query.define({
            selection: {
              position: Game.Query.read(Position),
              velocity: Game.Query.optional(Velocity)
            },
            filters: [Game.Query.changed(Position)] as const
          })
        },
        removed: {
          positions: Game.System.readRemoved(Position)
        },
        despawned: {
          entities: Game.System.readDespawned()
        }
      },
      ({ queries, removed, despawned }) =>
        Fx.sync(() => {
          for (const match of queries.moved.each()) {
            expect(match.data.velocity).type.toBe<import("../src/query.ts").OptionalReadCell<{ dx: number; dy: number }>>()
          }

          expect(removed.positions.all()).type.toBe<
            ReadonlyArray<import("../src/entity.ts").EntityId<typeof schema, typeof schema | undefined>>
          >()
          expect(despawned.entities.all()).type.toBe<
            ReadonlyArray<import("../src/entity.ts").EntityId<typeof schema, typeof schema | undefined>>
          >()
        })
    )

    const runtime = Game.Runtime.make({
      services: Game.Runtime.services()
    })

    App.makeApp(runtime).update(Game.Schedule.define({
      systems: [ObserveLifecycleSystem],
      steps: [Game.Schedule.updateLifecycle(), ObserveLifecycleSystem]
    }))
  })

  it("rejects non-component descriptors in lifecycle query APIs", () => {
    const schema = Schema.build(Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      }
    }))

    const Game = Schema.bind(schema)

    // @ts-expect-error!
    Game.Query.added(Time)
    // @ts-expect-error!
    Game.Query.changed(Time)
    // @ts-expect-error!
    Game.System.readRemoved(Time)
  })

  it("rejects cross-schema systems and schedules on the bound path", () => {
    const schemaA = Schema.build(Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      }
    }))

    const schemaB = Schema.build(Schema.fragment({
      components: {
        Velocity
      }
    }))

    const GameA = Schema.bind(schemaA)
    const GameB = Schema.bind(schemaB)

    const SystemA = GameA.System.define(
      "A",
      {
        queries: {
          moving: GameA.Query.define({
            selection: {
              position: GameA.Query.read(Position)
            }
          })
        }
      },
      () => Fx.sync<undefined, any>(() => undefined)
    )

    const SystemB = GameB.System.define(
      "B",
      {
        queries: {
          moving: GameB.Query.define({
            selection: {
              velocity: GameB.Query.read(Velocity)
            }
          })
        }
      },
      () => Fx.sync<undefined, any>(() => undefined)
    )

    type GameBSystem = Parameters<typeof GameB.Schedule.define>[0]["systems"][number]
    // @ts-expect-error!
    const _invalidSystem: GameBSystem = SystemA

    const runtimeA = GameA.Runtime.make({
      services: GameA.Runtime.services(),
      resources: {
        DeltaTime: 1 / 60
      }
    })

    const scheduleB = GameB.Schedule.define({
      systems: [SystemB]
    })

    // @ts-expect-error!
    runtimeA.runSchedule(scheduleB)
  })
})
