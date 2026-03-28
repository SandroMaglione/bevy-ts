/**
 * Minimal `snake`-style example.
 *
 * This example exercises the feature set missing from the initial scaffold:
 * - ordered systems
 * - required queries
 * - typed event polling
 * - validated entity lookup by id
 * - deferred despawn/spawn in response to gameplay events
 */
import { App, Command, Descriptor, Entity, Fx, Label, Query, Runtime, Schedule, Schema, System } from "../index.ts"

/**
 * Opaque entity identity used inside the example's component and event payloads.
 *
 * Using `Schema.Any` here avoids a recursive type cycle during schema
 * construction while still preserving the stronger "typed entity id" model.
 */
type SnakeEntityId = Entity.EntityId<Schema.Schema.Any>

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Snake/Position")
const Velocity = Descriptor.defineComponent<{ x: number; y: number }>()("Snake/Velocity")
const SnakeHead = Descriptor.defineComponent<{}>()("Snake/Head")
const SnakeBody = Descriptor.defineComponent<{ parent: SnakeEntityId; isTail: boolean }>()("Snake/Body")
const Food = Descriptor.defineComponent<{}>()("Snake/Food")
const FollowTarget = Descriptor.defineComponent<{ x: number; y: number }>()("Snake/FollowTarget")

const FoodEaten = Descriptor.defineEvent<{ entityId: SnakeEntityId }>()("Snake/FoodEaten")

const schema = Schema.build(
  Schema.fragment({
    components: {
      Position,
      Velocity,
      SnakeHead,
      SnakeBody,
      Food,
      FollowTarget
    },
    events: {
      FoodEaten
    }
  })
)

/**
 * Narrows an opaque example entity id back to this runtime's exact schema id.
 *
 * The example stores entity ids in components and events using a widened schema
 * to avoid recursive type construction. Those ids are still produced only by
 * this schema's runtime, so narrowing them at the lookup boundary is sound.
 */
const asSnakeRuntimeEntityId = (entityId: SnakeEntityId): Entity.EntityId<typeof schema> =>
  entityId as Entity.EntityId<typeof schema>

const SetupSystemLabel = Label.defineSystemLabel("Snake/Setup")
const MovementSystemLabel = Label.defineSystemLabel("Snake/Movement")
const CollisionSystemLabel = Label.defineSystemLabel("Snake/Collision")
const GrowSystemLabel = Label.defineSystemLabel("Snake/Grow")
const FollowSystemLabel = Label.defineSystemLabel("Snake/Follow")
const MovementSetLabel = Label.defineSystemSetLabel("Snake/Movement")
const GrowthSetLabel = Label.defineSystemSetLabel("Snake/Growth")

const SetupScheduleLabel = Label.defineScheduleLabel("Snake/Setup")
const UpdateScheduleLabel = Label.defineScheduleLabel("Snake/Update")

const HeadQuery = Query.define({
  selection: {
    head: Query.read(SnakeHead),
    position: Query.write(Position),
    velocity: Query.read(Velocity)
  }
})

const FoodQuery = Query.define({
  selection: {
    food: Query.read(Food),
    position: Query.read(Position)
  }
})

const BodyQuery = Query.define({
  selection: {
    body: Query.write(SnakeBody),
    position: Query.write(Position),
    followTarget: Query.write(FollowTarget)
  }
})

const SetupSystem = System.define(
  {
    label: SetupSystemLabel,
    schema
  },
  ({ commands }) =>
    Fx.sync(() => {
      const headId = commands.spawn(
        Command.spawnWith<typeof schema>(
          [Position, { x: 5, y: 5 }],
          [Velocity, { x: 1, y: 0 }],
          [SnakeHead, {}]
        )
      )

      commands.spawn(
        Command.spawnWith<typeof schema>(
          [Position, { x: 4, y: 5 }],
          [SnakeBody, { parent: headId, isTail: true }],
          [FollowTarget, { x: 5, y: 5 }]
        )
      )

      commands.spawn(
        Command.spawnWith<typeof schema>(
          [Position, { x: 8, y: 5 }],
          [Food, {}]
        )
      )
    })
)

const MovementSystem = System.define(
  {
    label: MovementSystemLabel,
    schema,
    inSets: [MovementSetLabel],
    queries: {
      head: HeadQuery
    }
  },
  ({ queries }) =>
    Fx.sync(() => {
      const head = queries.head.single()
      if (!head.ok) {
        return
      }

      const position = head.value.data.position.get()
      const velocity = head.value.data.velocity.get()
      head.value.data.position.set({
        x: position.x + velocity.x,
        y: position.y + velocity.y
      })
    })
)

