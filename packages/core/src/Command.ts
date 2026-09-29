/**
 * Deferred command builders and typed entity-draft helpers.
 *
 * This module exists for the part of ECS work that wants to describe mutation
 * now and make it visible later. Systems often decide that an entity should be
 * spawned, despawned, or extended while iterating queries, but the actual
 * world change is intentionally deferred until the schedule reaches
 * `Game.Schedule.applyDeferred()`.
 *
 * `Command` is therefore the write-side companion to `Query`:
 *
 * - queries prove what exists right now
 * - commands stage what should exist after the next deferred boundary
 *
 * Reach for this module when gameplay logic needs explicit world mutation,
 * especially for setup, reset, projectiles, pickups, despawns, and relation
 * edits that should stay schedule-visible instead of happening implicitly.
 *
 * @example
 * ```ts
 * // Build drafts as values so spawn intent stays explicit inside the system.
 * const EnemyWave = Game.System("EnemyWave", {}, ({ commands }) => {
 *   const enemy = Game.Command.spawn(
 *     // Validate raw authored input through the constructed descriptor.
 *     Game.Command.entryRaw(Position, { x: 96, y: 32 }),
 *     // Add already-validated marker or config components directly.
 *     [Enemy, {}],
 *     [Health, 3]
 *   )
 *
 *   if (!enemy.ok) {
 *     return
 *   }
 *
 *   // Queue the world write now. The entity becomes visible later.
 *   commands.spawn(enemy.value)
 * })
 *
 * // Make the deferred mutation boundary part of the schedule itself.
 * const update = Game.Schedule(
 *   EnemyWave,
 *   Game.Schedule.applyDeferred(),
 *   observeSpawnedEnemies
 * )
 * ```
 *
 * @module Command
 * @docGroup core
 *
 * @groupDescription Namespaces
 * Type-level draft helpers that derive exact component proofs while command values are still staged.
 *
 * @groupDescription Interfaces
 * Structural command-side contracts used by the deferred mutation layer.
 *
 * @groupDescription Type Aliases
 * Explicit entry, error, and proof-folding shapes used by staged command builders.
 *
 * @groupDescription Functions
 * Public command builders that stage entity and component mutations as explicit values.
 */
import * as DescriptorModule from "./Descriptor.ts"
import type { Descriptor } from "./Descriptor.ts"
import * as Entity from "./Entity.ts"
import type * as EntityScope from "./EntityScope.ts"
import type * as Relation from "./Relation.ts"
import * as Result from "./Result.ts"
import type { Schema } from "./Schema.ts"

/**
 * Type-level helpers for staged entity construction.
 *
 * These helpers let command builders carry exact component proofs before the
 * draft is flushed into the runtime world.
 */
export namespace Draft {
  /**
   * Adds or replaces a component proof on an entity draft.
   *
   * This is used internally by typed draft builders so each staged insert
   * returns a new draft with a more precise component set.
   */
  export type Insert<
    P extends Entity.ComponentProof,
    Key extends string,
    Value
  > = Omit<P, Key> & {
    readonly [K in Key]: Value
  }

  /**
   * Adds the proof implied by one descriptor/value entry.
   */
  export type InsertEntry<
    P extends Entity.ComponentProof,
    Entry extends readonly [Descriptor<"component", string, any>, unknown]
  > = Entry extends readonly [infer D extends Descriptor<"component", string, any>, infer _Value]
    ? Insert<P, Descriptor.Name<D>, Descriptor.Value<D>>
    : P
}

/**
 * A typed descriptor/value pair used by the flat command authoring APIs.
 */
export type Entry<D extends Descriptor<"component", string, any>> = readonly [D, Descriptor.Value<D>]

/**
 * Extracts the component-descriptor union from a schema.
 */
type SchemaComponentDescriptor<S extends Schema.Any> =
  Extract<Schema.Components<S>[keyof Schema.Components<S>], Descriptor<"component", string, any>>

/**
 * Pairs each descriptor of a union with its own value type. Building one pair
 * from the whole union instead would accept any descriptor with any value of
 * the schema, e.g. `[Health, "a name"]`.
 */
