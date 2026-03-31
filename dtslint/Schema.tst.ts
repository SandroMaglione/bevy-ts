import { App, Descriptor, Entity, Fx, Schema } from "../src/index.ts"
import * as Public from "../src/index.ts"
import { describe, expect, it } from "tstyche"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Time = Descriptor.defineResource<number>()("Time")
const Phase = Descriptor.defineState<"Running" | "Paused">()("Phase")
const TickEvent = Descriptor.defineEvent<{ dt: number }>()("TickEvent")
const Velocity = Descriptor.defineComponent<{ dx: number; dy: number }>()("Velocity")
const { relation: ChildOf } = Descriptor.defineHierarchy("ChildOf", "Children")
const { relation: Targeting } = Descriptor.defineRelation("Targeting", "TargetedBy")

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

  it("build merges fragment registries into one final schema", () => {
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

    const schema = Schema.build(left, right)

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
        DeltaTime: Descriptor.defineResource<number>()("OtherTime")
      }
    })

    // @ts-expect-error!
    Schema.merge(left, right)
  })

  it("bind closes the schema over systems, schedules, and runtimes", () => {
    const schema = Schema.build(Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      },
      states: {
        CurrentPhase: Phase
      }
    }))

    const Game = Schema.bind(schema)

    const MoveSystem = Game.System.define(
      "Move",
      {
        queries: {
          moving: Game.Query.define({
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

    const update = Game.Schedule.define({
      systems: [MoveSystem]
    })

    const runtime = Game.Runtime.make({
      services: Game.Runtime.services(),
      resources: {
        DeltaTime: 1 / 60
      },
      states: {
        CurrentPhase: "Running"
      }
    })

    App.makeApp(runtime).update(update)
  })

  it("supports explicit optional component access without widening entity proofs", () => {
    const schema = Schema.build(Schema.fragment({
      components: {
        Position,
        Velocity
      }
    }))

    const Game = Schema.bind(schema)

    const ObserveSystem = Game.System.define(
      "ObserveOptional",
      {
        queries: {
          moving: Game.Query.define({
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
            expect(match.data.velocity).type.toBe<import("../src/query.ts").OptionalReadCell<{ dx: number; dy: number }>>()
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

    App.makeApp(runtime).update(Game.Schedule.define({
      systems: [ObserveSystem]
    }))
  })

  it("rejects non-component descriptors in query selection and structural filters", () => {
    const schema = Schema.build(Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      }
    }))

    const Game = Schema.bind(schema)

    // @ts-expect-error!
    Game.Query.read(Time)
    // @ts-expect-error!
    Game.Query.optional(Time)
    Game.Query.define({
      selection: {
        position: Game.Query.read(Position)
      },
      with: [
        // @ts-expect-error!
        Time
      ]
    })
    Game.Query.define({
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
    const schema = Schema.build(Schema.fragment({
      components: {
        Position,
        Velocity
      },
      resources: {
        DeltaTime: Time
      }
    }))

    const Game = Schema.bind(schema)

    const ObserveLifecycleSystem = Game.System.define(
      "ObserveLifecycle",
      {
        queries: {
          moved: Game.Query.define({
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
            expect(match.data.velocity).type.toBe<import("../src/query.ts").OptionalReadCell<{ dx: number; dy: number }>>()
          }

          expect(removed.positions.all()).type.toBe<
            ReadonlyArray<import("../src/entity.ts").EntityId<typeof schema, typeof schema>>
          >()
          expect(despawned.entities.all()).type.toBe<
            ReadonlyArray<import("../src/entity.ts").EntityId<typeof schema, typeof schema>>
          >()
        })
    )

    const runtime = Game.Runtime.make({
      services: Game.Runtime.services()
    })

    const schedule = Game.Schedule.define({
      systems: [ObserveLifecycleSystem],
      steps: [Game.Schedule.updateLifecycle(), ObserveLifecycleSystem]
    })

    runtime.runSchedule(schedule)
  })

  it("rejects non-component descriptors in lifecycle query APIs", () => {
    const schema = Schema.build(Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      }
    }))

    const Game = Schema.bind(schema)

    // @ts-expect-error!
    Game.Query.added(Time)
    // @ts-expect-error!
    Game.Query.changed(Time)
    // @ts-expect-error!
    Game.System.readRemoved(Time)
  })

  it("rejects cross-schema systems and schedules on the bound path", () => {
    const schemaA = Schema.build(Schema.fragment({
      components: {
        Position
      },
      resources: {
        DeltaTime: Time
      }
    }))

    const schemaB = Schema.build(Schema.fragment({
      components: {
        Velocity
      }
    }))

    const GameA = Schema.bind(schemaA)
    const GameB = Schema.bind(schemaB)

    const SystemA = GameA.System.define(
      "A",
      {
        queries: {
          moving: GameA.Query.define({
            selection: {
              position: GameA.Query.read(Position)
            }
          })
        }
      },
      () => Fx.sync<undefined, any>(() => undefined)
    )

    const SystemB = GameB.System.define(
      "B",
      {
        queries: {
          moving: GameB.Query.define({
            selection: {
              velocity: GameB.Query.read(Velocity)
            }
          })
        }
      },
      () => Fx.sync<undefined, any>(() => undefined)
    )

    type GameBSystem = Parameters<typeof GameB.Schedule.define>[0]["systems"][number]
    // @ts-expect-error!
    const _invalidSystem: GameBSystem = SystemA

    const runtimeA = GameA.Runtime.make({
      services: GameA.Runtime.services(),
      resources: {
        DeltaTime: 1 / 60
      }
    })

    const scheduleB = GameB.Schedule.define({
      systems: [SystemB]
    })

    // @ts-expect-error!
    runtimeA.runSchedule(scheduleB)

    const scheduleA = GameA.Schedule.define({
      systems: [SystemA]
    })

    GameA.Schedule.extend(scheduleA, {
      before: [
        // @ts-expect-error!
        SystemB
      ]
    })
  })

  it("supports explicit relation query access and hierarchy-only lookup helpers", () => {
    const schema = Schema.build(Schema.fragment({
      components: {
        Position
      },
      relations: {
        ChildOf,
        Targeting
      }
    }))

    const Game = Schema.bind(schema)
    const entityId = Entity.makeEntityId<typeof schema, typeof Game.schema>(1)

    const query = Game.Query.define({
      selection: {
        parent: Game.Query.readRelation(ChildOf),
        children: Game.Query.optionalRelated(ChildOf),
        target: Game.Query.optionalRelation(Targeting)
      },
      withRelations: [ChildOf]
    })

    expect(query).type.toBeAssignableTo<import("../src/query.ts").QuerySpec<{
      readonly parent: import("../src/relation.ts").RelationReadAccess<typeof ChildOf, typeof schema, typeof Game.schema>
      readonly children: import("../src/relation.ts").OptionalRelatedReadAccess<typeof ChildOf, typeof schema, typeof Game.schema>
      readonly target: import("../src/relation.ts").OptionalRelationReadAccess<typeof Targeting, typeof schema, typeof Game.schema>
    }, readonly [], readonly [], readonly [], readonly [typeof ChildOf], readonly [], readonly [], readonly [], typeof Game.schema>>()

    const ObserveSystem = Game.System.define(
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
          lookup.related(entityId, Targeting)
          relationFailures.targeting.all()
          commands.relate(entityId, Targeting, entityId)
          commands.unrelate(entityId, Targeting)
          commands.reorderChildren(entityId, ChildOf, [entityId])

          expect(relationFailures.targeting.all()).type.toBeAssignableTo<
            ReadonlyArray<import("../src/relation.ts").Relation.MutationFailure<
              typeof Targeting,
              typeof schema,
              typeof Game.schema
            >>
          >()
          expect(relationFailures.childOf.all()).type.toBeAssignableTo<
            ReadonlyArray<import("../src/relation.ts").Relation.MutationFailure<
              typeof ChildOf,
              typeof schema,
              typeof Game.schema
            >>
          >()

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
          Game.System.readRelationFailures(Position)
        })
    )
  })

  it("supports durable handles with explicit roots and checked lookup resolution", () => {
    const Root = Schema.defineRoot("HandleRoot")
    const Target = Descriptor.defineComponent<{
      target: Entity.Handle<typeof Root, typeof Position> | null
    }>()("Target")

    const schema = Schema.build(Schema.fragment({
      components: {
        Position,
        Target
      }
    }))

    const Game = Schema.bind(schema, Root)

    const PositionQuery = Game.Query.define({
      selection: {
        position: Game.Query.read(Position)
      }
    })

    const TargetQuery = Game.Query.define({
      selection: {
        target: Game.Query.read(Target),
        position: Game.Query.read(Position)
      }
    })

    const ObserveSystem = Game.System.define(
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

            const WithQuery = Game.Query.define({
              selection: {
                target: Game.Query.read(Target)
              },
              with: [Position] as const
            })

            lookup.getHandle(current, WithQuery)

            // @ts-expect-error!
            lookup.get(current, PositionQuery)

            const WrongQuery = Game.Query.define({
              selection: {
                target: Game.Query.read(Target)
              }
            })

            // @ts-expect-error!
            lookup.getHandle(current, WrongQuery)

            const OptionalOnlyQuery = Game.Query.define({
              selection: {
                target: Game.Query.read(Target),
                position: Game.Query.optional(Position)
              }
            })

            // @ts-expect-error!
            lookup.getHandle(current, OptionalOnlyQuery)

            const RelatedOnlyQuery = Game.Query.define({
              selection: {
                target: Game.Query.read(Target)
              },
              with: [Target] as const
            })

            // @ts-expect-error!
            lookup.getHandle(current, RelatedOnlyQuery)

            const LifecycleOnlyQuery = Game.Query.define({
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

    expect(ObserveSystem).type.toBeAssignableTo<import("../src/schema.ts").Schema.BoundSystem<typeof schema, typeof Root, any, void, never>>()
  })

  it("supports pre-bind typed feature composition with structural dependencies", () => {
    const Root = Schema.defineRoot("FeatureRoot")
    const Health = Descriptor.defineComponent<{ current: number }>()("Health")
    const Damage = Descriptor.defineEvent<{ amount: number }>()("Damage")

    const Core = Schema.Feature.define("Core", {
      schema: Schema.fragment({
        resources: {
          DeltaTime: Time
        }
      }),
      build: (Game) => {
        const Tick = Game.System.define(
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
          update: [Game.Schedule.define({
            systems: [Tick]
          })]
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
        const ApplyDamage = Game.System.define(
          "Feature/ApplyDamage",
          {
            queries: {
              units: Game.Query.define({
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
          update: [Game.Schedule.define({
            systems: [ApplyDamage]
          })]
        }
      }
    })

    const project = Schema.Feature.compose({
      root: Root,
      features: [Core, Combat] as const
    })

    expect(project.Game).type.toBe<import("../src/schema.ts").Schema.Game<typeof project.schema, typeof Root>>()
    expect(project.features.Core.update).type.toBeAssignableTo<ReadonlyArray<import("../src/schema.ts").Schema.BoundSchedule<typeof project.schema, typeof Root, any>>>()
    expect(project.features.Combat.update).type.toBeAssignableTo<ReadonlyArray<import("../src/schema.ts").Schema.BoundSchedule<typeof project.schema, typeof Root, any>>>()

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
