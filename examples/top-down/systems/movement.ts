import { Fx } from "../../../src/index.ts"
import * as Vector2 from "../../../src/Vector2.ts"

import { PLAYER_SPEED } from "../constants.ts"
import { normalizeMovement, resolveHorizontalMovement, resolveVerticalMovement } from "../math.ts"
import { PlayerMovementQuery, WallCollisionQuery } from "../queries.ts"
import { DeltaTime, Game, InputState } from "../schema.ts"

export const PlanPlayerVelocitySystem = Game.System(
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
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      const direction = normalizeMovement(resources.input.get())
      player.value.data.velocity.updateRaw(() =>
        ({
          x: direction.x * PLAYER_SPEED,
          y: direction.y * PLAYER_SPEED
        })
      )
    })
)

export const MovePlayerSystem = Game.System(
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
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
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
      const nextPosition = Vector2.result({
        x: nextX,
        y: position.y
      })
      if (!nextPosition.ok) {
        return
      }
      const nextY = resolveVerticalMovement(nextPosition.value, velocity.y * dt, collider, walls)

      player.value.data.position.setRaw({
        x: nextX,
        y: nextY
      })
    })
)
