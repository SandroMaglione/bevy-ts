import * as Command from "./command.ts"
import type { Descriptor } from "./descriptor.ts"
import * as Entity from "./entity.ts"
import * as Fx from "./fx.ts"
import * as Query from "./query.ts"
import type { QueryMatch, ReadCell, WriteCell } from "./query.ts"
import * as Schedule from "./schedule.ts"
import type { ScheduleDefinition } from "./schedule.ts"
import type { Registry, Schema } from "./schema.ts"
import type {
  EventReadView,
  EventWriteView,
  QueryHandle,
  ResourceReadView,
  ResourceWriteView,
  StateReadView,
  StateWriteView,
  SystemContext,
  SystemDefinition
} from "./system.ts"

/**
 * The in-memory store used by the prototype runtime.
 *
 * Each entity id maps to descriptor-keyed component storage.
 */
type EntityStore = Map<number, Map<symbol, unknown>>

/**
 * The caller-facing initialization shape for one descriptor registry.
 *
 * Initialization is keyed by schema property names, not descriptor names. This
 * is the same key space exposed by `Schema.Resources<S>` and `Schema.States<S>`.
 */
type InitialRegistryValues<R extends Registry> = Partial<{
  readonly [K in keyof R]: Descriptor.Value<R[K]>
}>

/**
 * Seeds a descriptor-keyed runtime store from one schema registry.
 *
 * The public initialization API is keyed by schema property names, while the
 * runtime store is keyed by descriptor symbols. This helper is the only place
 * that converts between the two, so descriptor names can never drift into the
 * seeding path.
 */
const seedRegistryStore = <R extends Registry>(
  registry: R,
  initialValues: InitialRegistryValues<R> | undefined,
  target: Map<symbol, unknown>
): void => {
  if (!initialValues) {
    return
  }

  for (const [schemaKey, descriptor] of Object.entries(registry) as Array<[keyof R, R[keyof R]]>) {
    const initial = initialValues[schemaKey]
    if (initial !== undefined) {
      target.set(descriptor.key, initial)
    }
  }
}

/**
 * A loop-agnostic execution runtime.
 *
 * The runtime owns world state and services, but it does not own the outer game
 * loop. Call `runSchedule` or `tick` from any host you want.
 */
export interface Runtime<S extends Schema.Any, Services extends Record<string, unknown>> {
  /**
   * The closed schema this runtime was built for.
   */
  readonly schema: S
  /**
   * The host-provided service environment.
   */
  readonly services: Services
  /**
   * Runs one or more schedules as an initialization step.
   *
   * This is a semantic alias for a one-off bootstrap phase before entering the
   * repeating outer loop.
   */
  readonly initialize: (...schedules: ReadonlyArray<ScheduleDefinition<S>>) => void
  /**
   * Runs one schedule once.
   *
   * Deferred commands and events advance only at explicit schedule marker
   * steps, plus one final end-of-schedule apply/update pass for safety.
   */
  readonly runSchedule: (schedule: ScheduleDefinition<S>) => void
  /**
   * Runs multiple schedules in sequence.
   *
   * Because schedules are executed one after another, later schedules in the
   * same `tick(...)` call can observe the fully applied world changes and event
   * updates produced by earlier schedules.
   */
  readonly tick: (...schedules: ReadonlyArray<ScheduleDefinition<S>>) => void
}

/**
 * Creates a runtime for a fully built schema and a set of external services.
 *
 * This is the main integration point for embedding the ECS into another loop,
 * renderer, or host application.
 *
 * The runtime does not own the outer frame loop. It only owns ECS state plus
 * the host-provided services that systems are allowed to depend on.
 */
