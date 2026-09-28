import { Descriptor, Result, Schema } from "@bevy-ts/core"
import * as Size2 from "@bevy-ts/math/Size2"
import * as Vector2 from "@bevy-ts/math/Vector2"
import * as Runtime from "@bevy-ts/core/Runtime"
import * as Schedule from "@bevy-ts/core/Schedule"
import * as System from "@bevy-ts/core/System"
import { describe, expect, it } from "tstyche"

const Time = Descriptor.Resource<number>()("Time")
const Counter = Descriptor.Resource<number>()("Counter")
const Phase = Descriptor.Resource<"Running" | "Paused">()("Phase")
const Viewport = Descriptor.ConstructedResource(Size2)("Viewport")
const Camera = Descriptor.ConstructedResource(Vector2)("Camera")
const Logger = Descriptor.Service<{ readonly log: (message: string) => void }>()("Logger")
const PrefixedLogger = Descriptor.Service<{ readonly log: (message: string) => void }>()("RuntimeTypes/Logger")

const Game = Schema.bind(Schema.fragment({
  resources: {
    DeltaTime: Time,
    Counter,
    Viewport,
    CurrentPhase: Phase,
    Camera
  }
}))
const schema = Game.schema

const ResourceSystem = System.System(
  "RuntimeTypes/Resource",
  {
    schema,
    resources: {
      time: System.readResource(Time)
    }
  },
  ({ resources }) =>
    { resources.time.get() }
)

const StateSystem = System.System(
  "RuntimeTypes/State",
  {
    schema,
    resources: {
      phase: System.readResource(Phase)
    }
  },
  ({ resources }) =>
    { resources.phase.get() }
)

const ServiceSystem = System.System(
  "RuntimeTypes/Service",
  {
    schema,
    services: {
      logger: System.service(Logger)
    }
  },
  ({ services }) =>
    {
      services.logger.log("ok")
    }
)

const PrefixedServiceSystem = System.System(
  "RuntimeTypes/PrefixedService",
  {
    schema,
    services: {
      logger: System.service(PrefixedLogger)
    }
  },
  ({ services }) =>
    {
      services.logger.log("ok")
    }
)

const resourceSchedule = Schedule.Schedule(ResourceSystem)

const stateSchedule = Schedule.Schedule(StateSystem)

const serviceSchedule = Schedule.Schedule(ServiceSystem)

const prefixedServiceSchedule = Schedule.Schedule(PrefixedServiceSystem)

