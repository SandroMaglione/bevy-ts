import { Descriptor, Schema } from "@typeonce/ritmo"
import type * as EntityScope from "@typeonce/ritmo/EntityScope"
import { describe, expect, it } from "tstyche"

const Name = Descriptor.Component<string>()("ScopeTriggersTypes/Name")
const Game = Schema.bind(Schema.fragment({ components: { Name } }))
const OtherGame = Schema.bind(Schema.fragment({ resources: {} }))
const Flow = Game.StateMachine("ScopeTriggersTypes/Flow", ["Menu", "Playing"] as const)
const OtherFlow = OtherGame.StateMachine("ScopeTriggersTypes/OtherFlow", ["Idle"] as const)

describe("Game.EntityScope triggers", () => {
  it("takes a machine of this game and one of its states", () => {
    const Run = Game.EntityScope("ScopeTriggersTypes/Run", { despawnOnExit: [Flow, "Playing"] })
    expect(Run).type.toBe<EntityScope.EntityScope<"ScopeTriggersTypes/Run", typeof Game.schema>>()
    const Both = Game.EntityScope("ScopeTriggersTypes/Both", { despawnOnEnter: [Flow, "Menu"], despawnOnExit: [Flow, "Playing"] })
    expect(Both).type.toBe<EntityScope.EntityScope<"ScopeTriggersTypes/Both", typeof Game.schema>>()
    const Plain = Game.EntityScope("ScopeTriggersTypes/Plain")
    expect(Plain).type.toBe<EntityScope.EntityScope<"ScopeTriggersTypes/Plain", typeof Game.schema>>()
  })

  it("rejects an unknown state", () => {
    // @ts-expect-error Type '"Paused"' is not assignable to type '"Menu" | "Playing"'
    Game.EntityScope("ScopeTriggersTypes/Typo", { despawnOnExit: [Flow, "Paused"] })
    // @ts-expect-error Type '"Paused"' is not assignable to type '"Menu" | "Playing"'
    Game.EntityScope("ScopeTriggersTypes/TypoEnter", { despawnOnEnter: [Flow, "Paused"] })
  })

  it("rejects a machine of another game, naming the fix", () => {
    // @ts-expect-error ScopeTriggersTypes/OtherFlow is a state machine of another game: use a machine defined with this game's Game.StateMachine(...)
    Game.EntityScope("ScopeTriggersTypes/Foreign", { despawnOnExit: [OtherFlow, "Idle"] })
  })
})