const CollisionSystem = System.define(
  {
    label: CollisionSystemLabel,
    schema,
    inSets: [MovementSetLabel],
    queries: {
      head: HeadQuery,
      food: FoodQuery
    },
    events: {
      foodEaten: System.writeEvent(FoodEaten)
    }
  },
  ({ queries, events }) =>
    Fx.sync(() => {
      const head = queries.head.single()
      if (!head.ok) {
        return
      }
      const headPosition = head.value.data.position.get()
      for (const match of queries.food.each()) {
        const foodPosition = match.data.position.get()
        if (foodPosition.x === headPosition.x && foodPosition.y === headPosition.y) {
          events.foodEaten.emit({ entityId: match.entity.id })
        }
      }
    })
)

const GrowSystem = System.define(
  {
    label: GrowSystemLabel,
    schema,
    inSets: [GrowthSetLabel],
    queries: {
      head: HeadQuery,
      body: BodyQuery
    },
    events: {
      foodEaten: System.readEvent(FoodEaten)
    }
  },
  ({ queries, events, commands, lookup }) =>
    Fx.sync(() => {
      const eaten = events.foodEaten.all()
      if (eaten.length === 0) {
        return
      }

      const head = queries.head.single()
      if (!head.ok) {
        return
      }

      const tail = queries.body.each().find((match) => match.data.body.get().isTail)
      if (tail) {
        tail.data.body.update((body) => ({
          ...body,
          isTail: false
        }))
      }

      for (const event of eaten) {
        const foodEntity = lookup.get(asSnakeRuntimeEntityId(event.entityId), FoodQuery)
        if (!foodEntity.ok) {
          continue
        }
        const foodPosition = foodEntity.value.data.position.get()
        void foodPosition
        commands.despawn(foodEntity.value.entity.id)
      }

      const parent = tail?.entity.id ?? head.value.entity.id
      const parentLookup = lookup.get(parent, Query.define({
        selection: {
          position: Query.read(Position)
        }
      }))
      if (!parentLookup.ok) {
        return
      }
      const parentPosition = parentLookup.value.data.position.get()

      commands.spawn(
        Command.spawnWith<typeof schema>(
          [Position, { x: parentPosition.x - 1, y: parentPosition.y }],
          [SnakeBody, { parent, isTail: true }],
          [FollowTarget, { x: parentPosition.x, y: parentPosition.y }]
        )
      )

      commands.spawn(
        Command.spawnWith<typeof schema>(
          [Position, { x: head.value.data.position.get().x + 3, y: head.value.data.position.get().y }],
          [Food, {}]
        )
      )
    })
)

const FollowSystem = System.define(
  {
    label: FollowSystemLabel,
    schema,
    inSets: [GrowthSetLabel],
    queries: {
      body: BodyQuery
    }
  },
  ({ queries, lookup }) =>
    Fx.sync(() => {
      for (const match of queries.body.each()) {
        const body = match.data.body.get()
        const parentLookup = lookup.get(
          asSnakeRuntimeEntityId(body.parent),
          Query.define({
            selection: {
              position: Query.read(Position)
            }
          })
        )
        if (!parentLookup.ok) {
          continue
        }
        const parentPosition = parentLookup.value.data.position.get()

        match.data.followTarget.set(parentPosition)
        match.data.position.set(parentPosition)
      }
    })
)

const setupSchedule = Schedule.define({
  label: SetupScheduleLabel,
  schema,
  systems: [SetupSystem]
})

const updateSchedule = Schedule.define({
  label: UpdateScheduleLabel,
  schema,
  systems: [MovementSystem, CollisionSystem, GrowSystem, FollowSystem],
  sets: [
    Schedule.configureSet({
      label: MovementSetLabel,
      chain: true
    }),
    Schedule.configureSet({
      label: GrowthSetLabel,
      after: [MovementSetLabel],
      chain: true
    })
  ],
  steps: [
    MovementSystem,
    CollisionSystem,
    Schedule.updateEvents(),
    GrowSystem,
    Schedule.applyDeferred(),
    FollowSystem
  ]
})

export const createSnakeExample = () => {
  const runtime = Runtime.makeRuntime({
    schema,
    services: {}
  })

  const app = App.makeApp(runtime)
  app.bootstrap(setupSchedule)

  return {
    runtime,
    app,
    update() {
      app.update(updateSchedule)
    }
  }
}
