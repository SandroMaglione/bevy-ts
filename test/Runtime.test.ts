import { describe, expect, it } from "vitest"
import { Command, Descriptor, Fx, Label, Query, Runtime, Schedule, Schema, System } from "../src/index.ts"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Count = Descriptor.defineResource<number>()("Count")
const Log = Descriptor.defineResource<ReadonlyArray<number>>()("Log")
const Ping = Descriptor.defineEvent<{ value: number }>()("Ping")

const schema = Schema.build(Schema.fragment({
  components: {
    Position
  },
  resources: {
    Count,
    Log
  },
  events: {
    Ping
  }
}))

const makeRuntime = () =>
  Runtime.makeRuntime({
    schema,
    services: {},
    resources: {
      Count: 0,
      Log: []
    }
  })

describe("Runtime", () => {
  it("applies deferred commands at the end of a schedule so later schedules can observe them", () => {
    const spawn = System.define(
      "RuntimeTest/SpawnForLaterSchedule",
      {
        schema
      },
      ({ commands }) =>
        Fx.sync(() => {
          commands.spawn(Command.spawnWith<typeof schema>(
            [Position, { x: 1, y: 2 }] as const
          ))
        })
    )

    const observe = System.define(
      "RuntimeTest/ObserveSpawnedEntity",
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
          const result = queries.positions.single()
          resources.count.set(result.ok ? result.value.data.position.get().x : -1)
        })
    )

    const spawnSchedule = Schedule.define({
      label: Label.defineScheduleLabel("RuntimeTest/SpawnSchedule"),
      schema,
      systems: [spawn]
    })

    const observeSchedule = Schedule.define({
      label: Label.defineScheduleLabel("RuntimeTest/ObserveSchedule"),
      schema,
      systems: [observe]
    })

    const runtime = makeRuntime()
    runtime.tick(spawnSchedule, observeSchedule)

    let captured = 0
    const readCount = System.define(
      "RuntimeTest/ReadCount",
      {
        schema,
        resources: {
          count: System.readResource(Count)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          captured = resources.count.get()
        })
    )

    runtime.runSchedule(Schedule.define({
      label: Label.defineScheduleLabel("RuntimeTest/ReadCountSchedule"),
      schema,
      systems: [readCount]
    }))

    expect(captured).toBe(1)
  })

  it("does not expose deferred spawns to later systems in the same schedule before applyDeferred", () => {
    const spawn = System.define(
      "RuntimeTest/SpawnWithoutApply",
      {
        schema
      },
      ({ commands }) =>
        Fx.sync(() => {
          commands.spawn(Command.spawnWith<typeof schema>(
            [Position, { x: 3, y: 4 }] as const
          ))
        })
    )

    const observe = System.define(
      "RuntimeTest/ObserveWithoutApply",
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

    const schedule = Schedule.define({
      label: Label.defineScheduleLabel("RuntimeTest/NoApplySchedule"),
      schema,
      systems: [spawn, observe],
      steps: [spawn, observe]
    })

    const runtime = makeRuntime()
    runtime.runSchedule(schedule)

    let captured = -1
    runtime.runSchedule(Schedule.define({
      label: Label.defineScheduleLabel("RuntimeTest/ReadNoApplyCount"),
      schema,
      systems: [System.define(
        "RuntimeTest/CaptureNoApplyCount",
        {
          schema,
          resources: {
            count: System.readResource(Count)
          }
        },
        ({ resources }) =>
          Fx.sync(() => {
            captured = resources.count.get()
          })
      )]
    }))

    expect(captured).toBe(0)
  })

  it("exposes deferred spawns after an explicit applyDeferred marker within the same schedule", () => {
    const spawn = System.define(
      "RuntimeTest/SpawnWithApply",
      {
        schema
      },
      ({ commands }) =>
        Fx.sync(() => {
          commands.spawn(Command.spawnWith<typeof schema>(
            [Position, { x: 5, y: 6 }] as const
          ))
        })
    )

    const observe = System.define(
      "RuntimeTest/ObserveWithApply",
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

    const schedule = Schedule.define({
      label: Label.defineScheduleLabel("RuntimeTest/ApplySchedule"),
      schema,
      systems: [spawn, observe],
      steps: [spawn, Schedule.applyDeferred(), observe]
    })

    const runtime = makeRuntime()
    runtime.runSchedule(schedule)

    let captured = -1
    runtime.runSchedule(Schedule.define({
      label: Label.defineScheduleLabel("RuntimeTest/ReadApplyCount"),
      schema,
      systems: [System.define(
        "RuntimeTest/CaptureApplyCount",
        {
          schema,
          resources: {
            count: System.readResource(Count)
          }
        },
        ({ resources }) =>
          Fx.sync(() => {
            captured = resources.count.get()
          })
      )]
    }))

    expect(captured).toBe(1)
  })

  it("makes pending events readable only after updateEvents within the same schedule", () => {
    const emit = System.define(
      "RuntimeTest/EmitPing",
      {
        schema,
        events: {
          ping: System.writeEvent(Ping)
        }
      },
      ({ events }) =>
        Fx.sync(() => {
          events.ping.emit({ value: 7 })
        })
    )

    const readBefore = System.define(
      "RuntimeTest/ReadBeforeEventUpdate",
      {
        schema,
        events: {
          ping: System.readEvent(Ping)
        },
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ events, resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, events.ping.all().length])
        })
    )

    const readAfter = System.define(
      "RuntimeTest/ReadAfterEventUpdate",
      {
        schema,
        events: {
          ping: System.readEvent(Ping)
        },
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ events, resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, events.ping.all().length])
        })
    )

    const schedule = Schedule.define({
      label: Label.defineScheduleLabel("RuntimeTest/EventSchedule"),
      schema,
      systems: [emit, readBefore, readAfter],
      steps: [emit, readBefore, Schedule.updateEvents(), readAfter]
    })

    const runtime = makeRuntime()
    runtime.runSchedule(schedule)

    let captured: ReadonlyArray<number> = []
    runtime.runSchedule(Schedule.define({
      label: Label.defineScheduleLabel("RuntimeTest/ReadEventLog"),
      schema,
      systems: [System.define(
        "RuntimeTest/CaptureEventLog",
        {
          schema,
          resources: {
            log: System.readResource(Log)
          }
        },
        ({ resources }) =>
          Fx.sync(() => {
            captured = resources.log.get()
          })
      )]
    }))

    expect(captured).toEqual([0, 1])
  })
})
