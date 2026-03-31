import { describe, expect, it } from "vitest"
import { App, Descriptor, Fx, Schema } from "../src/index.ts"
import * as Runtime from "../src/runtime.ts"
import * as Schedule from "../src/schedule.ts"
import * as System from "../src/system.ts"
import { readResourceValue } from "./utils/fixtures.ts"

const Counter = Descriptor.defineResource<number>()("Counter")
const Log = Descriptor.defineResource<ReadonlyArray<string>>()("Log")
const Health = Descriptor.defineComponent<{ current: number }>()("Health")
const BootCount = Descriptor.defineResource<number>()("BootCount")

const schema = Schema.build(Schema.fragment({
  resources: {
    Counter,
    Log
  }
}))

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
      schema,
      systems: [increment]
    })

    const readSchedule = Schedule.define({
      schema,
      systems: [read]
    })

    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(),
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
      schema,
      systems: [first]
    })

    const secondSchedule = Schedule.define({
      schema,
      systems: [second]
    })

    const readSchedule = Schedule.define({
      schema,
      systems: [read]
    })

    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(),
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
      schema,
      systems: [setup]
    })

    const readSchedule = Schedule.define({
      schema,
      systems: [read]
    })

    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(),
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

  it("repeated update calls accumulate world changes", () => {
    const increment = System.define(
      "AppTest/RepeatedIncrement",
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

    const runtime = Runtime.makeRuntime({
      schema,
      services: Runtime.services(),
      resources: {
        Counter: 0,
        Log: []
      }
    })

    const app = App.makeApp(runtime)
    const schedule = Schedule.define({
      schema,
      systems: [increment]
    })

    app.update(schedule)
    app.update(schedule)
    app.update(schedule)

    const captured = readCounter(runtime)
    expect(captured).toBe(3)
  })

  it("composes typed features before bind and runs aggregated app phases", () => {
    const Root = Schema.defineRoot("FeatureApp")

    const Core = Schema.Feature.define("Core", {
      schema: Schema.fragment({
        resources: {
          Counter,
          Log,
          BootCount
        }
      }),
      build: (Game) => {
        const bootstrap = Game.System.define(
          "Feature/CoreBootstrap",
          {
            resources: {
              bootCount: Game.System.writeResource(BootCount),
              log: Game.System.writeResource(Log)
            }
          },
          ({ resources }) =>
            Fx.sync(() => {
              resources.bootCount.update((value) => value + 1)
              resources.log.update((entries) => [...entries, "bootstrap"])
            })
        )

        return {
          bootstrap: [Game.Schedule.define({
            systems: [bootstrap]
          })]
        }
      }
    })

    const Combat = Schema.Feature.define("Combat", {
      schema: Schema.fragment({
        components: {
          Health
        }
      }),
      requires: [Core] as const,
      build: (Game) => {
        const increment = Game.System.define(
          "Feature/CombatIncrement",
          {
            resources: {
              counter: Game.System.writeResource(Counter),
              log: Game.System.writeResource(Log)
            }
          },
          ({ resources }) =>
            Fx.sync(() => {
              resources.counter.update((value) => value + 1)
              resources.log.update((entries) => [...entries, "combat"])
            })
        )

        const capture = Game.System.define(
          "Feature/CombatCapture",
          {
            resources: {
              counter: Game.System.readResource(Counter),
              bootCount: Game.System.readResource(BootCount),
              log: Game.System.readResource(Log)
            }
          },
          ({ resources }) =>
            Fx.sync(() => {
              capturedCounter = resources.counter.get()
              capturedBootCount = resources.bootCount.get()
              capturedLog = resources.log.get()
            })
        )

        return {
          update: [
            Game.Schedule.define({
              systems: [increment]
            }),
            Game.Schedule.define({
              systems: [capture]
            })
          ]
        }
      }
    })

    let capturedCounter = -1
    let capturedBootCount = -1
    let capturedLog: ReadonlyArray<string> = []

    const project = Schema.Feature.compose({
      root: Root,
      features: [Core, Combat] as const
    })

    const app = project.App.make({
      services: project.Game.Runtime.services(),
      resources: {
        Counter: 0,
        Log: [],
        BootCount: 0
      }
    })

    app.bootstrap()
    app.update()

    expect(capturedCounter).toBe(1)
    expect(capturedBootCount).toBe(1)
    expect(capturedLog).toEqual(["bootstrap", "combat"])
  })

  it("uses selected feature order for aggregated phases and matches manual schedule execution", () => {
    const Root = Schema.defineRoot("FeatureOrderApp")
    const Trace = Descriptor.defineResource<ReadonlyArray<string>>()("FeatureOrder/Trace")

    const Core = Schema.Feature.define("Core", {
      schema: Schema.fragment({
        resources: {
          Trace
        }
      }),
      build: (Game) => {
        const bootstrap = Game.System.define(
          "FeatureOrder/CoreBootstrap",
          {
            resources: {
              trace: Game.System.writeResource(Trace)
            }
          },
          ({ resources }) =>
            Fx.sync(() => {
              resources.trace.update((entries) => [...entries, "core-bootstrap"])
            })
        )

        const update = Game.System.define(
          "FeatureOrder/CoreUpdate",
          {
            resources: {
              trace: Game.System.writeResource(Trace)
            }
          },
          ({ resources }) =>
            Fx.sync(() => {
              resources.trace.update((entries) => [...entries, "core-update"])
            })
        )

        return {
          bootstrap: [Game.Schedule.define({ systems: [bootstrap] })],
          update: [Game.Schedule.define({ systems: [update] })]
        }
      }
    })

    const Combat = Schema.Feature.define("Combat", {
      schema: Schema.fragment({}),
      requires: [Core] as const,
      build: (Game) => {
        const bootstrap = Game.System.define(
          "FeatureOrder/CombatBootstrap",
          {
            resources: {
              trace: Game.System.writeResource(Trace)
            }
          },
          ({ resources }) =>
            Fx.sync(() => {
              resources.trace.update((entries) => [...entries, "combat-bootstrap"])
            })
        )

        const update = Game.System.define(
          "FeatureOrder/CombatUpdate",
          {
            resources: {
              trace: Game.System.writeResource(Trace)
            }
          },
          ({ resources }) =>
            Fx.sync(() => {
              resources.trace.update((entries) => [...entries, "combat-update"])
            })
        )

        return {
          bootstrap: [Game.Schedule.define({ systems: [bootstrap] })],
          update: [Game.Schedule.define({ systems: [update] })]
        }
      }
    })

    const Empty = Schema.Feature.define("Empty", {
      schema: Schema.fragment({}),
      build: () => ({})
    })

    const project = Schema.Feature.compose({
      root: Root,
      features: [Combat, Core, Empty] as const
    })

    const manualRuntime = project.Game.Runtime.make({
      services: project.Game.Runtime.services(),
      resources: {
        Trace: []
      }
    })

    manualRuntime.initialize(...project.schedules.bootstrap)
    manualRuntime.tick(...project.schedules.update)

    const app = project.App.make({
      services: project.Game.Runtime.services(),
      resources: {
        Trace: []
      }
    })

    app.bootstrap()
    app.update()

    expect(readResourceValue(manualRuntime, project.schema, Trace)).toEqual([
      "combat-bootstrap",
      "core-bootstrap",
      "combat-update",
      "core-update"
    ])
    expect(readResourceValue(app.runtime, project.schema, Trace)).toEqual([
      "combat-bootstrap",
      "core-bootstrap",
      "combat-update",
      "core-update"
    ])
    expect(project.features.Empty.bootstrap).toEqual([])
    expect(project.features.Empty.update).toEqual([])
  })

  it("throws deterministically for duplicate or missing features when type checks are bypassed", () => {
    const Root = Schema.defineRoot("FeatureRuntimeChecks")

    const Core = Schema.Feature.define("Core", {
      schema: Schema.fragment({}),
      build: () => ({})
    })

    const Combat = Schema.Feature.define("Combat", {
      schema: Schema.fragment({}),
      requires: [Core] as const,
      build: () => ({})
    })

    expect(() =>
      Schema.Feature.compose({
        root: Root,
        features: [Core, Core]
      } as never)
    ).toThrow("Duplicate feature name: Core")

    expect(() =>
      Schema.Feature.compose({
        root: Root,
        features: [Combat]
      } as never)
    ).toThrow("Missing required feature: Core")
  })
})

const readCounter = (
  runtime: Runtime.Runtime<
    typeof schema,
    {},
    {
      readonly Counter: number
      readonly Log: ReadonlyArray<string>
    }
  >
): number => {
  let captured = -1
  runtime.runSchedule(Schedule.define({
    schema,
    systems: [System.define(
      "AppTest/ReadCounterHelperSystem",
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
    )]
  }))
  return captured
}
