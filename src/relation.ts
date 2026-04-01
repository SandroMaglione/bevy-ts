/**
 * Relationship definitions, traversal helpers, and mutation failures.
 *
 * Relations model directed entity links plus the explicit error surfaces used
 * when those links cannot be created or traversed.
 *
 * @example
 * ```ts
 * const Parent = Relation.defineHierarchy("Parent", "Children")
 * const Target = Relation.define("Target", "TargetedBy")
 * ```
 *
 * @module relation
 *
 * @groupDescription Namespaces
 * Grouped relation helper types for edges, pairs, and traversal proofs.
 *
 * @groupDescription Interfaces
 * Public relation contracts and traversal view shapes.
 *
 * @groupDescription Type Aliases
 * Shared relation descriptor, edge, and traversal helper types.
 *
 * @groupDescription Functions
 * Public constructors for relation descriptors and relation-aware traversal helpers.
 */
import type { EntityId } from "./entity.ts"
import type { Schema } from "./schema.ts"

/**
 * String-literal type id used to brand paired relationship definitions.
 */
export type RelationTypeId = "~bevy-ts/Relation"

const relationTypeId: RelationTypeId = "~bevy-ts/Relation"

export type RelationKind = "hierarchy" | "relation"

type PairBrand<Name extends string, RelatedName extends string, Kind extends RelationKind> = {
  readonly relation: Name
  readonly related: RelatedName
  readonly kind: Kind
}

export interface RelatedDefinition<
  out RelatedName extends string = string,
  out RelationName extends string = string,
  out Kind extends RelationKind = RelationKind,
  Pair = unknown
> {
  readonly kind: "related"
  readonly relatedName: RelatedName
  readonly relationName: RelationName
  readonly key: symbol
  readonly relationKind: Kind
  readonly [relationTypeId]: {
    readonly _Pair: (_: never) => Pair
  }
}

export interface RelationDefinition<
  out Name extends string = string,
  out RelatedName extends string = string,
  out Kind extends RelationKind = RelationKind,
  Pair = unknown
> {
  readonly kind: "relation"
  readonly name: Name
  readonly relatedName: RelatedName
  readonly key: symbol
  readonly relationKind: Kind
  readonly linkedDespawn: boolean
  readonly allowSelf: boolean
  readonly ordered: boolean
  readonly related: RelatedDefinition<RelatedName, Name, Kind, Pair>
  readonly [relationTypeId]: {
    readonly _Pair: (_: never) => Pair
  }
}

export namespace Relation {
  export type Any = RelationDefinition<string, string, RelationKind, any>
  export type AnyRelated = RelatedDefinition<string, string, RelationKind, any>
  export type Hierarchy = RelationDefinition<string, string, "hierarchy", any>
  export type MutationOperation = "relate" | "reorderChildren"

  export type Result<A, E> =
    | { readonly ok: true; readonly value: A }
    | { readonly ok: false; readonly error: E }

  export interface MissingEntityError {
    readonly _tag: "MissingEntity"
    readonly entityId: number
  }

  export interface MissingRelationError {
    readonly _tag: "MissingRelation"
    readonly entityId: number
    readonly relation: string
  }

  export interface MissingTargetEntityError {
    readonly _tag: "MissingTargetEntity"
    readonly entityId: number
    readonly targetId: number
    readonly relation: string
  }

  export interface SelfRelationNotAllowedError {
    readonly _tag: "SelfRelationNotAllowed"
    readonly entityId: number
    readonly relation: string
  }

  export interface HierarchyCycleError {
    readonly _tag: "HierarchyCycle"
    readonly entityId: number
    readonly targetId: number
    readonly relation: string
  }

  export interface MissingChildEntityError {
    readonly _tag: "MissingChildEntity"
    readonly entityId: number
    readonly childId: number
    readonly relation: string
  }

  export interface DuplicateChildError {
    readonly _tag: "DuplicateChild"
    readonly entityId: number
    readonly childId: number
    readonly relation: string
  }

