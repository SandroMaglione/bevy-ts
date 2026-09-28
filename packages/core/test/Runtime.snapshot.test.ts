import { describe, expect, it } from "vitest"
import { Descriptor, Entity, Schema, Snapshot } from "@bevy-ts/core"
import * as Vector2 from "@bevy-ts/core/Vector2"

const Root = Schema.defineRoot("SnapshotTest")
const Position = Descriptor.ConstructedComponent(Vector2)("Snapshot/Position")
const Name = Descriptor.Component<string>()("Snapshot/Name")
const Target = Descriptor.Component<{ readonly handle: Entity.Handle<typeof Root, typeof Name> }>()("Snapshot/Target")
const Score = Descriptor.Resource<number>()("Snapshot/Score")
const { relation: ChildOf } = Descriptor.Hierarchy("Snapshot/ChildOf", "Snapshot/Children")

const Game = Schema.bind(Schema.fragment({
  components: { Position, Name, Target },
  resources: { Score },
  relations: { ChildOf }
}), Root)
const Flow = Game.StateMachine("Snapshot/Flow", ["Menu", "Playing"])

const makeRuntime = (score: number) => Game.Runtime.make({
  services: Game.Runtime.services(),
  resources: { Score: score },
  machines: Game.Runtime.machines(Game.Runtime.machine(Flow, "Menu"))
})

const Named = Game.Query({ selection: { name: Game.Query.read(Name) } })

const readWorld = (runtime: ReturnType<typeof makeRuntime>) => {
  const Read = Game.Inspector("Snapshot/Read", {
    queries: { named: Named },
    resources: { score: Game.System.readResource(Score) },
    machines: { flow: Game.System.machine(Flow) }
  }, ({ queries, resources, machines }) => ({
    names: queries.named.each().map((match) => [match.entity.id.value, match.data.name.get()] as const),
    score: resources.score.get(),
    flow: machines.flow.get()
  }))
  return runtime.inspect(Read)
}

const populate = (runtime: ReturnType<typeof makeRuntime>) => {
  const Setup = Game.System("Snapshot/Setup", {
    nextMachines: { flow: Game.System.nextState(Flow) },
    resources: { score: Game.System.writeResource(Score) }
  }, ({ commands, nextMachines, resources }) => {
    const parentDraft = Game.Command.spawn([Name, "parent"], Game.Command.entryRaw(Position, { x: 1, y: 2 }))
    if (!parentDraft.ok) throw new Error("invalid fixture")
    const parent = commands.spawn(parentDraft.value)
    const first = commands.spawn(Game.Command.relate(Game.Command.spawn([Name, "first"]), ChildOf, parent))
    commands.spawn(Game.Command.relate(Game.Command.spawn([Name, "second"]), ChildOf, parent))
    commands.spawn(Game.Command.spawn([Target, { handle: Game.Entity.handle(first, Name) }]))
    resources.score.set(42)
    nextMachines.flow.set("Playing")
  })
  runtime.tick(Game.Schedule(Setup, Game.Schedule.applyStateTransitions()))
}

describe("Runtime snapshots", () => {
  it("round-trips entities, relations, resources, and machines through JSON", () => {
    const source = makeRuntime(0)
    populate(source)
    const json = JSON.stringify(source.snapshot())

    const target = makeRuntime(7)
    const restored = target.restore(JSON.parse(json))

    expect(restored.ok).toBe(true)
    expect(readWorld(target)).toEqual(readWorld(source))

    let children: Array<string> = []
    let resolved = ""
    const Check = Game.System("Snapshot/Check", {
      queries: { targets: Game.Query({ selection: { target: Game.Query.read(Target) } }) }
    }, ({ queries, lookup }) => {
      const parent = readWorld(target).names.find(([, name]) => name === "parent")![0]
      const matches = lookup.childMatches(Entity.makeEntityId(parent), ChildOf, Named)
      children = matches.ok ? matches.value.map((match) => match.data.name.get()) : []
      const handle = queries.targets.each()[0]!.data.target.get().handle
      const match = lookup.getHandle(handle, Named)
      resolved = match.ok ? match.value.data.name.get() : "missing"
    })
    target.tick(Game.Schedule(Check))

    expect(children).toEqual(["first", "second"])
    expect(resolved).toBe("first")
  })

  it("keeps allocating ids after the restored ones", () => {
    const source = makeRuntime(0)
    populate(source)
    const target = makeRuntime(0)
    target.restore(JSON.parse(JSON.stringify(source.snapshot())))

    const Spawn = Game.System("Snapshot/SpawnMore", {}, ({ commands }) => {
      commands.spawn(Game.Command.spawn([Name, "later"]))
    })
    target.tick(Game.Schedule(Spawn, Game.Schedule.applyDeferred()))

    const ids = readWorld(target).names.map(([id]) => id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("rejects invalid data and leaves the world unchanged", () => {
    const runtime = makeRuntime(5)
    populate(runtime)
    const before = readWorld(runtime)
    const good = runtime.snapshot()
    const firstId = good.entities[0]!.id

    const cases: ReadonlyArray<readonly [unknown, Snapshot.RestoreError["_tag"]]> = [
      [null, "InvalidSnapshot"],
      [{ ...good, version: 2 }, "UnsupportedVersion"],
      [{ ...good, entities: [{ id: firstId, components: { Missing: 1 } }] }, "UnknownComponent"],
      [{ ...good, entities: [{ id: firstId, components: { "Snapshot/Position": { x: Number.NaN, y: 0 } } }] }, "InvalidComponent"],
      [{ ...good, resources: { "Snapshot/Other": 1 } }, "UnknownResource"],
      [{ ...good, machines: { "Snapshot/Flow": "Paused" } }, "InvalidMachineState"],
      [{ ...good, relations: { "Snapshot/ChildOf": [[firstId, [firstId]]] } }, "InvalidRelation"],
      [{ ...good, entities: [...good.entities, good.entities[0]] }, "DuplicateEntity"]
    ]
    for (const [data, tag] of cases) {
      const result = runtime.restore(data)
      expect(result.ok ? undefined : result.error._tag).toBe(tag)
    }
    expect(readWorld(runtime)).toEqual(before)
  })

  it("reports a restore to change detection as despawns and spawns", () => {
    const runtime = makeRuntime(0)
    populate(runtime)
    const seen: Array<{ added: number; despawned: number }> = []
    const Observe = Game.System("Snapshot/Observe", {
      queries: { added: Game.Query({ selection: { name: Game.Query.read(Name) }, filters: [Game.Query.added(Name)] }) },
      despawned: { entities: Game.System.readDespawned() }
    }, ({ queries, despawned }) => {
      seen.push({ added: queries.added.each().length, despawned: despawned.entities.all().length })
    })
    runtime.tick(Game.Schedule(Observe))
    runtime.restore(runtime.snapshot())
    runtime.tick(Game.Schedule(Observe))

    expect(seen).toEqual([{ added: 3, despawned: 0 }, { added: 3, despawned: 4 }])
  })
})
