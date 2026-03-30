import { Fx } from "../../../index.ts"

import { PLAYER_SPEED } from "../constants.ts"
import { normalizeMovement, resolveHorizontalMovement, resolveVerticalMovement } from "../math.ts"
import { PlayerMovementQuery, WallCollisionQuery } from "../queries.ts"
import { DeltaTime, Game, InputState } from "../schema.ts"

export const PlanPlayerVelocitySystem = Game.System.define(
  "TopDown/PlanPlayerVelocity",
  {
    queries: {
      player: PlayerMovementQuery
    },
    resources: {
      input: Game.System.readResource(InputState)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const player = queries.player.single()
      if (!player.ok) {
        return
      }

      const direction = normalizeMovement(resources.input.get())
      player.value.data.velocity.set({
        x: direction.x * PLAYER_SPEED,
        y: direction.y * PLAYER_SPEED
      })
    })
)

export const MovePlayerSystem = Game.System.define(
  "TopDown/MovePlayer",
  {
    queries: {
      player: PlayerMovementQuery,
      walls: WallCollisionQuery
    },
    resources: {
      deltaTime: Game.System.readResource(DeltaTime)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const player = queries.player.single()
      if (!player.ok) {
        return
      }

      const dt = resources.deltaTime.get()
      const velocity = player.value.data.velocity.get()
      if (velocity.x === 0 && velocity.y === 0) {
        return
      }

      const walls = queries.walls.each().map((match) => ({
        position: match.data.position.get(),
        collider: match.data.collider.get()
      }))

      const position = player.value.data.position.get()
      const collider = player.value.data.collider.get()
      const nextX = resolveHorizontalMovement(position, velocity.x * dt, collider, walls)
      const nextPosition = {
        x: nextX,
        y: position.y
      }
      const nextY = resolveVerticalMovement(nextPosition, velocity.y * dt, collider, walls)

      player.value.data.position.set({
        x: nextX,
        y: nextY
      })
    })
)
