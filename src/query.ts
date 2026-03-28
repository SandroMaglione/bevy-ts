import type { Descriptor } from "./descriptor.ts"
import type { EntityMut, EntityRef } from "./entity.ts"
import type { Schema } from "./schema.ts"

/**
 * A read access declaration for a descriptor.
 *
 * Read accesses allow systems to observe data without gaining mutation
 * capability in the resulting query or view type.
 */
export interface ReadAccess<D extends Descriptor.Any> {
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
export interface WriteAccess<D extends Descriptor.Any> {
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
export type Access<D extends Descriptor.Any> = ReadAccess<D> | WriteAccess<D>

/**
 * Declares read-only access to a descriptor in a query specification.
 */
export const read = <D extends Descriptor.Any>(descriptor: D): ReadAccess<D> => ({
  mode: "read",
  descriptor
})

/**
 * Declares writable access to a descriptor in a query specification.
 */
export const write = <D extends Descriptor.Any>(descriptor: D): WriteAccess<D> => ({
  mode: "write",
  descriptor
})

/**
 * A fully explicit query specification.
 *
 * Queries describe exactly which components are read or written, plus optional
 * `with` and `without` filters. They are the source of typed entity proofs.
 */
export interface QuerySpec<
  out Selection extends Record<string, Access<Descriptor.Any>>,
  out With extends ReadonlyArray<Descriptor.Any> = [],
  out Without extends ReadonlyArray<Descriptor.Any> = []
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
}

/**
 * Type-level helpers for queries.
 */
export namespace Query {
  /**
   * Any supported query specification.
   */
  export type Any = QuerySpec<Record<string, Access<Descriptor.Any>>, ReadonlyArray<Descriptor.Any>, ReadonlyArray<Descriptor.Any>>

  /**
   * The readable proof produced by a query.
   */
  export type ReadProof<T extends Any> = {
    readonly [K in keyof T["selection"]]:
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
      : T["selection"][K] extends WriteAccess<infer D> ? WriteCell<Descriptor.Value<D>>
      : never
  }
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
 * The typed item returned by iterating a query handle.
 *
 * If the query contains at least one write access, the entity proof is mutable.
 * Otherwise it remains read-only.
 */
export type QueryMatch<S extends Schema.Any, Q extends Query.Any> =
  keyof Query.WriteProof<Q> extends never
    ? {
        readonly entity: EntityRef<S, Query.ReadProof<Q>>
        readonly data: Query.Cells<Q>
      }
    : {
        readonly entity: EntityMut<S, Query.ReadProof<Q>, Query.WriteProof<Q>>
        readonly data: Query.Cells<Q>
      }

/**
 * Creates an explicit query specification.
 *
 * Use this inside system specs instead of relying on callback parameter
 * inference. The resulting value drives both runtime execution and the derived
 * query result type.
 */
export const define = <
  const Selection extends Record<string, Access<Descriptor.Any>>,
  const With extends ReadonlyArray<Descriptor.Any> = [],
  const Without extends ReadonlyArray<Descriptor.Any> = []
>(spec: {
  readonly selection: Selection
  readonly with?: With
  readonly without?: Without
}): QuerySpec<Selection, With, Without> => ({
  selection: spec.selection,
  with: (spec.with ?? []) as With,
  without: (spec.without ?? []) as Without
})
