import type { Descriptor } from "./descriptor.ts"
import * as Entity from "./entity.ts"
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

/**
 * Any component entry accepted by a schema-aware command API.
 */
export type SchemaEntry<S extends Schema.Any> = Entry<SchemaComponentDescriptor<S>>

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
  readonly nextEntityId: () => Entity.EntityId<S>
  /**
   * Retrieves or creates the component storage map for an entity.
   */
  readonly ensureEntityStore: (id: Entity.EntityId<S>) => Map<symbol, unknown>
  /**
   * Removes an entity from storage.
   */
  readonly destroyEntity: (id: Entity.EntityId<S>) => void
  /**
   * Removes a component from an entity.
   */
  readonly removeComponent: (id: Entity.EntityId<S>, descriptor: Descriptor.Any) => void
  /**
   * Writes a world-level resource or state value.
   */
  readonly writeResource: (descriptor: Descriptor.Any, value: unknown) => void
  /**
   * Appends an event payload to the event queue for a descriptor.
   */
  readonly appendEvent: (descriptor: Descriptor.Any, value: unknown) => void
}

/**
 * Starts a staged entity definition.
 *
 * Use this inside a system to build an entity with an exact compile-time
 * component proof before the spawn command is queued.
 */
export const spawn = <S extends Schema.Any>(): Entity.EntityDraft<S, {}> =>
  Entity.draft(Entity.makeEntityId<S>(-1), {})

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

/**
 * Adds a component to an entity draft and returns a more precise draft type.
 *
 * This is the command-building equivalent of a typed builder pattern: each call
 * enriches the proof carried by the draft.
 */
export const insert = <
  S extends Schema.Any,
  P extends Entity.ComponentProof,
  D extends Descriptor<"component", string, any>
>(
  draft: Entity.EntityDraft<S, P>,
  descriptor: D,
  value: Descriptor.Value<D>
): Entity.EntityDraft<S, Draft.Insert<P, Descriptor.Name<D>, Descriptor.Value<D>>> =>
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
  const Entries extends ReadonlyArray<SchemaEntry<S>> = ReadonlyArray<SchemaEntry<S>>
>(
  draft: Entity.EntityDraft<S, P>,
  ...entries: Entries
): Entity.EntityDraft<S, Draft.FoldEntries<Entries, P>> => {
  let current: Entity.EntityDraft<S, Entity.ComponentProof> = draft
  for (const [descriptor, value] of entries) {
    current = insert(current, descriptor, value)
  }
  return current as Entity.EntityDraft<S, Draft.FoldEntries<Entries, P>>
}

/**
 * Starts a staged entity definition and inserts multiple components at once.
 *
 * This is the recommended authoring API for new entity drafts because it keeps
 * the exact proof typing without the visual noise of nested `insert(...)`
 * chains.
 */
export const spawnWith = <
  S extends Schema.Any,
  const Entries extends ReadonlyArray<SchemaEntry<S>> = ReadonlyArray<SchemaEntry<S>>
>(
  ...entries: Entries
): Entity.EntityDraft<S, Draft.FoldEntries<Entries>> =>
  insertMany(spawn<S>(), ...entries)

/**
 * Public command API exposed to systems.
 *
 * This is the only mutation entrypoint in the runtime model. Systems can queue
 * spawns, inserts, despawns, resource writes, and emitted events, then the
 * runtime flushes them in order after the system effect completes.
 */
export interface CommandsApi<S extends Schema.Any> {
  /**
   * Queues a staged entity for spawning and returns its stable runtime id.
   */
  readonly spawn: <P extends Entity.ComponentProof>(draft: Entity.EntityDraft<S, P>) => Entity.EntityId<S>
  /**
   * Queues a component insert on an existing entity.
   */
  readonly insert: <D extends Schema.Components<S>[keyof Schema.Components<S>]>(
    entity: Entity.EntityId<S>,
    descriptor: D,
    value: Descriptor.Value<D>
  ) => Entity.EntityId<S>
  /**
   * Queues multiple component inserts on an existing entity.
   */
  readonly insertMany: (
    entity: Entity.EntityId<S>,
    ...entries: ReadonlyArray<SchemaEntry<S>>
  ) => Entity.EntityId<S>
  /**
   * Queues an entity removal.
   */
  readonly despawn: (entity: Entity.EntityId<S>) => void
  /**
   * Queues a component removal on an existing entity.
   */
  readonly remove: <D extends Schema.Components<S>[keyof Schema.Components<S>]>(
    entity: Entity.EntityId<S>,
    descriptor: D
  ) => Entity.EntityId<S>
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
export const makeCommands = <S extends Schema.Any>(
  allocateId: () => Entity.EntityId<S>
): CommandsApi<S> => {
  /**
   * The per-system command buffer.
   *
   * Each system gets a fresh queue so command application happens only after
   * the system effect completes.
   */
  const queue: Array<DeferredCommand<S>> = []

  return {
    spawn<P extends Entity.ComponentProof>(draft: Entity.EntityDraft<S, P>): Entity.EntityId<S> {
      const id = allocateId()
      queue.push({
        tag: "spawn",
        apply(world) {
          const store = world.ensureEntityStore(id)
          for (const [key, value] of Object.entries(draft.proof)) {
            store.set(Symbol.for(`bevy-ts/component/${key}`), value)
          }
        }
      })
      return id
    },
    insert(entity, descriptor, value) {
      queue.push({
        tag: "insert",
        apply(world) {
          world.ensureEntityStore(entity).set(descriptor.key, value)
        }
      })
      return entity
    },
    insertMany(entity, ...entries) {
      queue.push({
        tag: "insertMany",
        apply(world) {
          const store = world.ensureEntityStore(entity)
          for (const [descriptor, value] of entries) {
            store.set(descriptor.key, value)
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
