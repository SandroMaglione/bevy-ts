import { Fx } from "../../../index.ts"

import {
  AddedRenderableQuery,
  ChangedRenderableTransformQuery,
  PickupRenderQuery,
  PlayerRenderQuery
} from "../queries.ts"
import {
  Camera,
  CurrentPlayerFrame,
  FocusedCollectable,
  Game,
  Renderable,
  TopDownHost,
  Viewport
} from "../schema.ts"
import { destroyRenderNode, ensureNode, textureForCurrentFrame } from "../render/nodes.ts"

export const ApplyWorldCameraTransformSystem = Game.System.define(
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
    Fx.sync(() => {
      services.host.world.position.set(
        resources.viewport.get().width * 0.5 - resources.camera.get().x,
        resources.viewport.get().height * 0.5 - resources.camera.get().y
      )
    })
)

export const DestroyRenderNodesSystem = Game.System.define(
  "TopDown/DestroyRenderNodes",
  {
    removed: {
      renderables: Game.System.readRemoved(Renderable)
    },
    despawned: {
      entities: Game.System.readDespawned()
    },
    services: {
      host: Game.System.service(TopDownHost)
    }
  },
  ({ removed, despawned, services }) =>
    Fx.sync(() => {
      const host = services.host

      for (const entityId of removed.renderables.all()) {
        const renderNode = host.nodes.get(entityId.value)
        if (!renderNode) {
          continue
        }

        host.actorLayer.removeChild(renderNode.node)
        destroyRenderNode(renderNode)
        host.nodes.delete(entityId.value)
      }

      for (const entityId of despawned.entities.all()) {
        const renderNode = host.nodes.get(entityId.value)
        if (!renderNode) {
          continue
        }

        host.actorLayer.removeChild(renderNode.node)
        destroyRenderNode(renderNode)
        host.nodes.delete(entityId.value)
      }
    })
)

export const CreateRenderNodesSystem = Game.System.define(
  "TopDown/CreateRenderNodes",
  {
    queries: {
      addedRenderables: AddedRenderableQuery
    },
    resources: {
      playerFrame: Game.System.readResource(CurrentPlayerFrame)
    },
    services: {
      host: Game.System.service(TopDownHost)
    }
  },
  ({ queries, resources, services }) =>
    Fx.sync(() => {
      const currentFrame = resources.playerFrame.get()

      for (const match of queries.addedRenderables.each()) {
        const renderNode = ensureNode(
          services.host,
          match.entity.id.value,
          match.data.renderable.get(),
          currentFrame
        )
        const position = match.data.position.get()
        renderNode.node.position.set(position.x, position.y)
      }
    })
)

export const SyncRenderableTransformsSystem = Game.System.define(
  "TopDown/SyncRenderableTransforms",
  {
    queries: {
      renderables: ChangedRenderableTransformQuery
    },
    resources: {
      playerFrame: Game.System.readResource(CurrentPlayerFrame)
    },
    services: {
      host: Game.System.service(TopDownHost)
    }
  },
  ({ queries, resources, services }) =>
    Fx.sync(() => {
      const currentFrame = resources.playerFrame.get()

      for (const match of queries.renderables.each()) {
        const entityId = match.entity.id.value
        const renderable = match.data.renderable.get()
        const renderNode = ensureNode(services.host, entityId, renderable, currentFrame)
        const position = match.data.position.get()

        renderNode.node.position.set(position.x, position.y)
      }
    })
)

export const SyncPlayerSpriteSystem = Game.System.define(
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
    Fx.sync(() => {
      const currentFrame = resources.playerFrame.get()

      for (const match of queries.players.each()) {
        const renderNode = services.host.nodes.get(match.entity.id.value)
        if (!renderNode || renderNode.kind !== "player") {
          continue
        }

        const renderable = match.data.renderable.get()
        renderNode.node.texture = textureForCurrentFrame(services.host.playerFrames, currentFrame)
        renderNode.node.width = renderable.width
        renderNode.node.height = renderable.height
        renderNode.node.alpha = 1
        renderNode.node.scale.set(1)
        renderNode.node.rotation = 0
      }
    })
)

export const SyncPickupPresentationSystem = Game.System.define(
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
    Fx.sync(() => {
      const focusedId = resources.focused.get().current?.value ?? null

      for (const match of queries.pickups.each()) {
        const renderNode = services.host.nodes.get(match.entity.id.value)
        if (!renderNode || renderNode.kind !== "pickup") {
          continue
        }

        const isFocused = match.entity.id.value === focusedId
        renderNode.node.rotation += 0.01
        renderNode.node.scale.set(isFocused ? 1.12 : 1)
        renderNode.node.alpha = isFocused ? 1 : 0.86
      }
    })
)
