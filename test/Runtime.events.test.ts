import { describe, expect, it } from "vitest"
import { Descriptor, Fx, Runtime, Schedule, Schema, System } from "../src/index.ts"
import { readResourceValue } from "./utils/fixtures.ts"

const Log = Descriptor.defineResource<ReadonlyArray<number>>()("Log")
const Ping = Descriptor.defineEvent<{ value: number }>()("Ping")

const schema = Schema.build(Schema.fragment({
  resources: {
    Log
  },
  events: {
    Ping
  }
}))

const makeRuntime = () =>
  Runtime.makeRuntime({
    schema,
    services: Runtime.services(),
    resources: {
      Log: []
    }
  })

describe("Runtime events", () => {
  it("later schedules in one tick can observe events emitted by earlier schedules", () => {
    const emit = System.define(
      "RuntimeEvents/Emit",
      {
        schema,
        events: {
          ping: System.writeEvent(Ping)
        }
      },
      ({ events }) =>
        Fx.sync(() => {
          events.ping.emit({ value: 1 })
        })
    )

    const observe = System.define(
      "RuntimeEvents/ObserveLaterSchedule",
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
          resources.log.set(events.ping.all().map((event) => event.value))
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.define({
        schema,
        systems: [emit]
      }),
      Schedule.define({
        schema,
        systems: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, Log)).toEqual([1])
  })

  it("does not expose newly emitted events before updateEvents in the same schedule", () => {
    const emit = System.define(
      "RuntimeEvents/EmitBefore",
      {
        schema,
        events: {
          ping: System.writeEvent(Ping)
        }
      },
      ({ events }) =>
        Fx.sync(() => {
          events.ping.emit({ value: 2 })
        })
    )

    const readBefore = System.define(
      "RuntimeEvents/ReadBefore",
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

    const runtime = makeRuntime()
    runtime.runSchedule(Schedule.define({
      schema,
      systems: [emit, readBefore],
      steps: [emit, readBefore]
    }))

    expect(readResourceValue(runtime, schema, Log)).toEqual([0])
  })

  it("makes pending events readable after updateEvents in the same schedule", () => {
    const emit = System.define(
      "RuntimeEvents/EmitAfter",
      {
        schema,
        events: {
          ping: System.writeEvent(Ping)
        }
      },
      ({ events }) =>
        Fx.sync(() => {
          events.ping.emit({ value: 3 })
        })
    )

    const readAfter = System.define(
      "RuntimeEvents/ReadAfter",
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
          resources.log.set(events.ping.all().map((event) => event.value))
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Schedule.define({
      schema,
      systems: [emit, readAfter],
      steps: [emit, Schedule.updateEvents(), readAfter]
    }))

    expect(readResourceValue(runtime, schema, Log)).toEqual([3])
  })

  it("preserves event order within one update phase", () => {
    const emit = System.define(
      "RuntimeEvents/EmitMany",
      {
        schema,
        events: {
          ping: System.writeEvent(Ping)
        }
      },
      ({ events }) =>
        Fx.sync(() => {
          events.ping.emit({ value: 4 })
          events.ping.emit({ value: 5 })
          events.ping.emit({ value: 6 })
        })
    )

    const observe = System.define(
      "RuntimeEvents/ObserveMany",
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
          resources.log.set(events.ping.all().map((event) => event.value))
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Schedule.define({
      schema,
      systems: [emit, observe],
      steps: [emit, Schedule.updateEvents(), observe]
    }))

    expect(readResourceValue(runtime, schema, Log)).toEqual([4, 5, 6])
  })

  it("refreshes readable events across updates instead of accumulating stale values", () => {
    const observe = System.define(
      "RuntimeEvents/ObserveAcrossUpdates",
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
          resources.log.set(events.ping.all().map((event) => event.value))
        })
    )

    const emitOne = System.define(
      "RuntimeEvents/EmitOne",
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

    const emitNone = System.define(
      "RuntimeEvents/EmitNone",
      {
        schema
      },
      () => Fx.sync<undefined, {}>(() => undefined)
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.define({
        schema,
        systems: [emitOne]
      }),
      Schedule.define({
        schema,
        systems: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, Log)).toEqual([7])

    runtime.tick(
      Schedule.define({
        schema,
        systems: [emitNone]
      }),
      Schedule.define({
        schema,
        systems: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, Log)).toEqual([])
  })
})
