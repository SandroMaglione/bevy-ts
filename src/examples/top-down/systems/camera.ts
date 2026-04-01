import { Fx } from "../../../index.ts"
import * as Vector2 from "../../../Vector2.ts"

import { WORLD_HEIGHT, WORLD_WIDTH } from "../constants.ts"
import { clamp } from "../math.ts"
import { PlayerCameraQuery } from "../queries.ts"
import { Camera, Game, Viewport } from "../schema.ts"

export const SyncCameraSystem = Game.System.define(
  "TopDown/SyncCamera",
  {
    queries: {
      player: PlayerCameraQuery
    },
    resources: {
      viewport: Game.System.readResource(Viewport),
      camera: Game.System.writeResource(Camera)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      const playerPosition = player.value.data.position.get()
      const viewport = resources.viewport.get()
      const halfViewWidth = viewport.width * 0.5
      const halfViewHeight = viewport.height * 0.5
      const minCameraX = halfViewWidth
      const maxCameraX = WORLD_WIDTH - halfViewWidth
      const minCameraY = halfViewHeight
      const maxCameraY = WORLD_HEIGHT - halfViewHeight

      resources.camera.setResult(Vector2.result({
        x: minCameraX > maxCameraX ? WORLD_WIDTH * 0.5 : clamp(playerPosition.x, minCameraX, maxCameraX),
        y: minCameraY > maxCameraY ? WORLD_HEIGHT * 0.5 : clamp(playerPosition.y, minCameraY, maxCameraY)
      }))
    })
)
