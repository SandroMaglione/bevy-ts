import { Descriptor, Schema } from "@typeonce/bevy-ts"
import type { StateMismatchError } from "@typeonce/bevy-ts/Query"
import type * as Result from "@typeonce/bevy-ts/Result"
import { describe, expect, it } from "tstyche"

const Phase = Descriptor.State("StateTypes/Phase", ["ready", "windup", "active"] as const, {
  transitions: { ready: ["windup"], windup: ["active", "ready"], active: ["ready"] }
})
const Mode = Descriptor.State("StateTypes/Mode", ["a", "b"] as const)

const Game = Schema.bind(Schema.fragment({ components: { Phase, Mode } }))
const Phases = Game.Query({ selection: { phase: Game.Query.write(Phase), mode: Game.Query.write(Mode) } })

describe("Descriptor.State", () => {
  it("is a component whose value is one of its states", () => {
    expect(Game.Command.spawn([Phase, "ready"], [Mode, "b"])).type.not.toRaiseError()
    // @ts-expect-error!
    Game.Command.spawn([Phase, "sleeping"])
  })

  it("checks transitions against the graph", () => {
    Game.System("StateTypes/Move", { queries: { phases: Phases } }, ({ queries }) => {
      for (const { data } of queries.phases.each()) {
        expect(data.phase.get()).type.toBe<"ready" | "windup" | "active">()
        expect(data.phase.transition("windup", "active")).type.toBe<Result.Result<void, StateMismatchError<"ready" | "windup" | "active">>>()
        expect(data.phase.transition("windup", "ready")).type.not.toRaiseError()
        // Not an allowed move.
        // @ts-expect-error!
        data.phase.transition("ready", "active")
        // Unknown states.
        // @ts-expect-error!
        data.phase.transition("sleeping", "ready")
        // @ts-expect-error!
        data.phase.transition("ready", "sleeping")
        // Without a graph any pair of states is accepted, unknown states are not.
        expect(data.mode.transition("a", "b")).type.not.toRaiseError()
        expect(data.mode.transition("b", "b")).type.not.toRaiseError()
        // @ts-expect-error!
        data.mode.transition("a", "c")
        // set stays available and typed.
        expect(data.phase.set("active")).type.not.toRaiseError()
        // @ts-expect-error!
        data.phase.set("sleeping")
      }
    })
  })

  it("requires the graph to list exactly the states", () => {
    // Missing state.
    // @ts-expect-error!
    Descriptor.State("StateTypes/Missing", ["a", "b"] as const, { transitions: { a: ["b"] } })
    // Unknown target.
    // @ts-expect-error!
    Descriptor.State("StateTypes/Target", ["a", "b"] as const, { transitions: { a: ["c"], b: [] } })
    // Unknown source.
    // @ts-expect-error!
    Descriptor.State("StateTypes/Source", ["a", "b"] as const, { transitions: { a: ["b"], b: [], c: ["a"] } })
    // Terminal states list no moves.
    expect(Descriptor.State("StateTypes/Terminal", ["a", "b"] as const, { transitions: { a: ["b"], b: [] } })).type.not.toRaiseError()
    // At least one state.
    // @ts-expect-error!
    Descriptor.State("StateTypes/Empty", [] as const)
  })
})