type EntryOf<D> = D extends Descriptor<"component", string, any> ? Entry<D> : never

/**
 * Any component entry accepted by a schema-aware command API: a descriptor of
 * the schema with a value of that descriptor.
 */
export type SchemaEntry<S extends Schema.Any> = EntryOf<SchemaComponentDescriptor<S>>

/**
 * One entry accepted by `spawn(...)` and `insert(...)`: a plain descriptor/value
 * pair, or a `Result` of one (from `entryRaw(...)` or `entryResult(...)`).
 */
export type SpawnEntry<S extends Schema.Any> = SchemaEntry<S> | Result.Result<SchemaEntry<S>, any>

type EntryValue<T> =
  [T] extends [Result.Result<infer Value extends readonly [Descriptor<"component", string, any>, unknown], any>]
    ? Value
    : [T] extends [readonly [Descriptor<"component", string, any>, unknown]]
      ? T
      : never

/**
 * Folds entries into the component proof of the resulting draft.
 */
export type FoldEntries<
  Entries extends ReadonlyArray<SpawnEntry<any>>,
  P extends Entity.ComponentProof = {}
> = Entries extends readonly [
  infer Head extends SpawnEntry<any>,
  ...infer Tail extends Array<SpawnEntry<any>>
]
  ? FoldEntries<Tail, Draft.InsertEntry<P, EntryValue<Head>>>
  : P

/**
 * Per-entry failures, aligned with the entries: `null` for entries that
 * succeeded or could not fail.
 */
export type EntryErrors<Entries extends ReadonlyArray<SpawnEntry<any>>> = {
  readonly [K in keyof Entries]:
    Entries[K] extends Result.Result<any, infer Error> ? Error | null : null
}

/**
 * The draft produced from `Entries`, wrapped in a `Result` exactly when at
 * least one entry is a `Result` and can therefore fail.
 */
export type DraftFor<
  S extends Schema.Any,
  Entries extends ReadonlyArray<SpawnEntry<S>>,
  P extends Entity.ComponentProof,
  Root
> = [Extract<Entries[number], { readonly ok: boolean }>] extends [never]
  ? Entity.EntityDraft<S, FoldEntries<Entries, P>, Root>
  : Result.Result<Entity.EntityDraft<S, FoldEntries<Entries, P>, Root>, EntryErrors<Entries>>

/**
 * A deferred world mutation.
 *
 * Systems never mutate the world directly. Instead they build command values
 * that are applied during an explicit flush phase.
 */
export type DeferredCommand<S extends Schema.Any> = {
  /**
   * A small runtime tag that makes command traces and debugging easier.
   */
  readonly tag: string
  /**
   * Applies the deferred mutation to the internal world.
   */
  readonly apply: (world: InternalWorld<S>) => void
}

/**
 * Minimal internal world surface required to apply deferred commands.
 *
 * Commands addressed to entities that no longer exist are ignored: a despawn
 * queued earlier in the same flush wins over later inserts or removals.
 */
export interface InternalWorld<S extends Schema.Any> {
  /**
   * Creates the entity for an id reserved by `commands.spawn(...)` with its
   * staged components.
   */
  readonly spawnEntity: (id: Entity.EntityId<S, any>, components: ReadonlyArray<Entity.StagedComponent>) => void
  /**
   * Removes an entity and its outgoing and incoming relations.
   */
  readonly destroyEntity: (id: Entity.EntityId<S, any>) => void
  /**
   * Assigns one live entity to an ownership scope.
   */
  readonly assignEntityScope: (
    id: Entity.EntityId<S, any>,
    scope: EntityScope.EntityScope.Any
  ) => void
  /**
   * Removes every live entity currently owned by one scope.
   */
  readonly destroyEntityScope: (scope: EntityScope.EntityScope.Any) => void
  /**
   * Removes a component from a live entity.
   */
  readonly removeComponent: (id: Entity.EntityId<S, any>, descriptor: Descriptor<"component", string, any>) => void
  /**
   * Inserts or replaces a component on a live entity.
   */
  readonly writeComponent: (id: Entity.EntityId<S, any>, descriptor: Descriptor<"component", string, any>, value: unknown) => void
  /**
   * Attempts to attach one relation edge between two live entities.
   */
  readonly tryRelate: (
    id: Entity.EntityId<S, any>,
    relation: Relation.Relation.Any,
    target: Entity.EntityId<S, any>
  ) => Result.Result<void, Relation.Relation.MutationError>
  /**
   * Removes one outgoing relation from an entity when present.
   */
  readonly unrelate: (
    id: Entity.EntityId<S, any>,
    relation: Relation.Relation.Any
  ) => void
  /**
   * Reorders the existing children of one hierarchy parent.
   */
  readonly reorderChildren: (
    id: Entity.EntityId<S, any>,
    relation: Relation.Relation.Hierarchy,
    children: ReadonlyArray<Entity.EntityId<S, any>>
  ) => Result.Result<void, Relation.Relation.MutationError>
}

