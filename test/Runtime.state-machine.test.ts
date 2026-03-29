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

const makeRuntime = () =>
  Game.Runtime.make({
    services: Runtime.services(),
    resources: {
      Counter: 0,
      Log: []
    },
    machines: Runtime.machines(
      Runtime.machine(AppState, "Menu")
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

    Game.Schedule.onExit(AppState, "Menu", {
      systems: [exitSystem]
    })
    Game.Schedule.onTransition(AppState, {
      from: "Menu",
      to: "Playing"
    }, {
      systems: [transitionSystem]
    })
    Game.Schedule.onEnter(AppState, "Playing", {
      systems: [enterSystem]
    })

    const runtime = makeRuntime()
    runtime.runSchedule(Game.Schedule.define({
      systems: [queuePlaying],
      steps: [queuePlaying, Game.Schedule.applyStateTransitions()]
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
})
