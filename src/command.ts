/**
 * Deferred command builders and typed entity-draft helpers.
 *
 * Commands keep mutation explicit by staging world writes as values that are
 * flushed later by schedule boundaries.
 *
 * @example
 * ```ts
 * const draft = Game.Command.spawnWithMixed(
 *   Game.Command.entryRaw(Position, { x: 8, y: 12 }),
 *   Game.Command.entry(Player, {})
 * )
 * ```
 *
 * @module command
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
import * as DescriptorModule from "./descriptor.ts"
import type { Descriptor } from "./descriptor.ts"
import * as Entity from "./entity.ts"
import type * as Relation from "./relation.ts"
import * as Result from "./Result.ts"
import type { Schema } from "./schema.ts"

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

  /**
   * Folds a readonly tuple of entries into one final component proof.
   */
  export type FoldEntries<
    Entries extends ReadonlyArray<readonly [Descriptor<"component", string, any>, unknown]>,
    P extends Entity.ComponentProof = {}
  > = Entries extends readonly [
    infer Head extends readonly [Descriptor<"component", string, any>, unknown],
    ...infer Tail extends Array<readonly [Descriptor<"component", string, any>, unknown]>
  ]
    ? FoldEntries<Tail, InsertEntry<P, Head>>
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

type ConstructedSchemaComponentDescriptor<S extends Schema.Any> =
  Extract<Schema.Components<S>[keyof Schema.Components<S>], DescriptorModule.ConstructedDescriptor<"component", string, any, any, any>>

/**
 * Any component entry accepted by a schema-aware command API.
 */
export type SchemaEntry<S extends Schema.Any> = Entry<SchemaComponentDescriptor<S>>

export type MixedEntry<S extends Schema.Any> = SchemaEntry<S> | Result.Result<SchemaEntry<S>, any>

type ResultValue<T> =
  [T] extends [Result.Result<infer Value extends readonly [Descriptor<"component", string, any>, unknown], any>]
    ? Value
    : never

type MixedEntryValue<T> =
  [T] extends [Result.Result<infer Value extends readonly [Descriptor<"component", string, any>, unknown], any>]
    ? Value
    : [T] extends [readonly [Descriptor<"component", string, any>, unknown]]
      ? T
      : never

export type FoldResultEntries<
  Entries extends ReadonlyArray<Result.Result<readonly [Descriptor<"component", string, any>, unknown], any>>,
  P extends Entity.ComponentProof = {}
> = Entries extends readonly [
  infer Head extends Result.Result<readonly [Descriptor<"component", string, any>, unknown], any>,
  ...infer Tail extends Array<Result.Result<readonly [Descriptor<"component", string, any>, unknown], any>>
]
  ? FoldResultEntries<Tail, Draft.InsertEntry<P, ResultValue<Head>>>
  : P

export type ResultEntryErrors<
  Entries extends ReadonlyArray<Result.Result<readonly [Descriptor<"component", string, any>, unknown], any>>
> = {
  readonly [K in keyof Entries]:
    Entries[K] extends Result.Result<any, infer Error> ? Error | null : never
}

export type MixedEntryErrors<
  Entries extends ReadonlyArray<MixedEntry<any>>
> = {
  readonly [K in keyof Entries]:
    Entries[K] extends Result.Result<any, infer Error> ? Error | null : null
}

type SuccessfulResultEntries<
  Entries extends ReadonlyArray<Result.Result<SchemaEntry<any>, any>>
> = Extract<{
  readonly [K in keyof Entries]: ResultValue<Entries[K]>
}, ReadonlyArray<SchemaEntry<any>>>

type SuccessfulMixedEntries<
  Entries extends ReadonlyArray<MixedEntry<any>>
> = Extract<{
  readonly [K in keyof Entries]: MixedEntryValue<Entries[K]>
}, ReadonlyArray<SchemaEntry<any>>>

export type FoldMixedEntries<
  Entries extends ReadonlyArray<MixedEntry<any>>,
  P extends Entity.ComponentProof = {}
> = Entries extends readonly [
  infer Head extends MixedEntry<any>,
  ...infer Tail extends Array<MixedEntry<any>>
]
  ? FoldMixedEntries<Tail, Draft.InsertEntry<P, MixedEntryValue<Head>>>
  : P

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
 * This stays intentionally small so the public API can remain type-safe while
 * the runtime uses simple mutable internals.
 */
