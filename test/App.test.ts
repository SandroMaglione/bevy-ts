import { describe, expect, it } from "vitest"
import { App, Descriptor, Fx, Label, Runtime, Schedule, Schema, System } from "../src/index.ts"

const Counter = Descriptor.defineResource<number>()("Counter")
const Log = Descriptor.defineResource<ReadonlyArray<string>>()("Log")

const schema = Schema.build(Schema.fragment({
  resources: {
    Counter,
    Log
  }
}))

const UpdateLabel = Label.defineScheduleLabel("AppTest/Update")
const ReadLabel = Label.defineScheduleLabel("AppTest/Read")
const SetupLabel = Label.defineScheduleLabel("AppTest/Setup")

describe("App", () => {
  it("runs one schedule once through update", () => {
    let captured = -1

    const increment = System.define(
      "AppTest/Increment",
      {
        schema,
        resources: {
          counter: System.writeResource(Counter)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.counter.update((value) => value + 1)
        })
    )

    const read = System.define(
      "AppTest/ReadCounter",
      {
        schema,
        resources: {
          counter: System.readResource(Counter)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          captured = resources.counter.get()
        })
    )

    const updateSchedule = Schedule.define({
      label: UpdateLabel,
      schema,
      systems: [increment]
    })

    const readSchedule = Schedule.define({
      label: ReadLabel,
      schema,
      systems: [read]
    })

    const runtime = Runtime.makeRuntime({
      schema,
      services: {},
      resources: {
        Counter: 0,
        Log: []
      }
    })

    const app = App.makeApp(runtime)
    app.update(updateSchedule)
    app.update(readSchedule)

    expect(captured).toBe(1)
  })

  it("runs multiple schedules in order within one update call", () => {
    let captured: ReadonlyArray<string> = []

    const first = System.define(
      "AppTest/First",
      {
        schema,
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "first"])
        })
    )

    const second = System.define(
      "AppTest/Second",
      {
        schema,
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "second"])
        })
    )

    const read = System.define(
      "AppTest/CaptureLog",
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
    )

    const firstSchedule = Schedule.define({
      label: Label.defineScheduleLabel("AppTest/FirstSchedule"),
      schema,
      systems: [first]
    })

    const secondSchedule = Schedule.define({
      label: Label.defineScheduleLabel("AppTest/SecondSchedule"),
      schema,
      systems: [second]
    })

    const readSchedule = Schedule.define({
      label: ReadLabel,
      schema,
      systems: [read]
    })

    const runtime = Runtime.makeRuntime({
      schema,
      services: {},
      resources: {
        Counter: 0,
        Log: []
      }
    })

    const app = App.makeApp(runtime)
    app.update(firstSchedule, secondSchedule, readSchedule)

    expect(captured).toEqual(["first", "second"])
  })

  it("runs bootstrap schedules through the runtime initialization path", () => {
    let captured = -1

    const setup = System.define(
      "AppTest/BootstrapSetup",
      {
        schema,
        resources: {
          counter: System.writeResource(Counter)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.counter.set(42)
        })
    )

    const read = System.define(
      "AppTest/BootstrapRead",
      {
        schema,
        resources: {
          counter: System.readResource(Counter)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          captured = resources.counter.get()
        })
    )

    const setupSchedule = Schedule.define({
      label: SetupLabel,
      schema,
      systems: [setup]
    })

    const readSchedule = Schedule.define({
      label: ReadLabel,
      schema,
      systems: [read]
    })

    const runtime = Runtime.makeRuntime({
      schema,
      services: {},
      resources: {
        Counter: 0,
        Log: []
      }
    })

    const app = App.makeApp(runtime)
    app.bootstrap(setupSchedule)
    app.update(readSchedule)

    expect(captured).toBe(42)
  })
})
