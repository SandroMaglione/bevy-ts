/**
 * Query declarations, matching semantics, and typed cell access surfaces.
 *
 * Queries are the explicit entity-data access layer used by systems.
 *
 * @example
 * ```ts
 * const movers = Game.Query({
 *   selection: {
 *     position: Game.Query.write(Position),
 *     velocity: Game.Query.read(Velocity)
 *   }
 * })
 * ```
 *
 * @module query
 * @docGroup core
 *
 * @groupDescription Namespaces
 * Grouped proof helpers that derive precise component evidence from one query selection.
 *
 * @groupDescription Interfaces
 * Public query contracts for selections, filters, matches, and read/write views.
 *
 * @groupDescription Type Aliases
 * Shared query access, proof, and lifecycle helper types.
 *
 * @groupDescription Functions
 * Query authoring helpers for selecting components and declaring explicit filters.
 */
import type { Descriptor } from "./descriptor.ts"
import type { EntityId, EntityMut, EntityRef } from "./entity.ts"
import type * as Result from "./Result.ts"
import type * as Relation from "./relation.ts"
import type { Schema } from "./schema.ts"

type ComponentDescriptor = Descriptor<"component", string, unknown>

/**
 * Query declarations and typed query result cells.
 *
 * Queries are the main way systems gain typed entity access. A query spec is
 * fully explicit:
 *
 * - `selection` declares readable and writable slots
 * - `with` / `without` refine structural matching
 * - `added` / `changed` refine matching using lifecycle buffers
 * - relation filters refine matching using explicit relation state
 *
 * The key mental model is that query matching is separate from the cell API:
 * required slots affect matching, while `optional(...)` does not.
 *
 * @example
 * ```ts
 * const Moving = Game.Query({
 *   selection: {
 *     position: Game.Query.write(Position),
 *     velocity: Game.Query.read(Velocity),
 *     sprite: Game.Query.optional(Sprite)
 *   },
 *   with: [Position, Velocity]
 * })
 * ```
 */

/**
 * A read access declaration for a descriptor.
 *
 * Read accesses allow systems to observe data without gaining mutation
 * capability in the resulting query or view type.
 */
export interface ReadAccess<D extends ComponentDescriptor> {
  /**
   * Distinguishes read access from write access at both type and runtime level.
   */
  readonly mode: "read"
  /**
   * The descriptor being accessed.
   */
  readonly descriptor: D
}

/**
 * A write access declaration for a descriptor.
 *
 * Write accesses produce writable cells and mutable entity proofs.
 */
export interface WriteAccess<D extends ComponentDescriptor> {
  /**
   * Distinguishes write access from read access at both type and runtime level.
   */
  readonly mode: "write"
  /**
   * The descriptor being accessed.
   */
  readonly descriptor: D
}

/**
 * Any supported query access declaration.
 */
export interface OptionalReadAccess<D extends ComponentDescriptor> {
  /**
   * Distinguishes maybe-present reads from required reads.
   */
  readonly mode: "optional"
  /**
   * The component descriptor being accessed.
   */
  readonly descriptor: D
}

export type Access<D extends ComponentDescriptor> =
  | ReadAccess<D>
  | WriteAccess<D>
  | OptionalReadAccess<D>

export type SelectionAccess<
  S extends Schema.Any = Schema.Any,
  Root = unknown
> = Access<ComponentDescriptor> | Relation.SelectionAccess<S, Root>

/**
 * A filter that matches entities whose component became present since the last
 * lifecycle update boundary.
 */
export interface AddedFilter<D extends ComponentDescriptor> {
  readonly kind: "added"
  readonly descriptor: D
}

/**
 * A filter that matches entities whose component was written since the last
 * lifecycle update boundary.
 */
export interface ChangedFilter<D extends ComponentDescriptor> {
  readonly kind: "changed"
  readonly descriptor: D
}

export type Filter<D extends ComponentDescriptor> =
  | AddedFilter<D>
  | ChangedFilter<D>

