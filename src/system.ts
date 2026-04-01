/**
 * System declarations, typed requirements, and execution context.
 *
 * Systems declare exactly what they may read, write, emit, and depend on
 * before they are allowed to run inside one schedule.
 */
import type { Descriptor } from "./descriptor.ts"
import type * as Entity from "./entity.ts"
import type { Fx } from "./fx.ts"
import * as Machine from "./machine.ts"
import type * as Relation from "./relation.ts"
import type { Query, QueryMatch } from "./query.ts"
import type { ConstructedWriteCell, ReadCell, WriteCell } from "./query.ts"
import type { Schema } from "./schema.ts"
import type { CommandsApi } from "./command.ts"
import * as LabelModule from "./label.ts"
import type { Label } from "./label.ts"

/**
 * System declarations, typed execution context, and runtime requirements.
 *
 * Systems are explicit dependency declarations. A system spec lists exactly
 * what the implementation may read or write, and the runtime context is
 * derived from that spec.
 *
 * The main mental model is:
 *
 * - declare access up front with `Game.System.*` helpers
 * - derive a typed context from the declaration
 * - run the implementation with no hidden world access
 *
 * Runtime visibility boundaries stay explicit:
 *
 * - deferred commands become visible after `Game.Schedule.applyDeferred()`
 * - event reads become visible after `Game.Schedule.updateEvents()`
 * - lifecycle reads become visible after `Game.Schedule.updateLifecycle()`
 * - relation-failure reads become visible after
 *   `Game.Schedule.updateRelationFailures()`
 *
 * @example
 * ```ts
 * const Move = Game.System.define("Move", {
 *   queries: {
 *     moving: Game.Query.define({
 *       selection: {
 *         position: Game.Query.write(Position),
 *         velocity: Game.Query.read(Velocity)
 *       }
 *     })
 *   },
 *   resources: {
 *     dt: Game.System.readResource(DeltaTime)
 *   }
 * }, ({ queries, resources }) => Fx.sync(() => {
 *   const dt = resources.dt.get()
 *   for (const { data } of queries.moving.each()) {
 *     const velocity = data.velocity.get()
 *     data.position.update((position) => ({
 *       x: position.x + velocity.x * dt,
 *       y: position.y + velocity.y * dt
 *     }))
 *   }
 * }))
 * ```
 */

/**
 * Declares a dependency-injected service requirement for a system.
 */
export interface ServiceRead<D extends Descriptor<"service", string, any>> {
  readonly descriptor: D
}

/**
 * Declares that a system needs a service from the external runtime environment.
 *
 * Services are not stored in the world. They are provided when the runtime is
 * created with `Game.Runtime.services(...)`.
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
 *
 * This gives the system a read-only `ReadCell` in `context.resources`.
 */
export const readResource = <D extends Descriptor<"resource", string, any>>(
  descriptor: D
): ResourceRead<D> => ({
  mode: "read",
  descriptor
})

/**
 * Creates a resource-write declaration for a system spec.
 *
 * This gives the system a `WriteCell` in `context.resources`.
 *
 * @example
 * ```ts
 * const CountUp = Game.System.define("CountUp", {
 *   resources: {
 *     score: Game.System.writeResource(Score)
 *   }
 * }, ({ resources }) => Fx.sync(() => {
 *   resources.score.update((score) => score + 1)
 * }))
 * ```
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
 *
 * Event reads observe the committed readable event buffer. New writes become
 * visible only after an explicit `Game.Schedule.updateEvents()` boundary.
 *
 * This is the usual second half of a deferred cross-system flow: one earlier
 * system emits an event, `updateEvents()` commits the buffer, and a later
 * system reads those events and re-validates any handles or lookups it needs.
 */
export const readEvent = <D extends Descriptor<"event", string, any>>(
  descriptor: D
): EventRead<D> => ({
  mode: "read",
  descriptor
})

/**
 * Creates an event-write declaration for a system spec.
 *
 * Event writes append to the pending event buffer. They are not visible to
 * readers in the same schedule phase until `Game.Schedule.updateEvents()`.
 *
 * If the payload needs to name an entity for later work, emit a durable
 * `Game.Entity.handle(...)` or `Game.Entity.handleAs(...)` and let the later
 * reader re-resolve it through `lookup.getHandle(...)` after the event buffer
 * is committed.
 *
 * @example
 * ```ts
 * const EmitHit = Game.System.define("EmitHit", {
 *   events: {
 *     hit: Game.System.writeEvent(Hit)
 *   }
 * }, ({ events }) => Fx.sync(() => {
 *   events.hit.emit({ amount: 1 })
 * }))
 * ```
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
 *
 * Plain states are just singleton schema values. They do not have queued
 * transition semantics, transition events, or enter/exit boundaries.
 *
 * If the behavior depends on when a mode change commits, prefer
 * `machine(...)` / `nextState(...)` on a `Game.StateMachine.define(...)`
 * machine instead.
 */
