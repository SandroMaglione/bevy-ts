/**
 * Entity identities, proofs, and long-lived handles.
 *
 * This module defines the nominal entity reference types used across queries,
 * commands, relations, and lookup APIs.
 *
 * @module entity
 *
 * @groupDescription Namespaces
 * Entity-specific proof helpers that refine ids and handles through descriptor evidence.
 *
 * @groupDescription Interfaces
 * Public contracts for current-runtime ids and long-lived storage-safe handles.
 *
 * @groupDescription Type Aliases
 * Shared nominal entity identities, handle shapes, and proof helpers.
 *
 * @groupDescription Functions
 * Explicit helpers for constructing and refining entity ids and handles.
 */
import type { Brand } from "./internal/brand.ts"
import type { Descriptor } from "./descriptor.ts"
import type { StagedRelation } from "./relation.ts"
import type { Schema } from "./schema.ts"

/**
 * Entity identities, proofs, and long-lived handles.
 *
 * `EntityId` is the current-runtime identity used by commands, queries, and
 * lookup. `Handle` is the storage-safe long-lived reference type used when the
 * entity must survive across frames inside components, resources, or events.
 *
 * The important distinction is explicit:
 *
 * - `EntityId` is not proof that an entity has specific components
 * - `Handle` is not proof that the entity is still alive
 * - current-world access must come from queries or checked lookup APIs
 *
 * @example
 * ```ts
 * const handle = Game.Entity.handleAs(Player, playerId)
 * const resolved = lookup.getHandle(handle, PlayerQuery)
 * if (!resolved.ok) return
 * ```
 */
export type EntityTypeId = "~bevy-ts/Entity"

/**
 * Runtime value for the entity type id.
 */
const entityTypeId: EntityTypeId = "~bevy-ts/Entity"
const entityHandleTypeId = "~bevy-ts/EntityHandle" as const

/**
 * A structural proof describing which components are known to be present.
 *
 * The engine uses proof objects instead of pretending entity ids always know
 * their exact runtime component set.
 */
export type ComponentProof = Record<string, unknown>

/**
 * An opaque schema-bound entity identity.
 *
 * `EntityId` proves only that the id belongs to a runtime built from schema `S`.
 * It does not prove anything about the entity's current component set.
 *
 * The numeric `value` is stable for the lifetime of the runtime and can be used
 * as an external integration key, for example when mirroring ECS entities into
 * renderer-owned maps such as Pixi sprites.
 */
export type EntityId<S extends Schema.Any, Root = unknown> = Brand<
  typeof entityTypeId,
  {
    readonly schema: S
    readonly root: Root
    readonly kind: "EntityId"
    readonly value: number
  }
>

/**
 * A durable, long-lived entity reference intended for storage.
 *
 * Unlike `EntityId`, this is explicitly a cross-frame reference that must be
 * resolved back into current-world access through checked lookup APIs.
 */
export type Handle<
  Root,
  Intent extends Descriptor<"component", string, any> | undefined = undefined
> = Brand<
  typeof entityHandleTypeId,
  {
    readonly root: Root
    readonly intent: Intent
    readonly kind: "EntityHandle"
    readonly value: number
  }
>

export namespace Handle {
  export type Root<T extends import("./entity.ts").Handle<any, any>> = T extends import("./entity.ts").Handle<infer R, any> ? R : never
  export type Intent<T extends import("./entity.ts").Handle<any, any>> =
    T extends import("./entity.ts").Handle<any, infer I extends Descriptor<"component", string, any> | undefined> ? I : never
}

/**
 * A staged entity with an exact compile-time component proof.
 *
 * Drafts exist before the command queue is flushed. This is the place where the
 * API can safely carry exact structural information.
 */
export interface EntityDraft<S extends Schema.Any, out P extends ComponentProof, Root = unknown> {
  /**
   * Runtime tag for debugging and pattern matching.
   */
  readonly kind: "EntityDraft"
  /**
   * The schema-bound entity identity associated with the draft.
   */
  readonly id: EntityId<S, Root>
  readonly __schemaRoot?: Root | undefined
  /**
   * Exact staged component proof.
   */
  readonly proof: P
  /**
   * Staged relationship edges attached to the entity before spawn.
   */
  readonly relations: ReadonlyArray<StagedRelation<S, Root>>
}

/**
 * A read capability for an entity together with a proof of readable components.
 *
 * Query execution is the main source of `EntityRef` values.
 */
