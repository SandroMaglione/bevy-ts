import { App, Descriptor, Fx, Label, Runtime, Schedule, Schema, System } from "../src/index.ts"
import { describe, expect, it } from "tstyche"

const Time = Descriptor.defineResource<number>()("Time")
const Counter = Descriptor.defineResource<number>()("Counter")
const Phase = Descriptor.defineState<"Running" | "Paused">()("Phase")
const Logger = Descriptor.defineService<{ readonly log: (message: string) => void }>()("Logger")
const PrefixedLogger = Descriptor.defineService<{ readonly log: (message: string) => void }>()("RuntimeTypes/Logger")

const schema = Schema.build(Schema.fragment({
  resources: {
    DeltaTime: Time,
    Counter
  },
  states: {
    CurrentPhase: Phase
  }
}))

const ResourceSystem = System.define(
  "RuntimeTypes/Resource",
  {
    schema,
    resources: {
      time: System.readResource(Time)
    }
  },
  ({ resources }) =>
    Fx.sync(() => resources.time.get())
)

const StateSystem = System.define(
  "RuntimeTypes/State",
  {
    schema,
    states: {
      phase: System.readState(Phase)
    }
  },
  ({ states }) =>
    Fx.sync(() => states.phase.get())
)

const ServiceSystem = System.define(
  "RuntimeTypes/Service",
  {
    schema,
    services: {
      logger: System.service(Logger)
    }
  },
  ({ services }) =>
    Fx.sync(() => {
      services.logger.log("ok")
    })
)

const PrefixedServiceSystem = System.define(
  "RuntimeTypes/PrefixedService",
  {
    schema,
    services: {
      logger: System.service(PrefixedLogger)
    }
  },
  ({ services }) =>
    Fx.sync(() => {
      services.logger.log("ok")
    })
)

const resourceSchedule = Schedule.define({
  label: Label.defineScheduleLabel("RuntimeTypes/ResourceSchedule"),
  schema,
  systems: [ResourceSystem]
})

const stateSchedule = Schedule.define({
  label: Label.defineScheduleLabel("RuntimeTypes/StateSchedule"),
  schema,
  systems: [StateSystem]
})

const serviceSchedule = Schedule.define({
  label: Label.defineScheduleLabel("RuntimeTypes/ServiceSchedule"),
  schema,
  systems: [ServiceSystem]
})

const prefixedServiceSchedule = Schedule.define({
  label: Label.defineScheduleLabel("RuntimeTypes/PrefixedServiceSchedule"),
  schema,
  systems: [PrefixedServiceSystem]
})

describe("Runtime", () => {
  it("accepts initialization keyed by schema property names", () => {
    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 1 / 60,
        Counter: 0
      },
      states: {
        CurrentPhase: "Running"
      }
    })

    expect(runtime).type.toBeAssignableTo<Runtime.Runtime<
      typeof schema,
      {},
      {
        readonly DeltaTime: number
        readonly Counter: number
      },
      {
        readonly CurrentPhase: "Running"
      }
    >>()
  })

  it("rejects descriptor-name keys that are not schema keys", () => {
    Runtime.makeRuntime({
      schema,
      services: Runtime.services(),
      resources: {
        // @ts-expect-error!
        Time: 1 / 60
      }
    })
  })

  it("rejects descriptor-name state keys that are not schema keys", () => {
    Runtime.makeRuntime({
      schema,
      services: Runtime.services(),
      states: {
        // @ts-expect-error!
        Phase: "Running"
      }
    })
  })

  it("rejects schedules whose required service is missing from the runtime", () => {
    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 1 / 60,
        Counter: 0
      },
      states: {
        CurrentPhase: "Running"
      }
    })

    // @ts-expect-error!
    runtime.runSchedule(serviceSchedule)
  })

  it("rejects schedules whose required resource initialization is missing from the runtime", () => {
    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services()
    })

    // @ts-expect-error!
    runtime.runSchedule(resourceSchedule)
  })

  it("rejects schedules whose required state initialization is missing from the runtime", () => {
    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 1 / 60,
        Counter: 0
      }
    })

    // @ts-expect-error!
    runtime.runSchedule(stateSchedule)
  })

  it("propagates runtime requirement checks through app.update", () => {
    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 1 / 60,
        Counter: 0
      },
      states: {
        CurrentPhase: "Running"
      }
    })

    const app = App.makeApp(runtime)

    // @ts-expect-error!
    app.update(serviceSchedule)
  })

  it("accepts schedules whose requirements are fully satisfied", () => {
    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(
        [Logger, {
          log(_message: string) {}
        }]
      ),
      resources: {
        DeltaTime: 1 / 60,
        Counter: 0
      },
      states: {
        CurrentPhase: "Running"
      }
    })

    runtime.tick(resourceSchedule, stateSchedule, serviceSchedule)
  })

  it("accepts descriptor-based provisioning for prefixed service names", () => {
    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(
        [PrefixedLogger, {
          log(_message: string) {}
        }]
      ),
      resources: {
        DeltaTime: 1 / 60,
        Counter: 0
      },
      states: {
        CurrentPhase: "Running"
      }
    })

    runtime.runSchedule(prefixedServiceSchedule)
  })

  it("rejects raw service objects so descriptor names cannot drift", () => {
    Runtime.makeRuntime({
      schema,
      // @ts-expect-error!
      services: {
        Logger: {
          log(_message: string) {}
        }
      }
    })
  })

  it("rejects non-service descriptors in Runtime.services", () => {
    Runtime.services(
      // @ts-expect-error!
      [Time, 1 / 60]
    )
  })
})