export const readState = <D extends Descriptor<"state", string, any>>(
  descriptor: D
): StateRead<D> => ({
  mode: "read",
  descriptor
})

/**
 * Creates a state-write declaration for a system spec.
 *
 * This updates a singleton schema value immediately in the current world state.
 * It does not queue a transition. Use `nextState(...)` when the boundary of
 * changing mode is part of the gameplay model.
 */
export const writeState = <D extends Descriptor<"state", string, any>>(
  descriptor: D
): StateWrite<D> => ({
  mode: "write",
  descriptor
})

/**
 * Declares read access to the current committed value of a finite-state machine.
 *
 * Use this when a system needs to branch on the current committed machine
 * state. Queued writes are exposed separately through `nextState(...)`.
 *
 * Machines are the intended default for gameplay phases and other discrete
 * mode changes whose transition boundary matters.
 */
export const machine = <M extends Machine.StateMachine.Any>(
  stateMachine: M
): Machine.MachineRead<M> => Machine.read(stateMachine)

/**
 * Declares queued write access to the next value of a finite-state machine.
 *
 * This does not immediately change the committed state. The queued value is
 * applied only at an explicit `Game.Schedule.applyStateTransitions(...)`
 * boundary.
 *
 * Use this instead of `writeState(...)` when gameplay depends on the explicit
 * transition boundary.
 *
 * This is the usual restart or mode-change entrypoint: input systems queue the
 * next phase here, then transition schedules perform reset or setup work later
 * at the explicit apply boundary.
 */
export const nextState = <M extends Machine.StateMachine.Any>(
  stateMachine: M
): Machine.NextMachineWrite<M> => Machine.write(stateMachine)

/**
 * Declares read access to the last applied transition payload of a machine.
 */
export const transition = <M extends Machine.StateMachine.Any>(
  stateMachine: M
): Machine.TransitionRead<M> => Machine.transition(stateMachine)

/**
 * Declares read access to committed transition events for one machine.
 *
 * Transition events are committed together with normal events and become
 * readable only after `Game.Schedule.updateEvents()`.
 *
 * This is one of the clearest signs that the modeled value should be a machine
 * rather than a plain state descriptor.
 */
export const readTransitionEvent = <M extends Machine.StateMachine.Any>(
  stateMachine: M
): Machine.TransitionEventRead<M> => Machine.readTransitionEvent(stateMachine)

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
export type ResourceWriteView<D extends Descriptor<"resource", string, any>> =
  D extends import("./descriptor.ts").ConstructedDescriptor<"resource", string, infer Value, infer Raw, infer Error>
    ? ConstructedWriteCell<Value, Raw, Error>
    : WriteCell<Descriptor.Value<D>>

/**
 * A read-only view over a state value.
 */
export interface StateReadView<T> extends ReadCell<T> {}

/**
 * A mutable view over a state value.
 */
export type StateWriteView<D extends Descriptor<"state", string, any>> =
  D extends import("./descriptor.ts").ConstructedDescriptor<"state", string, infer Value, infer Raw, infer Error>
    ? ConstructedWriteCell<Value, Raw, Error>
    : WriteCell<Descriptor.Value<D>>

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
 * A read-only view over one committed finite-state-machine value.
 */
export interface MachineReadView<M extends Machine.StateMachine.Any = Machine.StateMachine.Any> {
  get(): Machine.StateMachine.Value<M>
  is(value: Machine.StateMachine.Value<M>): boolean
}

/**
 * A queued write view over one finite-state-machine transition target.
 */
export interface NextMachineWriteView<M extends Machine.StateMachine.Any = Machine.StateMachine.Any> {
  getPending(): Machine.StateMachine.Value<M> | undefined
  set(value: Machine.StateMachine.Value<M>): void
  setIfChanged(value: Machine.StateMachine.Value<M>): void
  reset(): void
}

/**
 * A read-only view over the last applied transition payload for one machine.
 */
export interface TransitionReadView<M extends Machine.StateMachine.Any = Machine.StateMachine.Any> {
  get(): Machine.TransitionSnapshot<M>
}

/**
 * A read-only event stream of committed machine transitions.
 */
