import type { Descriptor } from "./descriptor.ts"
import type { Fx } from "./fx.ts"
import type { Query, QueryMatch } from "./query.ts"
import type { ReadCell, WriteCell } from "./query.ts"
import type { Schema } from "./schema.ts"
import type { CommandsApi } from "./command.ts"

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
}

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
  out States extends Record<string, StateRead<Descriptor<"state", string, any>> | StateWrite<Descriptor<"state", string, any>>> = {}
> {
  readonly id: string
  readonly queries: Queries
  readonly resources: Resources
  readonly events: Events
  readonly services: Services
  readonly states: States
  readonly schema: S
}

type ResourceContext<Spec extends SystemSpec<any, any, any, any, any>> = {
  readonly [K in keyof Spec["resources"]]:
    Spec["resources"][K] extends ResourceRead<infer D> ? ResourceReadView<Descriptor.Value<D>>
    : Spec["resources"][K] extends ResourceWrite<infer D> ? ResourceWriteView<Descriptor.Value<D>>
    : never
}

/**
 * Derives the event view context from a system spec.
 */
type EventContext<Spec extends SystemSpec<any, any, any, any, any>> = {
  readonly [K in keyof Spec["events"]]:
    Spec["events"][K] extends EventRead<infer D> ? EventReadView<Descriptor.Value<D>>
    : Spec["events"][K] extends EventWrite<infer D> ? EventWriteView<Descriptor.Value<D>>
    : never
}

/**
 * Derives the service environment from a system spec.
 */
type ServiceContext<Spec extends SystemSpec<any, any, any, any, any>> = {
  readonly [K in keyof Spec["services"]]:
    Spec["services"][K] extends ServiceRead<infer D> ? Descriptor.Value<D> : never
}

/**
 * Derives the state view context from a system spec.
 */
type StateContext<Spec extends SystemSpec<any, any, any, any, any>> = {
  readonly [K in keyof Spec["states"]]:
    Spec["states"][K] extends StateRead<infer D> ? StateReadView<Descriptor.Value<D>>
    : Spec["states"][K] extends StateWrite<infer D> ? StateWriteView<Descriptor.Value<D>>
    : never
}

/**
 * Derives the query handle context from a system spec.
 */
type QueryContext<Spec extends SystemSpec<any, any, any, any, any>> = {
  readonly [K in keyof Spec["queries"]]: QueryHandle<Spec["schema"], Spec["queries"][K]>
}

/**
 * The implementation context derived from a system spec.
 *
 * Instead of inferring from callback parameters, the library computes this
 * context from the declared spec so the runtime and types stay in sync.
 */
export interface SystemContext<Spec extends SystemSpec<any, any, any, any, any>> {
  readonly queries: QueryContext<Spec>
  readonly resources: ResourceContext<Spec>
  readonly events: EventContext<Spec>
  readonly states: StateContext<Spec>
  readonly services: ServiceContext<Spec>
  readonly commands: CommandsApi<Spec["schema"]>
}

/**
 * The service environment required by a system.
 */
export type SystemDependencies<Spec extends SystemSpec<any, any, any, any, any>> = ServiceContext<Spec>

/**
 * A fully defined system value ready to be placed into a schedule.
 */
export interface SystemDefinition<
  Spec extends SystemSpec<any, any, any, any, any>,
  out A = void,
  out E = never
> {
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
export const define = <
  S extends Schema.Any,
  const Queries extends Record<string, Query.Any> = {},
  const Resources extends Record<string, ResourceAccess> = {},
  const Events extends Record<string, EventAccess> = {},
  const Services extends Record<string, ServiceRead<Descriptor<"service", string, any>>> = {},
  const States extends Record<string, StateRead<Descriptor<"state", string, any>> | StateWrite<Descriptor<"state", string, any>>> = {},
  A = void,
  E = never
>(
  spec: {
    readonly id: string
    readonly schema: S
    readonly queries?: Queries
    readonly resources?: Resources
    readonly events?: Events
    readonly services?: Services
    readonly states?: States
  },
  run: (context: SystemContext<SystemSpec<S, Queries, Resources, Events, Services, States>>) => Fx<
    A,
    E,
    ServiceContext<SystemSpec<S, Queries, Resources, Events, Services, States>>
  >
): SystemDefinition<SystemSpec<S, Queries, Resources, Events, Services, States>, A, E> => ({
  spec: {
    id: spec.id,
    schema: spec.schema,
    queries: (spec.queries ?? {}) as Queries,
    resources: (spec.resources ?? {}) as Resources,
    events: (spec.events ?? {}) as Events,
    services: (spec.services ?? {}) as Services,
    states: (spec.states ?? {}) as States
  },
  run
})
