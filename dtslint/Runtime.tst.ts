import { App, Descriptor, Fx, Result, Schema } from "../src/index.ts"
import * as Size2 from "../src/Size2.ts"
import * as Vector2 from "../src/Vector2.ts"
import * as Runtime from "../src/runtime.ts"
import * as Schedule from "../src/schedule.ts"
import * as System from "../src/system.ts"
import { describe, expect, it } from "tstyche"

const Time = Descriptor.defineResource<number>()("Time")
const Counter = Descriptor.defineResource<number>()("Counter")
const Phase = Descriptor.defineState<"Running" | "Paused">()("Phase")
const Viewport = Descriptor.defineConstructedResource(Size2)("Viewport")
const Camera = Descriptor.defineConstructedState(Vector2)("Camera")
const Logger = Descriptor.defineService<{ readonly log: (message: string) => void }>()("Logger")
const PrefixedLogger = Descriptor.defineService<{ readonly log: (message: string) => void }>()("RuntimeTypes/Logger")

const schema = Schema.build(Schema.fragment({
  resources: {
    DeltaTime: Time,
    Counter,
    Viewport
  },
  states: {
    CurrentPhase: Phase,
    Camera
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

const resourceSchedule = Schedule.define([ResourceSystem])

const stateSchedule = Schedule.define([StateSystem])

const serviceSchedule = Schedule.define([ServiceSystem])

const prefixedServiceSchedule = Schedule.define([PrefixedServiceSystem])

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

  it("makeRuntimeResult unwraps validated resource and state seeds", () => {
    const runtime = Runtime.makeRuntimeResult({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: Result.success(1 / 60),
        Counter: Result.success(0)
      },
      states: {
        CurrentPhase: Result.success("Running" as const)
      }
    })

    if (runtime.ok) {
      runtime.value.runSchedule(resourceSchedule)
      runtime.value.runSchedule(stateSchedule)
    }
  })

  it("makeRuntimeConstructed accepts raw values for constructed resources and states", () => {
    const runtime = Runtime.makeRuntimeConstructed({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 1 / 60,
        Counter: 0,
        Viewport: {
          width: 320,
          height: 180
        }
      },
      states: {
        CurrentPhase: "Running",
        Camera: {
          x: 10,
          y: 20
        }
      }
    })

    if (runtime.ok) {
      runtime.value.runSchedule(resourceSchedule)
      runtime.value.runSchedule(stateSchedule)
    }
  })

  it("makeRuntimeConstructed rejects carried values for constructed resources that bypass raw validation", () => {
    Runtime.makeRuntimeConstructed({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 1 / 60,
        Counter: 0,
        // @ts-expect-error!
        Viewport: Result.success({ width: 320, height: 180 })
      }
    })
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
        Runtime.service(Logger, {
          log(message) {
            expect(message).type.toBe<string>()
          }
        })
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
        Runtime.service(PrefixedLogger, {
          log(message) {
            expect(message).type.toBe<string>()
          }
        })
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
    Runtime.service(
      // @ts-expect-error!
      Time,
      1 / 60
    )
  })

  it("rejects the old tuple entry syntax", () => {
    Runtime.services(
      // @ts-expect-error!
      [Logger, {
        log(_message: string) {}
      }]
    )
  })

  it("propagates composed feature runtime requirements through project.App.make and project.schedules", () => {
    const Root = Schema.defineRoot("RuntimeFeatureRoot")

    const Core = Schema.Feature.define("Core", {
      schema: Schema.fragment({
        resources: {
          DeltaTime: Time
        },
        states: {
          CurrentPhase: Phase
        }
      }),
      build: (_Game) => ({})
    })

    const Modes = Schema.Feature.define("Modes", {
      schema: Schema.fragment({}),
      requires: [Core] as const,
      build: (Game) => {
        const Mode = Game.StateMachine.define("Mode", ["Idle", "Live"] as const)

        const update = Game.System.define(
          "RuntimeTypes/FeatureMode",
          {
            resources: {
              time: Game.System.readResource(Time)
            },
            states: {
              phase: Game.System.readState(Phase)
            },
            services: {
              logger: Game.System.service(Logger)
            },
            machines: {
              mode: Game.System.machine(Mode)
            }
          },
          ({ resources, states, services, machines }) =>
            Fx.sync(() => {
              expect(resources.time.get()).type.toBe<number>()
              expect(states.phase.get()).type.toBe<"Running" | "Paused">()
              expect(machines.mode.get()).type.toBe<"Idle" | "Live">()
              services.logger.log("feature")
            })
        )

        return {
          machines: {
            Mode
          },
          update: [Game.Schedule.define([update])]
        }
      }
    })

    const project = Schema.Feature.compose({
      root: Root,
      features: [Core, Modes] as const
    })

    const runtime = project.Game.Runtime.make({
      services: project.Game.Runtime.services(
        project.Game.Runtime.service(Logger, {
          log(message) {
            expect(message).type.toBe<string>()
          }
        })
      ),
      resources: {
        DeltaTime: 1
      },
      states: {
        CurrentPhase: "Running"
      },
      machines: project.Game.Runtime.machines(
        project.Game.Runtime.machine(project.features.Modes.machines.Mode, "Idle")
      )
    })

    runtime.tick(...project.schedules.update)

    project.App.make({
      services: project.Game.Runtime.services(
        project.Game.Runtime.service(Logger, {
          log(_message) {}
        })
      ),
      resources: {
        DeltaTime: 1
      },
      states: {
        CurrentPhase: "Running"
      },
      machines: project.Game.Runtime.machines(
        project.Game.Runtime.machine(project.features.Modes.machines.Mode, "Idle")
      )
    })

    // @ts-expect-error!
    project.App.make({
      services: project.Game.Runtime.services(),
      resources: {
        DeltaTime: 1
      },
      states: {
        CurrentPhase: "Running"
      },
      machines: project.Game.Runtime.machines(
        project.Game.Runtime.machine(project.features.Modes.machines.Mode, "Idle")
      )
    })

    // @ts-expect-error!
    project.App.make({
      services: project.Game.Runtime.services(
        project.Game.Runtime.service(Logger, {
          log(_message) {}
        })
      ),
      states: {
        CurrentPhase: "Running"
      },
      machines: project.Game.Runtime.machines(
        project.Game.Runtime.machine(project.features.Modes.machines.Mode, "Idle")
      )
    })

    // @ts-expect-error!
    project.App.make({
      services: project.Game.Runtime.services(
        project.Game.Runtime.service(Logger, {
          log(_message) {}
        })
      ),
      resources: {
        DeltaTime: 1
      },
      machines: project.Game.Runtime.machines(
        project.Game.Runtime.machine(project.features.Modes.machines.Mode, "Idle")
      )
    })

    // @ts-expect-error!
    project.App.make({
      services: project.Game.Runtime.services(
        project.Game.Runtime.service(Logger, {
          log(_message) {}
        })
      ),
      resources: {
        DeltaTime: 1
      },
      states: {
        CurrentPhase: "Running"
      }
    })
  })
})
