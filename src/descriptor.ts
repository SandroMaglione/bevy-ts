/**
 * Nominal descriptor constructors for schema authoring.
 *
 * Descriptors are the stable typed identities behind every public ECS surface:
 * schema entries, query slots, system specs, runtime provisioning, long-lived
 * handle intents, and relationships.
 *
 * The normal authoring flow is:
 *
 * 1. declare descriptors with `Descriptor.*`
 * 2. register them in `Schema.fragment(...)`
 * 3. close the schema with `Schema.build(...)`
 * 4. bind one `Game` with `Schema.bind(...)`
 *
 * @module descriptor
 * @docGroup core
 *
 * @groupDescription Namespaces
 * Grouped descriptor helper types for narrowing and reflecting descriptor metadata.
 *
 * @groupDescription Interfaces
 * Public descriptor contracts and constructor-aware descriptor variants.
 *
 * @groupDescription Type Aliases
 * Shared descriptor identities and helper types used throughout the ECS surface.
 *
 * @groupDescription Variables
 * Stable runtime markers used to brand descriptor kinds and constructor-aware variants.
 *
 * @groupDescription Functions
 * Authoring helpers for declaring components, resources, services, events, and states.
 *
 * @example
 * ```ts
 * const Position = Descriptor.Component<{ x: number; y: number }>()("Position")
 * const DeltaTime = Descriptor.Resource<number>()("DeltaTime")
 * const DamageTaken = Descriptor.Event<{ amount: number }>()("DamageTaken")
 * ```
 */
export type DescriptorTypeId = "~bevy-ts/Descriptor"
export type DescriptorConstructionTypeId = "~bevy-ts/DescriptorConstruction"

/**
 * Runtime value for the descriptor type id.
 */
const descriptorTypeId: DescriptorTypeId = "~bevy-ts/Descriptor"
const descriptorConstructionTypeId: DescriptorConstructionTypeId = "~bevy-ts/DescriptorConstruction"
const descriptorConstruction = Symbol("bevy-ts/DescriptorConstruction")

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
 * Minimal constructor contract carried by constructed descriptors.
 */
export interface ResultConstructor<Value, Raw, Error> {
  readonly result: (raw: Raw) => import("./Result.ts").Result<Value, Error>
}

/**
 * Descriptor that also carries explicit raw-construction metadata.
 *
 * Outside raw-aware APIs this behaves like a normal descriptor. The extra
 * constructor information is only used when a public entrypoint explicitly
 * opts into raw validation.
 */
export interface ConstructedDescriptor<
  out Kind extends DescriptorKind,
  out Name extends string,
  out Value,
  Raw,
  Error