export interface TransitionEventReadView<M extends Machine.StateMachine.Any = Machine.StateMachine.Any> {
  all(): ReadonlyArray<Machine.TransitionSnapshot<M>>
}

/**
 * Declares read access to removed-component lifecycle records.
 */
export interface RemovedRead<D extends Descriptor<"component", string, any>> {
  readonly descriptor: D
}

/**
 * Declares read access to despawned-entity lifecycle records.
 */
export interface DespawnedRead {
  readonly kind: "despawned"
}

/**
 * Declares read access to relation-mutation failure records.
 *
 * These failures are deferred. Systems can read them only after an explicit
 * `Game.Schedule.updateRelationFailures()` boundary.
 */
export interface RelationFailureRead<R extends Relation.Relation.Any> {
  readonly relation: R
}

/**
 * Declares read access to removed-component lifecycle records.
 *
 * This reads the committed lifecycle buffer, not immediate removals. Systems
 * usually pair this with `Game.Schedule.updateLifecycle()` and host cleanup
 * logic such as removing renderer-owned nodes. {@link readDespawned}
 * complements this for whole-entity teardown.
 *
 * @example
 * ```ts
 * const DestroyRenderNodesSystem = Game.System.define("DestroyRenderNodes", {
 *   removed: {
 *     renderables: Game.System.readRemoved(Renderable)
 *   }
 * }, ({ removed }) => Fx.sync(() => {
 *   for (const entityId of removed.renderables.all()) {
 *     // destroy host-owned node here
 *   }
 * }))
 * ```
 */
export const readRemoved = <D extends Descriptor<"component", string, any>>(
  descriptor: D
): RemovedRead<D> => ({
  descriptor
})

/**
 * Declares read access to relation-mutation failure records.
 */
export const readRelationFailures = <R extends Relation.Relation.Any>(
  relation: R
): RelationFailureRead<R> => ({
  relation
})

/**
 * Declares read access to despawned-entity lifecycle records.
 *
 * This reads the committed despawn buffer after `Game.Schedule.updateLifecycle()`.
 * Use it when host-owned state must be destroyed even if no single removed
 * component is the canonical trigger. {@link readRemoved} is often used
 * alongside this in authoritative host mirrors.
 *
 * @example
 * ```ts
 * const DestroyNodesSystem = Game.System.define("DestroyNodes", {
 *   despawned: {
 *     entities: Game.System.readDespawned()
 *   }
 * }, ({ despawned }) => Fx.sync(() => {
 *   for (const entityId of despawned.entities.all()) {
 *     // destroy host-owned node here
 *   }
 * }))
 * ```
 */
export const readDespawned = (): DespawnedRead => ({
  kind: "despawned"
})

/**
 * A read-only lifecycle stream of entity ids for one removed component.
 */
export interface RemovedReadView<S extends Schema.Any, Root = unknown> {
  all(): ReadonlyArray<import("./entity.ts").EntityId<S, Root>>
}

/**
 * A read-only lifecycle stream of despawned entity ids.
 */
export interface DespawnedReadView<S extends Schema.Any, Root = unknown> {
  all(): ReadonlyArray<import("./entity.ts").EntityId<S, Root>>
}

/**
 * A read-only stream of deferred relation-mutation failures.
 */
export interface RelationFailureReadView<
  R extends Relation.Relation.Any = Relation.Relation.Any,
  S extends Schema.Any = Schema.Any,
  Root = unknown
> {
  all(): ReadonlyArray<Relation.Relation.MutationFailure<R, S, Root>>
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
  get(entityId: import("./entity.ts").EntityId<S, Query.Root<Q>>): Query.Result<QueryMatch<S, Q>, Query.LookupError>
  /**
   * Returns a single match when exactly one entity satisfies the query.
   */
  single(): Query.Result<QueryMatch<S, Q>, Query.SingleError>
  /**
   * Returns a single match when zero or one entity satisfies the query.
   *
   * Use this when absence is acceptable but multiplicity is still a bug. Zero
   * matches return `ok: true` with `value: undefined`; multiple matches remain
   * an explicit `MultipleEntities` failure.
   *
   * @example
   * ```ts
   * const player = queries.player.singleOptional()
   * if (!player.ok || !player.value) {
   *   return
   * }
   *
   * player.value.data.position.set({ x: 0, y: 0 })
   * ```
   */
  singleOptional(): Query.Result<QueryMatch<S, Q> | undefined, Query.MultipleEntitiesError>
}

