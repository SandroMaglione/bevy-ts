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
          const descendants = lookup.descendants(rootId, ChildOf, { order: "breadth" })
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
      Game.Schedule.define([spawn]),
      Game.Schedule.define([observe])
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
      Game.Schedule.define([spawn]),
      Game.Schedule.define([destroy]),
      Game.Schedule.define([observe])
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
      Game.Schedule.define([spawn]),
      Game.Schedule.define([observe])
    )

    expect(readResourceValue(runtime, schema, Summary)).toBe(
      "1/1/alpha:none:1|beta:1:1|gamma:2:none"
    )
  })

  it("supports live relate and unrelate commands after explicit deferred application", () => {
    let alphaId: Entity.EntityId<typeof schema, any> | undefined
    let betaId: Entity.EntityId<typeof schema, any> | undefined

    const spawn = Game.System.define(
      "SpawnLiveRelationEntities",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          alphaId = commands.spawn(Game.Command.spawnWith([Name, { value: "alpha" }] as const))
          betaId = commands.spawn(Game.Command.spawnWith([Name, { value: "beta" }] as const))
        })
    )

    const relate = Game.System.define(
      "RelateLiveEntities",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          if (alphaId && betaId) {
            commands.relate(alphaId, Targeting, betaId)
          }
        })
    )

    const unrelate = Game.System.define(
      "UnrelateLiveEntities",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          if (alphaId) {
            commands.unrelate(alphaId, Targeting)
          }
        })
    )

    const observe = Game.System.define(
      "ObserveLiveRelationMutation",
      {
        resources: {
          summary: Game.System.writeResource(Summary)
        }
      },
      ({ lookup, resources }) =>
        Fx.sync(() => {
          if (!alphaId || !betaId) {
            resources.summary.set("missing-setup")
            return
          }

          const target = lookup.related(alphaId, Targeting)
          const sources = lookup.relatedSources(betaId, Targeting)

          resources.summary.set(`${target.ok ? target.value.value : target.error._tag}/${sources.ok ? sources.value.length : -1}`)
        })
    )

    const runtime = makeRuntime()
    const spawnSchedule = Game.Schedule.define([spawn])
    const relateSchedule = Game.Schedule.define([relate, Game.Schedule.applyDeferred(), observe])
    const unrelateSchedule = Game.Schedule.define([unrelate, Game.Schedule.applyDeferred(), observe])
    runtime.tick(spawnSchedule, relateSchedule, unrelateSchedule)

    expect(readResourceValue(runtime, schema, Summary)).toBe("MissingRelation/0")
  })

  it("reorders hierarchy children through deferred commands", () => {
    let rootId: Entity.EntityId<typeof schema, any> | undefined
    let firstId: Entity.EntityId<typeof schema, any> | undefined
    let secondId: Entity.EntityId<typeof schema, any> | undefined
    let thirdId: Entity.EntityId<typeof schema, any> | undefined

    const spawn = Game.System.define(
      "SpawnHierarchyForReorder",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          rootId = commands.spawn(Game.Command.spawnWith([Name, { value: "root" }] as const))
          firstId = commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith([Name, { value: "first" }] as const),
              ChildOf,
              rootId
            )
          )
          secondId = commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith([Name, { value: "second" }] as const),
              ChildOf,
              rootId
            )
          )
          thirdId = commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith([Name, { value: "third" }] as const),
              ChildOf,
              rootId
            )
          )
        })
    )

    const reorder = Game.System.define(
      "ReorderHierarchyChildren",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          if (!rootId || !firstId || !secondId || !thirdId) {
            return
          }
          commands.reorderChildren(rootId, ChildOf, [thirdId, firstId, secondId])
        })
    )

    const observe = Game.System.define(
      "ObserveHierarchyReorder",
      {
        queries: {
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
          if (!rootId) {
            resources.summary.set("missing-setup")
            return
          }
          const children = lookup.relatedSources(rootId, ChildOf)
          const descendants = lookup.descendants(rootId, ChildOf, { order: "breadth" })
          const fromQuery = queries.hasChildren.get(rootId)
          resources.summary.set(
            [
              children.ok ? children.value.map((child) => child.value).join(",") : children.error._tag,
              descendants.ok ? descendants.value.map((child) => child.value).join(",") : descendants.error._tag,
              fromQuery.ok ? fromQuery.value.data.children.get().map((child) => child.value).join(",") : fromQuery.error._tag
            ].join("/")
          )
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Game.Schedule.define([spawn]),
      Game.Schedule.define([reorder, Game.Schedule.applyDeferred(), observe])
    )

    expect(readResourceValue(runtime, schema, Summary)).toBe("4,2,3/4,2,3/4,2,3")
  })

  it("returns ordered typed hierarchy matches while skipping non-matching entities", () => {
    let rootId: Entity.EntityId<typeof schema, any> | undefined
    let branchId: Entity.EntityId<typeof schema, any> | undefined

    const NamedQuery = Game.Query.define({
      selection: {
        name: Game.Query.read(Name)
      }
    })

    const spawn = Game.System.define(
      "SpawnHierarchyMatchTraversal",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          rootId = commands.spawn(Game.Command.spawnWith([Name, { value: "root" }] as const))
          commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith([Name, { value: "first" }] as const),
              ChildOf,
              rootId
            )
          )
          branchId = commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith(),
              ChildOf,
              rootId
            )
          )
          commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith([Name, { value: "nested" }] as const),
              ChildOf,
              branchId
            )
          )
        })
    )

    const observe = Game.System.define(
      "ObserveHierarchyMatchTraversal",
      {
        resources: {
          summary: Game.System.writeResource(Summary)
        }
      },
      ({ lookup, resources }) =>
        Fx.sync(() => {
          if (!rootId) {
            resources.summary.set("missing-setup")
            return
          }

          const children = lookup.childMatches(rootId, ChildOf, NamedQuery)
          const descendants = lookup.descendantMatches(rootId, ChildOf, NamedQuery, { order: "breadth" })
          const missing = lookup.descendantMatches(
            Entity.makeEntityId<typeof schema, typeof Game.schema>(999),
            ChildOf,
            NamedQuery
          )

          resources.summary.set([
            children.ok
              ? children.value.map((match) => match.data.name.get().value).join(",")
              : children.error._tag,
            descendants.ok
              ? descendants.value.map((match) => match.data.name.get().value).join(",")
              : descendants.error._tag,
            missing.ok ? "ok" : missing.error._tag
          ].join("/"))
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Game.Schedule.define([spawn]),
      Game.Schedule.define([observe])
    )

    expect(readResourceValue(runtime, schema, Summary)).toBe("first/first,nested/MissingEntity")
  })

  it("makes successful deferred relation mutations visible through lookup and keeps failure streams empty", () => {
    let alphaId: Entity.EntityId<typeof schema, any> | undefined
    let betaId: Entity.EntityId<typeof schema, any> | undefined

    const spawn = Game.System.define(
      "SpawnSuccessfulRelationMutation",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          alphaId = commands.spawn(Game.Command.spawnWith([Name, { value: "alpha" }] as const))
          betaId = commands.spawn(Game.Command.spawnWith([Name, { value: "beta" }] as const))
        })
    )

    const relate = Game.System.define(
      "QueueSuccessfulRelationMutation",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          if (!alphaId || !betaId) {
            return
          }
          commands.relate(alphaId, Targeting, betaId)
        })
    )

    const observeBefore = Game.System.define(
      "ObserveSuccessfulRelationMutationBeforeFlush",
      {
        relationFailures: {
          targeting: Game.System.readRelationFailures(Targeting)
        },
        resources: {
          summary: Game.System.writeResource(Summary)
        }
      },
      ({ relationFailures, lookup, resources }) =>
        Fx.sync(() => {
          if (!alphaId) {
            resources.summary.set("missing-setup")
            return
          }
          const target = lookup.related(alphaId, Targeting)
          resources.summary.set(`${target.ok ? "ok" : target.error._tag}/${relationFailures.targeting.all().length}`)
        })
    )

    const observeAfter = Game.System.define(
      "ObserveSuccessfulRelationMutationAfterFlush",
      {
        relationFailures: {
          targeting: Game.System.readRelationFailures(Targeting)
        },
        resources: {
          summary: Game.System.writeResource(Summary)
        }
      },
      ({ relationFailures, lookup, resources }) =>
        Fx.sync(() => {
          if (!alphaId || !betaId) {
            resources.summary.set("missing-setup")
            return
          }
          const target = lookup.related(alphaId, Targeting)
          const sources = lookup.relatedSources(betaId, Targeting)
          resources.summary.set([
            target.ok ? String(target.value.value) : target.error._tag,
            sources.ok ? sources.value.map((source) => source.value).join(",") : sources.error._tag,
            relationFailures.targeting.all().length
          ].join("/"))
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Game.Schedule.define([spawn]),
      Game.Schedule.define([
          relate,
          observeBefore,
          Game.Schedule.applyDeferred(),
          Game.Schedule.updateRelationFailures(),
          observeAfter
        ])
    )

    expect(readResourceValue(runtime, schema, Summary)).toBe("2/1/0")
  })

  it("keeps unrelate total and benign when repeated or when no edge exists", () => {
    let alphaId: Entity.EntityId<typeof schema, any> | undefined
    let betaId: Entity.EntityId<typeof schema, any> | undefined

    const spawn = Game.System.define(
      "SpawnForRepeatedUnrelate",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          betaId = commands.spawn(Game.Command.spawnWith([Name, { value: "beta" }] as const))
          alphaId = commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith([Name, { value: "alpha" }] as const),
              Targeting,
              betaId
            )
          )
        })
    )

    const clear = Game.System.define(
      "RepeatedUnrelate",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          if (!alphaId) {
            return
          }
          commands.unrelate(alphaId, Targeting)
          commands.unrelate(alphaId, Targeting)
          commands.unrelate(Entity.makeEntityId<typeof schema, typeof Game.schema>(999), Targeting)
        })
    )

    const observe = Game.System.define(
      "ObserveRepeatedUnrelate",
      {
        relationFailures: {
          targeting: Game.System.readRelationFailures(Targeting)
        },
        resources: {
          summary: Game.System.writeResource(Summary)
        }
      },
      ({ relationFailures, lookup, resources }) =>
        Fx.sync(() => {
          if (!alphaId || !betaId) {
            resources.summary.set("missing-setup")
            return
          }
          const target = lookup.related(alphaId, Targeting)
          const sources = lookup.relatedSources(betaId, Targeting)
          resources.summary.set([
            target.ok ? "ok" : target.error._tag,
            sources.ok ? sources.value.length : 0,
            relationFailures.targeting.all().length
          ].join("/"))
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Game.Schedule.define([spawn]),
      Game.Schedule.define([clear, Game.Schedule.applyDeferred(), Game.Schedule.updateRelationFailures(), observe])
    )

    expect(readResourceValue(runtime, schema, Summary)).toBe("MissingRelation/0/0")
  })

  it("surfaces failed deferred relation mutations only after updateRelationFailures and leaves world state unchanged", () => {
    let alphaId: Entity.EntityId<typeof schema, any> | undefined
    let betaId: Entity.EntityId<typeof schema, any> | undefined

    const spawn = Game.System.define(
      "SpawnFailureEntities",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          alphaId = commands.spawn(Game.Command.spawnWith([Name, { value: "alpha" }] as const))
          betaId = commands.spawn(Game.Command.spawnWith([Name, { value: "beta" }] as const))
        })
    )

    const queueInvalid = Game.System.define(
      "QueueInvalidRelations",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          if (!alphaId || !betaId) {
            return
          }
          commands.relate(alphaId, Targeting, Entity.makeEntityId<typeof schema, typeof Game.schema>(999))
          commands.relate(alphaId, ChildOf, betaId)
          commands.relate(betaId, ChildOf, alphaId)
        })
    )

    const readBefore = Game.System.define(
      "ReadRelationFailuresBeforeFlush",
      {
        relationFailures: {
          targeting: Game.System.readRelationFailures(Targeting),
          childOf: Game.System.readRelationFailures(ChildOf)
        },
        resources: {
          summary: Game.System.writeResource(Summary)
        }
      },
      ({ relationFailures, resources }) =>
        Fx.sync(() => {
          resources.summary.set(`${relationFailures.targeting.all().length}/${relationFailures.childOf.all().length}`)
        })
    )

    const readAfter = Game.System.define(
      "ReadRelationFailuresAfterFlush",
      {
        relationFailures: {
          targeting: Game.System.readRelationFailures(Targeting),
          childOf: Game.System.readRelationFailures(ChildOf)
        },
        resources: {
          summary: Game.System.writeResource(Summary)
        }
      },
      ({ relationFailures, lookup, resources }) =>
        Fx.sync(() => {
          if (!alphaId || !betaId) {
            resources.summary.set("missing-setup")
            return
          }

          const targetingFailures = relationFailures.targeting.all()
          const hierarchyFailures = relationFailures.childOf.all()
          const alphaTarget = lookup.related(alphaId, Targeting)
          const betaParent = lookup.parent(betaId, ChildOf)

          resources.summary.set([
            targetingFailures.map((failure) => failure.error._tag).join(","),
            hierarchyFailures.map((failure) => failure.error._tag).join(","),
            alphaTarget.ok ? "ok" : alphaTarget.error._tag,
            betaParent.ok ? "ok" : betaParent.error._tag
          ].join("/"))
        })
    )

    const runtime = makeRuntime()
    const spawnSchedule = Game.Schedule.define([spawn])
    const failureSchedule = Game.Schedule.define([
        queueInvalid,
        Game.Schedule.applyDeferred(),
        readBefore,
        Game.Schedule.updateRelationFailures(),
        readAfter
      ])
    runtime.tick(spawnSchedule, failureSchedule)

    expect(readResourceValue(runtime, schema, Summary)).toBe(
      "MissingTargetEntity/HierarchyCycle/MissingRelation/MissingRelation"
    )
  })

  it("surfaces failed hierarchy reorders only after updateRelationFailures and keeps child order unchanged", () => {
    let rootId: Entity.EntityId<typeof schema, any> | undefined
    let firstId: Entity.EntityId<typeof schema, any> | undefined
    let secondId: Entity.EntityId<typeof schema, any> | undefined
    let unrelatedId: Entity.EntityId<typeof schema, any> | undefined

    const spawn = Game.System.define(
      "SpawnHierarchyForReorderFailure",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          rootId = commands.spawn(Game.Command.spawnWith([Name, { value: "root" }] as const))
          firstId = commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith([Name, { value: "first" }] as const),
              ChildOf,
              rootId
            )
          )
          secondId = commands.spawn(
            Game.Command.relate(
              Game.Command.spawnWith([Name, { value: "second" }] as const),
              ChildOf,
              rootId
            )
          )
          unrelatedId = commands.spawn(Game.Command.spawnWith([Name, { value: "free" }] as const))
        })
    )

    const queueInvalid = Game.System.define(
      "QueueInvalidReorders",
      {},
      ({ commands }) =>
        Fx.sync(() => {
          if (!rootId || !firstId || !secondId || !unrelatedId) {
            return
          }
          commands.reorderChildren(rootId, ChildOf, [secondId, secondId])
          commands.reorderChildren(rootId, ChildOf, [firstId])
          commands.reorderChildren(rootId, ChildOf, [firstId, unrelatedId])
          commands.reorderChildren(Entity.makeEntityId<typeof schema, typeof Game.schema>(999), ChildOf, [firstId, secondId])
        })
    )

    const readBefore = Game.System.define(
      "ReadReorderFailuresBeforeFlush",
      {
        relationFailures: {
          childOf: Game.System.readRelationFailures(ChildOf)
        },
        resources: {
          summary: Game.System.writeResource(Summary)
        }
      },
      ({ relationFailures, resources }) =>
        Fx.sync(() => {
          resources.summary.set(String(relationFailures.childOf.all().length))
        })
    )

    const readAfter = Game.System.define(
      "ReadReorderFailuresAfterFlush",
      {
        relationFailures: {
          childOf: Game.System.readRelationFailures(ChildOf)
        },
        resources: {
          summary: Game.System.writeResource(Summary)
        }
      },
      ({ relationFailures, lookup, resources }) =>
        Fx.sync(() => {
          if (!rootId) {
            resources.summary.set("missing-setup")
            return
          }
          const failures = relationFailures.childOf.all()
          const children = lookup.relatedSources(rootId, ChildOf)
          resources.summary.set([
            failures.map((failure) => `${failure.operation}:${failure.error._tag}`).join(","),
            children.ok ? children.value.map((child) => child.value).join(",") : children.error._tag
          ].join("/"))
        })
    )

    const runtime = makeRuntime()
    runtime.tick(
      Game.Schedule.define([spawn]),
      Game.Schedule.define([
          queueInvalid,
          Game.Schedule.applyDeferred(),
          readBefore,
          Game.Schedule.updateRelationFailures(),
          readAfter
        ])
    )

    expect(readResourceValue(runtime, schema, Summary)).toBe(
      "reorderChildren:DuplicateChild,reorderChildren:ChildSetMismatch,reorderChildren:ChildNotRelatedToParent,reorderChildren:MissingEntity/2,3"
    )
  })
})
