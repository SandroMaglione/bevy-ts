/**
 * Minimal `pokemon`-style example.
 *
 * This example mirrors the reference repo's grid-movement structure:
 * - input comes from a host service
 * - movement intent is planned first
 * - collision cancels illegal targets
 * - movement is applied afterwards in dependency order
 */
import { App, Command, Descriptor, Fx, Label, Query, Runtime, Schedule, Schema, System } from "../index.ts"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Pokemon/Position")
const Movement = Descriptor.defineComponent<{
  direction: "up" | "down" | "left" | "right" | null
  targetX: number
  targetY: number
  isMoving: boolean
}>()("Pokemon/Movement")
const Player = Descriptor.defineComponent<{}>()("Pokemon/Player")
const Solid = Descriptor.defineComponent<{}>()("Pokemon/Solid")

const GridSize = Descriptor.defineResource<{ width: number; height: number; tileSize: number }>()("Pokemon/GridSize")
const InputManager = Descriptor.defineService<{
  readonly direction: () => "up" | "down" | "left" | "right" | null
}>()("Pokemon/InputManager")

const schema = Schema.build(
  Schema.fragment({
    components: {
      Position,
      Movement,
      Player,
      Solid
    },
    resources: {
      GridSize
    }
  })
)

const SetupSystemLabel = Label.defineSystemLabel("Pokemon/Setup")
const InputSystemLabel = Label.defineSystemLabel("Pokemon/Input")
const PlanMovementSystemLabel = Label.defineSystemLabel("Pokemon/PlanMovement")
const CollisionSystemLabel = Label.defineSystemLabel("Pokemon/Collision")
const ApplyMovementSystemLabel = Label.defineSystemLabel("Pokemon/ApplyMovement")
const InputPipelineSetLabel = Label.defineSystemSetLabel("Pokemon/InputPipeline")
const ResolveMovementSetLabel = Label.defineSystemSetLabel("Pokemon/ResolveMovement")

const SetupScheduleLabel = Label.defineScheduleLabel("Pokemon/Setup")
const UpdateScheduleLabel = Label.defineScheduleLabel("Pokemon/Update")

const PlayerQuery = Query.define({
  selection: {
    position: Query.read(Position),
    movement: Query.write(Movement),
    player: Query.read(Player)
  }
})

const SetupSystem = System.define(
  {
    label: SetupSystemLabel,
    schema
  },
  ({ commands }) =>
    Fx.sync(() => {
      commands.spawn(
        Command.spawnWith<typeof schema>(
          [Position, { x: 32 * 3, y: 32 * 3 }],
          [Movement, {
            direction: null,
            targetX: 32 * 3,
            targetY: 32 * 3,
            isMoving: false
          }],
          [Player, {}]
        )
      )

      commands.spawn(
        Command.spawnWith<typeof schema>(
          [Position, { x: 32 * 5, y: 32 * 5 }],
          [Solid, {}]
        )
      )
    })
)

const InputSystem = System.define(
  {
    label: InputSystemLabel,
    schema,
    inSets: [InputPipelineSetLabel],
    queries: {
      player: PlayerQuery
    },
    services: {
      input: System.service(InputManager)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      const direction = services.input.direction()
      const player = queries.player.single()
      if (!player.ok) {
        return
      }
      player.value.data.movement.update((movement) => ({
        ...movement,
        direction
      }))
    })
)

const PlanMovementSystem = System.define(
  {
    label: PlanMovementSystemLabel,
    schema,
    inSets: [InputPipelineSetLabel],
    queries: {
      player: PlayerQuery
    },
    resources: {
      grid: System.readResource(GridSize)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const { tileSize } = resources.grid.get()
      const player = queries.player.single()
      if (!player.ok) {
        return
      }

      const match = player.value
      const position = match.data.position.get()
      const movement = match.data.movement.get()
      if (movement.isMoving || movement.direction === null) {
        return
      }

      const offset = movement.direction === "up" ? { x: 0, y: -tileSize }
        : movement.direction === "down" ? { x: 0, y: tileSize }
        : movement.direction === "left" ? { x: -tileSize, y: 0 }
        : { x: tileSize, y: 0 }

      match.data.movement.set({
        ...movement,
        targetX: position.x + offset.x,
        targetY: position.y + offset.y,
        isMoving: true
      })
    })
)

const CollisionSystem = System.define(
  {
    label: CollisionSystemLabel,
    schema,
    inSets: [ResolveMovementSetLabel],
    queries: {
      player: PlayerQuery,
      solids: Query.define({
        selection: {
          position: Query.read(Position),
          solid: Query.read(Solid)
        }
      })
    },
    resources: {
      grid: System.readResource(GridSize)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const { width, height } = resources.grid.get()
      const occupied = new Set(
        queries.solids.each().map((match) => {
          const position = match.data.position.get()
          return `${position.x},${position.y}`
        })
      )

      const player = queries.player.single()
      if (!player.ok) {
        return
      }

      const match = player.value
      const movement = match.data.movement.get()
      if (!movement.isMoving) {
        return
      }

      const outOfBounds = movement.targetX < 0 || movement.targetY < 0 || movement.targetX >= width || movement.targetY >= height
      const occupiedTarget = occupied.has(`${movement.targetX},${movement.targetY}`)
      if (outOfBounds || occupiedTarget) {
        match.data.movement.set({
          ...movement,
          direction: null,
          isMoving: false
        })
      }
    })
)

const ApplyMovementSystem = System.define(
  {
    label: ApplyMovementSystemLabel,
    schema,
    inSets: [ResolveMovementSetLabel],
    queries: {
      player: PlayerQuery
    }
  },
  ({ queries, lookup }) =>
    Fx.sync(() => {
      const player = queries.player.single()
      if (!player.ok) {
        return
      }

      const match = player.value
      {
        const movement = match.data.movement.get()
        if (!movement.isMoving) {
          return
        }

        const lookedUp = lookup.get(match.entity.id, Query.define({
          selection: {
            position: Query.write(Position)
          }
        }))
        if (!lookedUp.ok) {
          return
        }

        lookedUp.value.data.position.set({
          x: movement.targetX,
          y: movement.targetY
        })

        match.data.movement.set({
          ...movement,
          direction: null,
          isMoving: false
        })
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
  systems: [InputSystem, PlanMovementSystem, CollisionSystem, ApplyMovementSystem],
  sets: [
    Schedule.configureSet({
      label: InputPipelineSetLabel,
      chain: true
    }),
    Schedule.configureSet({
      label: ResolveMovementSetLabel,
      after: [InputPipelineSetLabel],
      chain: true
    })
  ]
})

export const createPokemonExample = (input: {
  readonly direction: () => "up" | "down" | "left" | "right" | null
}) => {
  const runtime = Runtime.makeRuntime({
    schema,
    services: {
      [InputManager.name]: input
    },
    resources: {
      GridSize: {
        width: 32 * 10,
        height: 32 * 10,
        tileSize: 32
      }
    }
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