export interface InternalWorld<S extends Schema.Any> {
  /**
   * Allocates a fresh entity id.
   */
  readonly nextEntityId: () => Entity.EntityId<S, any>
  /**
   * Retrieves or creates the component storage map for an entity.
   */
  readonly ensureEntityStore: (id: Entity.EntityId<S, any>) => Map<symbol, unknown>
  /**
   * Removes an entity from storage.
   */
  readonly destroyEntity: (id: Entity.EntityId<S, any>) => void
  /**
   * Removes a component from an entity.
   */
  readonly removeComponent: (id: Entity.EntityId<S, any>, descriptor: Descriptor.Any) => void
  /**
   * Writes a component on an entity, recording lifecycle semantics precisely.
   */
  readonly writeComponent: (id: Entity.EntityId<S, any>, descriptorKey: Descriptor<"component", string, any>, value: unknown) => void
  /**
   * Writes a world-level resource or state value.
   */
  readonly writeResource: (descriptor: Descriptor.Any, value: unknown) => void
  /**
   * Appends an event payload to the event queue for a descriptor.
   */
  readonly appendEvent: (descriptor: Descriptor.Any, value: unknown) => void
  /**
   * Attempts to attach one relation edge between two live entities.
   */
  readonly tryRelate: (
    id: Entity.EntityId<S, any>,
    relation: Relation.Relation.Any,
    target: Entity.EntityId<S, any>
  ) => Relation.Relation.Result<void, Relation.Relation.MutationError>
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
  ) => Relation.Relation.Result<void, Relation.Relation.MutationError>
}

/**
 * Starts a staged entity definition.
 *
 * Use this inside a system to build an entity with an exact compile-time
 * component proof before the spawn command is queued.
 */
export const spawn = <S extends Schema.Any, Root = unknown>(): Entity.EntityDraft<S, {}, Root> =>
  Entity.draft(Entity.makeEntityId<S, Root>(-1), {})

/**
 * Creates a typed component entry.
 *
 * This helper is optional, but it gives a named constructor for the flat
 * variadic APIs when plain tuple literals feel too bare.
 */
export const entry = <D extends Descriptor<"component", string, any>>(
  descriptor: D,
  value: Descriptor.Value<D>
): Entry<D> => [descriptor, value]

export const entryResult = <D extends Descriptor<"component", string, any>, Error>(
  descriptor: D,
  result: Result.Result<Descriptor.Value<D>, Error>
): Result.Result<Entry<D>, Error> =>
  result.ok
    ? Result.success([descriptor, result.value] as Entry<D>)
    : Result.failure(result.error)

/**
 * Creates a typed component entry by validating raw input through a
 * constructed descriptor.
 *
 * @example
 * ```ts
 * const position = Game.Command.entryRaw(Position, { x: 10, y: 20 })
 * ```
 */
export const entryRaw = <D extends DescriptorModule.ConstructedDescriptor<"component", string, any, any, any>>(
  descriptor: D,
  raw: Descriptor.Raw<D>
): Result.Result<Entry<D>, Descriptor.ConstructionError<D>> => {
  return entryResult(descriptor, DescriptorModule.constructorOf(descriptor)!.result(raw) as Result.Result<Descriptor.Value<D>, Descriptor.ConstructionError<D>>)
}

/**
 * Adds a component to an entity draft and returns a more precise draft type.
 *
 * This is the command-building equivalent of a typed builder pattern: each call
 * enriches the proof carried by the draft.
 */
export const insert = <
  S extends Schema.Any,
  P extends Entity.ComponentProof,
  D extends Descriptor<"component", string, any>,
  Root = unknown
>(
  draft: Entity.EntityDraft<S, P, Root>,
  descriptor: D,
  value: Descriptor.Value<D>
): Entity.EntityDraft<S, Draft.Insert<P, Descriptor.Name<D>, Descriptor.Value<D>>, Root> =>
  Entity.draft(draft.id, {
    ...(draft.proof as object),
    [descriptor.name]: value
  } as Draft.Insert<P, Descriptor.Name<D>, Descriptor.Value<D>>)

/**
 * Adds multiple components to an entity draft in one flat call.
 *
 * This preserves the same exact proof precision as repeated `insert(...)`
 * calls, but folds the proof internally instead of forcing users to nest
 * builders manually.
 */
export const insertMany = <
  S extends Schema.Any,
  P extends Entity.ComponentProof,
  Root = unknown,
  const Entries extends ReadonlyArray<SchemaEntry<S>> = ReadonlyArray<SchemaEntry<S>>
>(
  draft: Entity.EntityDraft<S, P, Root>,
  ...entries: Entries
): Entity.EntityDraft<S, Draft.FoldEntries<Entries, P>, Root> => {
  let current: Entity.EntityDraft<S, Entity.ComponentProof, Root> = draft
  for (const [descriptor, value] of entries) {
    current = insert(current, descriptor, value)
  }
  return current as Entity.EntityDraft<S, Draft.FoldEntries<Entries, P>, Root>
}

