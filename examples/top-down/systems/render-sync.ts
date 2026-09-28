
import { RenderSync } from "@bevy-ts/pixi"

import { PickupRenderQuery, PlayerRenderQuery } from "../queries.ts"
import {
  Camera,
  CurrentPlayerFrame,
  FocusedCollectable,
  Game,
  Position,
  Renderable,
  RenderNodes,
  TopDownHost,
  Viewport
} from "../schema.ts"
import { createRenderNode, textureForCurrentFrame } from "../render/nodes.ts"

export const ApplyWorldCameraTransformSystem = Game.System(
  "TopDown/ApplyWorldCameraTransform",
  {
    resources: {
      viewport: Game.System.readResource(Viewport),
      camera: Game.System.readResource(Camera)
    },
    services: {
      host: Game.System.service(TopDownHost)
    }
  },
  ({ resources, services }) =>
    {
      services.host.world.position.set(
        resources.viewport.get().width * 0.5 - resources.camera.get().x,
        resources.viewport.get().height * 0.5 - resources.camera.get().y
      )
    }
)

const render = RenderSync.systems(Game, {
  name: "TopDown/Render",
  renderable: Renderable,
  transform: Position,
  registry: RenderNodes,
  services: { host: TopDownHost },
  // The player's frame is refreshed every tick by SyncPlayerSpriteSystem.
  create: ({ renderable, services }) =>
    createRenderNode(renderable, services.host.playerFrames, { row: 1, column: 1 }),
  apply: (renderNode, { transform }) => {
    renderNode.node.position.set(transform.x, transform.y)
  }
})

export const DestroyRenderNodesSystem = render.destroy
export const CreateRenderNodesSystem = render.create
export const SyncRenderableTransformsSystem = render.sync

export const SyncPlayerSpriteSystem = Game.System(
  "TopDown/SyncPlayerSprite",
  {
    queries: {
      players: PlayerRenderQuery
    },
    resources: {
      playerFrame: Game.System.readResource(CurrentPlayerFrame)
    },
    services: {
      host: Game.System.service(TopDownHost)
    }
  },
  ({ queries, resources, services }) =>
    {
      const currentFrame = resources.playerFrame.get()

      for (const match of queries.players.each()) {
        const renderNode = services.host.nodes.get(match.entity.id)
        if (!renderNode || renderNode.kind !== "player") {
          continue
        }

        const renderable = match.data.renderable.get()
        renderNode.node.texture = textureForCurrentFrame(services.host.playerFrames, currentFrame)
        // Sizing sets the scale, so it must come after any scale reset.
        renderNode.node.width = renderable.width
        renderNode.node.height = renderable.height
        renderNode.node.alpha = 1
        renderNode.node.rotation = 0
      }
    }
)

export const SyncPickupPresentationSystem = Game.System(
  "TopDown/SyncPickupPresentation",
  {
    queries: {
      pickups: PickupRenderQuery
    },
    resources: {
      focused: Game.System.readResource(FocusedCollectable)
    },
    services: {
      host: Game.System.service(TopDownHost)
    }
  },
  ({ queries, resources, services }) =>
    {
      const focusedId = resources.focused.get().current?.value ?? null

      for (const match of queries.pickups.each()) {
        const renderNode = services.host.nodes.get(match.entity.id)
        if (!renderNode || renderNode.kind !== "pickup") {
          continue
        }

        const isFocused = match.entity.id.value === focusedId
        renderNode.node.rotation += 0.01
        renderNode.node.scale.set(isFocused ? 1.12 : 1)
        renderNode.node.alpha = isFocused ? 1 : 0.86
      }
    }
)