/**
 * Typed entity lookup API exposed to systems.
 *
 * Use this when you already have an entity id and want a validated, typed view
 * over a specific component access specification.
 *
 * All lookup methods are total and explicit:
 *
 * - no hidden exceptions
 * - stale handles are treated as normal typed failures
 * - hierarchy traversal is available only for hierarchy relations
 */
export interface LookupApi<S extends Schema.Any, Root = unknown> {
  get<Q extends Query.Any<Root>>(
    entityId: Entity.EntityId<S, Root>,
    query: Q
  ): Query.Result<QueryMatch<S, Q>, Query.LookupError>
  /**
   * Resolves a stored durable handle back into current-world query access.
   *
   * Use this after crossing deferred boundaries such as `updateEvents()` or
   * when reading handles back out of resources or components. A handle is
   * storage-safe, not proof of liveness, so stale or mismatched handles remain
   * explicit typed failures.
   */
  getHandle<
    H extends Entity.Handle<Root, any>,
    Q extends Query.Any<Root>
  >(
    handle: [Entity.Handle.Intent<H>] extends [undefined]
      ? H
      : Query.ProvesComponent<Q, Entity.Handle.Intent<H> & Descriptor<"component", string, any>> extends true
        ? H
        : never,
    query: Q
  ): Query.Result<QueryMatch<S, Q>, Query.LookupError>
  related<R extends Extract<Schema.Relations<S>[keyof Schema.Relations<S>], Relation.Relation.Any>>(
    entityId: Entity.EntityId<S, Root>,
    relation: R
  ): Relation.Relation.Result<Entity.EntityId<S, Root>, Relation.Relation.LookupError>
  relatedSources<R extends Extract<Schema.Relations<S>[keyof Schema.Relations<S>], Relation.Relation.Any>>(
    entityId: Entity.EntityId<S, Root>,
    relation: R
  ): Relation.Relation.Result<ReadonlyArray<Entity.EntityId<S, Root>>, Relation.Relation.MissingEntityError>
  /**
   * Reads the direct children of one hierarchy parent as typed query matches.
   *
   * This preserves the stored child order for that hierarchy relation and skips
   * entities that do not satisfy the query. Missing parents remain explicit
   * `MissingEntity` failures.
   */
  childMatches<
    R extends Extract<Schema.Relations<S>[keyof Schema.Relations<S>], Relation.Relation.Hierarchy>,
    Q extends Query.Any<Root>
  >(
    entityId: Entity.EntityId<S, Root>,
    relation: R,
    query: Q
  ): Relation.Relation.Result<ReadonlyArray<QueryMatch<S, Q>>, Relation.Relation.MissingEntityError>
  parent<R extends Extract<Schema.Relations<S>[keyof Schema.Relations<S>], Relation.Relation.Hierarchy>>(
    entityId: Entity.EntityId<S, Root>,
    relation: R
  ): Relation.Relation.Result<Entity.EntityId<S, Root>, Relation.Relation.LookupError>
  ancestors<R extends Extract<Schema.Relations<S>[keyof Schema.Relations<S>], Relation.Relation.Hierarchy>>(
    entityId: Entity.EntityId<S, Root>,
    relation: R
  ): Relation.Relation.Result<ReadonlyArray<Entity.EntityId<S, Root>>, Relation.Relation.MissingEntityError>
  descendants<R extends Extract<Schema.Relations<S>[keyof Schema.Relations<S>], Relation.Relation.Hierarchy>>(
    entityId: Entity.EntityId<S, Root>,
    relation: R,
    options?: {
      readonly order?: "breadth" | "depth"
    }
  ): Relation.Relation.Result<ReadonlyArray<Entity.EntityId<S, Root>>, Relation.Relation.MissingEntityError>
  /**
   * Traverses hierarchy descendants and resolves only the entities that match
   * the given query.
   *
   * Traversal order stays explicit through `options.order`, and non-matching
   * descendants are skipped without turning traversal into a failure.
   */
  descendantMatches<
    R extends Extract<Schema.Relations<S>[keyof Schema.Relations<S>], Relation.Relation.Hierarchy>,
    Q extends Query.Any<Root>
  >(
    entityId: Entity.EntityId<S, Root>,
    relation: R,
    query: Q,
    options?: {
      readonly order?: "breadth" | "depth"
    }
  ): Relation.Relation.Result<ReadonlyArray<QueryMatch<S, Q>>, Relation.Relation.MissingEntityError>
  root<R extends Extract<Schema.Relations<S>[keyof Schema.Relations<S>], Relation.Relation.Hierarchy>>(
    entityId: Entity.EntityId<S, Root>,
    relation: R
  ): Relation.Relation.Result<Entity.EntityId<S, Root>, Relation.Relation.MissingEntityError>
}

