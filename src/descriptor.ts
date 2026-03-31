/**
 * Nominal descriptor constructors for schema authoring.
 *
 * Descriptors are the stable typed identities behind every public ECS surface:
 * schema entries, query slots, system specs, runtime provisioning, long-lived
 * handle intents, and relationships.
 *
 * The normal authoring flow is:
 *
 * 1. declare descriptors with `Descriptor.define...`
 * 2. register them in `Schema.fragment(...)`
 * 3. close the schema with `Schema.build(...)`
 * 4. bind one `Game` with `Schema.bind(...)`
 *
 * @example
 * ```ts
 * const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
 * const DeltaTime = Descriptor.defineResource<number>()("DeltaTime")
 * const DamageTaken = Descriptor.defineEvent<{ amount: number }>()("DamageTaken")
 * ```
 */
export type DescriptorTypeId = "~bevy-ts/Descriptor"

/**
 * Runtime value for the descriptor type id.
 */
const descriptorTypeId: DescriptorTypeId = "~bevy-ts/Descriptor"

/**
 * The public categories of nominal descriptors used by the engine.
 *
 * Descriptors are the strongly typed identities behind components, resources,
 * events, states, and dependency-injected services.
 */
export type DescriptorKind = "component" | "resource" | "event" | "state" | "service"

/**
 * A branded identity for a schema item.
 *
 * Use descriptors instead of strings anywhere data is registered or accessed.
 * They are the foundation for schema typing, query typing, and system specs.
 */
export interface Descriptor<
  out Kind extends DescriptorKind,
  out Name extends string,
  out Value
> {
  readonly kind: Kind
  readonly name: Name
  readonly key: symbol
  readonly [descriptorTypeId]: {
    readonly _Value: (_: never) => Value
  }
}

/**
 * Type-level helpers for working with descriptors.
 */
export namespace Descriptor {
  /**
   * Any supported descriptor.
   */
  export type Any = Descriptor<DescriptorKind, string, unknown>
  /**
   * Extracts the runtime value associated with a descriptor.
   */
  export type Value<T extends Any> = T extends Descriptor<infer _Kind, infer _Name, infer Value> ? Value : never
  /**
   * Extracts the descriptor name.
   */
  export type Name<T extends Any> = T extends Descriptor<infer _Kind, infer Name, infer _Value> ? Name : never
}

/**
 * Internal descriptor constructor shared by all descriptor helpers.
 *
 * The runtime value is intentionally tiny: only category, name, and a stable
 * symbol key are needed.
 */
const makeDescriptor = <Kind extends DescriptorKind, Name extends string, Value>(
  kind: Kind,
  name: Name
): Descriptor<Kind, Name, Value> =>
  ({
    kind,
    name,
    key: Symbol.for(`bevy-ts/${kind}/${name}`)
  }) as Descriptor<Kind, Name, Value>

/**
 * Defines a component descriptor.
 *
 * Use this when declaring per-entity data that should participate in queries
 * and typed entity proofs.
 *
 * Components are the only descriptor kind that can be queried directly with
 * `Game.Query.read(...)`, `write(...)`, or `optional(...)`.
 *
 * @example
 * ```ts
 * const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
 * ```
 */
export const defineComponent = <Value>() => <const Name extends string>(
  name: Name
): Descriptor<"component", Name, Value> => makeDescriptor("component", name)

/**
 * Defines a resource descriptor.
 *
 * Resources represent unique world-level values accessed through explicit
 * system specs.
 *
 * Use resources for singleton world data such as counters, configuration, or
 * transient per-frame summaries.
 *
 * @example
 * ```ts
 * const Score = Descriptor.defineResource<number>()("Score")
 * ```
 */
export const defineResource = <Value>() => <const Name extends string>(
  name: Name
): Descriptor<"resource", Name, Value> => makeDescriptor("resource", name)

/**
 * Defines an event descriptor.
 *
 * Use event descriptors to model append-only messages flowing between systems
 * without exposing untyped channels.
 *
 * Writers emit into a pending buffer. Readers observe only the committed
 * readable buffer after an explicit `Game.Schedule.updateEvents()` boundary.
 *
 * @example
 * ```ts
 * const Hit = Descriptor.defineEvent<{ target: number; amount: number }>()("Hit")
 * ```
 */
export const defineEvent = <Value>() => <const Name extends string>(
  name: Name
): Descriptor<"event", Name, Value> => makeDescriptor("event", name)

/**
 * Defines a state descriptor.
 *
 * States are unique world-level finite values, typically used for coarse
 * application mode or gameplay flow.
 *
 * @example
 * ```ts
 * const Phase = Descriptor.defineState<"Menu" | "Playing">()("Phase")
 * ```
 */
export const defineState = <Value>() => <const Name extends string>(
  name: Name
): Descriptor<"state", Name, Value> => makeDescriptor("state", name)

/**
 * Defines a service descriptor.
 *
 * Services are the dependency-injection side of the system model, similar to
 * Effect environment entries.
 *
 * Services are provided when the runtime is created with
 * `Game.Runtime.services(...)`. Systems declare them explicitly with
 * `Game.System.service(...)`.
 *
 * @example
 * ```ts
 * const Logger = Descriptor.defineService<{ log: (message: string) => void }>()("Logger")
 * ```
 */
export const defineService = <Value>() => <const Name extends string>(
  name: Name
): Descriptor<"service", Name, Value> => makeDescriptor("service", name)

/**
 * Defines the canonical parent/children relationship pair.
 *
 * The returned `relation` is the source-of-truth edge component, while
 * `related` is the reverse collection maintained by the runtime.
 *
 * Use hierarchy when the relationship must support ordered children,
 * ancestor/descendant traversal, and linked recursive despawn.
 */
export const defineHierarchy = Relation.defineHierarchy

/**
 * Defines a general relationship pair with direct edges and reverse lookups.
 *
 * Use a general relation when you need direct source -> target edges plus
 * reverse lookup, but not hierarchy-only behavior such as tree traversal or
 * child reordering.
 */
export const defineRelation = Relation.defineRelation
import * as Relation from "./relation.ts"