/**
 * Declares read-only access to a component in a query selection.
 *
 * A required read slot contributes to both:
 *
 * - query matching: the component must be present
 * - result typing: the slot becomes a `ReadCell`
 */
export const read = <D extends ComponentDescriptor>(descriptor: D): ReadAccess<D> => ({
  mode: "read",
  descriptor
})

/**
 * Declares writable access to a component in a query selection.
 *
 * A write slot requires the component to be present and produces a
 * `WriteCell`, making mutation capability explicit in the query result.
 */
export const write = <D extends ComponentDescriptor>(descriptor: D): WriteAccess<D> => ({
  mode: "write",
  descriptor
})

/**
 * Declares maybe-present read-only access to a component in a query
 * specification.
 *
 * `optional(...)` does not affect entity matching. It only changes the cell
 * type for that slot, forcing callers to narrow on `present` before reading.
 *
 * @example
 * ```ts
 * const query = Game.Query({
 *   selection: {
 *     sprite: Game.Query.optional(Sprite)
 *   }
 * })
 * ```
 */
export const optional = <D extends ComponentDescriptor>(descriptor: D): OptionalReadAccess<D> => ({
  mode: "optional",
  descriptor
})

/**
 * Declares a lifecycle filter that matches newly added components.
 *
 * This depends on the readable lifecycle buffer, so it only changes after an
 * explicit `Game.Schedule.updateLifecycle()` boundary.
 *
 * This is the usual entrypoint for incremental host sync: create host-owned
 * nodes only after lifecycle visibility has been advanced for the current
 * schedule. {@link changed} complements this for later update passes.
 *
 * @example
 * ```ts
 * const AddedRenderableQuery = Game.Query({
 *   selection: {
 *     position: Game.Query.read(Position),
 *     renderable: Game.Query.read(Renderable)
 *   },
 *   filters: [Game.Query.added(Renderable)]
 * })
 * ```
 */
export const added = <D extends ComponentDescriptor>(descriptor: D): AddedFilter<D> => ({
  kind: "added",
  descriptor
})

/**
 * Declares a lifecycle filter that matches components written since the last
 * lifecycle boundary.
 *
 * This depends on the readable lifecycle buffer, so it only changes after an
 * explicit `Game.Schedule.updateLifecycle()` boundary.
 *
 * Use this for narrow host-sync passes after initial creation, for example one
 * transform-sync system that should only touch entities whose position changed
 * since the last lifecycle boundary. {@link added} is the matching
 * creation-side lifecycle filter.
 *
 * @example
 * ```ts
 * const MovedQuery = Game.Query({
 *   selection: {
 *     position: Game.Query.read(Position)
 *   },
 *   filters: [Game.Query.changed(Position)]
 * })
 * ```
 */
export const changed = <D extends ComponentDescriptor>(descriptor: D): ChangedFilter<D> => ({
  kind: "changed",
  descriptor
})

/**
 * A fully explicit query specification.
 *
 * Queries describe exactly which components are read or written, plus optional
 * `with` and `without` filters. They are the source of typed entity proofs.
 */
export interface QuerySpec<
  out Selection extends Record<string, SelectionAccess<any, Root>>,
  out With extends ReadonlyArray<ComponentDescriptor> = [],
  out Without extends ReadonlyArray<ComponentDescriptor> = [],
  out Filters extends ReadonlyArray<Filter<ComponentDescriptor>> = [],
  out WithRelations extends ReadonlyArray<Relation.Relation.Any> = [],
  out WithoutRelations extends ReadonlyArray<Relation.Relation.Any> = [],
  out WithRelated extends ReadonlyArray<Relation.Relation.Any> = [],
  out WithoutRelated extends ReadonlyArray<Relation.Relation.Any> = [],
  Root = unknown
