import { Descriptor, Schema } from "@typeonce/ritmo"
import type * as Machine from "@typeonce/ritmo/Machine"
import type * as Result from "@typeonce/ritmo/Result"
import type * as SchemaTypes from "@typeonce/ritmo/Schema"
import { describe, expect, it } from "tstyche"

const Name = Descriptor.Component<string>()("SubStateTypes/Name")
const Game = Schema.bind(Schema.fragment({ components: { Name } }))
const OtherGame = Schema.bind(Schema.fragment({ resources: {} }))
const Session = Game.StateMachine("SubStateTypes/Session", ["Menu", "Playing"] as const)
const Phase = Game.StateMachine("SubStateTypes/Phase", ["Setup", "Battle"] as const, { within: [Session, "Playing"] })
const OtherFlow = OtherGame.StateMachine("SubStateTypes/OtherFlow", ["Idle"] as const)

describe("sub-states", () => {
  it("is a bound machine that records its parent", () => {
    expect(Phase).type.toBe<SchemaTypes.Schema.BoundStateMachine<typeof Game.schema, "SubStateTypes/Phase", readonly ["Setup", "Battle"], typeof Session>>()
    expect(Session).type.toBe<SchemaTypes.Schema.BoundStateMachine<typeof Game.schema, "SubStateTypes/Session", readonly ["Menu", "Playing"]>>()
  })

  it("reads as possibly absent and sets as a Result; top-level machines are unchanged", () => {
    Game.System("SubStateTypes/Read", {
      machines: { phase: Game.System.machine(Phase), session: Game.System.machine(Session) },
      nextMachines: { phase: Game.System.nextState(Phase), session: Game.System.nextState(Session) },
      transitionEvents: { phase: Game.System.readTransitionEvent(Phase), session: Game.System.readTransitionEvent(Session) }
    }, ({ machines, nextMachines, transitionEvents }) => {
      expect(machines.phase.get()).type.toBe<"Setup" | "Battle" | undefined>()
      expect(machines.session.get()).type.toBe<"Menu" | "Playing">()
      expect(nextMachines.phase.set("Battle")).type.toBe<Result.Result<void, Machine.SubStateInactive>>()
      expect(nextMachines.phase.setIfChanged("Battle")).type.toBe<Result.Result<void, Machine.SubStateInactive>>()
      expect(nextMachines.session.set("Menu")).type.toBe<void>()
      expect(transitionEvents.phase.all()[0]!.to).type.toBe<"Setup" | "Battle" | undefined>()
      expect(transitionEvents.session.all()[0]!.to).type.toBe<"Menu" | "Playing">()
    })
  })

  it("gates, schedules, and scopes like any machine", () => {
    expect(Game.Condition.inState(Phase, "Battle")).type.toBe<Machine.InStateCondition<typeof Phase>>()
    Game.Schedule.onEnter(Phase, "Battle", [])
    Game.EntityScope("SubStateTypes/Battlefield", { despawnOnExit: [Phase, "Battle"] })
    Game.Runtime.machine(Phase, "Setup")
  })

  it("rejects a parent state that does not exist", () => {
    // @ts-expect-error Type '"Paused"' is not assignable to type '"Menu" | "Playing"'
    Game.StateMachine("SubStateTypes/Typo", ["A"] as const, { within: [Session, "Paused"] })
  })

  it("rejects a parent from another game, naming the fix", () => {
    // @ts-expect-error SubStateTypes/OtherFlow is a state machine of another game: use a machine defined with this game's Game.StateMachine(...)
    Game.StateMachine("SubStateTypes/Foreign", ["A"] as const, { within: [OtherFlow, "Idle"] })
  })
})
