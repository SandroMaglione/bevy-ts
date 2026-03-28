import * as Command from "./command.ts"
import * as Entity from "./entity.ts"
import * as Fx from "./fx.ts"
import type { Query, QueryMatch, ReadCell, WriteCell } from "./query.ts"
import type { ScheduleDefinition } from "./schedule.ts"
import type { Schema } from "./schema.ts"
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
   * Runs one schedule once and clears events afterwards.
   *
   * Deferred commands are flushed after each individual system run, so later
   * systems in the same schedule observe changes produced by earlier systems.
   */
  readonly runSchedule: (schedule: ScheduleDefinition<S>) => void
  /**
   * Runs multiple schedules in sequence.
   *
   * Because schedules are executed one after another, later schedules in the
   * same `tick(...)` call can observe the fully flushed world changes from
   * earlier schedules.
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
   * Descriptor-keyed event buffers for the current schedule step.
   */
  const events = new Map<symbol, Array<unknown>>()

  /**
   * Seeds runtime resources from the host-provided initial values.
   */
  for (const descriptor of Object.values(options.schema.resources)) {
    const initial = options.resources?.[descriptor.name as keyof typeof options.resources]
    if (initial !== undefined) {
      resources.set(descriptor.key, initial)
    }
  }

  /**
   * Seeds runtime states from the host-provided initial values.
   */
  for (const descriptor of Object.values(options.schema.states)) {
    const initial = options.states?.[descriptor.name as keyof typeof options.states]
    if (initial !== undefined) {
      states.set(descriptor.key, initial)
    }
  }

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
    writeResource(descriptor, value) {
      if (descriptor.kind === "state") {
        states.set(descriptor.key, value)
        return
      }
      resources.set(descriptor.key, value)
    },
    appendEvent(descriptor, value) {
      const queue = events.get(descriptor.key) ?? []
      queue.push(value)
      events.set(descriptor.key, queue)
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
  const makeQueryHandle = <Q extends Query.Any>(query: Q): QueryHandle<S, Q> => ({
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
        for (const [slot, access] of Object.entries(query.selection)) {
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
          Object.entries(query.selection).map(([slot, access]) => [slot, store.get(access.descriptor.key)])
        )
        const writeProof = Object.fromEntries(
          Object.entries(query.selection)
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
    }
  })

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
      return (events.get(descriptorKey) ?? []) as ReadonlyArray<T>
    }
  })

  /**
   * Creates a writable event stream view.
   */
  const makeEventWriteView = <T>(descriptorKey: symbol): EventWriteView<T> => ({
    emit(value) {
      const queue = events.get(descriptorKey) ?? []
      queue.push(value)
      events.set(descriptorKey, queue)
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
      Object.entries(system.spec.queries as Record<string, Query.Any>).map(([key, query]) => [key, makeQueryHandle(query)])
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
      resources: resourceViews,
      events: eventViews,
      states: stateViews,
      services: serviceViews,
      commands
    } as SystemContext<any>
  }

  /**
   * Runs one system, then flushes its deferred commands.
   *
   * This per-system flush behavior is intentional in the current prototype and
   * is what allows later systems or schedules in the same update pass to see
   * spawned entities and resource writes immediately.
   */
  const runSystem = (
    system: SystemDefinition<any, any, any>
  ): void => {
    const context = makeContext(system)
    const effect = system.run(context)
    Fx.runSync(Fx.provide(effect as never, context.services))
    const flushed = context.commands.flush()
    for (const command of flushed) {
      command.apply(internalWorld as never)
    }
  }

  /**
   * The final loop-agnostic runtime value returned to users.
   */
  const runtime: Runtime<S, Services> = {
    schema: options.schema,
    services: options.services,
    runSchedule(schedule) {
      for (const system of schedule.systems) {
        runSystem(system as SystemDefinition<any, any, any>)
      }
      events.clear()
    },
    tick(...schedules) {
      for (const schedule of schedules) {
        runtime.runSchedule(schedule)
      }
    }
  }

  return runtime
}
