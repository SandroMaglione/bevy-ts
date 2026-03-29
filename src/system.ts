import type { Descriptor } from "./descriptor.ts"
import type { Fx } from "./fx.ts"
import type { Query, QueryMatch } from "./query.ts"
import type { ReadCell, WriteCell } from "./query.ts"
import type { Schema } from "./schema.ts"
import type { CommandsApi } from "./command.ts"
import * as LabelModule from "./label.ts"
import type { Label } from "./label.ts"

/**
 * Declares a dependency-injected service requirement for a system.
 */
export interface ServiceRead<D extends Descriptor<"service", string, any>> {
  readonly descriptor: D
}

/**
 * Declares that a system needs a service from the external runtime environment.
 */
export const service = <D extends Descriptor<"service", string, any>>(
  descriptor: D
): ServiceRead<D> => ({
  descriptor
})

/**
 * Declares read-only access to a resource.
 */
export type ResourceRead<D extends Descriptor<"resource", string, any>> = {
  readonly mode: "read"
  readonly descriptor: D
}

/**
 * Declares writable access to a resource.
 */
export type ResourceWrite<D extends Descriptor<"resource", string, any>> = {
  readonly mode: "write"
  readonly descriptor: D
}

/**
 * Creates a resource-read declaration for a system spec.
 */
export const readResource = <D extends Descriptor<"resource", string, any>>(
  descriptor: D
): ResourceRead<D> => ({
  mode: "read",
  descriptor
})

/**
 * Creates a resource-write declaration for a system spec.
 */
export const writeResource = <D extends Descriptor<"resource", string, any>>(
  descriptor: D
): ResourceWrite<D> => ({
  mode: "write",
  descriptor
})

/**
 * Declares read-only access to an event stream.
 */
export type EventRead<D extends Descriptor<"event", string, any>> = {
  readonly mode: "read"
  readonly descriptor: D
}

/**
 * Declares write access to an event stream.
 */
export type EventWrite<D extends Descriptor<"event", string, any>> = {
  readonly mode: "write"
  readonly descriptor: D
}

/**
 * Creates an event-read declaration for a system spec.
 */
export const readEvent = <D extends Descriptor<"event", string, any>>(
  descriptor: D
): EventRead<D> => ({
  mode: "read",
  descriptor
})

/**
 * Creates an event-write declaration for a system spec.
 */
export const writeEvent = <D extends Descriptor<"event", string, any>>(
  descriptor: D
): EventWrite<D> => ({
  mode: "write",
  descriptor
})

/**
 * Declares read-only access to a state value.
 */
export type StateRead<D extends Descriptor<"state", string, any>> = {
  readonly mode: "read"
  readonly descriptor: D
}

/**
 * Declares writable access to a state value.
 */
export type StateWrite<D extends Descriptor<"state", string, any>> = {
  readonly mode: "write"
  readonly descriptor: D
}

/**
 * Creates a state-read declaration for a system spec.
 */
export const readState = <D extends Descriptor<"state", string, any>>(
  descriptor: D
): StateRead<D> => ({
  mode: "read",
  descriptor
})

/**
 * Creates a state-write declaration for a system spec.
 */
export const writeState = <D extends Descriptor<"state", string, any>>(
  descriptor: D
): StateWrite<D> => ({
  mode: "write",
  descriptor
})

/**
 * Internal union for all supported resource access declarations.
 */
type ResourceAccess = ResourceRead<Descriptor<"resource", string, any>> | ResourceWrite<Descriptor<"resource", string, any>>
/**
 * Internal union for all supported event access declarations.
 */
type EventAccess = EventRead<Descriptor<"event", string, any>> | EventWrite<Descriptor<"event", string, any>>

/**
 * A read-only view over a resource value.
 */
export interface ResourceReadView<T> extends ReadCell<T> {}

/**
 * A mutable view over a resource value.
 */
export interface ResourceWriteView<T> extends WriteCell<T> {}

/**
 * A read-only view over a state value.
 */
export interface StateReadView<T> extends ReadCell<T> {}

/**
 * A mutable view over a state value.
 */
export interface StateWriteView<T> extends WriteCell<T> {}

/**
 * A read-only event stream view.
 */
export interface EventReadView<T> {
  all(): ReadonlyArray<T>
}

/**
 * A writable event stream view.
 */
export interface EventWriteView<T> {
  emit(value: T): void
}

/**
 * A runtime query handle exposed to system implementations.
 *
 * The handle is already typed from the query spec, so iterating it returns
 * strongly typed entity proofs and cells.
 */