/**
 * Compact ordering metadata carried by each system for schedule validation.
 *
 * This keeps schedule-level type computation focused on the small ordering
 * surface instead of repeatedly expanding the full system spec.
 */
export interface SystemOrderingSpec<
  out InSets extends ReadonlyArray<Label.SystemSet> = ReadonlyArray<Label.SystemSet>,
  out After extends ReadonlyArray<OrderTarget> = ReadonlyArray<OrderTarget>,
  out Before extends ReadonlyArray<OrderTarget> = ReadonlyArray<OrderTarget>
> {
  readonly label: Label.System
  readonly inSets: InSets
  readonly after: After
  readonly before: Before
}

/**
 * An ordering target inside one schedule.
 *
 * Systems can order themselves relative to other system definitions or reusable
 * typed system sets. No open string references are allowed.
 */
export type OrderTarget = SystemDefinition<any, any, any, any> | Label.System | Label.SystemSet

/**
 * An explicit system specification.
 *
 * This is the central user-facing abstraction: all ECS access, service
 * dependencies, and stateful capabilities are declared here up front.
 */
export interface SystemSpec<
  S extends Schema.Any,
  out Queries extends Record<string, Query.Any<any>> = {},
  out Resources extends Record<string, ResourceAccess> = {},
  out Events extends Record<string, EventAccess> = {},
  out Services extends Record<string, ServiceRead<Descriptor<"service", string, any>>> = {},
  out States extends Record<string, StateRead<Descriptor<"state", string, any>> | StateWrite<Descriptor<"state", string, any>>> = {},
  out InSets extends ReadonlyArray<Label.SystemSet> = readonly [],
  out After extends ReadonlyArray<OrderTarget> = readonly [],
  out Before extends ReadonlyArray<OrderTarget> = readonly [],
  out Machines extends Record<string, Machine.MachineRead<Machine.StateMachine.Any>> = {},
  out NextMachines extends Record<string, Machine.NextMachineWrite<Machine.StateMachine.Any>> = {},
  out TransitionEvents extends Record<string, Machine.TransitionEventRead<Machine.StateMachine.Any>> = {},
  out Removed extends Record<string, RemovedRead<Descriptor<"component", string, any>>> = {},
  out Despawned extends Record<string, DespawnedRead> = {},
  out When extends ReadonlyArray<Machine.Condition> = readonly [],
  out Transitions extends Record<string, Machine.TransitionRead<Machine.StateMachine.Any>> = {},
  Root = unknown,
  out RelationFailures extends Record<string, RelationFailureRead<Relation.Relation.Any>> = {}
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
  readonly machines: Machines
  readonly nextMachines: NextMachines
  readonly transitionEvents: TransitionEvents
  readonly removed: Removed
  readonly despawned: Despawned
  readonly relationFailures: RelationFailures
  readonly when: When
  readonly transitions: Transitions
  readonly schema: S
  readonly __schemaRoot: Root
}

/**
 * Internal helper representing any fully-defined system spec shape.
 */
export type AnySystemSpec = SystemSpec<
  any,
  any,
  any,
  any,
  any,
  any,
  ReadonlyArray<Label.SystemSet>,
  ReadonlyArray<OrderTarget>,
  ReadonlyArray<OrderTarget>,
  any,
  any,
  any,
  any,
  any,
  ReadonlyArray<Machine.Condition>,
  any,
  any
>

/**
 * Flattens an inferred object type for clearer public signatures.
 */
type Simplify<A> = {
  readonly [K in keyof A]: A[K]
}

type UnionToIntersection<A> =
  (A extends unknown ? (value: A) => void : never) extends ((value: infer I) => void) ? I : never

type IntersectOrEmpty<A> = [A] extends [never] ? {} : UnionToIntersection<A>

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
    : Spec["resources"][K] extends ResourceWrite<infer D> ? ResourceWriteView<D>
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
    : Spec["states"][K] extends StateWrite<infer D> ? StateWriteView<D>
    : never
}

/**
 * Derives the committed-machine view context from a system spec.
 */
type MachineContext<Spec extends AnySystemSpec> = {
  readonly [K in keyof Spec["machines"]]:
    Spec["machines"][K] extends Machine.MachineRead<infer M> ? MachineReadView<M> : never
}

/**
 * Derives the next-machine write context from a system spec.
 */
