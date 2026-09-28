import { RenderSync } from "@bevy-ts/pixi"

import { createRenderNode } from "../render/nodes.ts"
import { Game, Position, RenderNodes, Renderable } from "../schema.ts"

const render = RenderSync.systems(Game, {
  name: "Platformer/Render",
  renderable: Renderable,
  transform: Position,
  registry: RenderNodes,
  create: createRenderNode,
  apply: (node, position) => {
    node.position.set(position.x, position.y)
  }
})

export const DestroyRenderNodesSystem = render.destroy
export const CreateRenderNodesSystem = render.create
export const SyncRenderableTransformsSystem = render.sync
