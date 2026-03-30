import type { Descriptor } from "./descriptor.ts"
import type { EntityId, EntityMut, EntityRef } from "./entity.ts"
import type { Schema } from "./schema.ts"

type ComponentDescriptor = Descriptor<"component", string, unknown>

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

/**
 * Declares read-only access to a descriptor in a query specification.
 */
export const read = <D extends ComponentDescriptor>(descriptor: D): ReadAccess<D> => ({
  mode: "read",
  descriptor
})

/**
 * Declares writable access to a descriptor in a query specification.
 */
export const write = <D extends ComponentDescriptor>(descriptor: D): WriteAccess<D> => ({
  mode: "write",
  descriptor
})

/**
 * Declares maybe-present read-only access to a component in a query
 * specification.
 */
export const optional = <D extends ComponentDescriptor>(descriptor: D): OptionalReadAccess<D> => ({
  mode: "optional",
  descriptor
})

/**
 * A fully explicit query specification.
 *
 * Queries describe exactly which components are read or written, plus optional
 * `with` and `without` filters. They are the source of typed entity proofs.
 */
export interface QuerySpec<
  out Selection extends Record<string, Access<ComponentDescriptor>>,
  out With extends ReadonlyArray<ComponentDescriptor> = [],
  out Without extends ReadonlyArray<ComponentDescriptor> = [],
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
  export type Any<Root = unknown> = QuerySpec<Record<string, Access<ComponentDescriptor>>, ReadonlyArray<ComponentDescriptor>, ReadonlyArray<ComponentDescriptor>, Root>

  /**
   * Extracts the schema-root brand carried by one query.
   */
  export type Root<T extends Any> = T extends QuerySpec<any, any, any, infer R> ? R : never

  /**
   * The readable proof produced by a query.
   */
  export type ReadProof<T extends Any> = {
    readonly [K in keyof T["selection"] as
      T["selection"][K] extends OptionalReadAccess<any> ? never : K]:
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
      : T["selection"][K] extends WriteAccess<infer D> ? WriteCell<Descriptor.Value<D>>
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
   * Updates the current value based on the previous one.
   */
  update(f: (current: T) => T): void
}

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
 */
export const define = <
  const Selection extends Record<string, Access<ComponentDescriptor>>,
  const With extends ReadonlyArray<ComponentDescriptor> = [],
  const Without extends ReadonlyArray<ComponentDescriptor> = [],
  Root = unknown
>(spec: {
  readonly selection: Selection
  readonly with?: With
  readonly without?: Without
}): QuerySpec<Selection, With, Without, Root> => ({
  selection: spec.selection,
  with: (spec.with ?? []) as With,
  without: (spec.without ?? []) as Without,
  __schemaRoot: undefined as unknown as Root
})