export interface QueryHandle<S extends Schema.Any, Q extends Query.Any> {
  each(): ReadonlyArray<QueryMatch<S, Q>>
  /**
   * Retrieves the match for one specific entity id when it satisfies the query.
   */
  get(entityId: import("./entity.ts").EntityId<S>): Query.Result<QueryMatch<S, Q>, Query.LookupError>
  /**
   * Returns a single match when exactly one entity satisfies the query.
   */
  single(): Query.Result<QueryMatch<S, Q>, Query.SingleError>
}

/**
 * Typed entity lookup API exposed to systems.
 *
 * Use this when you already have an entity id and want a validated, typed view
 * over a specific component access specification.
 */
export interface LookupApi<S extends Schema.Any> {
  get<Q extends Query.Any>(
    entityId: import("./entity.ts").EntityId<S>,
    query: Q
  ): Query.Result<QueryMatch<S, Q>, Query.LookupError>
}

/**
 * An ordering target inside one schedule.
 *
 * Systems can order themselves relative to other system definitions or reusable
 * typed system sets. No open string references are allowed.
 */
export type OrderTarget = SystemDefinition<any, any, any> | Label.System | Label.SystemSet

/**
 * An explicit system specification.
 *
 * This is the central user-facing abstraction: all ECS access, service
 * dependencies, and stateful capabilities are declared here up front.
 */
export interface SystemSpec<
  S extends Schema.Any,
  out Queries extends Record<string, Query.Any> = {},
  out Resources extends Record<string, ResourceAccess> = {},
  out Events extends Record<string, EventAccess> = {},
  out Services extends Record<string, ServiceRead<Descriptor<"service", string, any>>> = {},
  out States extends Record<string, StateRead<Descriptor<"state", string, any>> | StateWrite<Descriptor<"state", string, any>>> = {},
  out InSets extends ReadonlyArray<Label.SystemSet> = readonly [],
  out After extends ReadonlyArray<OrderTarget> = readonly [],
  out Before extends ReadonlyArray<OrderTarget> = readonly []
> {
  readonly label: Label.System
  readonly inSets: InSets
  readonly after: After
  readonly before: Before
  readonly queries: Queries
  readonly resources: Resources
  readonly events: Events
  readonly services: Services
  readonly states: States
  readonly schema: S
}

/**
 * Internal helper representing any fully-defined system spec shape.
 */
type AnySystemSpec = SystemSpec<
  any,
  any,
  any,
  any,
  any,
  any,
  ReadonlyArray<Label.SystemSet>,
  ReadonlyArray<OrderTarget>,
  ReadonlyArray<OrderTarget>
>

/**
 * Flattens an inferred object type for clearer public signatures.
 */
type Simplify<A> = {
  readonly [K in keyof A]: A[K]
}

/**
 * Finds the schema registry key associated with one descriptor.
 */
type RegistryKeyForDescriptor<
  R extends Record<string, Descriptor.Any>,
  D extends Descriptor.Any
> = {
  readonly [K in keyof R]:
    [R[K]] extends [D] ? K
    : [D] extends [R[K]] ? K
    : never
}[keyof R]

type ResourceContext<Spec extends AnySystemSpec> = {
  readonly [K in keyof Spec["resources"]]:
    Spec["resources"][K] extends ResourceRead<infer D> ? ResourceReadView<Descriptor.Value<D>>
    : Spec["resources"][K] extends ResourceWrite<infer D> ? ResourceWriteView<Descriptor.Value<D>>
    : never
}

/**
 * Derives the event view context from a system spec.
 */
type EventContext<Spec extends AnySystemSpec> = {
  readonly [K in keyof Spec["events"]]:
    Spec["events"][K] extends EventRead<infer D> ? EventReadView<Descriptor.Value<D>>
    : Spec["events"][K] extends EventWrite<infer D> ? EventWriteView<Descriptor.Value<D>>
    : never
}

/**
 * Derives the service environment from a system spec.
 */
type ServiceContext<Spec extends AnySystemSpec> = {
  readonly [K in keyof Spec["services"]]:
    Spec["services"][K] extends ServiceRead<infer D> ? Descriptor.Value<D> : never
}

/**
 * Derives the state view context from a system spec.
 */
type StateContext<Spec extends AnySystemSpec> = {
  readonly [K in keyof Spec["states"]]:
    Spec["states"][K] extends StateRead<infer D> ? StateReadView<Descriptor.Value<D>>
    : Spec["states"][K] extends StateWrite<infer D> ? StateWriteView<Descriptor.Value<D>>
    : never
}

/**
 * Derives the query handle context from a system spec.
 */
