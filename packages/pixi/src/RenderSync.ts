/**
 * A system that mirrors ECS entities into renderer nodes.
 *
 * Every renderer integration does the same bookkeeping: create a node when an
 * entity gains its renderable component, re-apply it when its transform
 * changes, and destroy it when the renderable is removed or the entity
 * despawns. `RenderSync.system(...)` builds one system that does all three,
 * in a safe order (destroy, create, update), for one bound `Game`. What a
 * node looks like and how state is applied stay caller-defined.
 *
 * Change detection is per system, so the system sees every addition, change,
 * and removal exactly once, wherever it sits in the schedule, and applies each
 * node at most once per run: a node created in a run is not applied again for
 * the same changes. `redrawOn` lists more components whose changes re-run
 * `apply`, for node state beyond the transform (animation frames, tints,
 * interpolation). Place the system after the `applyDeferred()` that commits
 * spawns to render new entities in the same tick.
 *
 * `create` and `apply` receive one context: the renderable and transform
 * values, the entity id, extra read-only slots declared in `select` (as query
 * cells), resources declared in `resources` (as read cells), and extra
 * services declared in `services`. Those resources and services become
 * runtime requirements like the registry itself.
 *
 * @module RenderSync
 * @docGroup pixi
 *
 * @example
 * ```ts
 * const Sprites = Descriptor.Service<NodeRegistry.NodeRegistry<Sprite>>()("Game/Sprites")
 *
 * const Render = RenderSync.system(Game, {
 *   name: "Game/Render",
 *   renderable: Renderable,
 *   transform: Position,
 *   registry: Sprites,
 *   services: { assets: Assets },
 *   create: ({ renderable, services }) => new Sprite(services.assets.textures[renderable.texture]),
 *   apply: (sprite, { transform }) => sprite.position.set(transform.x, transform.y)
 * })
 *
 * const update = Game.Schedule(Gameplay, Game.Schedule.applyDeferred(), Render)
 * ```
 */
import type { Descriptor } from "@typeonce/bevy-ts/Descriptor"
import type * as Entity from "@typeonce/bevy-ts/Entity"
import type { OptionalReadAccess, OptionalReadCell, ReadAccess, ReadCell, ReadonlyValue } from "@typeonce/bevy-ts/Query"
import type { Schema } from "@typeonce/bevy-ts/Schema"
import type { NodeRegistry } from "./NodeRegistry.ts"

type RegistryService = Descriptor<"service", string, NodeRegistry<any>>
type ServiceDescriptor = Descriptor<"service", string, any>
type ResourceDescriptor = Descriptor<"resource", string, any>

/**
 * The node type held by a registry service.
 */
export type NodeOf<R extends RegistryService> =
  R extends Descriptor<"service", string, NodeRegistry<infer Node>> ? Node : never

/**
 * Extra read-only slots available to `create` and `apply`.
 */
export type Selection<S extends Schema.Any> = Readonly<Record<
  string,
  ReadAccess<Schema.ComponentDescriptor<S>> | OptionalReadAccess<Schema.ComponentDescriptor<S>>
>>

type SelectionCells<Select> = {
  readonly [K in keyof Select]:
    Select[K] extends ReadAccess<infer D> ? ReadCell<Descriptor.Value<D>>
    : Select[K] extends OptionalReadAccess<infer D> ? OptionalReadCell<Descriptor.Value<D>>
    : never
}

type ResourceCells<Resources> = {
  readonly [K in keyof Resources]: Resources[K] extends ResourceDescriptor ? ReadCell<Descriptor.Value<Resources[K]>> : never
}

type ServiceValues<Services> = {
  readonly [K in keyof Services]: Services[K] extends ServiceDescriptor ? Descriptor.Value<Services[K]> : never
}

/**
 * What `create` and `apply` see for one entity.
 */
export interface NodeContext<
  S extends Schema.Any,
  Root,
  Renderable extends Schema.ComponentDescriptor<S>,
  Transform extends Schema.ComponentDescriptor<S>,
  Select,
  Services,
  Resources = {}
> {
  readonly entity: Entity.EntityId<S, Root>
  readonly renderable: ReadonlyValue<Descriptor.Value<Renderable>>
  readonly transform: ReadonlyValue<Descriptor.Value<Transform>>
  readonly data: SelectionCells<Select>
  readonly resources: ResourceCells<Resources>
  readonly services: ServiceValues<Services>
}

export interface Options<
  S extends Schema.Any,
  Root,
  Renderable extends Schema.ComponentDescriptor<S>,
  Transform extends Schema.ComponentDescriptor<S>,
  Registry extends RegistryService,
  Select extends Selection<S>,
  Services extends Readonly<Record<string, ServiceDescriptor>>,
  Resources extends Readonly<Record<string, Schema.ResourceDescriptor<S>>> = {}