> {
  /**
   * Named access slots that become typed cells in query results.
   */
  readonly selection: Selection
  /**
   * Components that must be present for an entity to match.
   */
  readonly with: With
  /**
   * Components that must be absent for an entity to match.
   */
  readonly without: Without
  /**
   * Lifecycle-aware filters that refine matching over the current world.
   */
  readonly filters: Filters
  /**
   * Relations that must be present on the entity as outgoing edges.
   */
  readonly withRelations: WithRelations
  /**
   * Relations that must be absent on the entity as outgoing edges.
   */
  readonly withoutRelations: WithoutRelations
  /**
   * Reverse relation collections that must be present and non-empty.
   */
  readonly withRelated: WithRelated
  /**
   * Reverse relation collections that must be absent or empty.
   */
  readonly withoutRelated: WithoutRelated
  /**
   * Hidden schema-root brand used by schema-bound APIs.
   */
  readonly __schemaRoot?: Root | undefined
}

/**
 * Type-level helpers for queries.
 */
export namespace Query {
  /**
   * Small result type used by lookup-style query operations.
   *
   * Query handles use a value-level result instead of throwing so callers can
   * keep failure cases explicit and type-directed.
   */
  export type Result<A, E> =
    | { readonly ok: true; readonly value: A }
    | { readonly ok: false; readonly error: E }

  /**
   * A non-empty readonly array.
   */
  export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

  /**
   * Any supported query specification.
   */
  export type Any<Root = unknown> = QuerySpec<
    Record<string, SelectionAccess<any, Root>>,
    ReadonlyArray<ComponentDescriptor>,
    ReadonlyArray<ComponentDescriptor>,
    ReadonlyArray<Filter<ComponentDescriptor>>,
    ReadonlyArray<Relation.Relation.Any>,
    ReadonlyArray<Relation.Relation.Any>,
    ReadonlyArray<Relation.Relation.Any>,
    ReadonlyArray<Relation.Relation.Any>,
    Root
  >

  /**
   * Extracts the schema-root brand carried by one query.
   */
  export type Root<T extends Any> = T extends QuerySpec<any, any, any, any, any, any, any, any, infer R> ? R : never

  type RequiredSelectionDescriptors<T extends Any> = {
    readonly [K in keyof T["selection"]]:
      T["selection"][K] extends ReadAccess<infer D> | WriteAccess<infer D> ? D : never
  }[keyof T["selection"]]

  /**
   * Whether one query statically proves the presence of a component descriptor.
   *
   * This is used by durable-handle resolution so intent-qualified handles can
   * only be resolved with queries that actually prove the intended role.
   */
  export type ProvesComponent<
    T extends Any,
    D extends ComponentDescriptor
  > = [Extract<RequiredSelectionDescriptors<T> | T["with"][number], D>] extends [never]
    ? false
    : true

  /**
   * The readable proof produced by a query.
   */
  export type ReadProof<T extends Any> = {
    readonly [K in keyof T["selection"] as
      T["selection"][K] extends OptionalReadAccess<any> | Relation.SelectionAccess<any, any> ? never
      : T["selection"][K] extends Access<any> ? K
      : never]:
      T["selection"][K] extends Access<infer D> ? Descriptor.Value<D> : never
  }

  /**
   * The writable proof produced by a query.
   */
  export type WriteProof<T extends Any> = {
    readonly [K in keyof T["selection"] as
      T["selection"][K] extends WriteAccess<any> ? K : never]:
      T["selection"][K] extends WriteAccess<infer D> ? Descriptor.Value<D> : never
  }

  /**
   * The per-slot cell API derived from a query.
   */
  export type Cells<T extends Any> = {
    readonly [K in keyof T["selection"]]:
      T["selection"][K] extends ReadAccess<infer D> ? ReadCell<Descriptor.Value<D>>
      : T["selection"][K] extends OptionalReadAccess<infer D> ? OptionalReadCell<Descriptor.Value<D>>
      : T["selection"][K] extends WriteAccess<infer D> ? WriteCellForDescriptor<D>
      : T["selection"][K] extends Relation.RelationReadAccess<any, infer S extends Schema.Any, infer Root> ? ReadCell<EntityId<S, Root>>
      : T["selection"][K] extends Relation.OptionalRelationReadAccess<any, infer S extends Schema.Any, infer Root> ? OptionalReadCell<EntityId<S, Root>>
      : T["selection"][K] extends Relation.RelatedReadAccess<any, infer S extends Schema.Any, infer Root> ? ReadCell<ReadonlyArray<EntityId<S, Root>>>
      : T["selection"][K] extends Relation.OptionalRelatedReadAccess<any, infer S extends Schema.Any, infer Root> ? OptionalReadCell<ReadonlyArray<EntityId<S, Root>>>
      : never
  }

