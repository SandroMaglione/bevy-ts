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
  RuntimeRequirements,
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
 * String-literal type id used to brand descriptor-based runtime service maps.
 */
export type RuntimeServicesTypeId = "~bevy-ts/RuntimeServices"

/**
 * Runtime value for the service-map type id.
 */
const runtimeServicesTypeId: RuntimeServicesTypeId = "~bevy-ts/RuntimeServices"

/**
 * The runtime-facing initialization shape for schema resources.
 */
export type RuntimeResources<S extends Schema.Any> = Partial<{
  readonly [K in keyof Schema.Resources<S>]: Schema.ResourceValue<S, K>
}>

/**
 * The runtime-facing initialization shape for schema states.
 */
export type RuntimeStates<S extends Schema.Any> = Partial<{
  readonly [K in keyof Schema.States<S>]: Schema.StateValue<S, K>
}>

/**
 * One descriptor-backed runtime service provision.
 *
 * `Runtime.service(...)` creates these entries with contextual typing for the
 * implementation object, so callback parameters are inferred from the service
 * descriptor instead of requiring repeated annotations at the call site.
 */
export interface ServiceProvision<D extends Descriptor<"service", string, any> = Descriptor<"service", string, any>> {
  readonly descriptor: D
  readonly implementation: Descriptor.Value<D>
}

/**
 * Folds a tuple of service entries into the normalized runtime service record.
 *
 * Later entries for the same descriptor name replace earlier ones, matching
 * normal object assignment semantics at runtime.
 */
type ServiceEntriesToRecord<
  Entries extends ReadonlyArray<ServiceProvision>,
  Acc extends Record<string, unknown> = {}
> = Entries extends readonly [infer Head, ...infer Tail]
  ? Head extends ServiceProvision<infer D>
    ? Tail extends ReadonlyArray<ServiceProvision>
      ? ServiceEntriesToRecord<Tail, Simplify<Omit<Acc, Descriptor.Name<D>> & {
          readonly [K in Descriptor.Name<D>]: Descriptor.Value<D>
        }>>
      : never
    : never
  : Simplify<Acc>

/**
 * Branded service environment produced by `Runtime.services(...)`.
 *
 * The brand ensures callers provide services through descriptors rather than
 * raw string keys, which prevents runtime mismatches between descriptor names
 * and manually repeated object properties.
 */
export type RuntimeServices<Services extends Record<string, unknown> = {}> = Readonly<Services> & {
  readonly [runtimeServicesTypeId]: {
    readonly _Services: (_: never) => Services
  }
}

/**
 * Flattens an inferred object type for clearer diagnostics.
 */
type Simplify<A> = {
  readonly [K in keyof A]: A[K]
}

/**
 * Extracts the requirements carried by one schedule definition.
 */
type ScheduleRequirementsOf<Schedule> = Schedule extends ScheduleDefinition<any, infer Requirements> ? Requirements : never

/**
 * Produces a readable type-level label name.
 */
type ScheduleName<Schedule> = Schedule extends { readonly label: { readonly name: infer Name extends string } }
  ? Name
  : "(anonymous schedule)"

type MissingKeys<Required extends object, Provided extends object> = Exclude<keyof Required, keyof Provided>

type IncompatibleKeys<Required extends object, Provided extends object> = {
  readonly [K in Extract<keyof Required, keyof Provided>]:
    [Provided[K]] extends [Required[K]] ? never : K
}[Extract<keyof Required, keyof Provided>]

type CategoryRequirementErrors<
  Kind extends string,
  Schedule,
  Required extends object,
  Provided extends object
> =
  | ([MissingKeys<Required, Provided>] extends [never]
    ? never
    : {
        readonly __runtimeRequirementError__: Kind
        readonly __schedule__: ScheduleName<Schedule>
        readonly __missing__: MissingKeys<Required, Provided>
      })
  | ([IncompatibleKeys<Required, Provided>] extends [never]
    ? never
    : {
        readonly __runtimeRequirementError__: `${Kind} (incompatible)`
        readonly __schedule__: ScheduleName<Schedule>
        readonly __missing__: IncompatibleKeys<Required, Provided>
      })

type ScheduleRequirementErrors<
  Schedule,
  Services extends Record<string, unknown>,
  Resources extends object,
  States extends object
> = Schedule extends ScheduleDefinition<any, infer Requirements extends RuntimeRequirements>
  ? | CategoryRequirementErrors<"Missing or incompatible services", Schedule, Requirements["services"], Services>
    | CategoryRequirementErrors<"Missing or incompatible resources", Schedule, Requirements["resources"], Resources>
    | CategoryRequirementErrors<"Missing or incompatible states", Schedule, Requirements["states"], States>
  : never

type ValidateSchedules<
  Schedules extends ReadonlyArray<ScheduleDefinition<any, AnyRequirements>>,
  Services extends Record<string, unknown>,
  Resources extends object,
  States extends object