> {
  /** The system name. */
  readonly name: string
  /** The component whose presence means "this entity has a node". */
  readonly renderable: Renderable
  /** The component applied to the node on creation and whenever it changes. */
  readonly transform: Transform
  /** The service providing the node registry. */
  readonly registry: Registry
  /** Extra read-only query slots passed to the callbacks as `data`. */
  readonly select?: Select
  /** Extra services passed to the callbacks as `services`. */
  readonly services?: Services
  /** Resources passed to the callbacks as read-only cells in `resources`. */
  readonly resources?: Resources
  /**
   * More components whose changes re-run `apply`, for node state other than
   * the transform: animation frames, tints, interpolation. `apply` then runs
   * once per changed entity per sync, however many of these changed, so it
   * should set the node's state rather than increment it.
   */
  readonly redrawOn?: ReadonlyArray<Schema.ComponentDescriptor<S>>
  /** Builds the node for a new renderable entity. */
  readonly create: (context: NodeContext<S, Root, Renderable, Transform, Select, Services, Resources>) => NodeOf<Registry>
  /**
   * Applies the current state to the node: on creation, and whenever the
   * transform or a `redrawOn` component changes.
   */
  readonly apply: (node: NodeOf<Registry>, context: NodeContext<S, Root, Renderable, Transform, Select, Services, Resources>) => void
}

/**
 * The generated system. It requires the registry and any extra resources and
 * services.
 */
export type RenderSystem<S extends Schema.Any, Root, Needs extends ServiceDescriptor | ResourceDescriptor> =
  Schema.BoundSystem<S, Root, any, void, never, string, Needs>

/**
 * Builds the render system for one renderable component.
 */
export const system = <
  S extends Schema.Any,
  Root,
  const Renderable extends Schema.ComponentDescriptor<S>,
  const Transform extends Schema.ComponentDescriptor<S>,
  const Registry extends RegistryService,
  const Select extends Selection<S> = {},
  const Services extends Readonly<Record<string, ServiceDescriptor>> = {},
  const Resources extends Readonly<Record<string, Schema.ResourceDescriptor<S>>> = {}
>(
  Game: Schema.Game<S, Root>,
  options: Options<S, Root, Renderable, Transform, Registry, Select, Services, Resources>
): RenderSystem<S, Root, Registry | Services[keyof Services] | Resources[keyof Resources]> => {
  type Node = NodeOf<Registry>
  type Context = NodeContext<S, Root, Renderable, Transform, Select, Services, Resources>
  // Internally the generic descriptors are erased; the public result type
  // above carries the exact requirements (the registry and extra services).
  const System = Game.System as unknown as (name: string, spec: object, run: (context: any) => void) => unknown
  const Query = Game.Query as unknown as (spec: object) => object
  const selection = {
    ...options.select,
    __renderable: Game.Query.read(options.renderable),
    __transform: Game.Query.read(options.transform)
  }
  const services: Record<string, unknown> = { __registry: Game.System.service(options.registry) }
  for (const [key, descriptor] of Object.entries(options.services ?? {})) {
    services[key] = Game.System.service(descriptor)
  }
  const resources: Record<string, unknown> = {}
  for (const [key, descriptor] of Object.entries(options.resources ?? {})) {
    resources[key] = Game.System.readResource(descriptor as Schema.ResourceDescriptor<S>)
  }

  const contextOf = (
    entity: { readonly id: unknown },
    data: Record<string, any>,
    provided: Record<string, unknown>,
    cells: Record<string, unknown>
  ): Context => ({
    entity: entity.id,
    renderable: data["__renderable"].get(),
    transform: data["__transform"].get(),
    data,
    resources: cells,
    services: provided
  }) as unknown as Context

  // One `changed` query per trigger; filters within one query must all match.
  const triggers = [options.transform, ...(options.redrawOn ?? [])]
  const queries: Record<string, object> = {
    added: Query({ selection, filters: [Game.Query.added(options.renderable)] })
  }
  triggers.forEach((trigger, index) => {
    queries[`changed${index}`] = Query({ selection, filters: [Game.Query.changed(trigger)] })
  })

  return System(options.name, {
    queries,
    removed: { renderables: Game.System.readRemoved(options.renderable) },
    despawned: { entities: Game.System.readDespawned() },
    resources,
    services
  }, ({ queries, removed, despawned, resources, services }) => {
    const registry = services.__registry as NodeRegistry<Node>
    // Destroy first, so an entity that lost and regained its renderable gets a fresh node.
    for (const entity of removed.renderables.all()) registry.remove(entity)
    for (const entity of despawned.entities.all()) registry.remove(entity)

    const applied = new Set<number>()
    for (const { entity, data } of queries.added.each()) {
      const context = contextOf(entity, data, services, resources)
      options.apply(registry.ensure(entity.id, () => options.create(context)), context)
      applied.add(entity.id.value)
    }
    for (let index = 0; index < triggers.length; index++) {
      for (const { entity, data } of queries[`changed${index}`].each()) {
        if (applied.has(entity.id.value)) continue
        applied.add(entity.id.value)
        const node = registry.get(entity.id)
        if (node !== undefined) options.apply(node, contextOf(entity, data, services, resources))
      }
    }
  }) as RenderSystem<S, Root, Registry | Services[keyof Services] | Resources[keyof Resources]>
}