/**
 * Placeholder id carried by drafts; `commands.spawn(...)` reserves the real id.
 */
const unspawnedId = Entity.makeEntityId<any, any>(-1)

/**
 * Creates a typed component entry.
 */
export const entry = <D extends Descriptor<"component", string, any>>(
  descriptor: D,
  value: Descriptor.Value<D>
): Entry<D> => [descriptor, value]

/**
 * Lifts an already validated value into an entry result, keeping the failure
 * visible to `spawn(...)` / `insert(...)`.
 */
export const entryResult = <D extends Descriptor<"component", string, any>, Error>(
  descriptor: D,
  result: Result.Result<Descriptor.Value<D>, Error>
): Result.Result<Entry<D>, Error> =>
  result.ok
    ? Result.success([descriptor, result.value] as Entry<D>)
    : Result.failure(result.error)

/**
 * Validates raw input through a constructed descriptor and returns an entry
 * result.
 *
 * @example
 * ```ts
 * const draft = Game.Command.spawn(
 *   Game.Command.entryRaw(Position, { x: 8, y: 12 }),
 *   [Player, {}]
 * )
 * if (!draft.ok) return
 * commands.spawn(draft.value)
 * ```
 */
export const entryRaw = <D extends DescriptorModule.ConstructedDescriptor<"component", string, any, any, any>>(
  descriptor: D,
  raw: Descriptor.Raw<D>
): Result.Result<Entry<D>, Descriptor.ConstructionError<D>> =>
  entryResult(descriptor, DescriptorModule.constructorOf(descriptor).result(raw) as Result.Result<Descriptor.Value<D>, Descriptor.ConstructionError<D>>)

/**
 * Adds entries to a draft. Plain entries return the new draft; if any entry is
 * a `Result`, the draft is returned as a `Result` whose error lists every
 * entry's failure (or `null`).
 */
export const insert = <
  S extends Schema.Any,
  P extends Entity.ComponentProof,
  Root,
  const Entries extends ReadonlyArray<SpawnEntry<S>>
>(
  draft: Entity.EntityDraft<S, P, Root>,
  ...entries: Entries
): DraftFor<S, Entries, P, Root> =>
  build(draft.id, { ...draft.proof }, [...draft.components], draft.relations, entries) as DraftFor<S, Entries, P, Root>

/**
 * Shared draft builder. Plain entries take a fast path; the first `Result`
 * entry switches to collecting per-entry errors.
 */
const build = (
  id: Entity.EntityId<any, any>,
  proof: Record<string, unknown>,
  components: Array<Entity.StagedComponent>,
  relations: ReadonlyArray<Relation.StagedRelation<any, any>>,
  entries: ReadonlyArray<SpawnEntry<any>>
): Entity.EntityDraft<any, any, any> | Result.Result<Entity.EntityDraft<any, any, any>, ReadonlyArray<unknown>> => {
  let errors: Array<unknown> | undefined
  let failed = false
  for (let index = 0; index < entries.length; index++) {
    const candidate = entries[index]!
    let resolved: SchemaEntry<any>
    if (Array.isArray(candidate)) {
      resolved = candidate as SchemaEntry<any>
      errors?.push(null)
    } else {
      errors ??= new Array<unknown>(index).fill(null)
      const result = candidate as Result.Result<SchemaEntry<any>, unknown>
      if (!result.ok) {
        failed = true
        errors.push(result.error)
        continue
      }
      errors.push(null)
      resolved = result.value
    }
    proof[resolved[0].name] = resolved[1]
    components.push(resolved)
  }
  if (errors === undefined) {
    return Entity.draft(id, proof, components, relations)
  }
  return failed ? Result.failure(errors) : Result.success(Entity.draft(id, proof, components, relations))
}