  export interface ChildNotRelatedToParentError {
    readonly _tag: "ChildNotRelatedToParent"
    readonly entityId: number
    readonly childId: number
    readonly relation: string
  }

  export interface ChildSetMismatchError {
    readonly _tag: "ChildSetMismatch"
    readonly entityId: number
    readonly relation: string
  }

  export type LookupError = MissingEntityError | MissingRelationError
  export type MutationError =
    | MissingEntityError
    | MissingTargetEntityError
    | SelfRelationNotAllowedError
    | HierarchyCycleError
    | MissingChildEntityError
    | DuplicateChildError
    | ChildNotRelatedToParentError
    | ChildSetMismatchError

  export interface MutationFailure<
    R extends Any = Any,
    S extends Schema.Any = Schema.Any,
    Root = unknown,
    Operation extends MutationOperation = MutationOperation
  > {
    readonly relation: R
    readonly operation: Operation
    readonly source: EntityId<S, Root>
    readonly target: EntityId<S, Root>
    readonly error: MutationError
  }
}

export const success = <A>(value: A): Relation.Result<A, never> => ({
  ok: true,
  value
})

export const failure = <E>(error: E): Relation.Result<never, E> => ({
  ok: false,
  error
})

export const missingEntityError = (entityId: number): Relation.MissingEntityError => ({
  _tag: "MissingEntity",
  entityId
})

export const missingRelationError = (
  entityId: number,
  relation: string
): Relation.MissingRelationError => ({
  _tag: "MissingRelation",
  entityId,
  relation
})

export const missingTargetEntityError = (
  entityId: number,
  targetId: number,
  relation: string
): Relation.MissingTargetEntityError => ({
  _tag: "MissingTargetEntity",
  entityId,
  targetId,
  relation
})

export const selfRelationNotAllowedError = (
  entityId: number,
  relation: string
): Relation.SelfRelationNotAllowedError => ({
  _tag: "SelfRelationNotAllowed",
  entityId,
  relation
})

export const hierarchyCycleError = (
  entityId: number,
  targetId: number,
  relation: string
): Relation.HierarchyCycleError => ({
  _tag: "HierarchyCycle",
  entityId,
  targetId,
  relation
})

export const missingChildEntityError = (
  entityId: number,
  childId: number,
  relation: string
): Relation.MissingChildEntityError => ({
  _tag: "MissingChildEntity",
  entityId,
  childId,
  relation
})

export const duplicateChildError = (
  entityId: number,
  childId: number,
  relation: string
): Relation.DuplicateChildError => ({
  _tag: "DuplicateChild",
  entityId,
  childId,
  relation
})

export const childNotRelatedToParentError = (
  entityId: number,
  childId: number,
  relation: string
): Relation.ChildNotRelatedToParentError => ({
  _tag: "ChildNotRelatedToParent",
  entityId,
  childId,
  relation
})

export const childSetMismatchError = (
  entityId: number,
  relation: string
): Relation.ChildSetMismatchError => ({
  _tag: "ChildSetMismatch",
  entityId,
  relation
})

export const mutationFailure = <
  R extends Relation.Any,
  S extends Schema.Any,
  Root,
  Operation extends Relation.MutationOperation
>(
  relation: R,
  operation: Operation,
  source: EntityId<S, Root>,
  target: EntityId<S, Root>,
  error: Relation.MutationError
): Relation.MutationFailure<R, S, Root, Operation> => ({
  relation,
  operation,
  source,
  target,
  error
})

const makePair = <
  const Name extends string,
  const RelatedName extends string,
  const Kind extends RelationKind
