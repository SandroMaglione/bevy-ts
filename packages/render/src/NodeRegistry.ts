/**
 * Renderer nodes keyed by ECS entity.
 *
 * Hosts mirror ECS entities into renderer objects (sprites, containers,
 * meshes, DOM elements). The registry owns the bookkeeping every game
 * repeats: one node per entity, attaching new nodes to the scene, detaching
 * and destroying them when the entity loses its renderable or is despawned,
 * and teardown. It does not import or assume any renderer: what attaching and
 * detaching mean is passed to `make`.
 *
 * Nodes are keyed by the entity's numeric value, so an `EntityId`, a query
 * match's `entity.id`, or a stored `Handle` all address the same node.
 *
 * @module NodeRegistry
 * @docGroup render
 *
 * @example
 * ```ts
 * const meshes = NodeRegistry.make<Mesh>({
 *   attach: (mesh) => scene.add(mesh),
 *   detach: (mesh) => {
 *     scene.remove(mesh)
 *     mesh.geometry.dispose()
 *   }
 * })
 * meshes.ensure(match.entity.id, () => new Mesh(geometry, material))
 * meshes.remove(despawnedId)
 * meshes.clear()
 * ```
 */

/**
 * An entity's numeric identity: an `EntityId`, a `Handle`, or the plain number
 * (ids and handles are branded numbers).
 */
export type EntityKey = number

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
 * Creates a registry with explicit attach/detach behavior: `attach` adds a
 * newly created node to the scene, `detach` removes and releases it. Renderer
 * packages build on this (for example `PixiNodeRegistry.make` in
 * `@typeonce/ritmo-pixi`).
 */
export const make = <Node>(options: RegistryOptions<Node>): NodeRegistry<Node> => {
  const nodes = new Map<number, Node>()
  return {
    get size() {
      return nodes.size
    },
    get(entity) {
      return nodes.get(entity)
    },
    ensure(entity, create) {
      const existing = nodes.get(entity)
      if (existing !== undefined) {
        return existing
      }
      const node = create()
      nodes.set(entity, node)
      options.attach(node)
      return node
    },
    remove(entity) {
      const node = nodes.get(entity)
      if (node === undefined) {
        return false
      }
      nodes.delete(entity)
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