type NextMachineContext<Spec extends AnySystemSpec> = {
  readonly [K in keyof Spec["nextMachines"]]:
    Spec["nextMachines"][K] extends Machine.NextMachineWrite<infer M> ? NextMachineWriteView<M> : never
}

/**
 * Derives the transition-event view context from a system spec.
 */
type TransitionEventContext<Spec extends AnySystemSpec> = {
  readonly [K in keyof Spec["transitionEvents"]]:
    Spec["transitionEvents"][K] extends Machine.TransitionEventRead<infer M> ? TransitionEventReadView<M> : never
}

type RemovedContext<Spec extends AnySystemSpec> = {
  readonly [K in keyof Spec["removed"]]:
    Spec["removed"][K] extends RemovedRead<any> ? RemovedReadView<Spec["schema"], Spec["__schemaRoot"]> : never
}

type DespawnedContext<Spec extends AnySystemSpec> = {
  readonly [K in keyof Spec["despawned"]]:
    Spec["despawned"][K] extends DespawnedRead ? DespawnedReadView<Spec["schema"], Spec["__schemaRoot"]> : never
}

type RelationFailureContext<Spec extends AnySystemSpec> = {
  readonly [K in keyof Spec["relationFailures"]]:
    Spec["relationFailures"][K] extends RelationFailureRead<infer R>
      ? RelationFailureReadView<R, Spec["schema"], Spec["__schemaRoot"]>
      : never
}

/**
 * Derives the transition view context from a system spec.
 */