/**
 * Starts a staged entity from component entries.
 *
 * Drafts are plain values: build them anywhere (including small factories),
 * then queue them with `commands.spawn(...)`. Entries may be `[Descriptor,
 * value]` pairs or results from `entryRaw(...)`; see `insert(...)` for how
 * failures are reported.
 *
 * @example
 * ```ts
 * const makeBullet = (x: number, y: number) =>
 *   Game.Command.spawn([Position, { x, y }], [Velocity, { x: 0, y: -8 }])
 *
 * commands.spawn(makeBullet(10, 20))
 * ```
 */
export const spawn = <
  S extends Schema.Any,
  Root = unknown,
  const Entries extends ReadonlyArray<SpawnEntry<S>> = readonly []
>(
  ...entries: Entries
): DraftFor<S, Entries, {}, Root> =>
  build(unspawnedId, {}, [], noRelations, entries) as DraftFor<S, Entries, {}, Root>

const noRelations: ReadonlyArray<Relation.StagedRelation<any, any>> = []

/**
 * Stages one outgoing relation edge on an entity draft.
 *
 * Drafts stay pure: this only records intent so the runtime can attempt to
 * attach the relation when the spawn command is applied.
 */
export const relate = <
  S extends Schema.Any,
  P extends Entity.ComponentProof,
  R extends Relation.Relation.Any,
  Root = unknown
>(
  draft: Entity.EntityDraft<S, P, Root>,
  relation: R,
  target: Entity.EntityId<S, Root>
): Entity.EntityDraft<S, P, Root> =>
  Entity.draft(draft.id, draft.proof, draft.components, [
    ...draft.relations,
    {
      relation,
      target
    }
  ])

/**
 * Public command API exposed to systems.
 *
 * Commands are the structural mutation entrypoint: spawns, inserts, removals,
 * despawns, and relation edits. They are queued in order and applied only at
 * the next `applyDeferred()` (or `applyStateTransitions(...)`) schedule step.
 *
 * Resource and event writes are not commands: they go through the
 * `writeResource(...)` / `writeEvent(...)` access a system declares.
 */
export interface CommandsApi<S extends Schema.Any, Root = unknown> {
  /**
   * Queues a staged entity for spawning and returns its stable runtime id.
   */
  readonly spawn: <P extends Entity.ComponentProof>(draft: Entity.EntityDraft<S, P, Root>) => Entity.EntityId<S, Root>
  /**
   * Queues an entity spawn owned by one lifetime scope.
   *
   * Scoped entities can later be removed together with `despawnScope(...)`.
   */
  readonly spawnIn: <P extends Entity.ComponentProof>(
    scope: EntityScope.EntityScope<string, Root>,
    draft: Entity.EntityDraft<S, P, Root>
  ) => Entity.EntityId<S, Root>
  /**
   * Queues component inserts (or replacements) on an existing entity.
   *
   * Entries must already be valid; validate raw input with
   * `Game.Command.entryRaw(...)` first.
   */
  readonly insert: (
    entity: Entity.EntityId<S, Root>,
    ...entries: ReadonlyArray<SchemaEntry<S>>
  ) => Entity.EntityId<S, Root>
  /**
   * Queues an entity removal.
   */
  readonly despawn: (entity: Entity.EntityId<S, Root>) => void
  /**
   * Queues removal of every entity owned by one lifetime scope.
   */
  readonly despawnScope: (scope: EntityScope.EntityScope<string, Root>) => void
  /**
   * Queues a component removal on an existing entity.
   */
  readonly remove: <D extends Extract<Schema.Components<S>[keyof Schema.Components<S>], Descriptor<"component", string, any>>>(
    entity: Entity.EntityId<S, Root>,
    descriptor: D
  ) => Entity.EntityId<S, Root>
  /**
   * Queues one live relation mutation for deferred application.
   */
  readonly relate: <R extends Extract<Schema.Relations<S>[keyof Schema.Relations<S>], Relation.Relation.Any>>(
    entity: Entity.EntityId<S, Root>,
    relation: R,
    target: Entity.EntityId<S, Root>
  ) => void
  /**
   * Queues removal of one outgoing relation when present.
   */
  readonly unrelate: <R extends Extract<Schema.Relations<S>[keyof Schema.Relations<S>], Relation.Relation.Any>>(
    entity: Entity.EntityId<S, Root>,
    relation: R
  ) => void
  /**
   * Queues a hierarchy-only reorder of one parent's current children.
   */
  readonly reorderChildren: <R extends Extract<Schema.Relations<S>[keyof Schema.Relations<S>], Relation.Relation.Hierarchy>>(
    entity: Entity.EntityId<S, Root>,
    relation: R,
    children: ReadonlyArray<Entity.EntityId<S, Root>>
  ) => void
  /**
   * Drains the queued commands in insertion order.
   */
  readonly flush: () => ReadonlyArray<DeferredCommand<S>>
}

