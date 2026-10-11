/**
 * Pixi render-node registries keyed by ECS entity.
 *
 * The registry itself (`make`, `NodeRegistry`, `EntityKey`, ...) lives in
 * `@typeonce/bevy-ts-render` and is re-exported here, so this module is
 * imported as `NodeRegistry` from `@typeonce/bevy-ts-pixi` like before. It
 * adds `inContainer`: a registry whose nodes are children of one Pixi
 * container and are destroyed, with their children, when removed.
 *
 * @module PixiNodeRegistry
 * @docGroup pixi
 *
 * @example
 * ```ts
 * const sprites = NodeRegistry.inContainer<Sprite>(actorLayer)
 * sprites.ensure(match.entity.id, () => new Sprite(texture))
 * sprites.remove(despawnedId)
 * sprites.clear()
 * ```
 */
import { make, type NodeRegistry } from "@typeonce/bevy-ts-render/NodeRegistry"

export * from "@typeonce/bevy-ts-render/NodeRegistry"

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
export const inContainer = <Node extends Destroyable>(parent: ContainerLike<Node>): NodeRegistry<Node> =>
  make({
    attach: (node) => {
      parent.addChild(node)
    },
    detach: (node) => {
      parent.removeChild(node)
      node.destroy({ children: true })
    }
  })