export const insertResult = <
  S extends Schema.Any,
  P extends Entity.ComponentProof,
  D extends Descriptor<"component", string, any>,
  Error = never,
  Root = unknown
>(
  draft: Entity.EntityDraft<S, P, Root>,
  result: Result.Result<Entry<D>, Error>
): Result.Result<Entity.EntityDraft<S, Draft.Insert<P, Descriptor.Name<D>, Descriptor.Value<D>>, Root>, Error> =>
  result.ok
    ? Result.success(insert(draft, result.value[0], result.value[1]) as Entity.EntityDraft<S, Draft.Insert<P, Descriptor.Name<D>, Descriptor.Value<D>>, Root>)
    : Result.failure(result.error)

/**
 * Inserts one raw component value into a draft through a constructed
 * descriptor.
 *
 * @example
 * ```ts
 * const updated = Game.Command.insertRaw(
 *   Game.Command.spawn(),
 *   Position,
 *   { x: 12, y: 18 }
 * )
 * ```
 */
export const insertRaw = <
  S extends Schema.Any,
  P extends Entity.ComponentProof,
  D extends DescriptorModule.ConstructedDescriptor<"component", string, any, any, any>,
  Root = unknown
>(
  draft: Entity.EntityDraft<S, P, Root>,
  descriptor: D,
  raw: Descriptor.Raw<D>
): Result.Result<Entity.EntityDraft<S, Draft.Insert<P, Descriptor.Name<D>, Descriptor.Value<D>>, Root>, Descriptor.ConstructionError<D>> =>
  insertResult(draft, entryRaw(descriptor, raw))

/**
 * Stages one outgoing relation edge on an entity draft.
 *
 * Drafts stay pure: this only records intent so the runtime can attempt to
 * attach the relation when the spawn command is flushed.
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
  Entity.draft(draft.id, draft.proof, [
    ...draft.relations,
    {
      relation,
      target
    }
  ])

/**
 * Starts a staged entity definition and inserts multiple components at once.
 *
 * This is the recommended authoring API for new entity drafts because it keeps
 * the exact proof typing without the visual noise of nested `insert(...)`
 * chains.
 *
 * Reset and restart systems should prefer this helper when rebuilding world
 * content after a transition boundary, because it keeps respawn logic flat and
 * explicit.
 *
 * This is also the normal bootstrap/setup path for initial world content:
 * build one typed draft with `spawnWith(...)`, then queue it through
 * `commands.spawn(...)` and commit it later at the schedule's
 * `applyDeferred()` boundary.
 *
 * When the same entity shape appears more than once, the normal scaling path
 * is to extract a small local draft factory that just returns
 * `Game.Command.spawnWith(...)`. Keep spawning explicit through
 * `commands.spawn(...)`.
 *
 * @example
 * ```ts
 * const SetupSystem = Game.System("Setup", {}, ({ commands }) =>
 *   Fx.sync(() => {
 *     commands.spawn(
 *       Game.Command.spawnWith(
 *         [Position, { x: 0, y: 0 }],
 *         [Velocity, { x: 1, y: 0 }]
 *       )
 *     )
 *   })
 * )
 *
 * const makeProjectileDraft = (x: number, y: number) =>
 *   Game.Command.spawnWith(
 *     [Position, { x, y }],
 *     [Velocity, { x: 4, y: 0 }]
 *   )
 * ```
 */
export const spawnWith = <
  S extends Schema.Any,
  Root = unknown,
  const Entries extends ReadonlyArray<SchemaEntry<S>> = ReadonlyArray<SchemaEntry<S>>
>(
  ...entries: Entries
): Entity.EntityDraft<S, Draft.FoldEntries<Entries>, Root> =>
  insertMany(spawn<S, Root>(), ...entries)

export const spawnWithResult = <
  S extends Schema.Any,
  const Entries extends ReadonlyArray<Result.Result<SchemaEntry<S>, any>>,
  Root = unknown
>(
  ...entries: Entries
): Result.Result<Entity.EntityDraft<S, FoldResultEntries<Entries>, Root>, ResultEntryErrors<Entries>> => {
  const normalized = [] as Array<SchemaEntry<S>>
  const errors = [] as Array<unknown>
  let hasFailure = false

  for (const entry of entries) {
    if (entry.ok) {
      normalized.push(entry.value)
      errors.push(null)
      continue
    }
    hasFailure = true
    errors.push(entry.error)
  }

  if (hasFailure) {
    return Result.failure(errors as ResultEntryErrors<Entries>)
  }

  const successfulEntries = normalized as unknown as SuccessfulResultEntries<Entries> as ReadonlyArray<SchemaEntry<S>>
  return Result.success(
    spawnWith<S, Root, typeof successfulEntries>(...(successfulEntries as typeof successfulEntries)) as Entity.EntityDraft<S, FoldResultEntries<Entries>, Root>
  )
}

