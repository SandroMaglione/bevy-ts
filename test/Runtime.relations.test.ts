import { describe, expect, it } from "vitest"
import { Descriptor, Entity, Fx, Schema } from "../src/index.ts"
import { readResourceValue } from "./utils/fixtures.ts"

const Name = Descriptor.defineComponent<{ value: string }>()("Name")
const Summary = Descriptor.defineResource<string>()("Summary")
const { relation: ChildOf } = Descriptor.defineHierarchy("ChildOf", "Children")
const { relation: Targeting } = Descriptor.defineRelation("Targeting", "TargetedBy")

const schema = Schema.build(Schema.fragment({
  components: {
    Name
  },
  resources: {
    Summary
  },
  relations: {
    ChildOf,
    Targeting
  }
}))

const Game = Schema.bind(schema)

const makeRuntime = () =>
  Game.Runtime.make({
    services: Game.Runtime.services(),
    resources: {
      Summary: ""
    }
  })

describe("Runtime relationships", () => {
  it("supports relation-aware queries and hierarchy traversal", () => {
    let rootId: Entity.EntityId<typeof schema, any> | undefined
    let childId: Entity.EntityId<typeof schema, any> | undefined
    let archerId: Entity.EntityId<typeof schema, any> | undefined

    const spawn = Game.System.define(
      "SpawnRelations",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          rootId = commands.spawn(Game.Command.spawnWith([Name, { value: "root" }] as const))
          childId = commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith([Name, { value: "child" }] as const),
              ChildOf,
              rootId
            )
          )
          commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith([Name, { value: "grandchild" }] as const),
              ChildOf,
              childId
            )
          )
          archerId = commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith([Name, { value: "archer" }] as const),
              Targeting,
              rootId
            )
          )
        })
    )

    const observe = Game.System.define(
      "ObserveRelations",
      {
        queries: {
          parents: Game.Query.define({
            selection: {
              parent: Game.Query.readRelation(ChildOf)
            },
            withRelations: [ChildOf]
          }),
          hasChildren: Game.Query.define({
            selection: {
              children: Game.Query.readRelated(ChildOf)
            },
            withRelated: [ChildOf]
          })
        },
        resources: {
          summary: Game.System.writeResource(Summary)
        }
      },
      ({ queries, lookup, resources }) =>
        Fx.sync(() => {
          if (!rootId || !childId || !archerId) {
            resources.summary.set("missing-setup")
            return
          }

          const rootChildren = queries.hasChildren.get(rootId)
          const childParent = queries.parents.get(childId)
          const descendants = lookup.descendants(rootId, ChildOf)
          const target = lookup.related(archerId, Targeting)
          const ancestors = lookup.ancestors(childId, ChildOf)

          resources.summary.set([
            rootChildren.ok ? rootChildren.value.data.children.get().length : -1,
            childParent.ok ? childParent.value.data.parent.get().value : -1,
            descendants.ok ? descendants.value.length : -1,
            target.ok ? target.value.value : -1,
            ancestors.ok ? ancestors.value.length : -1
          ].join("/"))
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Game.Schedule.define({
        systems: [spawn]
      }),
      Game.Schedule.define({
        systems: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, Summary)).toBe("1/1/2/1/1")
  })

  it("recursively despawns hierarchy descendants and clears non-hierarchy incoming edges", () => {
    let rootId: Entity.EntityId<typeof schema, any> | undefined
    let childId: Entity.EntityId<typeof schema, any> | undefined
    let archerId: Entity.EntityId<typeof schema, any> | undefined

    const spawn = Game.System.define(
      "SpawnHierarchyForDespawn",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          rootId = commands.spawn(Game.Command.spawnWith([Name, { value: "root" }] as const))
          childId = commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith([Name, { value: "child" }] as const),
              ChildOf,
              rootId
            )
          )
          archerId = commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith([Name, { value: "archer" }] as const),
              Targeting,
              rootId
            )
          )
        })
    )

    const destroy = Game.System.define(
      "DestroyRoot",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          if (rootId) {
            commands.despawn(rootId)
          }
        })
    )

    const observe = Game.System.define(
      "ObserveDespawn",
      {
        resources: {
          summary: Game.System.writeResource(Summary)
        }
      },
      ({ lookup, resources }) =>
        Fx.sync(() => {
          if (!rootId || !childId || !archerId) {
            resources.summary.set("missing-setup")
            return
          }

          const childRoot = lookup.root(childId, ChildOf)
          const archerTarget = lookup.related(archerId, Targeting)

          resources.summary.set(`${childRoot.ok ? "ok" : childRoot.error._tag}/${archerTarget.ok ? "ok" : archerTarget.error._tag}`)
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Game.Schedule.define({
        systems: [spawn]
      }),
      Game.Schedule.define({
        systems: [destroy]
      }),
      Game.Schedule.define({
        systems: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, Summary)).toBe("MissingEntity/MissingRelation")
  })

  it("allows general relation cycles and keeps optional relation slots non-matching-safe", () => {
    let alphaId: Entity.EntityId<typeof schema, any> | undefined
    let betaId: Entity.EntityId<typeof schema, any> | undefined

    const spawn = Game.System.define(
      "SpawnGeneralCycle",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          alphaId = commands.spawn(Game.Command.spawnWith([Name, { value: "alpha" }] as const))
          betaId = commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith([Name, { value: "beta" }] as const),
              Targeting,
              alphaId
            )
          )
          commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith([Name, { value: "gamma" }] as const),
              Targeting,
              betaId
            )
          )
        })
    )

    const observe = Game.System.define(
      "ObserveOptionalRelations",
      {
        queries: {
          optionalTargets: Game.Query.define({
            selection: {
              name: Game.Query.read(Name),
              target: Game.Query.optionalRelation(Targeting),
              sources: Game.Query.optionalRelated(Targeting)
            }
          })
        },
        resources: {
          summary: Game.System.writeResource(Summary)
        }
      },
      ({ queries, lookup, resources }) =>
        Fx.sync(() => {
          if (!alphaId || !betaId) {
            resources.summary.set("missing-setup")
            return
          }

          const betaTarget = lookup.related(betaId, Targeting)
          const alphaSources = lookup.relatedSources(alphaId, Targeting)

          const optionalSummary = queries.optionalTargets.each()
            .map((match) => {
              const target = match.data.target.present
                ? match.data.target.get().value.toString()
                : "none"
              const sources = match.data.sources.present
                ? match.data.sources.get().length.toString()
                : "none"
              return `${match.data.name.get().value}:${target}:${sources}`
            })
            .sort()
            .join("|")

          resources.summary.set([
            betaTarget.ok ? betaTarget.value.value : -1,
            alphaSources.ok ? alphaSources.value.length : -1,
            optionalSummary
          ].join("/"))
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Game.Schedule.define({
        systems: [spawn]
      }),
      Game.Schedule.define({
        systems: [observe]
      })
    )

    expect(readResourceValue(runtime, schema, Summary)).toBe(
      "1/1/alpha:none:1|beta:1:1|gamma:2:none"
    )
  })
})
