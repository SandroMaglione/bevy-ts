/**
 * Pixi container implementation of the renderer-independent node registry.
 *
 * Import the registry contract and render systems from `@typeonce/bevy-ts-render`.
 * Construct this adapter in the host and provide it as a normal runtime service.
 * Removing a node detaches it and destroys it with its children.
 *
 * @module PixiNodeRegistry
 * @docGroup pixi
 *
 * @example
 * ```ts
 * const sprites = PixiNodeRegistry.make(actorLayer)
 * sprites.ensure(match.entity.id, () => new Sprite(texture))
 * sprites.remove(despawnedId)
 * sprites.clear()
 * ```
 */
import * as NodeRegistry from "@typeonce/bevy-ts-render/NodeRegistry"

/**
 * The container surface the registry needs; Pixi's `Container` satisfies it.
 */
export interface ContainerLike<Child> {
  addChild(child: Child): unknown
  removeChild(child: Child): unknown
}

/**
 * The node surface the registry needs; every Pixi display object satisfies it.
 */
export interface Destroyable {
  destroy(options?: unknown): void
}

/**
 * Creates a registry whose nodes are children of one container and are
 * destroyed (with their children) when removed.
 */
export const make = <Node extends Destroyable>(parent: ContainerLike<Node>): NodeRegistry.NodeRegistry<Node> =>
  NodeRegistry.make({
    attach: (node) => {
      parent.addChild(node)
    },
    detach: (node) => {
      parent.removeChild(node)
      node.destroy({ children: true })
    }
  })
