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

  it("reports a missing import next to a requiring component as only that missing name", () => {
    // The expansion must not recurse on the unresolved name: an excessive-depth error
    // would be reported on the call's first line, which nothing here suppresses.
    Game.System.spawns(
      Player,
      // @ts-expect-error Cannot find name 'Missing'
      Missing
    )
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

const Bodies = Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Body] })
const Players = Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player, Body, Velocity] })
const MaybeBody = Game.Query({ selection: { position: Game.Query.read(Position), body: Game.Query.optional(Body) } })

describe("commands.insert with requirements", () => {
  it("checks inserts against the target's proof plus the inserted entries", () => {
    Game.System("Req/Insert", {
      queries: { bodies: Bodies, maybe: MaybeBody },
      commands: Game.System.commands(Game.System.inserts(Player, Velocity, Noise))
    }, ({ queries, commands }) => {
      for (const match of queries.bodies.each()) {
        expect(commands.insert(match.entity, [Player, {}], [Velocity, { x: 0 }])).type.toBe<typeof match.entity.id>()
        // @ts-expect-error Req/Player requires Req/Velocity: insert it in the same call, or pass match.entity from a query that proves it
        commands.insert(match.entity, [Player, {}])
        // a raw id proves nothing
        // @ts-expect-error Req/Player requires Req/Body
        commands.insert(match.entity.id, [Player, {}], [Velocity, { x: 0 }])
        // components without requirements still take raw ids
        commands.insert(match.entity.id, [Noise, 1])
      }
      for (const match of queries.maybe.each()) {
        // optional(Body) does not prove Body
        // @ts-expect-error Req/Player requires Req/Body
        commands.insert(match.entity, [Player, {}], [Velocity, { x: 0 }])
      }
    })
  })

  it("lets the id spawn returned prove its draft", () => {
    Game.System("Req/InsertSpawned", {
      commands: Game.System.commands(Game.System.spawns(Body), Game.System.inserts(Player, Velocity))
    }, ({ commands }) => {
      const body = commands.spawn(Game.Command.spawn([Body, {}], [Position, { x: 0 }]))
      commands.insert(body, [Player, {}], [Velocity, { x: 0 }])
    })
  })
})

describe("commands.remove with requirements", () => {
  it("rejects removing a component the target may still need", () => {
    Game.System("Req/Remove", {
      queries: {
        players: Players,
        moving: Game.Query({ selection: { velocity: Game.Query.read(Velocity) } }),
        notPlayers: Game.Query({ selection: { velocity: Game.Query.read(Velocity) }, without: [Player] })
      },
      commands: Game.System.commands(Game.System.removes(Velocity, Noise, Player))
    }, ({ queries, commands }) => {
      for (const match of queries.players.each()) {
        // @ts-expect-error Req/Velocity is required by Req/Player: remove Req/Player in the same call, or match the entity with a query that has without: [Req/Player]
        commands.remove(match.entity, Velocity)
        commands.remove(match.entity, Noise)
        commands.remove(match.entity, Player)
        expect(commands.remove(match.entity, Player, Velocity)).type.toBe<typeof match.entity.id>()
      }
      // The query proves Velocity but not Player: the entity may still hold Player.
      for (const match of queries.moving.each()) {
        // @ts-expect-error Req/Velocity is required by Req/Player
        commands.remove(match.entity, Velocity)
      }
      // without: [Player] proves Player is absent.
      for (const match of queries.notPlayers.each()) {
        commands.remove(match.entity, Velocity)
      }
    })
  })

  it("removes from the id spawn returned, as from a match", () => {
    Game.System("Req/RemoveSpawned", {
      commands: Game.System.commands(Game.System.spawns(Noise, Velocity), Game.System.removes(Noise, Velocity))
    }, ({ commands }) => {
      const spawned = commands.spawn(Game.Command.spawn([Noise, 1], [Velocity, { x: 0 }]))
      commands.remove(spawned, Noise)
      // the entity may gain Player before this applies: only a query's without proves it absent
      // @ts-expect-error Req/Velocity is required by Req/Player
      commands.remove(spawned, Velocity)
    })
  })
})