type TransitionContext<Spec extends AnySystemSpec> = {
  readonly [K in keyof Spec["transitions"]]:
    Spec["transitions"][K] extends Machine.TransitionRead<infer M> ? TransitionReadView<M> : never
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
  readonly lookup: LookupApi<Spec["schema"], Spec["__schemaRoot"]>
  readonly resources: ResourceContext<Spec>
  readonly events: EventContext<Spec>
  readonly states: StateContext<Spec>
  readonly machines: MachineContext<Spec>
  readonly nextMachines: NextMachineContext<Spec>
  readonly transitionEvents: TransitionEventContext<Spec>
  readonly removed: RemovedContext<Spec>
  readonly despawned: DespawnedContext<Spec>
  readonly relationFailures: RelationFailureContext<Spec>
  readonly transitions: TransitionContext<Spec>
  readonly services: ServiceContext<Spec>
  readonly commands: CommandsApi<Spec["schema"], Spec["__schemaRoot"]>
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
  out States extends Record<string, unknown> = {},
  out Machines extends Record<string, unknown> = {}
> {
  readonly services: Services
  readonly resources: Resources
  readonly states: States
  readonly machines: Machines
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
 * Derives the runtime machine initialization requirements from one system spec.
 */
export type SystemMachineRequirements<Spec extends AnySystemSpec> = Simplify<
  IntersectOrEmpty<
    | Machine.MachineRequirementsFromRecord<Spec["machines"]>
    | Machine.MachineRequirementsFromRecord<Spec["nextMachines"]>
    | Machine.MachineRequirementsFromRecord<Spec["transitionEvents"]>
    | Machine.MachineRequirementsFromRecord<Spec["transitions"]>
    | Machine.MachineRequirementsFromConditions<Spec["when"]>
  >
>

/**
 * Aggregates every runtime requirement implied by a system spec.
 */
export type SystemRequirements<Spec extends AnySystemSpec> = RuntimeRequirements<
  SystemServiceRequirements<Spec>,
  SystemResourceRequirements<Spec>,
  SystemStateRequirements<Spec>,
  SystemMachineRequirements<Spec>
>

/**
 * A fully defined system value ready to be placed into a schedule.
 */
export interface SystemDefinition<
  Spec extends AnySystemSpec,
  out A = void,
  out E = never,
  out Root = unknown,
  out Name extends string = string
> {
  /**
   * Human-readable declaration name used to derive the internal typed label.
   */
  readonly name: Name
  /**
   * The explicit static description of the system.
   */
  readonly spec: Spec
  /**
   * Cached static runtime requirements for this system.
   *
   * Carrying this directly on the value avoids having later schedule-level
   * type folds re-infer the full spec repeatedly, which keeps the bound API
   * both stricter and cheaper for the compiler.
   */
  readonly requirements: SystemRequirements<Spec>
  /**
   * Hidden schema-root brand used by schema-bound APIs.
   */
  readonly __schemaRoot: Root
  /**
   * Compact schedule-ordering view derived from the system spec once.
   */
  readonly ordering: SystemOrderingSpec<Spec["inSets"], Spec["after"], Spec["before"]>
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
 *
 * Use the string-name overload in normal code. The name is turned into a typed
 * internal label automatically, so the system can participate in schedule
 * ordering without extra label plumbing.
 *
 * @example
 * ```ts
 * const CountEnemies = Game.System.define("CountEnemies", {
 *   queries: {
 *     enemies: Game.Query.define({
 *       selection: {
 *         enemy: Game.Query.read(Enemy)
 *       }
 *     })
 *   },
 *   resources: {
 *     total: Game.System.writeResource(EnemyCount)
 *   }
 * }, ({ queries, resources }) => Fx.sync(() => {
 *   resources.total.set(queries.enemies.each().length)
 * }))
 * ```
 */
export function define<
  S extends Schema.Any,
  const Queries extends Record<string, Query.Any<any>> = {},
  const Resources extends Record<string, ResourceAccess> = {},
  const Events extends Record<string, EventAccess> = {},
  const Services extends Record<string, ServiceRead<Descriptor<"service", string, any>>> = {},
  const States extends Record<string, StateRead<Descriptor<"state", string, any>> | StateWrite<Descriptor<"state", string, any>>> = {},
  const InSets extends ReadonlyArray<Label.SystemSet> = [],
  const After extends ReadonlyArray<OrderTarget> = [],
  const Before extends ReadonlyArray<OrderTarget> = [],
  const Machines extends Record<string, Machine.MachineRead<Machine.StateMachine.Any>> = {},
  const NextMachines extends Record<string, Machine.NextMachineWrite<Machine.StateMachine.Any>> = {},
  const TransitionEvents extends Record<string, Machine.TransitionEventRead<Machine.StateMachine.Any>> = {},
  const Removed extends Record<string, RemovedRead<Descriptor<"component", string, any>>> = {},
  const Despawned extends Record<string, DespawnedRead> = {},
  const RelationFailures extends Record<string, RelationFailureRead<Relation.Relation.Any>> = {},
  const When extends ReadonlyArray<Machine.Condition> = [],
  const Transitions extends Record<string, Machine.TransitionRead<Machine.StateMachine.Any>> = {},
  Root = unknown,
  A = void,
  E = never,
  const Name extends string = string
>(
  name: Name,
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
    readonly machines?: Machines
    readonly nextMachines?: NextMachines
    readonly transitionEvents?: TransitionEvents
    readonly removed?: Removed
    readonly despawned?: Despawned
    readonly relationFailures?: RelationFailures
    readonly when?: When
    readonly transitions?: Transitions
  },
  run: (context: SystemContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>) => Fx<
    A,
    E,
    ServiceContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>
  >
): SystemDefinition<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>, A, E, Root, Name>

/**
 * Legacy low-level overload that accepts an explicit system label.
 *
 * Prefer the string-name overload, which creates the internal typed label
 * automatically and avoids manual label threading in user code.
 */
export function define<
  S extends Schema.Any,
  const Queries extends Record<string, Query.Any<any>> = {},
  const Resources extends Record<string, ResourceAccess> = {},
  const Events extends Record<string, EventAccess> = {},
  const Services extends Record<string, ServiceRead<Descriptor<"service", string, any>>> = {},
  const States extends Record<string, StateRead<Descriptor<"state", string, any>> | StateWrite<Descriptor<"state", string, any>>> = {},
  const InSets extends ReadonlyArray<Label.SystemSet> = [],
  const After extends ReadonlyArray<OrderTarget> = [],
  const Before extends ReadonlyArray<OrderTarget> = [],
  const Machines extends Record<string, Machine.MachineRead<Machine.StateMachine.Any>> = {},
  const NextMachines extends Record<string, Machine.NextMachineWrite<Machine.StateMachine.Any>> = {},
  const TransitionEvents extends Record<string, Machine.TransitionEventRead<Machine.StateMachine.Any>> = {},
  const Removed extends Record<string, RemovedRead<Descriptor<"component", string, any>>> = {},
  const Despawned extends Record<string, DespawnedRead> = {},
  const RelationFailures extends Record<string, RelationFailureRead<Relation.Relation.Any>> = {},
  const When extends ReadonlyArray<Machine.Condition> = [],
  const Transitions extends Record<string, Machine.TransitionRead<Machine.StateMachine.Any>> = {},
  Root = unknown,
  A = void,
  E = never,
  const Name extends string = string
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
    readonly machines?: Machines
    readonly nextMachines?: NextMachines
    readonly transitionEvents?: TransitionEvents
    readonly removed?: Removed
    readonly despawned?: Despawned
    readonly relationFailures?: RelationFailures
    readonly when?: When
    readonly transitions?: Transitions
  },
  run: (context: SystemContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>) => Fx<
    A,
    E,
    ServiceContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>
  >
): SystemDefinition<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>, A, E, Root, Name>