export const makeRuntime = <S extends Schema.Any, Services extends Record<string, unknown>>(options: {
  readonly schema: S
  readonly services: Services
  readonly resources?: Partial<{
    readonly [K in keyof Schema.Resources<S>]: Schema.ResourceValue<S, K>
  }>
  readonly states?: Partial<{
    readonly [K in keyof Schema.States<S>]: Schema.StateValue<S, K>
  }>
}): Runtime<S, Services> => {
  /**
   * Monotonic entity id counter.
   */
  let nextEntity = 1
  /**
   * Component storage indexed by runtime entity id.
   */
  const entities: EntityStore = new Map()
  /**
   * Descriptor-keyed world resource storage.
   */
  const resources = new Map<symbol, unknown>()
  /**
   * Descriptor-keyed world state storage.
   */
  const states = new Map<symbol, unknown>()
  /**
   * Descriptor-keyed readable event buffers for the current phase.
   */
  let readableEvents = new Map<symbol, Array<unknown>>()
  /**
   * Descriptor-keyed pending event buffers written before the next event update.
   */
  let pendingEvents = new Map<symbol, Array<unknown>>()

  /**
   * Seeds runtime resources from the host-provided initial values.
   */
  seedRegistryStore(options.schema.resources, options.resources, resources)

  /**
   * Seeds runtime states from the host-provided initial values.
   */
  seedRegistryStore(options.schema.states, options.states, states)

  /**
   * Internal world adapter used by deferred commands.
   */
  const internalWorld: Command.InternalWorld<S> = {
    nextEntityId() {
      const id = Entity.makeEntityId<S>(nextEntity)
      nextEntity += 1
      return id
    },
    ensureEntityStore(id) {
      const store = entities.get(id.value)
      if (store) {
        return store
      }
      const fresh = new Map<symbol, unknown>()
      entities.set(id.value, fresh)
      return fresh
    },
    destroyEntity(id) {
      entities.delete(id.value)
    },
    removeComponent(id, descriptor) {
      entities.get(id.value)?.delete(descriptor.key)
    },
    writeResource(descriptor, value) {
      if (descriptor.kind === "state") {
        states.set(descriptor.key, value)
        return
      }
      resources.set(descriptor.key, value)
    },
    appendEvent(descriptor, value) {
      const queue = pendingEvents.get(descriptor.key) ?? []
      queue.push(value)
      pendingEvents.set(descriptor.key, queue)
    }
  }

  /**
   * Creates a read-only cell view over an arbitrary storage source.
   */
  const makeReadCell = <T>(readValue: () => T): ReadCell<T> => ({
    get: readValue
  })

  /**
   * Creates a writable cell view over an arbitrary storage source.
   */
  const makeWriteCell = <T>(readValue: () => T, writeValue: (value: T) => void): WriteCell<T> => ({
    get: readValue,
    set: writeValue,
    update(f) {
      writeValue(f(readValue()))
    }
  })

  /**
   * Compiles a query spec into a runtime query handle.
   *
   * The handle performs filtering, builds typed cells, and attaches the
   * matching entity proof for each result.
   */
  const makeQueryHandle = <Q extends Query.Query.Any>(query: Q): QueryHandle<S, Q> => ({
    each() {
      const matches: Array<QueryMatch<S, Q>> = []
      for (const [idValue, store] of entities) {
        let include = true
        for (const descriptor of query.with) {
          if (!store.has(descriptor.key)) {
            include = false
            break
          }
        }
        if (!include) {
          continue
        }
        for (const descriptor of query.without) {
          if (store.has(descriptor.key)) {
            include = false
            break
          }
        }
        if (!include) {
          continue
        }

        const data = {} as Record<string, unknown>
        for (const [slot, access] of Object.entries(query.selection) as Array<[string, Q["selection"][keyof Q["selection"]]]>) {
          const descriptor = access.descriptor
          if (!store.has(descriptor.key)) {
            include = false
            break
          }
          if (access.mode === "read") {
            data[slot] = makeReadCell(() => store.get(descriptor.key) as never)
          } else {
            data[slot] = makeWriteCell(
              () => store.get(descriptor.key) as never,
              (value) => {
                store.set(descriptor.key, value)
              }
            )
          }
        }
        if (!include) {
          continue
        }

        const readProof = Object.fromEntries(
          (Object.entries(query.selection) as Array<[string, Q["selection"][keyof Q["selection"]]]>)
            .map(([slot, access]) => [slot, store.get(access.descriptor.key)])
        )
        const writeProof = Object.fromEntries(
          (Object.entries(query.selection) as Array<[string, Q["selection"][keyof Q["selection"]]]>)
            .filter(([, access]) => access.mode === "write")
            .map(([slot, access]) => [slot, store.get(access.descriptor.key)])
        )
        const entityId = Entity.makeEntityId<S>(idValue)
        matches.push({
          entity: Object.keys(writeProof).length > 0
            ? Entity.mut(entityId, readProof, writeProof)
            : Entity.ref(entityId, readProof),
          data
        } as QueryMatch<S, Q>)
      }
      return matches
    },
    get(entityId) {
      const match = lookup.get(entityId, query)
      return match
    },
    single() {
      const matches = this.each()
      if (matches.length === 0) {
        return Query.failure(Query.noEntitiesError())
      }
      if (matches.length > 1) {
        return Query.failure(Query.multipleEntitiesError(matches.length))
      }
      return Query.success(matches[0]!)
    }
  })

  const lookup = {
    get<Q extends Query.Query.Any>(entityId: Entity.EntityId<S>, query: Q): Query.Query.Result<QueryMatch<S, Q>, Query.Query.LookupError> {
      const store = entities.get(entityId.value)
      if (!store) {
        return Query.failure(Query.missingEntityError(entityId.value))
      }
      for (const descriptor of query.with) {
        if (!store.has(descriptor.key)) {
          return Query.failure(Query.queryMismatchError(entityId.value))
        }
      }
      for (const descriptor of query.without) {
        if (store.has(descriptor.key)) {
          return Query.failure(Query.queryMismatchError(entityId.value))
        }
      }
      const data = {} as Record<string, unknown>
      for (const [slot, access] of Object.entries(query.selection) as Array<[string, Q["selection"][keyof Q["selection"]]]>) {
        if (!store.has(access.descriptor.key)) {
          return Query.failure(Query.queryMismatchError(entityId.value))
        }
        data[slot] = access.mode === "read"
          ? makeReadCell(() => store.get(access.descriptor.key) as never)
          : makeWriteCell(
              () => store.get(access.descriptor.key) as never,
              (value) => {
                store.set(access.descriptor.key, value)
              }
            )
      }
      const readProof = Object.fromEntries(
        (Object.entries(query.selection) as Array<[string, Q["selection"][keyof Q["selection"]]]>)
          .map(([slot, access]) => [slot, store.get(access.descriptor.key)])
      )
      const writeProof = Object.fromEntries(
        (Object.entries(query.selection) as Array<[string, Q["selection"][keyof Q["selection"]]]>)
          .filter(([, access]) => access.mode === "write")
          .map(([slot, access]) => [slot, store.get(access.descriptor.key)])
      )
      return Query.success({
        entity: Object.keys(writeProof).length > 0
          ? Entity.mut(entityId, readProof, writeProof)
          : Entity.ref(entityId, readProof),
        data
      } as QueryMatch<S, Q>)
    }
  } satisfies import("./system.ts").LookupApi<S>

  /**
   * Creates a read-only resource or state view.
   */
  const makeResourceReadView = <T>(descriptorKey: symbol, source: Map<symbol, unknown>): ResourceReadView<T> =>
    makeReadCell(() => source.get(descriptorKey) as T)

  /**
   * Creates a writable resource or state view.
   */
  const makeResourceWriteView = <T>(descriptorKey: symbol, source: Map<symbol, unknown>): ResourceWriteView<T> =>
    makeWriteCell(
      () => source.get(descriptorKey) as T,
      (value) => {
        source.set(descriptorKey, value)
      }
    )

  /**
   * Creates a read-only event stream view.
   */
  const makeEventReadView = <T>(descriptorKey: symbol): EventReadView<T> => ({
    all() {
      return (readableEvents.get(descriptorKey) ?? []) as ReadonlyArray<T>
    }
  })

  /**
   * Creates a writable event stream view.
   */
  const makeEventWriteView = <T>(descriptorKey: symbol): EventWriteView<T> => ({
    emit(value) {
      const queue = pendingEvents.get(descriptorKey) ?? []
      queue.push(value)
      pendingEvents.set(descriptorKey, queue)
    }
  })

  /**
   * Derives the runtime system context from the explicit system spec.
   *
   * This is the core "Effect-like" move of the runtime: the spec is the source
   * of truth and the runtime materializes the exact context the implementation
   * is allowed to see.
   */
  const makeContext = (
    system: SystemDefinition<any, any, any>
  ): SystemContext<any> => {
    const commands = Command.makeCommands<S>(() => internalWorld.nextEntityId())
    const queries = Object.fromEntries(
      Object.entries(system.spec.queries as Record<string, Query.Query.Any>).map(([key, query]) => [key, makeQueryHandle(query)])
    )
    const resourceViews = Object.fromEntries(
      Object.entries(system.spec.resources as Record<string, any>).map(([key, access]) => [
        key,
        access.mode === "read"
          ? makeResourceReadView(access.descriptor.key, resources)
          : makeResourceWriteView(access.descriptor.key, resources)
      ])
    )
    const eventViews = Object.fromEntries(
      Object.entries(system.spec.events as Record<string, any>).map(([key, access]) => [
        key,
        access.mode === "read"
          ? makeEventReadView(access.descriptor.key)
          : makeEventWriteView(access.descriptor.key)
      ])
    )
    const stateViews = Object.fromEntries(
      Object.entries(system.spec.states as Record<string, any>).map(([key, access]) => [
        key,
        access.mode === "write"
          ? makeResourceWriteView(access.descriptor.key, states)
          : makeResourceReadView(access.descriptor.key, states)
      ])
    )
    const serviceViews = Object.fromEntries(
      Object.entries(system.spec.services as Record<string, any>).map(([key, access]) => [key, options.services[access.descriptor.name as keyof Services]])
    )

    return {
      queries,
      lookup,
      resources: resourceViews,
      events: eventViews,
      states: stateViews,
      services: serviceViews,
      commands
    } as SystemContext<any>
  }

  /**
   * Runs one system and returns the commands it queued.
   *
   * The schedule decides when those commands become visible by placing
   * `applyDeferred()` steps.
   */
  const runSystem = (
    system: SystemDefinition<any, any, any>
  ): ReadonlyArray<Command.DeferredCommand<S>> => {
    const context = makeContext(system)
    const effect = system.run(context)
    Fx.runSync(Fx.provide(effect as never, context.services))
    return context.commands.flush()
  }

  /**
   * Applies all queued commands gathered since the previous apply step.
   */
  const applyDeferred = (commands: Array<Command.DeferredCommand<S>>): void => {
    for (const command of commands.splice(0, commands.length)) {
      command.apply(internalWorld as never)
    }
  }

  /**
   * Advances the readable event buffers to the latest pending writes.
   */
  const updateEvents = (): void => {
    readableEvents = pendingEvents
    pendingEvents = new Map()
  }

  /**
   * The final loop-agnostic runtime value returned to users.
   */
  const runtime: Runtime<S, Services> = {
    schema: options.schema,
    services: options.services,
    initialize(...schedules) {
      runtime.tick(...schedules)
    },
    runSchedule(schedule) {
      const deferred: Array<Command.DeferredCommand<S>> = []
      for (const step of schedule.steps) {
        if (Schedule.isSystemStep(step)) {
          deferred.push(...runSystem(step as SystemDefinition<any, any, any>))
          continue
        }
        if (step.kind === "applyDeferred") {
          applyDeferred(deferred)
          continue
        }
        updateEvents()
      }
      applyDeferred(deferred)
      updateEvents()
    },
    tick(...schedules) {
      for (const schedule of schedules) {
        runtime.runSchedule(schedule)
      }
    }
  }

  return runtime
}