> = [ScheduleRequirementErrors<Schedules[number], Services, Resources, States>] extends [never]
  ? unknown
  : {
      readonly __fixRuntimeRequirements__: ScheduleRequirementErrors<Schedules[number], Services, Resources, States>
    }

type AnyRequirements = RuntimeRequirements<any, any, any>

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
export interface Runtime<
  S extends Schema.Any,
  Services extends Record<string, unknown>,
  Resources extends RuntimeResources<S> = {},
  States extends RuntimeStates<S> = {}
> {
  /**
   * The closed schema this runtime was built for.
   */
  readonly schema: S
  /**
   * The host-provided service environment.
   */
  readonly services: Services
  /**
   * The schema-keyed resources that were initialized when the runtime was made.
   */
  readonly resourceValues: Resources
  /**
   * The schema-keyed states that were initialized when the runtime was made.
   */
  readonly stateValues: States
  /**
   * Runs one or more schedules as an initialization step.
   *
   * This is a semantic alias for a one-off bootstrap phase before entering the
   * repeating outer loop.
   */
  readonly initialize: <
    const Schedules extends ReadonlyArray<ScheduleDefinition<S, AnyRequirements>>
  >(...schedules: Schedules & ValidateSchedules<Schedules, Services, Resources, States>) => void
  /**
   * Runs one schedule once.
   *
   * Deferred commands and events advance only at explicit schedule marker
   * steps, plus one final end-of-schedule apply/update pass for safety.
   */
  readonly runSchedule: <
    const Selected extends ScheduleDefinition<S, AnyRequirements>
  >(schedule: Selected & ValidateSchedules<[Selected], Services, Resources, States>) => void
  /**
   * Runs multiple schedules in sequence.
   *
   * Because schedules are executed one after another, later schedules in the
   * same `tick(...)` call can observe the fully applied world changes and event
   * updates produced by earlier schedules.
   */
  readonly tick: <
    const Schedules extends ReadonlyArray<ScheduleDefinition<S, AnyRequirements>>
  >(...schedules: Schedules & ValidateSchedules<Schedules, Services, Resources, States>) => void
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
export const makeRuntime = <
  S extends Schema.Any,
  const Services extends Record<string, unknown>,
  const Resources extends RuntimeResources<S> = {},
  const States extends RuntimeStates<S> = {}
>(options: {
  readonly schema: S
  readonly services: RuntimeServices<Services>
  readonly resources?: Resources
  readonly states?: States
}): Runtime<S, Simplify<Services>, Resources, States> => {
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
   * The normalized descriptor-backed runtime service environment.
   */
  const providedServices = options.services as unknown as Simplify<Services>

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
      Object.entries(system.spec.services as Record<string, any>).map(([key, access]) => [key, providedServices[access.descriptor.name as keyof Services]])
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
  const runScheduleUnsafe = (schedule: ScheduleDefinition<S, AnyRequirements>): void => {
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
    const lastStep = schedule.steps.at(-1)
    applyDeferred(deferred)
    if (!lastStep || Schedule.isSystemStep(lastStep) || lastStep.kind !== "eventUpdate") {
      updateEvents()
    }
  }

  /**
   * Executes multiple schedules after their requirement checks have passed.
   */
  const tickUnsafe = (schedules: ReadonlyArray<ScheduleDefinition<S, AnyRequirements>>): void => {
    for (const schedule of schedules) {
      runScheduleUnsafe(schedule)
    }
  }

  /**
   * The final loop-agnostic runtime value returned to users.
   */
  const runtime: Runtime<S, Simplify<Services>, Resources, States> = {
    schema: options.schema,
    services: providedServices,
    resourceValues: (options.resources ?? {}) as Resources,
    stateValues: (options.states ?? {}) as States,
    initialize(...schedules) {
      tickUnsafe(schedules)
    },
    runSchedule(schedule) {
      runScheduleUnsafe(schedule)
    },
    tick(...schedules) {
      tickUnsafe(schedules)
    }
  }

  return runtime
}

/**
 * Builds the descriptor-backed runtime service environment.
 *
 * Use this instead of writing service objects keyed by strings manually. The
 * helper derives the runtime map directly from service descriptors, so the key
 * used at runtime can never drift from the declared service identity.
 */
export const services = <
  const Entries extends ReadonlyArray<ServiceProvision>
>(...entries: Entries): RuntimeServices<ServiceEntriesToRecord<Entries>> => {
  const provided: Record<string, unknown> = {}
  for (const { descriptor, implementation } of entries) {
    provided[descriptor.name] = implementation
  }
  return provided as RuntimeServices<ServiceEntriesToRecord<Entries>>
}

/**
 * Creates one service provision for `Runtime.services(...)`.
 *
 * This is the canonical user-facing entry constructor because passing the
 * descriptor directly gives TypeScript a contextual type for the implementation
 * object.
 */
export const service = <
  D extends Descriptor<"service", string, any>
>(
  descriptor: D,
  implementation: Descriptor.Value<D>
): ServiceProvision<D> => ({
  descriptor,
  implementation
})