/**
 * Creates a fresh command queue for a system execution.
 *
 * The returned API is intentionally imperative for system authors, but all
 * mutations stay deferred until `flush()` is applied by the runtime.
 */
export const makeCommands = <S extends Schema.Any, Root = unknown>(
  allocateId: () => Entity.EntityId<S, Root>
): CommandsApi<S, Root> => {
  /**
   * The per-system command buffer.
   *
   * Each system gets a fresh queue so command application happens only after
   * the system effect completes.
   */
  const queue: Array<DeferredCommand<S>> = []

  return {
    spawn<P extends Entity.ComponentProof>(draft: Entity.EntityDraft<S, P, Root>): Entity.EntityId<S, Root> {
      const id = allocateId()
      queue.push({
        tag: "spawn",
        apply(world) {
          world.spawnEntity(id, draft.components)
          for (const stagedRelation of draft.relations) {
            world.tryRelate(id, stagedRelation.relation, stagedRelation.target)
          }
        }
      })
      return id
    },
    spawnIn<P extends Entity.ComponentProof>(
      scope: EntityScope.EntityScope<string, Root>,
      draft: Entity.EntityDraft<S, P, Root>
    ): Entity.EntityId<S, Root> {
      const id = allocateId()
      queue.push({
        tag: "spawnIn",
        apply(world) {
          world.spawnEntity(id, draft.components)
          world.assignEntityScope(id, scope)
          for (const stagedRelation of draft.relations) {
            world.tryRelate(id, stagedRelation.relation, stagedRelation.target)
          }
        }
      })
      return id
    },
    insert(entity, ...entries) {
      queue.push({
        tag: "insert",
        apply(world) {
          for (const [descriptor, value] of entries) {
            world.writeComponent(entity, descriptor, value)
          }
        }
      })
      return entity
    },
    despawn(entity) {
      queue.push({
        tag: "despawn",
        apply(world) {
          world.destroyEntity(entity)
        }
      })
    },
    despawnScope(scope) {
      queue.push({
        tag: "despawnScope",
        apply(world) {
          world.destroyEntityScope(scope)
        }
      })
    },
    remove(entity, descriptor) {
      queue.push({
        tag: "remove",
        apply(world) {
          world.removeComponent(entity, descriptor)
        }
      })
      return entity
    },
    relate(entity, relation, target) {
      queue.push({
        tag: "relate",
        apply(world) {
          world.tryRelate(entity, relation, target)
        }
      })
    },
    unrelate(entity, relation) {
      queue.push({
        tag: "unrelate",
        apply(world) {
          world.unrelate(entity, relation)
        }
      })
    },
    reorderChildren(entity, relation, children) {
      queue.push({
        tag: "reorderChildren",
        apply(world) {
          world.reorderChildren(entity, relation, children)
        }
      })
    },
    flush() {
      return queue.splice(0, queue.length)
    }
  }
}
