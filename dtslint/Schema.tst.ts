import { App, Descriptor, Entity, Fx, Schema } from "../src/index.ts"
import * as Public from "../src/index.ts"
import type { EntityId } from "../src/entity.ts"
import * as QueryTypes from "../src/query.ts"
import * as Relation from "../src/relation.ts"
import type * as SchemaTypes from "../src/schema.ts"
import { describe, expect, it } from "tstyche"

const Position = Descriptor.Component<{ x: number; y: number }>()("Position")
const Time = Descriptor.Resource<number>()("Time")
const Phase = Descriptor.State<"Running" | "Paused">()("Phase")
const TickEvent = Descriptor.Event<{ dt: number }>()("TickEvent")
const Velocity = Descriptor.Component<{ dx: number; dy: number }>()("Velocity")
const { relation: ChildOf } = Descriptor.Hierarchy("ChildOf", "Children")
const { relation: Targeting } = Descriptor.Relation("Targeting", "TargetedBy")

describe("Schema", () => {
  it("does not export top-level runtime authoring namespaces from the public barrel", () => {
    // @ts-expect-error!
    Public.System
    // @ts-expect-error!
    Public.Schedule
    // @ts-expect-error!
    Public.Runtime
    // @ts-expect-error!
    Public.Query
    // @ts-expect-error!
    Public.Command
    // @ts-expect-error!
    Public.StateMachine
  })

  it("preserves exact fragment registries", () => {
    const fragment = Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      },
      events: {
        Tick: TickEvent
      },
      states: {
        CurrentPhase: Phase
      }
    })

    expect(fragment).type.toBe<Schema.SchemaDefinition<
      { readonly Position: typeof Position },
      { readonly DeltaTime: typeof Time },
      { readonly Tick: typeof TickEvent },
      { readonly CurrentPhase: typeof Phase }
    >>()
  })

  it("bind merges fragment registries into one final schema", () => {
    const left = Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      }
    })

    const right = Schema.fragment({
      events: {
        Tick: TickEvent
      },
      states: {
        CurrentPhase: Phase
      }
    })

    const Game = Schema.bind(left, right)
    const schema = Game.schema

    expect(schema).type.toBe<Schema.SchemaDefinition<
      { readonly Position: typeof Position },
      { readonly DeltaTime: typeof Time },
      { readonly Tick: typeof TickEvent },
      { readonly CurrentPhase: typeof Phase }
    >>()
  })

  it("rejects duplicate schema keys", () => {
    const left = Schema.fragment({
      resources: {
        DeltaTime: Time
      }
    })

    const right = Schema.fragment({
      resources: {
        DeltaTime: Descriptor.Resource<number>()("OtherTime")
      }
    })

    // @ts-expect-error!
    Schema.merge(left, right)
  })

  it("bind closes the schema over systems, schedules, and runtimes", () => {
    const schema = Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      },
      states: {
        CurrentPhase: Phase
      }
    })
    const Game = Schema.bind(schema)

    const MoveSystem = Game.System(
      "Move",
      {
        queries: {
          moving: Game.Query({
            selection: {
              position: Game.Query.write(Position)
            }
          })
        },
        resources: {
          time: Game.System.readResource(Time)
        }
      },
      ({ queries, resources }) =>
        Fx.sync(() => {
          resources.time.get()
          for (const match of queries.moving.each()) {
            match.data.position.get()
          }
        })
    )

    const update = Game.Schedule(MoveSystem)

    const runtime = Game.Runtime.make({
      services: Game.Runtime.services(),
      resources: {
        DeltaTime: 1 / 60
      },
      states: {
        CurrentPhase: "Running"
      }
    })

    expect(update).type.toBeAssignableTo<SchemaTypes.Schema.BoundSchedule<typeof schema, typeof schema>>()
    App.makeApp(runtime)
  })

  it("supports explicit optional component access without widening entity proofs", () => {
    const schema = Schema.fragment({
      components: {
        Position,
        Velocity
      }
    })
    const Game = Schema.bind(schema)

    const ObserveSystem = Game.System(
      "ObserveOptional",
      {
        queries: {
          moving: Game.Query({
            selection: {
              position: Game.Query.read(Position),
              velocity: Game.Query.optional(Velocity)
            }
          })
        }
      },
      ({ queries }) =>
        Fx.sync(() => {
          for (const match of queries.moving.each()) {
            expect(match.data.velocity).type.toBe<QueryTypes.OptionalReadCell<{ dx: number; dy: number }>>()
            expect(match.entity.proof).type.toBe<{
              readonly position: { x: number; y: number }
            }>()

            // @ts-expect-error!
            match.data.velocity.get()

            if (match.data.velocity.present) {
              expect(match.data.velocity.get()).type.toBe<{ dx: number; dy: number }>()
            }
          }
        })
    )

    const runtime = Game.Runtime.make({
      services: Game.Runtime.services()
    })

    expect(Game.Schedule(ObserveSystem)).type.toBeAssignableTo<SchemaTypes.Schema.BoundSchedule<typeof schema, typeof schema>>()
  })

  it("supports a zero-or-one singleton read without widening successful matches", () => {
    const schema = Schema.fragment({
      components: {
        Position,
        Velocity
      }
    })
    const Game = Schema.bind(schema)
    const MovingQuery = Game.Query({
      selection: {
        position: Game.Query.write(Position),
        velocity: Game.Query.read(Velocity)
      }
    })

    const ObserveSystem = Game.System(
      "ObserveSingleOptional",
      {
        queries: {
          moving: MovingQuery
        }
      },
      ({ queries }) =>
        Fx.sync(() => {
          const result = queries.moving.singleOptional()
          expect(result).type.toBe<QueryTypes.Query.Result<
            QueryTypes.QueryMatch<typeof schema, typeof MovingQuery> | undefined,
            QueryTypes.Query.MultipleEntitiesError
          >>()

          if (!result.ok || !result.value) {
            return
          }

          expect(result.value.entity.proof).type.toBe<{
            readonly position: { x: number; y: number }
            readonly velocity: { dx: number; dy: number }
          }>()
          result.value.data.position.set({ x: 0, y: 0 })
          expect(result.value.data.velocity.get()).type.toBe<{ dx: number; dy: number }>()
        })
    )

    const runtime = Game.Runtime.make({
      services: Game.Runtime.services()
    })

    expect(Game.Schedule(ObserveSystem)).type.toBeAssignableTo<SchemaTypes.Schema.BoundSchedule<typeof schema, typeof schema>>()
  })

  it("rejects non-component descriptors in query selection and structural filters", () => {
    const schema = Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      }
    })
    const Game = Schema.bind(schema)

    // @ts-expect-error!
    Game.Query.read(Time)
    // @ts-expect-error!
    Game.Query.optional(Time)
    Game.Query({
      selection: {
        position: Game.Query.read(Position)
      },
      with: [
        // @ts-expect-error!
        Time
      ]
    })
    Game.Query({
      selection: {
        position: Game.Query.read(Position)
      },
      without: [
        // @ts-expect-error!
        Time
      ]
    })
  })

  it("supports explicit lifecycle query filters and lifecycle readers", () => {
    const schema = Schema.fragment({
      components: {
        Position,
        Velocity
      },
      resources: {
        DeltaTime: Time
      }
    })
    const Game = Schema.bind(schema)

    const ObserveLifecycleSystem = Game.System(
      "ObserveLifecycle",
      {
        queries: {
          moved: Game.Query({
            selection: {
              position: Game.Query.read(Position),
              velocity: Game.Query.optional(Velocity)
            },
            filters: [Game.Query.changed(Position)] as const
          })
        },
        removed: {
          positions: Game.System.readRemoved(Position)
        },
        despawned: {
          entities: Game.System.readDespawned()
        }
      },
      ({ queries, removed, despawned }) =>
        Fx.sync(() => {
          for (const match of queries.moved.each()) {
            expect(match.data.velocity).type.toBe<QueryTypes.OptionalReadCell<{ dx: number; dy: number }>>()
          }

          expect(removed.positions.all()).type.toBe<ReadonlyArray<EntityId<typeof schema, typeof schema>>>()
          expect(despawned.entities.all()).type.toBe<ReadonlyArray<EntityId<typeof schema, typeof schema>>>()
        })
    )

    const runtime = Game.Runtime.make({
      services: Game.Runtime.services()
    })

    const schedule = Game.Schedule(Game.Schedule.updateLifecycle(), ObserveLifecycleSystem)

    expect(schedule).type.toBeAssignableTo<SchemaTypes.Schema.BoundSchedule<typeof schema, typeof schema>>()
  })

  it("rejects non-component descriptors in lifecycle query APIs", () => {
    const schema = Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      }
    })
    const Game = Schema.bind(schema)

    // @ts-expect-error!
    Game.Query.added(Time)
    // @ts-expect-error!
    Game.Query.changed(Time)
    // @ts-expect-error!
    Game.System.readRemoved(Time)
  })

  it("rejects cross-schema systems and schedules on the bound path", () => {
    const GameA = Schema.bind(Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      }
    }))
    const schemaA = GameA.schema

    const GameB = Schema.bind(Schema.fragment({
      components: {
        Velocity
      }
    }))
    const schemaB = GameB.schema

    const SystemA = GameA.System(
      "A",
      {
        queries: {
          moving: GameA.Query({
            selection: {
              position: GameA.Query.read(Position)
            }
          })
        }
      },
      () => Fx.sync<undefined, any>(() => undefined)
    )

    const SystemB = GameB.System(
      "B",
      {
        queries: {
          moving: GameB.Query({
            selection: {
              velocity: GameB.Query.read(Velocity)
            }
          })
        }
      },
      () => Fx.sync<undefined, any>(() => undefined)
    )

    type GameBSystem = Parameters<typeof GameB.Schedule>[number]
    // @ts-expect-error!
    const _invalidSystem: GameBSystem = SystemA

    const runtimeA = GameA.Runtime.make({
      services: GameA.Runtime.services(),
      resources: {
        DeltaTime: 1 / 60
      }
    })

    const scheduleB = GameB.Schedule(SystemB)

    // @ts-expect-error!
    runtimeA.runSchedule(scheduleB)

    const scheduleA = GameA.Schedule(SystemA)
    type GameAScheduleEntry = Parameters<typeof GameA.Schedule>[number]

    scheduleA

    // @ts-expect-error!
    const _invalidSystemForA: GameAScheduleEntry = SystemB
  })

  it("supports explicit relation query access and hierarchy-only lookup helpers", () => {
    const schema = Schema.fragment({
      components: {
        Position
      },
      relations: {
        ChildOf,
        Targeting
      }
    })
    const Game = Schema.bind(schema)
    const entityId = Entity.makeEntityId<typeof schema, typeof Game.schema>(1)

    const query = Game.Query({
      selection: {
        parent: Game.Query.readRelation(ChildOf),
        children: Game.Query.optionalRelated(ChildOf),
        target: Game.Query.optionalRelation(Targeting)
      },
      withRelations: [ChildOf]
    })

    expect(query).type.toBeAssignableTo<QueryTypes.QuerySpec<{
      readonly parent: Relation.RelationReadAccess<typeof ChildOf, typeof schema, typeof Game.schema>
      readonly children: Relation.OptionalRelatedReadAccess<typeof ChildOf, typeof schema, typeof Game.schema>
      readonly target: Relation.OptionalRelationReadAccess<typeof Targeting, typeof schema, typeof Game.schema>
    }, readonly [], readonly [], readonly [], readonly [typeof ChildOf], readonly [], readonly [], readonly [], typeof Game.schema>>()

    const ObserveSystem = Game.System(
      "ObserveRelations",
      {
        relationFailures: {
          targeting: Game.System.readRelationFailures(Targeting),
          childOf: Game.System.readRelationFailures(ChildOf)
        }
      },
      ({ lookup, commands, relationFailures }) =>
        Fx.sync(() => {
          lookup.parent(entityId, ChildOf)
          lookup.ancestors(entityId, ChildOf)
          lookup.childMatches(entityId, ChildOf, query)
          lookup.descendantMatches(entityId, ChildOf, query, { order: "depth" })
          lookup.related(entityId, Targeting)
          relationFailures.targeting.all()
          commands.relate(entityId, Targeting, entityId)
          commands.unrelate(entityId, Targeting)
          commands.reorderChildren(entityId, ChildOf, [entityId])

          expect(relationFailures.targeting.all()).type.toBeAssignableTo<ReadonlyArray<Relation.Relation.MutationFailure<
            typeof Targeting,
            typeof schema,
            typeof Game.schema
          >>>()
          expect(relationFailures.childOf.all()).type.toBeAssignableTo<ReadonlyArray<Relation.Relation.MutationFailure<
            typeof ChildOf,
            typeof schema,
            typeof Game.schema
          >>>()
          expect(lookup.childMatches(entityId, ChildOf, query)).type.toBeAssignableTo<Relation.Relation.Result<
            ReadonlyArray<QueryTypes.QueryMatch<typeof schema, typeof query>>,
            Relation.Relation.MissingEntityError
          >>()
          expect(lookup.descendantMatches(entityId, ChildOf, query, { order: "breadth" })).type.toBeAssignableTo<Relation.Relation.Result<
            ReadonlyArray<QueryTypes.QueryMatch<typeof schema, typeof query>>,
            Relation.Relation.MissingEntityError
          >>()

          // @ts-expect-error!
          commands.reorderChildren(entityId, Targeting, [entityId])
          // @ts-expect-error!
          commands.reorderChildren(entityId, ChildOf.related, [entityId])
          // @ts-expect-error!
          Game.Query.readRelation(Position)
          // @ts-expect-error!
          Game.Query.readRelated(Position)
          // @ts-expect-error!
          lookup.parent(entityId, Targeting)
          // @ts-expect-error!
          lookup.childMatches(entityId, Targeting, query)
          // @ts-expect-error!
          lookup.descendantMatches(entityId, Targeting, query)
          // @ts-expect-error!
          Game.System.readRelationFailures(Position)
        })
    )
  })

  it("rejects undeclared query result fields across system and lookup query-match surfaces", () => {
    const Root = Schema.defineRoot("ExactQueryRoot")
    const Tagged = Descriptor.Component<{ readonly kind: "tagged" }>()("Tagged")

    const Game = Schema.bind(Schema.fragment({
      components: {
        Position,
        Velocity,
        Tagged
      },
      relations: {
        ChildOf
      }
    }), Root)
    const schema = Game.schema
    const entityId = Entity.makeEntityId<typeof schema, typeof Root>(1)

    const CameraTargetQuery = Game.Query({
      selection: {
        position: Game.Query.read(Position),
        tagged: Game.Query.read(Tagged)
      }
    })

    const ObserveSystem = Game.System(
      "ObserveExactQueryMatches",
      {
        queries: {
          player: CameraTargetQuery
        }
      },
      ({ queries, lookup }) =>
        Fx.sync(() => {
          for (const match of queries.player.each()) {
            match.data.position.get()
            // @ts-expect-error!
            match.data.velocity.get()
          }

          const single = queries.player.single()
          if (single.ok) {
            single.value.data.position.get()
            // @ts-expect-error!
            single.value.data.velocity.get()
          }

          const singleOptional = queries.player.singleOptional()
          if (singleOptional.ok && singleOptional.value) {
            singleOptional.value.data.position.get()
            // @ts-expect-error!
            singleOptional.value.data.velocity.get()

            const handle = Game.Entity.handleAs(Position, singleOptional.value.entity.id)
            const fromHandle = lookup.getHandle(handle, CameraTargetQuery)
            if (fromHandle.ok) {
              fromHandle.value.data.position.get()
              // @ts-expect-error!
              fromHandle.value.data.velocity.get()
            }
          }

          const direct = lookup.get(entityId, CameraTargetQuery)
          if (direct.ok) {
            direct.value.data.position.get()
            // @ts-expect-error!
            direct.value.data.velocity.get()
          }

          const children = lookup.childMatches(entityId, ChildOf, CameraTargetQuery)
          if (children.ok) {
            for (const child of children.value) {
              child.data.position.get()
              // @ts-expect-error!
              child.data.velocity.get()
            }
          }

          const descendants = lookup.descendantMatches(entityId, ChildOf, CameraTargetQuery, { order: "depth" })
          if (descendants.ok) {
            for (const descendant of descendants.value) {
              descendant.data.position.get()
              // @ts-expect-error!
              descendant.data.velocity.get()
            }
          }
        })
    )

    expect(ObserveSystem).type.toBeAssignableTo<SchemaTypes.Schema.BoundSystem<typeof schema, typeof Root, any, void, never>>()
  })

  it("supports durable handles with explicit roots and checked lookup resolution", () => {
    const Root = Schema.defineRoot("HandleRoot")
    const Target = Descriptor.Component<{
      target: Entity.Handle<typeof Root, typeof Position> | null
    }>()("Target")

    const Game = Schema.bind(Schema.fragment({
      components: {
        Position,
        Target
      }
    }), Root)
    const schema = Game.schema

    const PositionQuery = Game.Query({
      selection: {
        position: Game.Query.read(Position)
      }
    })

    const TargetQuery = Game.Query({
      selection: {
        target: Game.Query.read(Target),
        position: Game.Query.read(Position)
      }
    })

    const ObserveSystem = Game.System(
      "ObserveHandles",
      {
        queries: {
          targets: TargetQuery
        }
      },
      ({ queries, lookup }) =>
        Fx.sync(() => {
          for (const match of queries.targets.each()) {
            const current = match.data.target.get().target
            if (!current) {
              continue
            }

            lookup.getHandle(current, PositionQuery)

            const unqualified = Game.Entity.handle(match.entity.id)
            expect(unqualified).type.toBe<Entity.Handle<typeof Root>>()

            const fromRef = Game.Entity.handleFrom(match.entity)
            expect(fromRef).type.toBe<Entity.Handle<typeof Root>>()

            const qualified = Game.Entity.handleAs(Position, match.entity.id)
            expect(qualified).type.toBe<Entity.Handle<typeof Root, typeof Position>>()

            const fromRefQualified = Game.Entity.handleAsFrom(Position, match.entity)
            expect(fromRefQualified).type.toBe<Entity.Handle<typeof Root, typeof Position>>()

            const WithQuery = Game.Query({
              selection: {
                target: Game.Query.read(Target)
              },
              with: [Position] as const
            })

            lookup.getHandle(current, WithQuery)

            // @ts-expect-error!
            lookup.get(current, PositionQuery)

            const WrongQuery = Game.Query({
              selection: {
                target: Game.Query.read(Target)
              }
            })

            // @ts-expect-error!
            lookup.getHandle(current, WrongQuery)

            const OptionalOnlyQuery = Game.Query({
              selection: {
                target: Game.Query.read(Target),
                position: Game.Query.optional(Position)
              }
            })

            // @ts-expect-error!
            lookup.getHandle(current, OptionalOnlyQuery)

            const RelatedOnlyQuery = Game.Query({
              selection: {
                target: Game.Query.read(Target)
              },
              with: [Target] as const
            })

            // @ts-expect-error!
            lookup.getHandle(current, RelatedOnlyQuery)

            const LifecycleOnlyQuery = Game.Query({
              selection: {
                target: Game.Query.read(Target)
              },
              filters: [Game.Query.changed(Position)] as const
            })

            // @ts-expect-error!
            lookup.getHandle(current, LifecycleOnlyQuery)
          }
        })
    )

    expect(ObserveSystem).type.toBeAssignableTo<SchemaTypes.Schema.BoundSystem<typeof schema, typeof Root, any, void, never>>()
  })

  it("supports pre-bind typed feature composition with structural dependencies", () => {
    const Root = Schema.defineRoot("FeatureRoot")
    const Health = Descriptor.Component<{ current: number }>()("Health")
    const Damage = Descriptor.Event<{ amount: number }>()("Damage")

    const Core = Schema.Feature.define("Core", {
      schema: Schema.fragment({
        resources: {
          DeltaTime: Time
        }
      }),
      build: (Game) => {
        const Tick = Game.System(
          "Feature/CoreTick",
          {
            resources: {
              time: Game.System.readResource(Time)
            }
          },
          ({ resources }) =>
            Fx.sync(() => {
              resources.time.get()
            })
        )

        return {
          update: [Game.Schedule(Tick)]
        }
      }
    })

    const Combat = Schema.Feature.define("Combat", {
      schema: Schema.fragment({
        components: {
          Health
        },
        events: {
          Damage
        }
      }),
      requires: [Core] as const,
      build: (Game) => {
        const ApplyDamage = Game.System(
          "Feature/ApplyDamage",
          {
            queries: {
              units: Game.Query({
                selection: {
                  health: Game.Query.write(Health)
                }
              })
            },
            resources: {
              time: Game.System.readResource(Time)
            },
            events: {
              damage: Game.System.readEvent(Damage)
            }
          },
          ({ queries, resources, events }) =>
            Fx.sync(() => {
              resources.time.get()
              events.damage.all()
              for (const match of queries.units.each()) {
                match.data.health.get()
              }
            })
        )

        return {
          update: [Game.Schedule(ApplyDamage)]
        }
      }
    })

    const project = Schema.Feature.compose({
      root: Root,
      features: [Core, Combat] as const
    })

    expect(project.Game).type.toBe<SchemaTypes.Schema.Game<typeof project.schema, typeof Root>>()
    expect(project.features.Core.update).type.toBeAssignableTo<ReadonlyArray<SchemaTypes.Schema.BoundSchedule<typeof project.schema, typeof Root, any>>>()
    expect(project.features.Combat.update).type.toBeAssignableTo<ReadonlyArray<SchemaTypes.Schema.BoundSchedule<typeof project.schema, typeof Root, any>>>()

    project.App.make({
      services: project.Game.Runtime.services(),
      resources: {
        DeltaTime: 1
      }
    })

    Schema.Feature.define("InvalidCombat", {
      schema: Schema.fragment({}),
      requires: [Core] as const,
      build: (Game) => {
        // @ts-expect-error!
        Game.Query.read(Velocity)
        // @ts-expect-error!
        Game.System.readResource(Counter)
        // @ts-expect-error!
        Game.System.writeEvent(TickEvent)
        return {}
      }
    })

    // @ts-expect-error!
    Schema.Feature.compose({
      root: Root,
      features: [Combat] as const
    })

    // @ts-expect-error!
    Schema.Feature.compose({
      root: Root,
      features: [Core, Core] as const
    })
  })
})