>(
  kind: Kind,
  name: Name,
  relatedName: RelatedName
): {
  readonly relation: RelationDefinition<Name, RelatedName, Kind, PairBrand<Name, RelatedName, Kind>>
  readonly related: RelatedDefinition<RelatedName, Name, Kind, PairBrand<Name, RelatedName, Kind>>
} => {
  type Pair = PairBrand<Name, RelatedName, Kind>
  const related = {
    kind: "related",
    relatedName,
    relationName: name,
    key: Symbol.for(`bevy-ts/related/${name}`),
    relationKind: kind,
    [relationTypeId]: {
      _Pair: (_: never) => undefined as unknown as Pair
    }
  } as RelatedDefinition<RelatedName, Name, Kind, Pair>

  const relation = {
    kind: "relation",
    name,
    relatedName,
    key: Symbol.for(`bevy-ts/relation/${name}`),
    relationKind: kind,
    linkedDespawn: kind === "hierarchy",
    allowSelf: false,
    ordered: kind === "hierarchy",
    related,
    [relationTypeId]: {
      _Pair: (_: never) => undefined as unknown as Pair
    }
  } as RelationDefinition<Name, RelatedName, Kind, Pair>

  return {
    relation,
    related
  }
}

export const defineHierarchy = <
  const Name extends string,
  const RelatedName extends string
>(
  name: Name,
  relatedName: RelatedName
) => makePair("hierarchy", name, relatedName)

export const defineRelation = <
  const Name extends string,
  const RelatedName extends string
>(
  name: Name,
  relatedName: RelatedName
) => makePair("relation", name, relatedName)

export interface RelationReadAccess<
  R extends Relation.Any,
  S extends Schema.Any,
  Root = unknown
> {
  readonly mode: "readRelation"
  readonly descriptor: R
  readonly __schema?: S | undefined
  readonly __schemaRoot?: Root | undefined
}

export interface OptionalRelationReadAccess<
  R extends Relation.Any,
  S extends Schema.Any,
  Root = unknown
> {
  readonly mode: "optionalRelation"
  readonly descriptor: R
  readonly __schema?: S | undefined
  readonly __schemaRoot?: Root | undefined
}

export interface RelatedReadAccess<
  R extends Relation.Any,
  S extends Schema.Any,
  Root = unknown
> {
  readonly mode: "readRelated"
  readonly descriptor: R
  readonly __schema?: S | undefined
  readonly __schemaRoot?: Root | undefined
}

export interface OptionalRelatedReadAccess<
  R extends Relation.Any,
  S extends Schema.Any,
  Root = unknown
> {
  readonly mode: "optionalRelated"
  readonly descriptor: R
  readonly __schema?: S | undefined
  readonly __schemaRoot?: Root | undefined
}

export type SelectionAccess<S extends Schema.Any, Root = unknown> =
  | RelationReadAccess<Relation.Any, S, Root>
  | OptionalRelationReadAccess<Relation.Any, S, Root>
  | RelatedReadAccess<Relation.Any, S, Root>
  | OptionalRelatedReadAccess<Relation.Any, S, Root>

export const read = <R extends Relation.Any, S extends Schema.Any, Root = unknown>(
  descriptor: R
): RelationReadAccess<R, S, Root> => ({
  mode: "readRelation",
  descriptor
})

export const optional = <R extends Relation.Any, S extends Schema.Any, Root = unknown>(
  descriptor: R
): OptionalRelationReadAccess<R, S, Root> => ({
  mode: "optionalRelation",
  descriptor
})

export const readRelated = <R extends Relation.Any, S extends Schema.Any, Root = unknown>(
  descriptor: R
): RelatedReadAccess<R, S, Root> => ({
  mode: "readRelated",
  descriptor
})

export const optionalRelated = <R extends Relation.Any, S extends Schema.Any, Root = unknown>(
  descriptor: R
): OptionalRelatedReadAccess<R, S, Root> => ({
  mode: "optionalRelated",
  descriptor
})

export interface StagedRelation<
  S extends Schema.Any,
  Root = unknown
> {
  readonly relation: Relation.Any
  readonly target: EntityId<S, Root>
}