export function define<
  S extends Schema.Any,
  const Queries extends Record<string, Query.Any<any>> = {},
  const Resources extends Record<string, ResourceAccess> = {},
  const Events extends Record<string, EventAccess> = {},
  const Services extends Record<string, ServiceRead<Descriptor<"service", string, any>>> = {},
  const States extends Record<string, StateRead<Descriptor<"state", string, any>> | StateWrite<Descriptor<"state", string, any>>> = {},
  const InSets extends ReadonlyArray<Label.SystemSet> = [],
  const After extends ReadonlyArray<OrderTarget> = [],
  const Before extends ReadonlyArray<OrderTarget> = [],
  const Machines extends Record<string, Machine.MachineRead<Machine.StateMachine.Any>> = {},
  const NextMachines extends Record<string, Machine.NextMachineWrite<Machine.StateMachine.Any>> = {},
  const TransitionEvents extends Record<string, Machine.TransitionEventRead<Machine.StateMachine.Any>> = {},
  const Removed extends Record<string, RemovedRead<Descriptor<"component", string, any>>> = {},
  const Despawned extends Record<string, DespawnedRead> = {},
  const RelationFailures extends Record<string, RelationFailureRead<Relation.Relation.Any>> = {},
  const When extends ReadonlyArray<Machine.Condition> = [],
  const Transitions extends Record<string, Machine.TransitionRead<Machine.StateMachine.Any>> = {},
  Root = unknown,
  A = void,
  E = never,
  const Name extends string = string
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
    readonly machines?: Machines
    readonly nextMachines?: NextMachines
    readonly transitionEvents?: TransitionEvents
    readonly removed?: Removed
    readonly despawned?: Despawned
    readonly relationFailures?: RelationFailures
    readonly when?: When
    readonly transitions?: Transitions
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
        readonly machines?: Machines
        readonly nextMachines?: NextMachines
        readonly transitionEvents?: TransitionEvents
        readonly removed?: Removed
        readonly despawned?: Despawned
        readonly when?: When
        readonly transitions?: Transitions
      }
      | ((context: SystemContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, unknown, RelationFailures>>) => Fx<
        A,
        E,
        ServiceContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, unknown, RelationFailures>>
      >),
  maybeRun?: (context: SystemContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>) => Fx<
    A,
    E,
    ServiceContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>
  >
): SystemDefinition<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>, A, E, Root> {
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
    readonly machines?: Machines
    readonly nextMachines?: NextMachines
    readonly transitionEvents?: TransitionEvents
    readonly removed?: Removed
    readonly despawned?: Despawned
    readonly relationFailures?: RelationFailures
    readonly when?: When
    readonly transitions?: Transitions
  }
  const run = (named ? maybeRun : specOrRun) as (context: SystemContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>) => Fx<
    A,
    E,
    ServiceContext<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>
  >
  const label = spec.label ?? LabelModule.defineSystemLabel(name)
  const inSets = (spec.inSets ?? []) as InSets
  const after = (spec.after ?? []) as After
  const before = (spec.before ?? []) as Before

  return {
    name,
    requirements: undefined as unknown as SystemRequirements<SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>,
    __schemaRoot: undefined as unknown as Root,
    ordering: {
      label,
      inSets,
      after,
      before
    },
    spec: {
      label,
      schema: spec.schema,
      inSets,
      after,
      before,
      queries: (spec.queries ?? {}) as Queries,
      resources: (spec.resources ?? {}) as Resources,
      events: (spec.events ?? {}) as Events,
      services: (spec.services ?? {}) as Services,
      states: (spec.states ?? {}) as States,
      machines: (spec.machines ?? {}) as Machines,
      nextMachines: (spec.nextMachines ?? {}) as NextMachines,
      transitionEvents: (spec.transitionEvents ?? {}) as TransitionEvents,
      removed: (spec.removed ?? {}) as Removed,
      despawned: (spec.despawned ?? {}) as Despawned,
      relationFailures: (spec.relationFailures ?? {}) as RelationFailures,
      when: (spec.when ?? []) as When,
      transitions: (spec.transitions ?? {}) as Transitions,
      __schemaRoot: undefined as unknown as Root
    },
    run
  } as SystemDefinition<
    SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>,
    A,
    E,
    Root,
    Name
  >
}
