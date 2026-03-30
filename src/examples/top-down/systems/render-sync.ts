import { Fx } from "../../../index.ts"

import { AddedRenderableQuery, RenderQuery } from "../queries.ts"
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

export const SyncSceneSystem = Game.System.define(
  "TopDown/SyncScene",
  {
    queries: {
      renderables: RenderQuery,
      addedRenderables: AddedRenderableQuery
    },
    removed: {
      renderables: Game.System.readRemoved(Renderable)
    },
    despawned: {
      entities: Game.System.readDespawned()
    },
    resources: {
      viewport: Game.System.readResource(Viewport),
      camera: Game.System.readResource(Camera),
      focused: Game.System.readResource(FocusedCollectable),
      playerFrame: Game.System.readResource(CurrentPlayerFrame)
    },
    services: {
      host: Game.System.service(TopDownHost)
    }
  },
  ({ queries, removed, despawned, resources, services }) =>
    Fx.sync(() => {
      const host = services.host
      const focusedId = resources.focused.get().current?.value ?? null
      const currentFrame = resources.playerFrame.get()

      host.world.position.set(
        resources.viewport.get().width * 0.5 - resources.camera.get().x,
        resources.viewport.get().height * 0.5 - resources.camera.get().y
      )

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

      for (const match of queries.addedRenderables.each()) {
        ensureNode(host, match.entity.id.value, match.data.renderable.get(), currentFrame)
      }

      for (const match of queries.renderables.each()) {
        const entityId = match.entity.id.value
        const renderable = match.data.renderable.get()
        const position = match.data.position.get()
        const renderNode = ensureNode(host, entityId, renderable, currentFrame)

        renderNode.node.position.set(position.x, position.y)
        renderNode.node.alpha = 1
        renderNode.node.scale.set(1)
        renderNode.node.rotation = 0

        if (renderNode.kind === "player") {
          renderNode.node.texture = textureForCurrentFrame(host.playerFrames, currentFrame)
          renderNode.node.width = renderable.width
          renderNode.node.height = renderable.height
        }

        if (match.data.collectable.present && renderNode.kind === "pickup") {
          const isFocused = entityId === focusedId
          renderNode.node.rotation += 0.01
          renderNode.node.scale.set(isFocused ? 1.12 : 1)
          renderNode.node.alpha = isFocused ? 1 : 0.86
        }
      }
    })
)
