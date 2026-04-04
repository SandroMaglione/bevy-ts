import { Descriptor, Fx, Schema } from "../src/index.ts"
import * as Runtime from "../src/runtime.ts"
import * as System from "../src/system.ts"
import { describe, expect, it } from "tstyche"

const Position = Descriptor.Component<{ x: number; y: number }>()("StateMachine/Position")
const Counter = Descriptor.Resource<number>()("StateMachine/Counter")

const schema = Schema.build(Schema.fragment({
  components: {
    Position
  },
  resources: {
    Counter
  }
}))

const otherSchema = Schema.build(Schema.fragment({
  resources: {
    Counter
  }
}))

const Game = Schema.bind(schema)
const OtherGame = Schema.bind(otherSchema)

const AppState = Game.StateMachine("AppState", ["Menu", "Playing", "Paused"] as const)
const RoundState = Game.StateMachine("RoundState", ["Warmup", "Live", "SuddenDeath"] as const)
const OtherState = OtherGame.StateMachine("OtherState", ["Idle", "Running"] as const)

const ReaderSystem = Game.System(
  "StateMachine/Reader",
  {
    machines: {
      app: System.machine(AppState)
    }
  },
  ({ machines }) =>
    Fx.sync(() => {
      expect(machines.app.get()).type.toBe<"Menu" | "Playing" | "Paused">()
    })
)

const WriterSystem = Game.System(
  "StateMachine/Writer",
  {
    nextMachines: {
      app: System.nextState(AppState)
    }
  },
  ({ nextMachines }) =>
    Fx.sync(() => {
      nextMachines.app.set("Playing")
      nextMachines.app.setIfChanged("Paused")
      expect(nextMachines.app.getPending()).type.toBe<"Menu" | "Playing" | "Paused" | undefined>()
    })
)

const TransitionSystem = Game.System(
  "StateMachine/TransitionReader",
  {
    transitions: {
      app: System.transition(AppState)
    }
  },
  ({ transitions }) =>
    Fx.sync(() => {
      expect(transitions.app.get().from).type.toBe<"Menu" | "Playing" | "Paused">()
      expect(transitions.app.get().to).type.toBe<"Menu" | "Playing" | "Paused">()
    })
)

const TransitionEventSystem = Game.System(
  "StateMachine/TransitionEventReader",
  {
    transitionEvents: {
      app: Game.System.readTransitionEvent(AppState)
    }
  },
  ({ transitionEvents }) =>
    Fx.sync(() => {
      const events = transitionEvents.app.all()
      expect(events).type.toBe<ReadonlyArray<{ readonly from: "Menu" | "Playing" | "Paused"; readonly to: "Menu" | "Playing" | "Paused" }>>()
    })
)

const PlayingOnlySystem = Game.System(
  "StateMachine/PlayingOnly",
  {
    when: [Game.Condition.inState(AppState, "Playing")]
  },
  () => Fx.sync<undefined, {}>(() => undefined)
)


const MachineSchedule = Game.Schedule(ReaderSystem, WriterSystem)

const EnterPlaying = Game.Schedule.onEnter(AppState, "Playing", [TransitionSystem])

const TransitionBundle = Game.Schedule.transitions(EnterPlaying)