  /**
   * Entity lookup failed because the entity id is not currently alive.
   */
  export interface MissingEntityError {
    readonly _tag: "MissingEntity"
    readonly entityId: number
  }

  /**
   * Entity lookup failed because the entity does not satisfy the query.
   */
  export interface QueryMismatchError {
    readonly _tag: "QueryMismatch"
    readonly entityId: number
  }

  /**
   * A query expected one result, but matched none.
   */
  export interface NoEntitiesError {
    readonly _tag: "NoEntities"
  }

  /**
   * A query expected one result, but matched multiple.
   */
  export interface MultipleEntitiesError {
    readonly _tag: "MultipleEntities"
    readonly count: number
  }

  /**
   * Errors produced by exact entity lookup helpers.
   */
  export type LookupError = MissingEntityError | QueryMismatchError

  /**
   * Errors produced by exact-one query helpers.
   */
  export type SingleError = NoEntitiesError | MultipleEntitiesError
}

/**
 * A read-only cell returned from query or resource access.
 */
export interface ReadCell<T> {
  /**
   * Reads the current value.
   */
  get(): T
}

/**
 * A mutable cell returned from query or resource access.
 *
 * This gives a narrow mutation surface instead of exposing raw storage objects.
 */
export interface WriteCell<T> extends ReadCell<T> {
  /**
   * Replaces the current value.
   */
  set(value: T): void
  /**
   * Replaces the current value from an explicit result.
   */
  setResult<E>(result: Result.Result<T, E>): Result.Result<void, E>
  /**
   * Updates the current value based on the previous one.
   */
  update(f: (current: T) => T): void
  /**
   * Updates the current value from an explicit result-producing callback.
   */
  updateResult<E>(f: (current: T) => Result.Result<T, E>): Result.Result<void, E>
}

/**
 * Writable cell for data backed by a constructed descriptor.
 *
 * This extends the normal write-cell surface with explicit raw-validation
 * helpers. It never appears for plain descriptors.
 */
export interface ConstructedWriteCell<T, Raw, Error> extends WriteCell<T> {
  /**
   * Validates one raw candidate and writes it only on success.
   *
   * @example
   * ```ts
   * data.position.setRaw({ x: 16, y: 24 })
   * ```
   */
  setRaw(raw: Raw): Result.Result<void, Error>
  /**
   * Derives one raw candidate from the current value, validates it, and writes
   * it only on success.
   *
   * @example
   * ```ts
   * data.position.updateRaw((position) => ({
   *   x: position.x + 1,
   *   y: position.y
   * }))
   * ```
   */
  updateRaw(f: (current: T) => Raw): Result.Result<void, Error>
}

/**
 * Write-cell surface produced for one queried component descriptor.
 */
export type WriteCellForDescriptor<D extends ComponentDescriptor> =
  D extends import("./descriptor.ts").ConstructedDescriptor<"component", string, infer Value, infer Raw, infer Error>
    ? ConstructedWriteCell<Value, Raw, Error>
    : WriteCell<Descriptor.Value<D>>

/**
 * Present branch for a maybe-present query slot.
 */
export interface PresentOptionalReadCell<T> extends ReadCell<T> {
  readonly present: true
}

/**
 * Absent branch for a maybe-present query slot.
 */
export interface AbsentOptionalReadCell {
  readonly present: false
}

/**
 * A query slot that may or may not be present on the matched entity.
 *
 * Callers must narrow on `present` before reading the value.
 */
export type OptionalReadCell<T> = PresentOptionalReadCell<T> | AbsentOptionalReadCell

