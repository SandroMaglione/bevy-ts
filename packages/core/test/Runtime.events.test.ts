import { describe, expect, it } from "vitest"
import { Descriptor, Schema } from "@bevy-ts/core"
import * as Runtime from "@bevy-ts/core/Runtime"
import * as Schedule from "@bevy-ts/core/Schedule"
import * as System from "@bevy-ts/core/System"
import { readResourceValue } from "./utils/fixtures.ts"

const Log = Descriptor.Resource<ReadonlyArray<number>>()("Log")
const Ping = Descriptor.Event<{ value: number }>()("Ping")

const Game = Schema.bind(Schema.fragment({
  resources: {
    Log
  },
  events: {
    Ping
  }
}))
const schema = Game.schema

const makeRuntime = () =>
  Runtime.make({
    schema,
    services: Runtime.services(),
    resources: {
      Log: []
    }
  })

describe("Runtime events", () => {
  it("later schedules in one tick observe earlier events once they advance the event buffer", () => {
    const emit = System.System(
      "RuntimeEvents/Emit",
      {
        schema,
        events: {
          ping: System.writeEvent(Ping)
        }
      },
      ({ events }) =>
        {
          events.ping.emit({ value: 1 })
        }
    )

    const observe = System.System(
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
        {
          resources.log.set(events.ping.all().map((event) => event.value))
        }
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.Schedule(emit),
      Schedule.Schedule(Schedule.updateEvents(), observe)
    )

    expect(readResourceValue(runtime, schema, Log)).toEqual([1])
  })

  it("keeps events pending across schedule runs until an explicit updateEvents()", () => {
    const emit = System.System(
      "RuntimeEvents/EmitPending",
      {
        schema,
        events: {
          ping: System.writeEvent(Ping)
        }
      },
      ({ events }) =>
        {
          events.ping.emit({ value: 8 })
        }
    )

    const observe = System.System(
      "RuntimeEvents/ObservePending",
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
        {
          resources.log.set(events.ping.all().map((event) => event.value))
        }
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.Schedule(emit),
      Schedule.Schedule(observe)
    )
    expect(readResourceValue(runtime, schema, Log)).toEqual([])

    runtime.tick(Schedule.Schedule(Schedule.updateEvents(), observe))
    expect(readResourceValue(runtime, schema, Log)).toEqual([8])
  })

  it("does not expose newly emitted events before updateEvents in the same schedule", () => {
    const emit = System.System(
      "RuntimeEvents/EmitBefore",
      {
        schema,
        events: {
          ping: System.writeEvent(Ping)
        }
      },
      ({ events }) =>
        {
          events.ping.emit({ value: 2 })
        }
    )

    const readBefore = System.System(
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
        {
          resources.log.update((entries) => [...entries, events.ping.all().length])
        }
    )

    const runtime = makeRuntime()
    runtime.tick(Schedule.Schedule(emit, readBefore))

    expect(readResourceValue(runtime, schema, Log)).toEqual([0])
  })

  it("makes pending events readable after updateEvents in the same schedule", () => {
    const emit = System.System(
      "RuntimeEvents/EmitAfter",
      {
        schema,
        events: {
          ping: System.writeEvent(Ping)
        }
      },
      ({ events }) =>
        {
          events.ping.emit({ value: 3 })
        }
    )

    const readAfter = System.System(
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
        {
          resources.log.set(events.ping.all().map((event) => event.value))
        }
    )

    const runtime = makeRuntime()
    runtime.tick(Schedule.Schedule(emit, Schedule.updateEvents(), readAfter))

    expect(readResourceValue(runtime, schema, Log)).toEqual([3])
  })

  it("preserves event order within one update phase", () => {
    const emit = System.System(
      "RuntimeEvents/EmitMany",
      {
        schema,
        events: {
          ping: System.writeEvent(Ping)
        }
      },
      ({ events }) =>
        {
          events.ping.emit({ value: 4 })
          events.ping.emit({ value: 5 })
          events.ping.emit({ value: 6 })
        }
    )

    const observe = System.System(
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
        {
          resources.log.set(events.ping.all().map((event) => event.value))
        }
    )

    const runtime = makeRuntime()
    runtime.tick(Schedule.Schedule(emit, Schedule.updateEvents(), observe))

    expect(readResourceValue(runtime, schema, Log)).toEqual([4, 5, 6])
  })

  it("refreshes readable events across updates instead of accumulating stale values", () => {
    const observe = System.System(
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
        {
          resources.log.set(events.ping.all().map((event) => event.value))
        }
    )

    const emitOne = System.System(
      "RuntimeEvents/EmitOne",
      {
        schema,
        events: {
          ping: System.writeEvent(Ping)
        }
      },
      ({ events }) =>
        {
          events.ping.emit({ value: 7 })
        }
    )

    const emitNone = System.System(
      "RuntimeEvents/EmitNone",
      {
        schema
      },
      () => {}
    )

    const runtime = makeRuntime()
    runtime.tick(
      Schedule.Schedule(emitOne),
      Schedule.Schedule(Schedule.updateEvents(), observe)
    )

    expect(readResourceValue(runtime, schema, Log)).toEqual([7])

    runtime.tick(
      Schedule.Schedule(emitNone),
      Schedule.Schedule(Schedule.updateEvents(), observe)
    )

    expect(readResourceValue(runtime, schema, Log)).toEqual([])
  })
})