type QueryContext<Spec extends AnySystemSpec> = {
  readonly [K in keyof Spec["queries"]]: QueryHandle<Spec["schema"], Spec["queries"][K]>
}

/**
 * The implementation context derived from a system spec.
 *
 * Instead of inferring from callback parameters, the library computes this
 * context from the declared spec so the runtime and types stay in sync.
 */
export interface SystemContext<Spec extends AnySystemSpec> {
  readonly queries: QueryContext<Spec>
  readonly lookup: LookupApi<Spec["schema"]>
  readonly resources: ResourceContext<Spec>
  readonly events: EventContext<Spec>
  readonly states: StateContext<Spec>
  readonly services: ServiceContext<Spec>
  readonly commands: CommandsApi<Spec["schema"]>
}

/**
 * The service environment required by a system.
 */
export type SystemDependencies<Spec extends AnySystemSpec> = ServiceContext<Spec>

/**
 * The runtime requirement contract derived from one system or schedule.
 *
 * Services are keyed by service descriptor names because runtimes provide them
 * through the public `services` map. Resources and states are keyed by schema
 * property names because runtime initialization is schema-keyed.
 */
export interface RuntimeRequirements<
  out Services extends Record<string, unknown> = {},
  out Resources extends Record<string, unknown> = {},
  out States extends Record<string, unknown> = {}
> {
  readonly services: Services
  readonly resources: Resources
  readonly states: States
}

/**
 * Derives the runtime service requirements from a system spec.
 */
export type SystemServiceRequirements<Spec extends AnySystemSpec> = Simplify<{
  readonly [K in keyof Spec["services"] as
    Spec["services"][K] extends ServiceRead<infer D> ? Descriptor.Name<D> : never]:
      Spec["services"][K] extends ServiceRead<infer D> ? Descriptor.Value<D> : never
}>

/**
 * Derives the runtime resource initialization requirements from a system spec.
 */
export type SystemResourceRequirements<Spec extends AnySystemSpec> = Simplify<{
  readonly [K in keyof Spec["resources"] as
    Spec["resources"][K] extends { readonly descriptor: infer D extends Descriptor<"resource", string, any> }
      ? RegistryKeyForDescriptor<Schema.Resources<Spec["schema"]>, D>
      : never]:
        Spec["resources"][K] extends { readonly descriptor: infer D extends Descriptor<"resource", string, any> }
          ? Descriptor.Value<D>
          : never
}>

/**
 * Derives the runtime state initialization requirements from a system spec.
 */
export type SystemStateRequirements<Spec extends AnySystemSpec> = Simplify<{
  readonly [K in keyof Spec["states"] as
    Spec["states"][K] extends { readonly descriptor: infer D extends Descriptor<"state", string, any> }
      ? RegistryKeyForDescriptor<Schema.States<Spec["schema"]>, D>
      : never]:
        Spec["states"][K] extends { readonly descriptor: infer D extends Descriptor<"state", string, any> }
          ? Descriptor.Value<D>
          : never
}>

/**
 * Aggregates every runtime requirement implied by a system spec.
 */
export type SystemRequirements<Spec extends AnySystemSpec> = RuntimeRequirements<
  SystemServiceRequirements<Spec>,
  SystemResourceRequirements<Spec>,
  SystemStateRequirements<Spec>
>

/**
 * A fully defined system value ready to be placed into a schedule.
 */
export interface SystemDefinition<
  Spec extends AnySystemSpec,
  out A = void,
  out E = never
> {
  /**
   * Human-readable declaration name used to derive the internal typed label.
   */
  readonly name: string
  /**
   * The explicit static description of the system.
   */
  readonly spec: Spec
  /**
   * The executable implementation of the system.
   */
  readonly run: (context: SystemContext<Spec>) => Fx<A, E, SystemDependencies<Spec>>
}

/**
 * Defines a system from an explicit spec and a typed implementation.
 *
 * This is the public entrypoint for authoring systems. The implementation only
 * receives the capabilities declared in the spec, and the returned effect keeps
 * service dependencies tracked in the type system.
 */
export function define<
  S extends Schema.Any,
  const Queries extends Record<string, Query.Any> = {},
  const Resources extends Record<string, ResourceAccess> = {},
  const Events extends Record<string, EventAccess> = {},
  const Services extends Record<string, ServiceRead<Descriptor<"service", string, any>>> = {},
  const States extends Record<string, StateRead<Descriptor<"state", string, any>> | StateWrite<Descriptor<"state", string, any>>> = {},
  const InSets extends ReadonlyArray<Label.SystemSet> = [],
  const After extends ReadonlyArray<OrderTarget> = [],
  const Before extends ReadonlyArray<OrderTarget> = [],
  A = void,
  E = never
