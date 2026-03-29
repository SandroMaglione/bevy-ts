import { describe, expect, it } from "vitest"
import { Descriptor, Fx, Label, Schema } from "../src/index.ts"
import * as Runtime from "../src/runtime.ts"
import * as System from "../src/system.ts"
import { readResourceValue } from "./utils/fixtures.ts"

const Counter = Descriptor.defineResource<number>()("StateMachineRuntime/Counter")
const Log = Descriptor.defineResource<ReadonlyArray<string>>()("StateMachineRuntime/Log")

const schema = Schema.build(Schema.fragment({
  resources: {
    Counter,
    Log
  }
}))

const Game = Schema.bind(schema)
const AppState = Game.StateMachine.define("AppState", ["Menu", "Playing", "Paused"] as const)
const RoundState = Game.StateMachine.define("RoundState", ["Warmup", "Live", "SuddenDeath"] as const)

const makeRuntime = () =>
  Game.Runtime.make({
    services: Runtime.services(),
    resources: {
      Counter: 0,
      Log: []
    },
    machines: Runtime.machines(
      Runtime.machine(AppState, "Menu"),
      Runtime.machine(RoundState, "Warmup")
    )
  })

describe("Runtime state machine", () => {
  it("gates systems by the committed current state", () => {
    const increment = Game.System.define(
      "StateMachineRuntime/IncrementWhilePlaying",
      {
        when: [Game.Condition.inState(AppState, "Playing")],
        resources: {
          counter: System.writeResource(Counter)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.counter.update((value) => value + 1)
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Game.Schedule.define({
      systems: [increment]
    }))

    expect(readResourceValue(runtime, schema, Counter)).toBe(0)

    const queuePlaying = Game.System.define(
      "StateMachineRuntime/QueuePlaying",
      {
        nextMachines: {
          app: System.nextState(AppState)
        }
      },
      ({ nextMachines }) =>
        Fx.sync(() => {
          nextMachines.app.set("Playing")
        })
    )

    runtime.runSchedule(Game.Schedule.define({
      systems: [queuePlaying],
      steps: [queuePlaying, Game.Schedule.applyStateTransitions(), increment]
    }))

    expect(readResourceValue(runtime, schema, Counter)).toBe(1)
  })

  it("keeps queued transitions invisible until applyStateTransitions", () => {
    const queuePlaying = Game.System.define(
      "StateMachineRuntime/QueuePlayingForVisibility",
      {
        nextMachines: {
          app: System.nextState(AppState)
        }
      },
      ({ nextMachines }) =>
        Fx.sync(() => {
          nextMachines.app.set("Playing")
        })
    )

    const before = Game.System.define(
      "StateMachineRuntime/BeforeTransition",
      {
        when: [Game.Condition.inState(AppState, "Menu")],
        machines: {
          app: System.machine(AppState)
        },
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ machines, resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, `before:${machines.app.get()}`])
        })
    )

    const after = Game.System.define(
      "StateMachineRuntime/AfterTransition",
      {
        when: [Game.Condition.inState(AppState, "Playing")],
        machines: {
          app: System.machine(AppState)
        },
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ machines, resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, `after:${machines.app.get()}`])
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Game.Schedule.define({
      systems: [queuePlaying, before, after],
      steps: [queuePlaying, before, Game.Schedule.applyStateTransitions(), after]
    }))

    expect(readResourceValue(runtime, schema, Log)).toEqual(["before:Menu", "after:Playing"])
  })

  it("runs exit, transition, and enter schedules in order", () => {
    const queuePlaying = Game.System.define(
      "StateMachineRuntime/QueueTransitionOrder",
      {
        nextMachines: {
          app: System.nextState(AppState)
        }
      },
      ({ nextMachines }) =>
        Fx.sync(() => {
          nextMachines.app.set("Playing")
        })
    )

    const exitSystem = Game.System.define(
      "StateMachineRuntime/OnExitMenu",
      {
        transitions: {
          app: System.transition(AppState)
        },
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ transitions, resources }) =>
        Fx.sync(() => {
          const transition = transitions.app.get()
          resources.log.update((entries) => [...entries, `exit:${transition.from}->${transition.to}`])
        })
    )

    const transitionSystem = Game.System.define(
      "StateMachineRuntime/OnTransitionMenuToPlaying",
      {
        transitions: {
          app: System.transition(AppState)
        },
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ transitions, resources }) =>
        Fx.sync(() => {
          const transition = transitions.app.get()
          resources.log.update((entries) => [...entries, `transition:${transition.from}->${transition.to}`])
        })
    )

    const enterSystem = Game.System.define(
      "StateMachineRuntime/OnEnterPlaying",
      {
        transitions: {
          app: System.transition(AppState)
        },
        machines: {
          app: System.machine(AppState)
        },
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ transitions, machines, resources }) =>
        Fx.sync(() => {
          const transition = transitions.app.get()
          resources.log.update((entries) => [...entries, `enter:${transition.from}->${transition.to}:${machines.app.get()}`])
        })
    )

    const transitions = Game.Schedule.transitions(
      Game.Schedule.onExit(AppState, "Menu", {
        systems: [exitSystem]
      }),
      Game.Schedule.onTransition(AppState, {
        from: "Menu",
        to: "Playing"
      }, {
        systems: [transitionSystem]
      }),
      Game.Schedule.onEnter(AppState, "Playing", {
        systems: [enterSystem]
      })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Game.Schedule.define({
      systems: [queuePlaying],
      steps: [queuePlaying, Game.Schedule.applyStateTransitions(transitions)]
    }))

    expect(readResourceValue(runtime, schema, Log)).toEqual([
      "exit:Menu->Playing",
      "transition:Menu->Playing",
      "enter:Menu->Playing:Playing"
    ])
  })

  it("supports stateChanged conditions after the transition marker", () => {
    const queuePlaying = Game.System.define(
      "StateMachineRuntime/QueueForChanged",
      {
        nextMachines: {
          app: System.nextState(AppState)
        }
      },
      ({ nextMachines }) =>
        Fx.sync(() => {
          nextMachines.app.set("Playing")
        })
    )

    const observeChanged = Game.System.define(
      "StateMachineRuntime/ObserveChanged",
      {
        when: [Game.Condition.stateChanged(AppState)],
        resources: {
          counter: System.writeResource(Counter)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.counter.update((value) => value + 1)
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Game.Schedule.define({
      systems: [queuePlaying, observeChanged],
      steps: [queuePlaying, Game.Schedule.applyStateTransitions(), observeChanged]
    }))

    expect(readResourceValue(runtime, schema, Counter)).toBe(1)
  })

  it("gates configured sets with machine conditions", () => {
    const gameplay = Label.defineSystemSetLabel("StateMachineRuntime/Gameplay")

    const first = Game.System.define(
      "StateMachineRuntime/SetFirst",
      {
        inSets: [gameplay],
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "first"])
        })
    )

    const second = Game.System.define(
      "StateMachineRuntime/SetSecond",
      {
        inSets: [gameplay],
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "second"])
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Game.Schedule.define({
      systems: [first, second],
      sets: [
        Game.Schedule.configureSet({
          label: gameplay,
          when: [Game.Condition.inState(AppState, "Playing")]
        })
      ] as const
    }))

    expect(readResourceValue(runtime, schema, Log)).toEqual([])
  })

  it("supports conditions composed across multiple machines", () => {
    const queueStates = Game.System.define(
      "StateMachineRuntime/QueueMultipleMachines",
      {
        nextMachines: {
          app: System.nextState(AppState),
          round: System.nextState(RoundState)
        }
      },
      ({ nextMachines }) =>
        Fx.sync(() => {
          nextMachines.app.set("Playing")
          nextMachines.round.set("Live")
        })
    )

    const gated = Game.System.define(
      "StateMachineRuntime/MultiMachineGated",
      {
        when: [
          Game.Condition.and(
            Game.Condition.inState(AppState, "Playing"),
            Game.Condition.inState(RoundState, "Live")
          )
        ],
        resources: {
          counter: System.writeResource(Counter)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.counter.update((value) => value + 1)
        })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Game.Schedule.define({
      systems: [queueStates, gated],
      steps: [queueStates, Game.Schedule.applyStateTransitions(), gated]
    }))

    expect(readResourceValue(runtime, schema, Counter)).toBe(1)
  })

  it("applies multiple machine transitions in definition order", () => {
    const LocalGame = Schema.bind(schema)
    const LocalAppState = LocalGame.StateMachine.define("LocalAppState", ["Menu", "Playing", "Paused"] as const)
    const LocalRoundState = LocalGame.StateMachine.define("LocalRoundState", ["Warmup", "Live", "SuddenDeath"] as const)

    const queueStates = LocalGame.System.define(
      "StateMachineRuntime/QueueDefinitionOrder",
      {
        nextMachines: {
          round: System.nextState(LocalRoundState),
          app: System.nextState(LocalAppState)
        }
      },
      ({ nextMachines }) =>
        Fx.sync(() => {
          // Intentionally queued in reverse declaration order.
          nextMachines.round.set("Live")
          nextMachines.app.set("Playing")
        })
    )

    const appEnter = LocalGame.System.define(
      "StateMachineRuntime/AppEnterPlaying",
      {
        transitions: {
          app: System.transition(LocalAppState)
        },
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ transitions, resources }) =>
        Fx.sync(() => {
          const transition = transitions.app.get()
          resources.log.update((entries) => [...entries, `app:${transition.from}->${transition.to}`])
        })
    )

    const roundEnter = LocalGame.System.define(
      "StateMachineRuntime/RoundEnterLive",
      {
        transitions: {
          round: System.transition(LocalRoundState)
        },
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ transitions, resources }) =>
        Fx.sync(() => {
          const transition = transitions.round.get()
          resources.log.update((entries) => [...entries, `round:${transition.from}->${transition.to}`])
        })
    )

    const transitions = LocalGame.Schedule.transitions(
      LocalGame.Schedule.onEnter(LocalAppState, "Playing", {
        systems: [appEnter]
      }),
      LocalGame.Schedule.onEnter(LocalRoundState, "Live", {
        systems: [roundEnter]
      })
    )

    const runtime = LocalGame.Runtime.make({
      services: Runtime.services(),
      resources: {
        Counter: 0,
        Log: []
      },
      machines: Runtime.machines(
        Runtime.machine(LocalAppState, "Menu"),
        Runtime.machine(LocalRoundState, "Warmup")
      )
    })
    runtime.runSchedule(LocalGame.Schedule.define({
      systems: [queueStates],
      steps: [queueStates, LocalGame.Schedule.applyStateTransitions(transitions)]
    }))

    expect(readResourceValue(runtime, schema, Log)).toEqual([
      "app:Menu->Playing",
      "round:Warmup->Live"
    ])
  })

  it("defers transitions queued during transition schedules to the next marker", () => {
    const LocalGame = Schema.bind(schema)
    const LocalAppState = LocalGame.StateMachine.define("LocalAppStateDeferred", ["Menu", "Playing", "Paused"] as const)
    const LocalRoundState = LocalGame.StateMachine.define("LocalRoundStateDeferred", ["Warmup", "Live", "SuddenDeath"] as const)

    const queueApp = LocalGame.System.define(
      "StateMachineRuntime/QueueAppOnly",
      {
        nextMachines: {
          app: System.nextState(LocalAppState)
        }
      },
      ({ nextMachines }) =>
        Fx.sync(() => {
          nextMachines.app.set("Playing")
        })
    )

    const queueRoundDuringEnter = LocalGame.System.define(
      "StateMachineRuntime/QueueRoundDuringEnter",
      {
        transitions: {
          app: System.transition(LocalAppState)
        },
        nextMachines: {
          round: System.nextState(LocalRoundState)
        },
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ transitions, nextMachines, resources }) =>
        Fx.sync(() => {
          const transition = transitions.app.get()
          resources.log.update((entries) => [...entries, `enter-app:${transition.to}`])
          nextMachines.round.set("SuddenDeath")
        })
    )

    const observeRoundChange = LocalGame.System.define(
      "StateMachineRuntime/ObserveDeferredRoundChange",
      {
        when: [LocalGame.Condition.stateChanged(LocalRoundState)],
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, "round-changed"])
        })
    )

    const observeRoundState = LocalGame.System.define(
      "StateMachineRuntime/ObserveRoundState",
      {
        machines: {
          round: System.machine(LocalRoundState)
        },
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ machines, resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, `round:${machines.round.get()}`])
        })
    )

    const transitions = LocalGame.Schedule.transitions(
      LocalGame.Schedule.onEnter(LocalAppState, "Playing", {
        systems: [queueRoundDuringEnter]
      })
    )

    const runtime = LocalGame.Runtime.make({
      services: Runtime.services(),
      resources: {
        Counter: 0,
        Log: []
      },
      machines: Runtime.machines(
        Runtime.machine(LocalAppState, "Menu"),
        Runtime.machine(LocalRoundState, "Warmup")
      )
    })
    runtime.runSchedule(LocalGame.Schedule.define({
      systems: [queueApp, observeRoundChange, observeRoundState],
      steps: [queueApp, LocalGame.Schedule.applyStateTransitions(transitions), observeRoundChange, observeRoundState]
    }))

    expect(readResourceValue(runtime, schema, Log)).toEqual([
      "enter-app:Playing",
      "round:Warmup"
    ])

    runtime.runSchedule(LocalGame.Schedule.define({
      systems: [observeRoundChange, observeRoundState],
      steps: [LocalGame.Schedule.applyStateTransitions(), observeRoundChange, observeRoundState]
    }))

    expect(readResourceValue(runtime, schema, Log)).toEqual([
      "enter-app:Playing",
      "round:Warmup",
      "round-changed",
      "round:SuddenDeath"
    ])
  })

  it("does not run transition handlers unless the bundle is attached to the marker", () => {
    const queuePlaying = Game.System.define(
      "StateMachineRuntime/QueueWithoutBundle",
      {
        nextMachines: {
          app: System.nextState(AppState)
        }
      },
      ({ nextMachines }) =>
        Fx.sync(() => {
          nextMachines.app.set("Playing")
        })
    )

    const onEnterPlaying = Game.System.define(
      "StateMachineRuntime/ExplicitBundleOnly",
      {
        transitions: {
          app: System.transition(AppState)
        },
        resources: {
          log: System.writeResource(Log)
        }
      },
      ({ transitions, resources }) =>
        Fx.sync(() => {
          resources.log.update((entries) => [...entries, `entered:${transitions.app.get().to}`])
        })
    )

    const bundle = Game.Schedule.transitions(
      Game.Schedule.onEnter(AppState, "Playing", {
        systems: [onEnterPlaying]
      })
    )

    const runtime = makeRuntime()
    runtime.runSchedule(Game.Schedule.define({
      systems: [queuePlaying],
      steps: [queuePlaying, Game.Schedule.applyStateTransitions()]
    }))

    expect(readResourceValue(runtime, schema, Log)).toEqual([])

    runtime.runSchedule(Game.Schedule.define({
      systems: [queuePlaying],
      steps: [queuePlaying, Game.Schedule.applyStateTransitions(bundle)]
    }))

    expect(readResourceValue(runtime, schema, Log)).toEqual(["entered:Playing"])
  })
})
