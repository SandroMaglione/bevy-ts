import { Descriptor, Schema } from "@typeonce/ritmo"
import type * as Command from "@typeonce/ritmo/Command"
import { describe, expect, it } from "tstyche"

const Position = Descriptor.Component<{ readonly x: number }>()("Req/Position")
const Velocity = Descriptor.Component<{ readonly x: number }>()("Req/Velocity")
const Body = Descriptor.Component<{}>()("Req/Body")
const Player = Descriptor.Component<{}>()("Req/Player")
const Noise = Descriptor.Component<number>()("Req/Noise")
const A = Descriptor.Component<{}>()("Req/A")
const B = Descriptor.Component<{}>()("Req/B")

const Core = Schema.fragment({ components: { Position, Velocity, Body, Noise, A, B } })
// Cross-fragment: Gameplay requires components registered by Core.
const Gameplay = Schema.fragment({
  components: { Player },
  requires: [
    Schema.requires(Player, Body, Velocity),
    Schema.requires(Body, Position),
    Schema.requires(A, B),
    Schema.requires(B, A)
  ]
})
const Game = Schema.bind(Core, Gameplay)

describe("Schema.requires", () => {
  it("carries one pair per required component", () => {
    expect(Schema.requires(Player, Body, Velocity)).type.toBe<
      Schema.ComponentRequirement<readonly ["Req/Player", "Req/Body"] | readonly ["Req/Player", "Req/Velocity"]>
    >()
    expect<Schema.Schema.Requires<typeof Gameplay>>().type.toBe<
      | readonly ["Req/Player", "Req/Body"]
      | readonly ["Req/Player", "Req/Velocity"]
      | readonly ["Req/Body", "Req/Position"]
      | readonly ["Req/A", "Req/B"]
      | readonly ["Req/B", "Req/A"]
    >()
  })

  it("needs at least one required component", () => {
    // @ts-expect-error Expected at least 2 arguments, but got 1
    Schema.requires(Player)
  })

  it("rejects a requirement naming a component no fragment registers", () => {
    const Lonely = Schema.fragment({ components: { Player }, requires: [Schema.requires(Player, Position)] })
    // @ts-expect-error Req/Position is named in Schema.requires(...) but no fragment registers it: add it to a fragment's components
    Schema.bind(Lonely)
  })

  it("expands spawns(...) to the transitive required set", () => {
    expect(Game.System.spawns(Player)).type.toBe<
      Command.Permission<"spawns", typeof Player | typeof Body | typeof Velocity | typeof Position>
    >()
    expect(Game.System.spawns(Noise)).type.toBe<Command.Permission<"spawns", typeof Noise>>()
    // a cycle terminates
    expect(Game.System.spawns(A)).type.toBe<Command.Permission<"spawns", typeof A | typeof B>>()
  })
})

describe("commands.spawn with requirements", () => {
  it("checks drafts at commands.spawn, not while they are built", () => {
    Game.System("Req/Spawn", { commands: Game.System.commands(Game.System.spawns(Player, Noise, A)) }, ({ commands }) => {
      // A partial draft is a legal value.
      const partial = Game.Command.spawn([Player, {}])
      commands.spawn(Game.Command.extend(partial, [Body, {}], [Velocity, { x: 0 }], [Position, { x: 0 }]))
      // @ts-expect-error Req/Player requires Req/Velocity: add the missing entries to the draft
      commands.spawn(Game.Command.spawn([Player, {}], [Body, {}], [Position, { x: 0 }]))
      // transitive: Body is present but its own requirement is not
      // @ts-expect-error Req/Body requires Req/Position
      commands.spawnIn(Game.EntityScope("Req/Level"), Game.Command.spawn([Player, {}], [Body, {}], [Velocity, { x: 0 }]))
      // a cycle means both or neither
      commands.spawn(Game.Command.spawn([A, {}], [B, {}]))
      // @ts-expect-error Req/A requires Req/B
      commands.spawn(Game.Command.spawn([A, {}]))
      // components without requirements spawn alone
      commands.spawn(Game.Command.spawn([Noise, 1]))
    })
  })

  it("treats a conditional required entry as missing", () => {
    Game.System("Req/SpawnMaybe", { commands: Game.System.commands(Game.System.spawns(Player, Noise)) }, ({ commands }) => {
      const maybe = Math.random() > 0.5
      // @ts-expect-error Req/Player requires Req/Velocity
      commands.spawn(Game.Command.spawn([Player, {}], [Body, {}], [Position, { x: 0 }], maybe ? [Velocity, { x: 0 }] : [Noise, 1]))
    })
  })

  it("returns the id with what the draft holds", () => {
    Game.System("Req/SpawnId", { commands: Game.System.commands(Game.System.spawns(Player)) }, ({ commands }) => {
      const id = commands.spawn(Game.Command.spawn([Player, {}], [Body, {}], [Velocity, { x: 0 }], [Position, { x: 0 }]))
      expect(id).type.toBe<Command.SpawnedId<typeof Game.schema, typeof Game.schema, "Req/Player" | "Req/Body" | "Req/Velocity" | "Req/Position">>()
    })
  })
})