>(
  name: string,
  spec: {
    readonly schema: S
    readonly inSets?: InSets
    readonly after?: After
    readonly before?: Before
    readonly queries?: Queries
    readonly resources?: Resources
    readonly events?: Events
    readonly services?: Services
    readonly states?: States
  },
  run: (context: SystemContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before>>) => Fx<
    A,
    E,
    ServiceContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before>>
  >
): SystemDefinition<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before>, A, E>

/**
 * Legacy low-level overload that accepts an explicit system label.
 *
 * Prefer the string-name overload, which creates the internal typed label
 * automatically and avoids manual label threading in user code.
 */
export function define<
  S extends Schema.Any,
  const Queries extends Record<string, Query.Any> = {},
  const Resources extends Record<string, ResourceAccess> = {},
  const Events extends Record<string, EventAccess> = {},
  const Services extends Record<string, ServiceRead<Descriptor<"service", string, any>>> = {},
  const States extends Record<string, StateRead<Descriptor<"state", string, any>> | StateWrite<Descriptor<"state", string, any>>> = {},
  const InSets extends ReadonlyArray<Label.SystemSet> = [],
  const After extends ReadonlyArray<OrderTarget> = [],
  const Before extends ReadonlyArray<OrderTarget> = [],
  A = void,
  E = never
>(
  spec: {
    readonly label: Label.System
    readonly schema: S
    readonly inSets?: InSets
    readonly after?: After
    readonly before?: Before
    readonly queries?: Queries
    readonly resources?: Resources
    readonly events?: Events
    readonly services?: Services
    readonly states?: States
  },
  run: (context: SystemContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before>>) => Fx<
    A,
    E,
    ServiceContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before>>
  >
): SystemDefinition<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before>, A, E>

export function define<
  S extends Schema.Any,
  const Queries extends Record<string, Query.Any> = {},
  const Resources extends Record<string, ResourceAccess> = {},
  const Events extends Record<string, EventAccess> = {},
  const Services extends Record<string, ServiceRead<Descriptor<"service", string, any>>> = {},
  const States extends Record<string, StateRead<Descriptor<"state", string, any>> | StateWrite<Descriptor<"state", string, any>>> = {},
  const InSets extends ReadonlyArray<Label.SystemSet> = [],
  const After extends ReadonlyArray<OrderTarget> = [],
  const Before extends ReadonlyArray<OrderTarget> = [],
  A = void,
  E = never
>(
  nameOrSpec: string | {
    readonly label: Label.System
    readonly schema: S
    readonly inSets?: InSets
    readonly after?: After
    readonly before?: Before
    readonly queries?: Queries
    readonly resources?: Resources
    readonly events?: Events
    readonly services?: Services
    readonly states?: States
  },
  specOrRun:
    | {
        readonly schema: S
        readonly inSets?: InSets
        readonly after?: After
        readonly before?: Before
        readonly queries?: Queries
        readonly resources?: Resources
        readonly events?: Events
        readonly services?: Services
        readonly states?: States
      }
    | ((context: SystemContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before>>) => Fx<
        A,
        E,
        ServiceContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before>>
      >),
  maybeRun?: (context: SystemContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before>>) => Fx<
    A,
    E,
    ServiceContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before>>
  >
): SystemDefinition<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before>, A, E> {
  const named = typeof nameOrSpec === "string"
  const name = named ? nameOrSpec : nameOrSpec.label.name
  const spec = (named ? specOrRun : nameOrSpec) as {
    readonly label?: Label.System
    readonly schema: S
    readonly inSets?: InSets
    readonly after?: After
    readonly before?: Before
    readonly queries?: Queries
    readonly resources?: Resources
    readonly events?: Events
    readonly services?: Services
    readonly states?: States
  }
  const run = (named ? maybeRun : specOrRun) as (context: SystemContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before>>) => Fx<
    A,
    E,
    ServiceContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before>>
  >

  return {
    name,
    spec: {
      label: spec.label ?? LabelModule.defineSystemLabel(name),
      schema: spec.schema,
      inSets: (spec.inSets ?? []) as InSets,
      after: (spec.after ?? []) as After,
      before: (spec.before ?? []) as Before,
      queries: (spec.queries ?? {}) as Queries,
      resources: (spec.resources ?? {}) as Resources,
      events: (spec.events ?? {}) as Events,
      services: (spec.services ?? {}) as Services,
      states: (spec.states ?? {}) as States
    },
    run
  }
}