describe("Runtime", () => {
  it("accepts initialization keyed by schema property names", () => {
    const runtime = Runtime.make({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 1 / 60,
        Counter: 0,
        CurrentPhase: "Running"
      }
    })

    expect(runtime).type.toBeAssignableTo<Runtime.Runtime<
      typeof schema,
      {},
      {
        readonly DeltaTime: number
        readonly Counter: number
        readonly CurrentPhase: "Running" | "Paused"
      }
    >>()
  })

  it("make accepts raw values for constructed resources and returns a Result", () => {
    const runtime = Runtime.make({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 1 / 60,
        Counter: 0,
        Viewport: {
          width: 320,
          height: 180
        },
        CurrentPhase: "Running",
        Camera: {
          x: 10,
          y: 20
        }
      }
    })

    if (runtime.ok) {
      runtime.value.tick(resourceSchedule)
      runtime.value.tick(stateSchedule)
    }
  })

  it("make rejects Result-wrapped values for constructed resources", () => {
    Runtime.make({
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
    Runtime.make({
      schema,
      services: Runtime.services(),
      resources: {
        // @ts-expect-error!
        Time: 1 / 60
      }
    })
  })

  it("rejects descriptor-name state keys that are not schema keys", () => {
    Runtime.make({
      schema,
      services: Runtime.services(),
      resources: {
        // @ts-expect-error!
        Phase: "Running"
      }
    })
  })

  it("rejects schedules whose required service is missing from the runtime", () => {
    const runtime = Runtime.make({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 1 / 60,
        Counter: 0,
        CurrentPhase: "Running"
      }
    })

    // @ts-expect-error!
    runtime.tick(serviceSchedule)
  })

  it("rejects schedules whose required resource initialization is missing from the runtime", () => {
    const runtime = Runtime.make({
      schema,
      services: Runtime.services()
    })

    // @ts-expect-error!
    runtime.tick(resourceSchedule)
  })

  it("rejects schedules whose required state initialization is missing from the runtime", () => {
    const runtime = Runtime.make({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 1 / 60,
        Counter: 0
      }
    })

    // @ts-expect-error!
    runtime.tick(stateSchedule)
  })

  it("propagates runtime requirement checks through app.update", () => {
    const runtime = Runtime.make({
      schema,
      services: Runtime.services(),
      resources: {
        DeltaTime: 1 / 60,
        Counter: 0,
        CurrentPhase: "Running"
      }
    })

    // @ts-expect-error!
    runtime.tick(serviceSchedule)
  })

  it("accepts schedules whose requirements are fully satisfied", () => {
    const runtime = Runtime.make({
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
        Counter: 0,
        CurrentPhase: "Running"
      }
    })

    runtime.tick(resourceSchedule, stateSchedule, serviceSchedule)
  })

  it("accepts descriptor-based provisioning for prefixed service names", () => {
    const runtime = Runtime.make({
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
        Counter: 0,
        CurrentPhase: "Running"
      }
    })

    runtime.tick(prefixedServiceSchedule)
  })

  it("rejects raw service objects so descriptor names cannot drift", () => {
    Runtime.make({
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
          DeltaTime: Time,
          CurrentPhase: Phase
        }
      }),
      build: (_Game) => ({})
    })

    const Modes = Schema.Feature.define("Modes", {
      schema: Schema.fragment({}),
      requires: [Core] as const,
      build: (Game) => {
        const Mode = Game.StateMachine("Mode", ["Idle", "Live"] as const)

        const update = Game.System(
          "RuntimeTypes/FeatureMode",
          {
            resources: {
              time: Game.System.readResource(Time),
              phase: Game.System.readResource(Phase)
            },
            services: {
              logger: Game.System.service(Logger)
            },
            machines: {
              mode: Game.System.machine(Mode)
            }
          },
          ({ resources, services, machines }) =>
            {
              expect(resources.time.get()).type.toBe<number>()
              expect(resources.phase.get()).type.toBe<"Running" | "Paused">()
              expect(machines.mode.get()).type.toBe<"Idle" | "Live">()
              services.logger.log("feature")
            }
        )

        return {
          machines: {
            Mode
          },
          update: [Game.Schedule(update)]
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
        DeltaTime: 1,
        CurrentPhase: "Running"
      },
      machines: project.Game.Runtime.machines(
        project.Game.Runtime.machine(project.features.Modes.machines.Mode, "Idle")
      )
    })

    runtime.tick(...project.schedules.update)

    const runtime2 = project.Game.Runtime.make({
      services: project.Game.Runtime.services(),
      resources: {
        DeltaTime: 1,
        CurrentPhase: "Running"
      },
      machines: project.Game.Runtime.machines(
        project.Game.Runtime.machine(project.features.Modes.machines.Mode, "Idle")
      )
    })
    // @ts-expect-error!
    runtime2.tick(...project.schedules.update)

    const runtime3 = project.Game.Runtime.make({
      services: project.Game.Runtime.services(
        project.Game.Runtime.service(Logger, {
          log(_message) {}
        })
      ),
      resources: {
        CurrentPhase: "Running"
      },
      machines: project.Game.Runtime.machines(
        project.Game.Runtime.machine(project.features.Modes.machines.Mode, "Idle")
      )
    })
    // @ts-expect-error!
    runtime3.tick(...project.schedules.update)

    const runtime4 = project.Game.Runtime.make({
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
    runtime4.tick(...project.schedules.update)

    const runtime5 = project.Game.Runtime.make({
      services: project.Game.Runtime.services(
        project.Game.Runtime.service(Logger, {
          log(_message) {}
        })
      ),
      resources: {
        DeltaTime: 1,
        CurrentPhase: "Running"
      }
    })
    // @ts-expect-error!
    runtime5.tick(...project.schedules.update)
  })
})
