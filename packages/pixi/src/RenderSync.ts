/**
 * Systems that mirror ECS entities into renderer nodes.
 *
 * Most renderer integrations need the same three systems: create a node when
 * an entity gains its renderable component, keep the node's transform in sync
 * when a transform component changes, and destroy the node when the
 * renderable is removed or the entity despawns. `RenderSync.systems(...)`
 * builds those systems for one bound `Game`. What a node looks like and how a
 * transform is applied stay caller-defined.
 *
 * Change detection is per system, so the systems see every addition, change,
 * and removal exactly once, wherever they sit in the schedule. Place them
 * after the `applyDeferred()` that commits spawns to render new entities in
 * the same tick.
 *
 * @module RenderSync
 * @docGroup pixi
 *
 * @example
 * ```ts
 * const Sprites = Descriptor.Service<NodeRegistry.NodeRegistry<Sprite>>()("Game/Sprites")
 *
 * const render = RenderSync.systems(Game, {
 *   name: "Game/Render",
 *   renderable: Renderable,
 *   transform: Position,
 *   registry: Sprites,
 *   create: (renderable) => new Sprite(textures[renderable.texture]),
 *   apply: (sprite, position) => sprite.position.set(position.x, position.y)
 * })
 *
 * const update = Game.Schedule(Gameplay, Game.Schedule.applyDeferred(), render.destroy, render.create, render.sync)
 * ```
 */
import type { Descriptor } from "@bevy-ts/core/Descriptor"
import type * as Entity from "@bevy-ts/core/Entity"
import type { ReadonlyValue } from "@bevy-ts/core/Query"
import type { Schema } from "@bevy-ts/core/Schema"
import type { NodeRegistry } from "./NodeRegistry.ts"

type RegistryService = Descriptor<"service", string, NodeRegistry<any>>

/**
 * The node type held by a registry service.
 */
export type NodeOf<R extends RegistryService> =
  R extends Descriptor<"service", string, NodeRegistry<infer Node>> ? Node : never

export interface Options<
  S extends Schema.Any,
  Root,
  Renderable extends Schema.ComponentDescriptor<S>,
  Transform extends Schema.ComponentDescriptor<S>,
  Registry extends RegistryService
> {
  /** Prefix for the generated system names. */
  readonly name: string
  /** The component whose presence means "this entity has a node". */
  readonly renderable: Renderable
  /** The component applied to the node on creation and whenever it changes. */
  readonly transform: Transform
  /** The service providing the node registry. */
  readonly registry: Registry
  /** Builds the node for a new renderable entity. */
  readonly create: (
    renderable: ReadonlyValue<Descriptor.Value<Renderable>>,
    entity: Entity.EntityId<S, Root>
  ) => NodeOf<Registry>
  /** Applies the transform to the node. */
  readonly apply: (
    node: NodeOf<Registry>,
    transform: ReadonlyValue<Descriptor.Value<Transform>>,
    renderable: ReadonlyValue<Descriptor.Value<Renderable>>
  ) => void
}

/**
 * One generated system. Its only runtime requirement is the registry service.
 */
export type RenderSystem<S extends Schema.Any, Root, Registry extends RegistryService> =
  Schema.BoundSystem<S, Root, any, void, never, string, Registry>

export interface RenderSystems<S extends Schema.Any, Root, Registry extends RegistryService> {
  /** Destroys nodes of entities that lost the renderable or despawned. */
  readonly destroy: RenderSystem<S, Root, Registry>
  /** Creates nodes for entities that gained the renderable, and applies their transform. */
  readonly create: RenderSystem<S, Root, Registry>
  /** Applies changed transforms to existing nodes. */
  readonly sync: RenderSystem<S, Root, Registry>
}

/**
 * Builds the destroy, create, and sync systems for one renderable component.
 */
export const systems = <
  S extends Schema.Any,
  Root,
  const Renderable extends Schema.ComponentDescriptor<S>,
  const Transform extends Schema.ComponentDescriptor<S>,
  const Registry extends RegistryService
>(
  Game: Schema.Game<S, Root>,
  options: Options<S, Root, Renderable, Transform, Registry>
): RenderSystems<S, Root, Registry> => {
  type Node = NodeOf<Registry>
  // Internally the generic descriptors are erased; the public result type
  // above carries the exact requirement (the registry service).
  const System = Game.System as unknown as (name: string, spec: object, run: (context: any) => void) => unknown
  const Query = Game.Query as unknown as ((spec: object) => object) & Schema.Game<S, Root>["Query"]
  const selection = {
    renderable: Game.Query.read(options.renderable),
    transform: Game.Query.read(options.transform)
  }
  const services = { registry: Game.System.service(options.registry) }

  const destroy = System(`${options.name}/Destroy`, {
    removed: { renderables: Game.System.readRemoved(options.renderable) },
    despawned: { entities: Game.System.readDespawned() },
    services
  }, ({ removed, despawned, services }) => {
    const registry = services.registry as NodeRegistry<Node>
    for (const entity of removed.renderables.all()) registry.remove(entity)
    for (const entity of despawned.entities.all()) registry.remove(entity)
  })

  const create = System(`${options.name}/Create`, {
    queries: { added: Query({ selection, filters: [Game.Query.added(options.renderable)] }) },
    services
  }, ({ queries, services }) => {
    const registry = services.registry as NodeRegistry<Node>
    for (const { entity, data } of queries.added.each()) {
      const renderable = data.renderable.get()
      const node = registry.ensure(entity.id, () => options.create(renderable, entity.id))
      options.apply(node, data.transform.get(), renderable)
    }
  })

  const sync = System(`${options.name}/Sync`, {
    queries: { changed: Query({ selection, filters: [Game.Query.changed(options.transform)] }) },
    services
  }, ({ queries, services }) => {
    const registry = services.registry as NodeRegistry<Node>
    for (const { entity, data } of queries.changed.each()) {
      const node = registry.get(entity.id)
      if (node !== undefined) options.apply(node, data.transform.get(), data.renderable.get())
    }
  })

  return { destroy, create, sync } as unknown as RenderSystems<S, Root, Registry>
}