> extends Descriptor<Kind, Name, Value> {
  readonly [descriptorConstruction]: ResultConstructor<Value, Raw, Error>
  readonly [descriptorConstructionTypeId]: {
    readonly _Raw: (_: never) => Raw
    readonly _Error: (_: never) => Error
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
  export type AnyConstructed = ConstructedDescriptor<DescriptorKind, string, unknown, unknown, unknown>
  /**
   * Extracts the runtime value associated with a descriptor.
   */
  export type Value<T extends Any> = T extends Descriptor<infer _Kind, infer _Name, infer Value> ? Value : never
  /**
   * Extracts the descriptor name.
   */
  export type Name<T extends Any> = T extends Descriptor<infer _Kind, infer Name, infer _Value> ? Name : never
  export type Raw<T extends Any> = T extends ConstructedDescriptor<infer _Kind, infer _Name, infer _Value, infer Raw, infer _Error>
    ? Raw
    : never
  export type ConstructionError<T extends Any> =
    T extends ConstructedDescriptor<infer _Kind, infer _Name, infer _Value, infer _Raw, infer Error>
      ? Error
      : never
  export type Constructor<T extends Any> =
    T extends ConstructedDescriptor<infer _Kind, infer _Name, infer Value, infer Raw, infer Error>
      ? ResultConstructor<Value, Raw, Error>
      : never
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

const makeConstructedDescriptor = <
  Kind extends DescriptorKind,
  Name extends string,
  Value,
  Raw,
  Error
>(
  kind: Kind,
  name: Name,
  constructor: ResultConstructor<Value, Raw, Error>
): ConstructedDescriptor<Kind, Name, Value, Raw, Error> =>
  ({
    kind,
    name,
    key: Symbol.for(`bevy-ts/${kind}/${name}`),
    [descriptorConstruction]: constructor
  }) as ConstructedDescriptor<Kind, Name, Value, Raw, Error>

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
 * const Position = Descriptor.Component<{ x: number; y: number }>()("Position")
 * ```
 */
export const Component = <Value>() => <const Name extends string>(
  name: Name
): Descriptor<"component", Name, Value> => makeDescriptor("component", name)

/**
 * Defines a component descriptor that also knows how to validate raw values.
 *
 * @example
 * ```ts
 * const Position = Descriptor.ConstructedComponent(Vector2)("Position")
 * ```
 */
export const ConstructedComponent = <Value, Raw, Error>(
  constructor: ResultConstructor<Value, Raw, Error>
) => <const Name extends string>(
  name: Name
): ConstructedDescriptor<"component", Name, Value, Raw, Error> =>
  makeConstructedDescriptor("component", name, constructor)

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
 * const Score = Descriptor.Resource<number>()("Score")
 * ```
 */
export const Resource = <Value>() => <const Name extends string>(
  name: Name
): Descriptor<"resource", Name, Value> => makeDescriptor("resource", name)

/**
 * Defines a resource descriptor that also knows how to validate raw values.
 */
export const ConstructedResource = <Value, Raw, Error>(
  constructor: ResultConstructor<Value, Raw, Error>
) => <const Name extends string>(
  name: Name
): ConstructedDescriptor<"resource", Name, Value, Raw, Error> =>
  makeConstructedDescriptor("resource", name, constructor)

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
 * const Hit = Descriptor.Event<{ target: number; amount: number }>()("Hit")
 * ```
 */
export const Event = <Value>() => <const Name extends string>(
  name: Name
): Descriptor<"event", Name, Value> => makeDescriptor("event", name)

/**
 * Defines a state descriptor.
 *
 * States are singleton schema values with no queued transition semantics.
 *
 * Use this when you need one current world-level value and the boundary of
 * changing that value is not itself meaningful. If gameplay logic depends on
 * queued transitions, enter/exit handling, or `inState(...)` gating, prefer
 * `Game.StateMachine(...)` instead.
 *
 * @example
 * ```ts
 * const ActiveLocale = Descriptor.State<"en" | "it">()("ActiveLocale")
 * ```
 */
export const State = <Value>() => <const Name extends string>(
  name: Name
): Descriptor<"state", Name, Value> => makeDescriptor("state", name)

/**
 * Defines a state descriptor that also knows how to validate raw values.
 */
export const ConstructedState = <Value, Raw, Error>(
  constructor: ResultConstructor<Value, Raw, Error>
) => <const Name extends string>(
  name: Name
): ConstructedDescriptor<"state", Name, Value, Raw, Error> =>
  makeConstructedDescriptor("state", name, constructor)

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
 * const Logger = Descriptor.Service<{ log: (message: string) => void }>()("Logger")
 * ```
 */
export const Service = <Value>() => <const Name extends string>(
  name: Name
): Descriptor<"service", Name, Value> => makeDescriptor("service", name)

/**
 * Checks whether one descriptor carries raw-construction metadata.
 */
export const hasConstructor = (descriptor: Descriptor.Any): descriptor is Descriptor.AnyConstructed =>
  descriptorConstruction in descriptor

/**
 * Returns the raw constructor carried by one descriptor when present.
 *
 * Plain descriptors return `undefined`.
 */
export function constructorOf<D extends Descriptor.AnyConstructed>(
  descriptor: D
): Descriptor.Constructor<D>
export function constructorOf<D extends Descriptor.Any>(
  descriptor: D
): Descriptor.Constructor<D> | undefined
export function constructorOf<D extends Descriptor.Any>(
  descriptor: D
): Descriptor.Constructor<D> | undefined {
  return (hasConstructor(descriptor) ? descriptor[descriptorConstruction] : undefined) as Descriptor.Constructor<D> | undefined
}

/**
 * Defines the canonical parent/children relationship pair.
 *
 * The returned `relation` is the source-of-truth edge component, while
 * `related` is the reverse collection maintained by the runtime.
 *
 * Use hierarchy when the relationship must support ordered children,
 * ancestor/descendant traversal, and linked recursive despawn.
 */
export const Hierarchy = RelationModule.Hierarchy

/**
 * Defines a general relationship pair with direct edges and reverse lookups.
 *
 * Use a general relation when you need direct source -> target edges plus
 * reverse lookup, but not hierarchy-only behavior such as tree traversal or
 * child reordering.
 */
export const Relation = RelationModule.Relation
import * as RelationModule from "./relation.ts"