/**
 * Starts a staged entity definition from a mix of plain validated entries and
 * explicit result-wrapped entries.
 *
 * @example
 * ```ts
 * const draft = Game.Command.spawnWithMixed(
 *   Game.Command.entryRaw(Position, { x: 8, y: 12 }),
 *   Game.Command.entry(Player, {})
 * )
 * ```
 */
export const spawnWithMixed = <
  S extends Schema.Any,
  const Entries extends ReadonlyArray<MixedEntry<S>>,
  Root = unknown
>(
  ...entries: Entries
): Result.Result<Entity.EntityDraft<S, FoldMixedEntries<Entries>, Root>, MixedEntryErrors<Entries>> => {
  const normalized = [] as Array<SchemaEntry<S>>
  const errors = [] as Array<unknown>
  let hasFailure = false

  for (const entry of entries) {
    if ("ok" in entry) {
      if (!entry.ok) {
        hasFailure = true
        errors.push(entry.error)
        continue
      }

      normalized.push(entry.value)
      errors.push(null)
      continue
    }

    normalized.push(entry)
    errors.push(null)
  }

  if (hasFailure) {
    return Result.failure(errors as MixedEntryErrors<Entries>)
  }

  const successfulEntries = normalized as unknown as SuccessfulMixedEntries<Entries> as ReadonlyArray<SchemaEntry<S>>
  return Result.success(
    spawnWith<S, Root, typeof successfulEntries>(...(successfulEntries as typeof successfulEntries)) as Entity.EntityDraft<S, FoldMixedEntries<Entries>, Root>
  )
}

/**
 * Public command API exposed to systems.
 *
 * This is the only mutation entrypoint in the runtime model. Systems can queue
 * spawns, inserts, despawns, resource writes, and emitted events, then the
 * runtime flushes them in order after the system effect completes.
 */
export interface CommandsApi<S extends Schema.Any, Root = unknown> {
  /**
   * Queues a staged entity for spawning and returns its stable runtime id.
   */
  readonly spawn: <P extends Entity.ComponentProof>(draft: Entity.EntityDraft<S, P, Root>) => Entity.EntityId<S, Root>
  /**
   * Queues a component insert on an existing entity.
   */
  readonly insert: <D extends Extract<Schema.Components<S>[keyof Schema.Components<S>], Descriptor<"component", string, any>>>(
    entity: Entity.EntityId<S, Root>,
    descriptor: D,
    value: Descriptor.Value<D>
  ) => Entity.EntityId<S, Root>
  /**
   * Queues multiple component inserts on an existing entity.
   */
  readonly insertMany: (
    entity: Entity.EntityId<S, Root>,
    ...entries: ReadonlyArray<SchemaEntry<S>>
  ) => Entity.EntityId<S, Root>
  /**
   * Queues an entity removal.
   */
  readonly despawn: (entity: Entity.EntityId<S, Root>) => void
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
   * Queues a resource write.
   */
  readonly setResource: <K extends keyof Schema.Resources<S>>(
    descriptor: Schema.Resources<S>[K],
    value: Schema.ResourceValue<S, K>
  ) => void
  /**
   * Queues an emitted event.
   */
  readonly emit: <K extends keyof Schema.Events<S>>(
    descriptor: Schema.Events<S>[K],
    value: Schema.EventValue<S, K>
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
          world.ensureEntityStore(id)
          for (const [key, value] of Object.entries(draft.proof)) {
            const descriptor = {
              kind: "component",
              name: key,
              key: Symbol.for(`bevy-ts/component/${key}`)
            } as Descriptor<"component", string, unknown>
            world.writeComponent(id, descriptor, value)
          }
          for (const stagedRelation of draft.relations) {
            world.tryRelate(id, stagedRelation.relation, stagedRelation.target)
          }
        }
      })
      return id
    },
    insert(entity, descriptor, value) {
      queue.push({
        tag: "insert",
        apply(world) {
          world.ensureEntityStore(entity)
          world.writeComponent(entity, descriptor, value)
        }
      })
      return entity
    },
    insertMany(entity, ...entries) {
      queue.push({
        tag: "insertMany",
        apply(world) {
          world.ensureEntityStore(entity)
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
    setResource(descriptor, value) {
      queue.push({
        tag: "resource",
        apply(world) {
          world.writeResource(descriptor, value)
        }
      })
    },
    emit(descriptor, value) {
      queue.push({
        tag: "event",
        apply(world) {
          world.appendEvent(descriptor, value)
        }
      })
    },
    flush() {
      return queue.splice(0, queue.length)
    }
  }
}
