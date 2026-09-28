import { RenderSync } from "@bevy-ts/pixi"

import { createRenderNode } from "../render/nodes.ts"
import { Game, Position, RenderNodes, Renderable } from "../schema.ts"

const render = RenderSync.systems(Game, {
  name: "Platformer/Render",
  renderable: Renderable,
  transform: Position,
  registry: RenderNodes,
  create: ({ renderable }) => createRenderNode(renderable),
  apply: (node, { transform }) => {
    node.position.set(transform.x, transform.y)
  }
})

export const DestroyRenderNodesSystem = render.destroy
export const CreateRenderNodesSystem = render.create
export const SyncRenderableTransformsSystem = render.sync
