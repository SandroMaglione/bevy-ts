import { Fx } from "../../../src/index.ts"

import { AddedRenderableQuery, ChangedRenderableTransformQuery } from "../queries.ts"
import { Game, PlatformerHost, Renderable } from "../schema.ts"
import { destroyRenderNode, ensureNode } from "../render/nodes.ts"

export const DestroyRenderNodesSystem = Game.System(
  "Platformer/DestroyRenderNodes",
  {
    removed: {
      renderables: Game.System.readRemoved(Renderable)
    },
    despawned: {
      entities: Game.System.readDespawned()
    },
    services: {
      host: Game.System.service(PlatformerHost)
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

export const CreateRenderNodesSystem = Game.System(
  "Platformer/CreateRenderNodes",
  {
    queries: {
      renderables: AddedRenderableQuery
    },
    services: {
      host: Game.System.service(PlatformerHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      for (const match of queries.renderables.each()) {
        const renderNode = ensureNode(
          services.host,
          match.entity.id.value,
          match.data.renderable.get()
        )
        const position = match.data.position.get()
        renderNode.node.position.set(position.x, position.y)
      }
    })
)

export const SyncRenderableTransformsSystem = Game.System(
  "Platformer/SyncRenderableTransforms",
  {
    queries: {
      renderables: ChangedRenderableTransformQuery
    },
    services: {
      host: Game.System.service(PlatformerHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      for (const match of queries.renderables.each()) {
        const renderNode = ensureNode(
          services.host,
          match.entity.id.value,
          match.data.renderable.get()
        )
        const position = match.data.position.get()
        renderNode.node.position.set(position.x, position.y)
      }
    })
)
