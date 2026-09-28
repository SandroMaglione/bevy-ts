/**
 * Renderer nodes keyed by ECS entity.
 *
 * Hosts mirror ECS entities into renderer objects (sprites, containers,
 * meshes). The registry owns the bookkeeping every game repeats: one node per
 * entity, attaching new nodes to the scene, detaching and destroying them
 * when the entity loses its renderable or is despawned, and teardown.
 *
 * Nodes are keyed by the entity's numeric value, so an `EntityId`, a query
 * match's `entity.id`, or a stored `Handle` all address the same node.
 *
 * @module NodeRegistry
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

/**
 * Anything carrying an entity's numeric identity: `EntityId`, `Handle`.
 */
export interface EntityKey {
  readonly value: number
}

export interface NodeRegistry<Node> {
  /** Number of live nodes. */
  readonly size: number
  get(entity: EntityKey): Node | undefined
  /**
   * Returns the entity's node, creating and attaching it first when missing.
   */
  ensure(entity: EntityKey, create: () => Node): Node
  /**
   * Detaches and destroys the entity's node. Returns whether one existed.
   */
  remove(entity: EntityKey): boolean
  /**
   * Detaches and destroys every node.
   */
  clear(): void
  entries(): IterableIterator<readonly [number, Node]>
}

export interface RegistryOptions<Node> {
  /** Adds a newly created node to the scene. */
  readonly attach: (node: Node) => void
  /** Removes a node from the scene and releases it. */
  readonly detach: (node: Node) => void
}

/**
 * Creates a registry with explicit attach/detach behavior, for nodes that are
 * not plain containers (for example a wrapper holding a sprite and metadata).
 */
export const make = <Node>(options: RegistryOptions<Node>): NodeRegistry<Node> => {
  const nodes = new Map<number, Node>()
  return {
    get size() {
      return nodes.size
    },
    get(entity) {
      return nodes.get(entity.value)
    },
    ensure(entity, create) {
      const existing = nodes.get(entity.value)
      if (existing !== undefined) {
        return existing
      }
      const node = create()
      nodes.set(entity.value, node)
      options.attach(node)
      return node
    },
    remove(entity) {
      const node = nodes.get(entity.value)
      if (node === undefined) {
        return false
      }
      nodes.delete(entity.value)
      options.detach(node)
      return true
    },
    clear() {
      for (const node of nodes.values()) {
        options.detach(node)
      }
      nodes.clear()
    },
    entries() {
      return nodes.entries()
    }
  }
}

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