export interface EntityRef<S extends Schema.Any, out P extends ComponentProof, Root = unknown> {
  /**
   * Runtime tag for debugging and pattern matching.
   */
  readonly kind: "EntityRef"
  /**
   * The schema-bound entity identity.
   */
  readonly id: EntityId<S, Root>
  readonly __schemaRoot?: Root | undefined
  /**
   * The readable component proof attached to this access value.
   */
  readonly proof: P
}

/**
 * A read/write capability for an entity.
 *
 * `P` tracks readable components and `W` tracks the writable subset. This keeps
 * mutation capabilities explicit in query results.
 */
export interface EntityMut<
  S extends Schema.Any,
  out P extends ComponentProof,
  out W extends ComponentProof,
  Root = unknown
> {
  /**
   * Runtime tag for debugging and pattern matching.
   */
  readonly kind: "EntityMut"
  /**
   * The schema-bound entity identity.
   */
  readonly id: EntityId<S, Root>
  readonly __schemaRoot?: Root | undefined
  /**
   * The readable component proof attached to this access value.
   */
  readonly proof: P
  /**
   * The writable subset of the proof.
   */
  readonly writable: W
}

/**
 * Creates an opaque entity id from a runtime integer id.
 *
 * This is a low-level constructor used by the runtime and command system.
 * The `value` it stores is the stable per-runtime numeric identity exposed on
 * `EntityId`.
 */
export const makeEntityId = <S extends Schema.Any, Root = unknown>(value: number): EntityId<S, Root> =>
  ({
    schema: undefined as unknown as S,
    root: undefined as unknown as Root,
    kind: "EntityId",
    value
  }) as EntityId<S, Root>

/**
 * Creates a durable handle from a runtime entity id.
 *
 * This is a low-level constructor used by the bound `Game.Entity` helpers and
 * by runtime lookup resolution.
 */
export const makeHandle = <
  Root,
  Intent extends Descriptor<"component", string, any> | undefined = undefined
>(value: number): Handle<Root, Intent> =>
  ({
    root: undefined as unknown as Root,
    intent: undefined as unknown as Intent,
    kind: "EntityHandle",
    value
  }) as Handle<Root, Intent>

/**
 * Converts a current runtime id into an unqualified durable handle.
 *
 * Use this when you need a long-lived reference but do not want to assert any
 * intended component role. Resolve it later with `lookup.getHandle(...)`.
 *
 * The handle is storage-safe, not a proof of liveness. The entity may have
 * been despawned by the time it is resolved.
 *
 * @example
 * ```ts
 * const handle = Game.Entity.handle(entityId)
 * ```
 */
export const handle = <S extends Schema.Any, Root = unknown>(
  entityId: EntityId<S, Root>
): Handle<Root> => makeHandle<Root>(entityId.value)

/**
 * Converts a current runtime id into an intent-qualified durable handle.
 *
 * The extra intent does not prove the entity still has that component later.
 * It only forces resolution through a query that statically proves the
 * component is present.
 *
 * @example
 * ```ts
 * const handle = Game.Entity.handleAs(Player, playerId)
 * ```
 */
export const handleAs = <
  S extends Schema.Any,
  Root,
  D extends Descriptor<"component", string, any>
>(
  _intent: D,
  entityId: EntityId<S, Root>
): Handle<Root, D> => makeHandle<Root, D>(entityId.value)

/**
 * Creates a typed entity draft from an id and a proof.
 */
export const draft = <S extends Schema.Any, P extends ComponentProof, Root = unknown>(
  id: EntityId<S, Root>,
  proof: P,
  relations: ReadonlyArray<StagedRelation<S, Root>> = []
): EntityDraft<S, P, Root> => ({
  kind: "EntityDraft",
  id,
  __schemaRoot: undefined as unknown as Root,
  proof,
  relations
})

/**
 * Creates a read-only entity proof value.
 */
export const ref = <S extends Schema.Any, P extends ComponentProof, Root = unknown>(
  id: EntityId<S, Root>,
  proof: P
): EntityRef<S, P, Root> => ({
  kind: "EntityRef",
  id,
  __schemaRoot: undefined as unknown as Root,
  proof
})

/**
 * Creates a mutable entity proof value.
 */
export const mut = <S extends Schema.Any, P extends ComponentProof, W extends ComponentProof, Root = unknown>(
  id: EntityId<S, Root>,
  proof: P,
  writable: W
): EntityMut<S, P, W, Root> => ({
  kind: "EntityMut",
  id,
  __schemaRoot: undefined as unknown as Root,
  proof,
  writable
})