/**
 * The typed item returned by iterating a query handle.
 *
 * If the query contains at least one write access, the entity proof is mutable.
 * Otherwise it remains read-only.
 */
export type QueryMatch<S extends Schema.Any, Q extends Query.Any> =
  keyof Query.WriteProof<Q> extends never
    ? {
        readonly entity: EntityRef<S, Query.ReadProof<Q>, Query.Root<Q>>
        readonly data: Query.Cells<Q>
      }
    : {
        readonly entity: EntityMut<S, Query.ReadProof<Q>, Query.WriteProof<Q>, Query.Root<Q>>
        readonly data: Query.Cells<Q>
      }

/**
 * Successful result constructor used by runtime query helpers.
 */
export const success = <A>(value: A): Query.Result<A, never> => ({
  ok: true,
  value
})

/**
 * Failed result constructor used by runtime query helpers.
 */
export const failure = <E>(error: E): Query.Result<never, E> => ({
  ok: false,
  error
})

/**
 * Creates a typed missing-entity error.
 */
export const missingEntityError = (entityId: number): Query.MissingEntityError => ({
  _tag: "MissingEntity",
  entityId
})

/**
 * Creates a typed query-mismatch error.
 */
export const queryMismatchError = (entityId: number): Query.QueryMismatchError => ({
  _tag: "QueryMismatch",
  entityId
})

/**
 * Creates a typed zero-match error.
 */
export const noEntitiesError = (): Query.NoEntitiesError => ({
  _tag: "NoEntities"
})

/**
 * Creates a typed multi-match error.
 */
export const multipleEntitiesError = (count: number): Query.MultipleEntitiesError => ({
  _tag: "MultipleEntities",
  count
})

/**
 * Creates an explicit query specification.
 *
 * Use this inside system specs instead of relying on callback parameter
 * inference. The resulting value drives both runtime execution and the derived
 * query result type.
 *
 * A query spec is purely declarative. It does not access the world by itself;
 * systems receive `QueryHandle`s derived from the spec.
 *
 * @example
 * ```ts
 * const Moving = Game.Query({
 *   selection: {
 *     position: Game.Query.write(Position),
 *     velocity: Game.Query.read(Velocity)
 *   },
 *   with: [Position, Velocity],
 *   without: [Sleeping]
 * })
 * ```
 */
export const Query = <
  const Selection extends Record<string, SelectionAccess<any, Root>>,
  const With extends ReadonlyArray<ComponentDescriptor> = [],
  const Without extends ReadonlyArray<ComponentDescriptor> = [],
  const Filters extends ReadonlyArray<Filter<ComponentDescriptor>> = [],
  const WithRelations extends ReadonlyArray<Relation.Relation.Any> = [],
  const WithoutRelations extends ReadonlyArray<Relation.Relation.Any> = [],
  const WithRelated extends ReadonlyArray<Relation.Relation.Any> = [],
  const WithoutRelated extends ReadonlyArray<Relation.Relation.Any> = [],
  Root = unknown
>(spec: {
  readonly selection: Selection
  readonly with?: With
  readonly without?: Without
  readonly filters?: Filters
  readonly withRelations?: WithRelations
  readonly withoutRelations?: WithoutRelations
  readonly withRelated?: WithRelated
  readonly withoutRelated?: WithoutRelated
}): QuerySpec<Selection, With, Without, Filters, WithRelations, WithoutRelations, WithRelated, WithoutRelated, Root> => ({
  selection: spec.selection,
  with: (spec.with ?? []) as With,
  without: (spec.without ?? []) as Without,
  filters: (spec.filters ?? []) as Filters,
  withRelations: (spec.withRelations ?? []) as WithRelations,
  withoutRelations: (spec.withoutRelations ?? []) as WithoutRelations,
  withRelated: (spec.withRelated ?? []) as WithRelated,
  withoutRelated: (spec.withoutRelated ?? []) as WithoutRelated,
  __schemaRoot: undefined as unknown as Root
})