describe("StateMachine", () => {
  it("keeps the machine value union exact across readers and writers", () => {
    AppState
    RoundState
    MachineSchedule
    EnterPlaying
    TransitionBundle
    TransitionEventSystem
  })

  it("supports multiple machines with exact unions in one system", () => {
    Game.System(
      "StateMachine/MultiMachineReader",
      {
        machines: {
          app: System.machine(AppState),
          round: System.machine(RoundState)
        },
        nextMachines: {
          round: System.nextState(RoundState)
        }
      },
      ({ machines, nextMachines }) =>
        Fx.sync(() => {
          expect(machines.app.get()).type.toBe<"Menu" | "Playing" | "Paused">()
          expect(machines.round.get()).type.toBe<"Warmup" | "Live" | "SuddenDeath">()
          nextMachines.round.set("Live")
          // @ts-expect-error!
          nextMachines.round.set("Paused")
        })
    )
  })

  it("rejects invalid machine values in conditions and queued writes", () => {
    Game.Condition.inState(
      AppState,
      // @ts-expect-error!
      "GameOver"
    )

    Game.System(
      "StateMachine/InvalidWriter",
      {
        nextMachines: {
          app: System.nextState(AppState)
        }
      },
      ({ nextMachines }) =>
        Fx.sync(() => {
          // @ts-expect-error!
          nextMachines.app.set("GameOver")
        })
    )
  })

  it("rejects cross-schema machine references", () => {
    Game.System(
      "StateMachine/CrossSchemaSystem",
      {
        machines: {
          // @ts-expect-error!
          other: System.machine(OtherState)
        }
      },
      () => Fx.sync<undefined, {}>(() => undefined)
    )

    Game.System(
      "StateMachine/CrossSchemaTransitionEvents",
      {
        transitionEvents: {
          // @ts-expect-error!
          other: Game.System.readTransitionEvent(OtherState)
        }
      },
      () => Fx.sync<undefined, {}>(() => undefined)
    )

    // @ts-expect-error!
    Game.Schedule.onEnter(OtherState, "Idle", [ReaderSystem])

    const OtherBundle = OtherGame.Schedule.transitions(
      OtherGame.Schedule.onEnter(OtherState, "Idle", [])
    )

    Game.Schedule(
      ReaderSystem,
      // @ts-expect-error!
      Game.Schedule.applyStateTransitions(OtherBundle)
    )
  })

  it("rejects runtimes that omit required machine initialization", () => {
    const runtime = Game.Runtime.make({
      services: Runtime.services(),
      resources: {
        Counter: 0
      }
    })

    expect(runtime.machineValues).type.toBe<{}>()
  })

  it("accepts runtimes that initialize the required machine", () => {
    const runtime = Game.Runtime.make({
      services: Runtime.services(),
      resources: {
        Counter: 0
      },
      machines: Runtime.machines(
        Runtime.machine(AppState, "Menu"),
        Runtime.machine(RoundState, "Warmup")
      )
    })

    runtime.runSchedule(MachineSchedule)
  })

  it("accepts direct inline schedule execution for disjunctive machine conditions", () => {
    const IncrementWithOrCondition = Game.System(
      "StateMachine/InlineRunSchedule",
      {
        when: [
          Game.Condition.or(
            Game.Condition.inState(AppState, "Menu"),
            Game.Condition.inState(RoundState, "Live")
          )
        ],
        resources: {
          counter: System.writeResource(Counter)
        }
      },
      () => Fx.sync<undefined, {}>(() => undefined)
    )

    const runtime = Game.Runtime.make({
      services: Runtime.services(),
      resources: {
        Counter: 0
      },
      machines: Runtime.machines(
        Runtime.machine(AppState, "Menu"),
        Runtime.machine(RoundState, "Warmup")
      )
    })

    runtime.runSchedule(Game.Schedule(IncrementWithOrCondition))
  })

  it("rejects invalid multi-machine runtime initialization values", () => {
    Game.Runtime.make({
      services: Runtime.services(),
      resources: {
        Counter: 0
      },
      machines: Runtime.machines(
        Runtime.machine(AppState, "Menu"),
        Runtime.machine(
          RoundState,
          // @ts-expect-error!
          "Playing"
        )
      )
    })
  })

  it("does not expose transition context on normal schedules", () => {
    Game.System(
      "StateMachine/NoTransitionContext",
      {},
      ({ transitions }) =>
        Fx.sync(() => {
          // @ts-expect-error!
          transitions.app
        })
    )
  })

  it("keeps transition schedules tied to the machine union", () => {
    Game.Schedule.onTransition(
      AppState,
      ["Menu", "Playing"] as const,
      [TransitionSystem]
    )

    Game.Schedule.onExit(
      AppState,
      // @ts-expect-error!
      "GameOver",
      [TransitionSystem]
    )
  })

  it("includes transition bundle requirements in the parent schedule", () => {
    const Logger = Descriptor.Service<{ readonly log: (message: string) => void }>()("StateMachine/Logger")

    const TransitionWithService = Game.Schedule.onEnter(AppState, "Playing", [
      Game.System(
        "StateMachine/TransitionServiceRequirement",
        {
          transitions: {
            app: System.transition(AppState)
          },
          services: {
            logger: System.service(Logger)
          }
        },
        ({ services }) =>
          Fx.sync(() => {
            services.logger.log("ok")
          })
      )
    ])

    const schedule = Game.Schedule(WriterSystem, Game.Schedule.applyStateTransitions(Game.Schedule.transitions(TransitionWithService)))

    const runtime = Game.Runtime.make({
      services: Runtime.services(),
      resources: {
        Counter: 0
      },
      machines: Runtime.machines(
        Runtime.machine(AppState, "Menu"),
        Runtime.machine(RoundState, "Warmup")
      )
    })

    runtime.runSchedule(schedule)
  })

  it("keeps transition event unions exact and allows bundle flattening", () => {
    const nested = Game.Schedule.transitions(
      Game.Schedule.onEnter(AppState, "Playing", [TransitionSystem])
    )

    const flattened = Game.Schedule.transitions(
      nested,
      Game.Schedule.onExit(AppState, "Paused", [TransitionSystem])
    )

    const schedule = Game.Schedule(
      WriterSystem,
      Game.Schedule.applyStateTransitions(flattened)
    )

    schedule
  })

  it("rejects nested transition-application markers in transition schedules", () => {
    Game.Schedule.onEnter(AppState, "Playing", [
      TransitionSystem,
      // @ts-expect-error!
      Game.Schedule.applyStateTransitions()
    ])
  })
})
