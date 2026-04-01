import { Fx } from "../../../index.ts"

import { levelBounds } from "../content.ts"
import { PlayerCameraQuery } from "../queries.ts"
import { Camera, Game, PlatformerHost, Viewport } from "../schema.ts"
import { clamp } from "../math.ts"

export const SyncCameraSystem = Game.System.define(
  "Platformer/SyncCamera",
  {
    queries: {
      player: PlayerCameraQuery
    },
    resources: {
      camera: Game.System.writeResource(Camera),
      viewport: Game.System.readResource(Viewport)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      const viewport = resources.viewport.get()
      const position = player.value.data.position.get()

      resources.camera.set({
        x: clamp(position.x, viewport.width * 0.5, levelBounds.width - viewport.width * 0.5),
        y: clamp(position.y - 96, viewport.height * 0.5, levelBounds.height - viewport.height * 0.5)
      })
    })
)

export const ApplyWorldCameraTransformSystem = Game.System.define(
  "Platformer/ApplyWorldCameraTransform",
  {
    resources: {
      viewport: Game.System.readResource(Viewport),
      camera: Game.System.readResource(Camera)
    },
    services: {
      host: Game.System.service(PlatformerHost)
    }
  },
  ({ resources, services }) =>
    Fx.sync(() => {
      services.host.world.position.set(
        resources.viewport.get().width * 0.5 - resources.camera.get().x,
        resources.viewport.get().height * 0.5 - resources.camera.get().y
      )
    })
)
