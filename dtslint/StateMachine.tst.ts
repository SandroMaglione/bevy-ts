import { Descriptor, Fx, Schema } from "../src/index.ts"
import * as Runtime from "../src/runtime.ts"
import * as System from "../src/system.ts"
import { describe, expect, it } from "tstyche"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("StateMachine/Position")
const Counter = Descriptor.defineResource<number>()("StateMachine/Counter")

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

const AppState = Game.StateMachine.define("AppState", ["Menu", "Playing", "Paused"] as const)
const OtherState = OtherGame.StateMachine.define("OtherState", ["Idle", "Running"] as const)

const ReaderSystem = Game.System.define(
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

const WriterSystem = Game.System.define(
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

const TransitionSystem = Game.System.define(
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

const PlayingOnlySystem = Game.System.define(
  "StateMachine/PlayingOnly",
  {
    when: [Game.Condition.inState(AppState, "Playing")]
  },
  () => Fx.sync<undefined, {}>(() => undefined)
)

const MachineSchedule = Game.Schedule.define({
  systems: [ReaderSystem, WriterSystem]
})

const EnterPlaying = Game.Schedule.onEnter(AppState, "Playing", {
  systems: [TransitionSystem]
})

describe("StateMachine", () => {
  it("keeps the machine value union exact across readers and writers", () => {
    AppState
    MachineSchedule
    EnterPlaying
  })

  it("rejects invalid machine values in conditions and queued writes", () => {
    Game.Condition.inState(
      AppState,
      // @ts-expect-error!
      "GameOver"
    )

    Game.System.define(
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
    Game.System.define(
      "StateMachine/CrossSchemaSystem",
      {
        machines: {
          // @ts-expect-error!
          other: System.machine(OtherState)
        }
      },
      () => Fx.sync<undefined, {}>(() => undefined)
    )

    // @ts-expect-error!
    Game.Schedule.onEnter(OtherState, "Idle", {
      systems: [ReaderSystem]
    })
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
        Runtime.machine(AppState, "Menu")
      )
    })

    runtime.runSchedule(MachineSchedule)
  })

  it("does not expose transition context on normal schedules", () => {
    Game.System.define(
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
      {
        from: "Menu",
        to: "Playing"
      },
      {
        systems: [TransitionSystem]
      }
    )

    Game.Schedule.onExit(
      AppState,
      // @ts-expect-error!
      "GameOver",
      {
        systems: [TransitionSystem]
      }
    )
  })
})
