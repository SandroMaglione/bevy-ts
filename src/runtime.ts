/**
 * Runtime creation, world storage, and schedule execution.
 *
 * The runtime owns ECS state and explicit service provisioning, and applies
 * deferred mutation only at schedule-controlled boundaries.
 *
 * @example
 * ```ts
 * const runtime = Game.Runtime.makeConstructed({
 *   services: Game.Runtime.services(),
 *   resources: {
 *     viewport: { width: 800, height: 600 }
 *   }
 * })
 * ```
 *
 * @module runtime
 * @docGroup runtime
 *
 * @groupDescription Interfaces
 * Public runtime and runtime-view contracts that expose explicit execution boundaries.
 *
 * @groupDescription Type Aliases
 * Shared runtime initialization, service, machine, and validation helper types.
 *
 * @groupDescription Functions
 * Public runtime constructors and helpers for services, machines, and bootstrap input.
 */
import * as Command from "./command.ts"
import * as DescriptorModule from "./descriptor.ts"
import type { Descriptor } from "./descriptor.ts"
import * as Entity from "./entity.ts"
import * as Fx from "./fx.ts"
import type * as Machine from "./machine.ts"
import * as Query from "./query.ts"
import type { ConstructedWriteCell, QueryMatch, ReadCell, WriteCell } from "./query.ts"
import * as Relation from "./relation.ts"
import * as Result from "./Result.ts"
import * as Schedule from "./schedule.ts"
import type { ScheduleDefinition } from "./schedule.ts"
import type { ExecutableScheduleDefinition } from "./schedule.ts"
import type { Registry, Schema } from "./schema.ts"
import type {
  DespawnedReadView,
  EventReadView,
  EventWriteView,
  QueryHandle,
  RelationFailureReadView,
  RemovedReadView,
  ResourceReadView,
  RuntimeRequirements,
  TransitionEventReadView,
  MachineReadView,
  NextMachineWriteView,
  ResourceWriteView,
  SystemContext,
  SystemDefinition,
  TransitionReadView
} from "./system.ts"

/**
 * Runtime provisioning and schedule execution.
 *
 * `Runtime` owns ECS state and host-provided services, but not the outer game
 * loop. Host code decides when to call `initialize(...)`, `runSchedule(...)`,
 * or `tick(...)`.
 *
 * The runtime keeps dynamic behavior explicit:
 *
 * - schedule requirements are checked at the call boundary
 * - deferred changes advance only at explicit schedule markers
 * - typed lookup failures stay value-level instead of throwing
 *
 * @example
 * ```ts
 * const runtime = Game.Runtime.make({
 *   services: Game.Runtime.services(
 *     Game.Runtime.service(Logger, { log: console.log })
 *   )
 * })
 *
 * runtime.tick(updateSchedule)
 * ```
 */

/**
 * The in-memory store used by the prototype runtime.
 *
 * Each entity id maps to descriptor-keyed component storage.
 */
type EntityStore = Map<number, Map<symbol, unknown>>
type RelationSourceStore = Map<symbol, Map<number, number>>
type RelationReverseStore = Map<symbol, Map<number, Array<number>>>

/**
 * String-literal type id used to brand descriptor-based runtime service maps.
 */
export type RuntimeServicesTypeId = "~bevy-ts/RuntimeServices"

/**
 * Runtime value for the service-map type id.
 */
const runtimeServicesTypeId: RuntimeServicesTypeId = "~bevy-ts/RuntimeServices"

/**
 * String-literal type id used to brand machine initialization maps.
 */
export type RuntimeMachinesTypeId = "~bevy-ts/RuntimeMachines"

/**
 * Runtime value for the machine-map type id.
 */
const runtimeMachinesTypeId: RuntimeMachinesTypeId = "~bevy-ts/RuntimeMachines"
const runtimeMachinesEntries = Symbol("RuntimeMachinesEntries")

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

export type RuntimeResultResources<S extends Schema.Any> = Partial<{
  readonly [K in keyof Schema.Resources<S>]: Result.Result<Schema.ResourceValue<S, K>, unknown>
}>

export type RuntimeResultStates<S extends Schema.Any> = Partial<{
  readonly [K in keyof Schema.States<S>]: Result.Result<Schema.StateValue<S, K>, unknown>
}>

export type RuntimeConstructedResources<S extends Schema.Any> = Partial<{
  readonly [K in keyof Schema.Resources<S>]:
    Schema.Resources<S>[K] extends DescriptorModule.ConstructedDescriptor<"resource", string, any, infer Raw, any>
      ? Raw
      : Schema.ResourceValue<S, K>
}>

export type RuntimeConstructedStates<S extends Schema.Any> = Partial<{
  readonly [K in keyof Schema.States<S>]:
    Schema.States<S>[K] extends DescriptorModule.ConstructedDescriptor<"state", string, any, infer Raw, any>
      ? Raw
      : Schema.StateValue<S, K>
}>

export type ValidatedRuntimeResources<
  S extends Schema.Any,
  Provided extends RuntimeResultResources<S>
> = Simplify<{
  readonly [K in keyof Provided]:
    K extends keyof Schema.Resources<S> ? Schema.ResourceValue<S, K> : never
}>

export type ValidatedRuntimeStates<
  S extends Schema.Any,
  Provided extends RuntimeResultStates<S>
> = Simplify<{
  readonly [K in keyof Provided]:
    K extends keyof Schema.States<S> ? Schema.StateValue<S, K> : never
}>

export type RuntimeConstructionError<
  S extends Schema.Any,
  Resources extends RuntimeResultResources<S>,
  States extends RuntimeResultStates<S>
> = Simplify<{
  readonly resources: Partial<{
    readonly [K in keyof Resources]:
      Resources[K] extends Result.Result<any, infer Error> ? Error : never
  }>
  readonly states: Partial<{
    readonly [K in keyof States]:
      States[K] extends Result.Result<any, infer Error> ? Error : never
  }>
}>

export type ValidatedConstructedRuntimeResources<
  S extends Schema.Any,
  Provided extends RuntimeConstructedResources<S>
> = Simplify<{
  readonly [K in keyof Provided]:
    K extends keyof Schema.Resources<S> ? Schema.ResourceValue<S, K> : never
}>

export type ValidatedConstructedRuntimeStates<
  S extends Schema.Any,
  Provided extends RuntimeConstructedStates<S>
> = Simplify<{
  readonly [K in keyof Provided]:
    K extends keyof Schema.States<S> ? Schema.StateValue<S, K> : never
}>

export type RuntimeConstructedConstructionError<
  S extends Schema.Any,
  Resources extends RuntimeConstructedResources<S>,
  States extends RuntimeConstructedStates<S>
> = Simplify<{
  readonly resources: Partial<{
    readonly [K in keyof Resources]:
      K extends keyof Schema.Resources<S>
        ? Schema.Resources<S>[K] extends DescriptorModule.ConstructedDescriptor<"resource", string, any, any, infer Error>
          ? Error
          : never
        : never
  }>
  readonly states: Partial<{
    readonly [K in keyof States]:
      K extends keyof Schema.States<S>
        ? Schema.States<S>[K] extends DescriptorModule.ConstructedDescriptor<"state", string, any, any, infer Error>
          ? Error
          : never
        : never
  }>
}>

/**
 * One machine-backed runtime state provision.
 */
export interface MachineProvision<M extends Machine.StateMachine.Any = Machine.StateMachine.Any> {
  readonly machine: M
  readonly initial: Machine.StateMachine.Value<M>
}

/**
 * Folds a tuple of machine provisions into the normalized runtime machine map.
 */
type MachineEntriesToRecord<
  Entries extends ReadonlyArray<MachineProvision>,
  Acc extends Record<string, unknown> = {}
> = Entries extends readonly [infer Head, ...infer Tail]
  ? Head extends MachineProvision<infer M>
    ? Tail extends ReadonlyArray<MachineProvision>
      ? MachineEntriesToRecord<Tail, Simplify<Omit<Acc, M["name"]> & {
          readonly [K in M["name"]]: Machine.StateMachine.Value<M>
        }>>
      : never
    : never
  : Simplify<Acc>

/**
 * Branded machine initialization environment produced by `Runtime.machines(...)`.
 */
export type RuntimeMachines<Machines extends Record<string, unknown> = {}> = Readonly<Machines> & {
  readonly [runtimeMachinesTypeId]: {
    readonly _Machines: (_: never) => Machines
  }
  readonly [runtimeMachinesEntries]: ReadonlyArray<MachineProvision>
}

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

type RuntimeServicesOf<Provided extends RuntimeServices<any>> =
  [Provided] extends [RuntimeServices<infer Services>] ? Services : never

type RuntimeMachinesOf<Provided extends RuntimeMachines<any>> =
  [Provided] extends [RuntimeMachines<infer Machines>] ? Machines : {}

/**
 * Flattens an inferred object type for clearer diagnostics.
 */
type Simplify<A> = {
  readonly [K in keyof A]: A[K]
}

type NormalizeRequirementObject<Required extends object> =
  [Required] extends [never] ? {} : Simplify<Required>

type KnownObjectKeys<Value extends object> =
  keyof Simplify<Value> extends infer Key
    ? Key extends string
      ? string extends Key
        ? never
        : Key
      : Key extends number
        ? number extends Key
          ? never
          : Key
        : Key extends symbol
          ? symbol extends Key
            ? never
            : Key
          : never
    : never

type NormalizeMachineRequirementObject<Required extends object> =
  [Required] extends [never]
    ? {}
    : {
        readonly [K in KnownObjectKeys<Required>]: unknown
      }

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
  ScheduleLabel extends string,
  Required extends object,
  Provided extends object
> =
  | ([MissingKeys<Required, Provided>] extends [never]
    ? never
    : {
        readonly __runtimeRequirementError__: Kind
        readonly __schedule__: ScheduleLabel
        readonly __missing__: MissingKeys<Required, Provided>
      })
  | ([IncompatibleKeys<Required, Provided>] extends [never]
    ? never
    : {
        readonly __runtimeRequirementError__: `${Kind} (incompatible)`
        readonly __schedule__: ScheduleLabel
        readonly __missing__: IncompatibleKeys<Required, Provided>
      })

type CategoryMissingRequirementErrors<
  Kind extends string,
  ScheduleLabel extends string,
  Required extends object,
  Provided extends object
> =
  [MissingKeys<Required, Provided>] extends [never]
    ? never
    : {
        readonly __runtimeRequirementError__: Kind
        readonly __schedule__: ScheduleLabel
        readonly __missing__: MissingKeys<Required, Provided>
      }

type RequirementErrorsFor<
  Requirements extends RuntimeRequirements,
  ScheduleLabel extends string,
  Services extends Record<string, unknown>,
  Resources extends object,
  States extends object,
  Machines extends object
> =
  | CategoryRequirementErrors<"Missing or incompatible services", ScheduleLabel, NormalizeRequirementObject<Requirements["services"]>, Services>
  | CategoryRequirementErrors<"Missing or incompatible resources", ScheduleLabel, NormalizeRequirementObject<Requirements["resources"]>, Resources>
  | CategoryRequirementErrors<"Missing or incompatible states", ScheduleLabel, NormalizeRequirementObject<Requirements["states"]>, States>
  | CategoryMissingRequirementErrors<"Missing machines", ScheduleLabel, NormalizeMachineRequirementObject<Requirements["machines"]>, Machines>

type RequirementErrorsOfSchedule<
  Schedule extends ExecutableScheduleDefinition<any, any, any, any>,
  Services extends Record<string, unknown>,
  Resources extends object,
  States extends object,
  Machines extends object
> = RequirementErrorsFor<
  Schedule.CarriedRuntimeRequirementsOf<Schedule>,
  ScheduleName<Schedule>,
  Services,
  Resources,
  States,
  Machines
>

export type ValidateSchedules<
  Schedules extends ReadonlyArray<ExecutableScheduleDefinition<any, any, any, any>>,
  Services extends Record<string, unknown>,
  Resources extends object,
  States extends object,
  Machines extends object
> = {
  readonly [K in keyof Schedules]:
    Schedules[K] & ValidateSchedule<
      Extract<Schedules[K], ExecutableScheduleDefinition<any, any, any, any>>,
      Services,
      Resources,
      States,
      Machines
    >
}

export type ValidateScheduleArray<
  Schedules extends ReadonlyArray<ExecutableScheduleDefinition<any, any, any, any>>,
  Services extends Record<string, unknown>,
  Resources extends object,
  States extends object,
  Machines extends object
> = [RequirementErrorsOfSchedule<Schedules[number], Services, Resources, States, Machines>] extends [never]
  ? unknown
  : {
      readonly __fixRuntimeRequirements__: RequirementErrorsOfSchedule<Schedules[number], Services, Resources, States, Machines>
    }

type ValidateScheduleArgs<
  Schedules extends ReadonlyArray<ExecutableScheduleDefinition<any, any, any, any>>,
  Services extends Record<string, unknown>,
  Resources extends object,
  States extends object,
  Machines extends object
> = [RequirementErrorsOfSchedule<NoInfer<Schedules[number]>, Services, Resources, States, Machines>] extends [never]
  ? Schedules
  : Schedules & {
      readonly __fixRuntimeRequirements__: RequirementErrorsOfSchedule<NoInfer<Schedules[number]>, Services, Resources, States, Machines>
    }

type ValidateSchedule<
  Schedule extends ExecutableScheduleDefinition<any, any, any, any>,
  Services extends Record<string, unknown>,
  Resources extends object,
  States extends object,
  Machines extends object
> = [RequirementErrorsOfSchedule<Schedule, Services, Resources, States, Machines>] extends [never]
  ? unknown
  : {
      readonly __fixRuntimeRequirements__: RequirementErrorsOfSchedule<Schedule, Services, Resources, States, Machines>
    }

export type AnyRequirements = RuntimeRequirements<any, any, any, any>

/**
 * The caller-facing initialization shape for one descriptor registry.
 *
 * Initialization is keyed by schema property names, not descriptor names. This
 * is the same key space exposed by `Schema.Resources<S>` and `Schema.States<S>`.
 */
type InitialRegistryValues<R extends Registry> = Partial<{
  readonly [K in keyof R]: Descriptor.Value<R[K]>
}>

type ResultRegistryValues<R extends Registry> = Partial<{
  readonly [K in keyof R]: Result.Result<Descriptor.Value<R[K]>, unknown>
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

const collectRegistryResults = <R extends Registry>(
  registry: R,
  provided: ResultRegistryValues<R> | undefined
): Result.Result<InitialRegistryValues<R>, Partial<{ readonly [K in keyof R]: unknown }>> => {
  if (!provided) {
    return Result.success({})
  }

  const validated = {} as Partial<Record<keyof R, unknown>>
  const errors = {} as Partial<Record<keyof R, unknown>>

  for (const schemaKey of Object.keys(registry) as Array<keyof R>) {
    const next = provided[schemaKey]
    if (next === undefined) {
      continue
    }
    if (!next.ok) {
      errors[schemaKey] = next.error
      continue
    }
    validated[schemaKey] = next.value
  }

  if (Object.keys(errors).length > 0) {
    return Result.failure(errors as Partial<{ readonly [K in keyof R]: unknown }>)
  }

  return Result.success(validated as InitialRegistryValues<R>)
}

const collectConstructedRegistryValues = <R extends Registry>(
  registry: R,
  provided: Partial<{ readonly [K in keyof R]: unknown }> | undefined
): Result.Result<InitialRegistryValues<R>, Partial<{ readonly [K in keyof R]: unknown }>> => {
  if (!provided) {
    return Result.success({})
  }

  const validated = {} as Partial<Record<keyof R, unknown>>
  const errors = {} as Partial<Record<keyof R, unknown>>

  for (const [schemaKey, descriptor] of Object.entries(registry) as Array<[keyof R, R[keyof R]]>) {
    const next = provided[schemaKey]
    if (next === undefined) {
      continue
    }

    const constructor = DescriptorModule.constructorOf(descriptor)
    if (!constructor) {
      validated[schemaKey] = next
      continue
    }

    const result = constructor.result(next as never)
    if (!result.ok) {
      errors[schemaKey] = result.error
      continue
    }

    validated[schemaKey] = result.value
  }

  if (Object.keys(errors).length > 0) {
    return Result.failure(errors as Partial<{ readonly [K in keyof R]: unknown }>)
  }

  return Result.success(validated as InitialRegistryValues<R>)
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
  States extends RuntimeStates<S> = {},
  Root = unknown,
  Machines extends Record<string, unknown> = {}
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
   * The machine values that were initialized when the runtime was made.
   */
  readonly machineValues: Machines
  /**
   * Hidden schema-root brand used by schema-bound APIs.
   */
  readonly __schemaRoot?: Root | undefined
  /**
   * Runs one or more schedules as an initialization step.
   *
   * This is a semantic alias for a one-off bootstrap phase before entering the
   * repeating outer loop.
   *
   * Use this for startup or setup phases that should run before the normal
   * repeating update loop.
   */
  readonly initialize: {
    <const Schedules extends ReadonlyArray<ExecutableScheduleDefinition<S, any, Root, any>>>(
      ...schedules: ValidateScheduleArgs<Schedules, Services, Resources, States, Machines>
    ): void
  }
  /**
   * Runs one schedule once.
   *
   * Deferred commands and events advance only at explicit schedule marker
   * steps, plus one final end-of-schedule apply/update pass for safety.
   *
   * Use this when you want one explicit schedule execution rather than a batch
   * of schedules.
   */
  readonly runSchedule: {
    <const Selected extends ExecutableScheduleDefinition<S, any, Root, any>>(
      schedule: Selected
        & ValidateSchedule<NoInfer<Selected>, Services, Resources, States, Machines>
    ): void
  }
  /**
   * Runs multiple schedules in sequence.
   *
   * Because schedules are executed one after another, later schedules in the
   * same `tick(...)` call can observe the fully applied world changes and event
   * updates produced by earlier schedules.
   */
  readonly tick: {
    <const Schedules extends ReadonlyArray<ExecutableScheduleDefinition<S, any, Root, any>>>(
      ...schedules: ValidateScheduleArgs<Schedules, Services, Resources, States, Machines>
    ): void
  }
}

/**
 * Creates a runtime for a fully built schema and a set of external services.
 *
 * This is the main integration point for embedding the ECS into another loop,
 * renderer, or host application.
 *
 * The runtime does not own the outer frame loop. It only owns ECS state plus
 * the host-provided services that systems are allowed to depend on.
 *
 * @example
 * ```ts
 * const runtime = Game.Runtime.make({
 *   services: Game.Runtime.services(
 *     Game.Runtime.service(Logger, { log: console.log })
 *   ),
 *   resources: {
 *     score: 0
 *   }
 * })
 * ```
 */
export const makeRuntime = <
  S extends Schema.Any,
  const ProvidedServices extends RuntimeServices<any>,
  const Resources extends RuntimeResources<S> = {},
  const States extends RuntimeStates<S> = {},
  Root = unknown,
  const ProvidedMachines extends RuntimeMachines<any> = RuntimeMachines<{}>
>(options: {
  readonly schema: S
  readonly services: ProvidedServices
  readonly resources?: Resources
  readonly states?: States
  readonly machines?: ProvidedMachines
  readonly machineDefinitions?: ReadonlyArray<Machine.StateMachine.Any>
}): Runtime<
  S,
  Simplify<RuntimeServicesOf<ProvidedServices>>,
  Resources,
  States,
  Root,
  RuntimeMachinesOf<ProvidedMachines>
> => {
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
   * Relation-keyed source edge stores.
   */
  const relationTargets: RelationSourceStore = new Map()
  /**
   * Relation-keyed reverse-source collections.
   */
  const relatedSources: RelationReverseStore = new Map()
  /**
   * Machine-keyed committed state values.
   */
  const currentMachines = new Map<symbol, unknown>()
  /**
   * Machine-keyed pending transition targets.
   */
  const pendingMachines = new Map<symbol, { value: unknown; skipIfSame: boolean }>()
  /**
   * Machine-keyed previous committed values.
   */
  const previousMachines = new Map<symbol, unknown>()
  /**
   * Machine keys changed by the last transition application in the current schedule.
   */
  let changedMachines = new Set<symbol>()
  /**
   * Active transition payloads for schedules running inside a transition phase.
   */
  let activeTransitions = new Map<symbol, Machine.TransitionSnapshot>()
  /**
   * Descriptor-keyed readable event buffers for the current phase.
   */
  let readableEvents = new Map<symbol, Array<unknown>>()
  /**
   * Descriptor-keyed pending event buffers written before the next event update.
   */
  let pendingEvents = new Map<symbol, Array<unknown>>()
  /**
   * Machine-keyed readable transition-event buffers for the current phase.
   */
  let readableTransitionEvents = new Map<symbol, Array<Machine.TransitionSnapshot>>()
  /**
   * Machine-keyed pending transition-event buffers written before the next event update.
   */
  let pendingTransitionEvents = new Map<symbol, Array<Machine.TransitionSnapshot>>()
  /**
   * Component-keyed readable added-lifecycle buffers for the current phase.
   */
  let readableAddedComponents = new Map<symbol, Set<number>>()
  /**
   * Component-keyed pending added-lifecycle buffers written before the next lifecycle update.
   */
  let pendingAddedComponents = new Map<symbol, Set<number>>()
  /**
   * Component-keyed readable changed-lifecycle buffers for the current phase.
   */
  let readableChangedComponents = new Map<symbol, Set<number>>()
  /**
   * Component-keyed pending changed-lifecycle buffers written before the next lifecycle update.
   */
  let pendingChangedComponents = new Map<symbol, Set<number>>()
  /**
   * Component-keyed readable removed-lifecycle buffers for the current phase.
   */
  let readableRemovedComponents = new Map<symbol, Set<number>>()
  /**
   * Component-keyed pending removed-lifecycle buffers written before the next lifecycle update.
   */
  let pendingRemovedComponents = new Map<symbol, Set<number>>()
  /**
   * Readable despawned-entity ids for the current phase.
   */
  let readableDespawnedEntities = new Set<number>()
  /**
   * Pending despawned-entity ids written before the next lifecycle update.
   */
  let pendingDespawnedEntities = new Set<number>()
  /**
   * Relation-keyed readable mutation-failure buffers for the current phase.
   */
  let readableRelationFailures = new Map<symbol, Array<Relation.Relation.MutationFailure<Relation.Relation.Any, S, Root>>>()
  /**
   * Relation-keyed pending mutation-failure buffers written before the next relation-failure update.
   */
  let pendingRelationFailures = new Map<symbol, Array<Relation.Relation.MutationFailure<Relation.Relation.Any, S, Root>>>()

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
  const providedServices = options.services as unknown as Simplify<RuntimeServicesOf<ProvidedServices>>
  /**
   * The normalized machine initialization environment.
   */
  const providedMachines = (options.machines ?? machines()) as unknown as Simplify<RuntimeMachinesOf<ProvidedMachines>>
  const machineEntries = (options.machines ?? machines())[runtimeMachinesEntries]
  const machineDefinitions = options.machineDefinitions ?? []
  const machineDefinitionOrder = new Map(
    machineDefinitions.map((machine, index) => [machine.key, index] as const)
  )
  const relationDefinitions = Object.values(options.schema.relations)

  for (const provision of machineEntries) {
    currentMachines.set(provision.machine.key, provision.initial)
  }

  const entityExists = (entityId: number): boolean => entities.has(entityId)

  const ensureRelationTargetStore = (descriptorKey: symbol): Map<number, number> => {
    const store = relationTargets.get(descriptorKey)
    if (store) {
      return store
    }
    const fresh = new Map<number, number>()
    relationTargets.set(descriptorKey, fresh)
    return fresh
  }

  const ensureRelatedSourcesStore = (descriptorKey: symbol): Map<number, Array<number>> => {
    const store = relatedSources.get(descriptorKey)
    if (store) {
      return store
    }
    const fresh = new Map<number, Array<number>>()
    relatedSources.set(descriptorKey, fresh)
    return fresh
  }

  const getRelatedSourceIds = (relation: Relation.Relation.Any, targetId: number): ReadonlyArray<number> =>
    relatedSources.get(relation.key)?.get(targetId) ?? []

  const hasRelatedSources = (relation: Relation.Relation.Any, targetId: number): boolean =>
    getRelatedSourceIds(relation, targetId).length > 0

  const addRelatedSource = (relation: Relation.Relation.Any, targetId: number, sourceId: number): void => {
    const store = ensureRelatedSourcesStore(relation.key)
    const entries = store.get(targetId) ?? []
    if (entries.includes(sourceId)) {
      return
    }
    entries.push(sourceId)
    store.set(targetId, entries)
  }

  const removeRelatedSource = (relation: Relation.Relation.Any, targetId: number, sourceId: number): void => {
    const store = relatedSources.get(relation.key)
    const entries = store?.get(targetId)
    if (!entries) {
      return
    }
    const next = entries.filter((entry) => entry !== sourceId)
    if (next.length === 0) {
      store?.delete(targetId)
      return
    }
    store?.set(targetId, next)
  }

  const wouldCreateHierarchyCycle = (
    relation: Relation.Relation.Hierarchy,
    sourceId: number,
    targetId: number
  ): boolean => {
    let current: number | undefined = targetId
    while (current !== undefined) {
      if (current === sourceId) {
        return true
      }
      current = relationTargets.get(relation.key)?.get(current)
    }
    return false
  }

  const unrelateEntity = (
    entityId: number,
    relation: Relation.Relation.Any
  ): void => {
    const targets = relationTargets.get(relation.key)
    const previousTarget = targets?.get(entityId)
    if (previousTarget === undefined) {
      return
    }
    targets?.delete(entityId)
    removeRelatedSource(relation, previousTarget, entityId)
  }

  const tryRelateEntity = (
    entityId: number,
    relation: Relation.Relation.Any,
    targetId: number
  ): Relation.Relation.Result<void, Relation.Relation.MutationError> => {
    if (!entityExists(entityId)) {
      return Relation.failure(Relation.missingEntityError(entityId))
    }
    if (!entityExists(targetId)) {
      return Relation.failure(Relation.missingTargetEntityError(entityId, targetId, relation.name))
    }
    if (!relation.allowSelf && entityId === targetId) {
      return Relation.failure(Relation.selfRelationNotAllowedError(entityId, relation.name))
    }
    if (
      relation.relationKind === "hierarchy"
      && wouldCreateHierarchyCycle(relation as Relation.Relation.Hierarchy, entityId, targetId)
    ) {
      return Relation.failure(Relation.hierarchyCycleError(entityId, targetId, relation.name))
    }

    const targets = ensureRelationTargetStore(relation.key)
    const previousTarget = targets.get(entityId)
    if (previousTarget !== undefined && previousTarget !== targetId) {
      removeRelatedSource(relation, previousTarget, entityId)
    }
    targets.set(entityId, targetId)
    addRelatedSource(relation, targetId, entityId)
    return Relation.success(undefined)
  }

  const reorderChildrenEntity = (
    parentId: number,
    relation: Relation.Relation.Hierarchy,
    childIds: ReadonlyArray<number>
  ): Relation.Relation.Result<void, Relation.Relation.MutationError> => {
    if (!entityExists(parentId)) {
      return Relation.failure(Relation.missingEntityError(parentId))
    }

    const currentChildren = getRelatedSourceIds(relation, parentId)
    const seenChildren = new Set<number>()

    for (const childId of childIds) {
      if (!entityExists(childId)) {
        return Relation.failure(Relation.missingChildEntityError(parentId, childId, relation.name))
      }
      if (seenChildren.has(childId)) {
        return Relation.failure(Relation.duplicateChildError(parentId, childId, relation.name))
      }
      seenChildren.add(childId)

      const currentParent = relationTargets.get(relation.key)?.get(childId)
      if (currentParent !== parentId) {
        return Relation.failure(Relation.childNotRelatedToParentError(parentId, childId, relation.name))
      }
    }

    if (currentChildren.length !== childIds.length) {
      return Relation.failure(Relation.childSetMismatchError(parentId, relation.name))
    }
    for (const childId of currentChildren) {
      if (!seenChildren.has(childId)) {
        return Relation.failure(Relation.childSetMismatchError(parentId, relation.name))
      }
    }

    const sources = ensureRelatedSourcesStore(relation.key)
    if (childIds.length === 0) {
      sources.delete(parentId)
      return Relation.success(undefined)
    }
    sources.set(parentId, [...childIds])
    return Relation.success(undefined)
  }

  const appendRelationFailure = (
    relation: Relation.Relation.Any,
    operation: Relation.Relation.MutationOperation,
    sourceId: number,
    targetId: number,
    error: Relation.Relation.MutationError
  ): void => {
    const failures = pendingRelationFailures.get(relation.key) ?? []
    failures.push(
      Relation.mutationFailure(
        relation,
        operation,
        Entity.makeEntityId<S, Root>(sourceId),
        Entity.makeEntityId<S, Root>(targetId),
        error
      )
    )
    pendingRelationFailures.set(relation.key, failures)
  }

  /**
   * Internal world adapter used by deferred commands.
   */
  const internalWorld: Command.InternalWorld<S> = {
    nextEntityId() {
      const id = Entity.makeEntityId<S, Root>(nextEntity)
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
      const store = entities.get(id.value)
      if (!store) {
        return
      }
      for (const relation of relationDefinitions) {
        const sources = [...getRelatedSourceIds(relation, id.value)]
        if (sources.length > 0) {
          if (relation.linkedDespawn) {
            for (const sourceId of sources) {
              internalWorld.destroyEntity(Entity.makeEntityId<S, Root>(sourceId))
            }
          } else {
            for (const sourceId of sources) {
              unrelateEntity(sourceId, relation)
            }
          }
        }
        unrelateEntity(id.value, relation)
      }
      for (const descriptorKey of store.keys()) {
        recordRemovedComponent(descriptorKey, id.value)
      }
      recordDespawnedEntity(id.value)
      entities.delete(id.value)
    },
    removeComponent(id, descriptor) {
      const store = entities.get(id.value)
      if (!store?.has(descriptor.key)) {
        return
      }
      store.delete(descriptor.key)
      recordRemovedComponent(descriptor.key, id.value)
    },
    writeComponent(id, descriptor, value) {
      const store = entities.get(id.value)
      if (!store) {
        return
      }
      const existed = store.has(descriptor.key)
      store.set(descriptor.key, value)
      if (!existed) {
        recordAddedComponent(descriptor.key, id.value)
      }
      recordChangedComponent(descriptor.key, id.value)
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
    },
    tryRelate(id, relation, target) {
      const result = tryRelateEntity(id.value, relation, target.value)
      if (!result.ok) {
        appendRelationFailure(relation, "relate", id.value, target.value, result.error)
      }
      return result
    },
    unrelate(id, relation) {
      unrelateEntity(id.value, relation)
    },
    reorderChildren(id, relation, children) {
      const result = reorderChildrenEntity(
        id.value,
        relation,
        children.map((child) => child.value)
      )
      if (!result.ok) {
        const targetId = result.error._tag === "MissingChildEntity"
          || result.error._tag === "DuplicateChild"
          || result.error._tag === "ChildNotRelatedToParent"
          ? result.error.childId
          : id.value
        appendRelationFailure(relation, "reorderChildren", id.value, targetId, result.error)
      }
      return result
    }
  }

  /**
   * Creates a read-only cell view over an arbitrary storage source.
   */
  const makeReadCell = <T>(readValue: () => T): ReadCell<T> => ({
    get: readValue
  })

  /**
   * Creates the present branch for an optional query slot.
   */
  const makePresentOptionalReadCell = <T>(readValue: () => T): import("./query.ts").PresentOptionalReadCell<T> => ({
    present: true,
    get: readValue
  })

  /**
   * Creates the absent branch for an optional query slot.
   */
  const makeAbsentOptionalReadCell = (): import("./query.ts").AbsentOptionalReadCell => ({
    present: false
  })

  /**
   * Creates a writable cell view over an arbitrary storage source.
   */
  function makeWriteCell<T>(
    readValue: () => T,
    writeValue: (value: T) => void
  ): WriteCell<T>
  function makeWriteCell<T, Raw, Error>(
    readValue: () => T,
    writeValue: (value: T) => void,
    constructor: DescriptorModule.ResultConstructor<T, Raw, Error>
  ): ConstructedWriteCell<T, Raw, Error>
  function makeWriteCell<T, Raw, Error>(
    readValue: () => T,
    writeValue: (value: T) => void,
    constructor?: DescriptorModule.ResultConstructor<T, Raw, Error>
  ): WriteCell<T> | ConstructedWriteCell<T, Raw, Error> {
    const base: WriteCell<T> = {
      get: readValue,
      set: writeValue,
      setResult<E>(result: Result.Result<T, E>): Result.Result<void, E> {
        if (!result.ok) {
          return Result.failure(result.error)
        }
        writeValue(result.value)
        return Result.success(undefined)
      },
      update(f) {
        writeValue(f(readValue()))
      },
      updateResult<E>(f: (current: T) => Result.Result<T, E>): Result.Result<void, E> {
        const result = f(readValue())
        if (!result.ok) {
          return Result.failure(result.error)
        }
        writeValue(result.value)
        return Result.success(undefined)
      }
    }

    if (!constructor) {
      return base
    }

    return {
      ...base,
      setRaw(raw) {
        const result = constructor.result(raw)
        if (!result.ok) {
          return Result.failure(result.error)
        }
        writeValue(result.value)
        return Result.success(undefined)
      },
      updateRaw(f) {
        const result = constructor.result(f(readValue()))
        if (!result.ok) {
          return Result.failure(result.error)
        }
        writeValue(result.value)
        return Result.success(undefined)
      }
    }
  }

  const pushLifecycleEntity = (buffer: Map<symbol, Set<number>>, descriptorKey: symbol, entityId: number): void => {
    const entries = buffer.get(descriptorKey) ?? new Set<number>()
    entries.add(entityId)
    buffer.set(descriptorKey, entries)
  }

  const recordAddedComponent = (descriptorKey: symbol, entityId: number): void => {
    pushLifecycleEntity(pendingAddedComponents, descriptorKey, entityId)
  }

  const recordChangedComponent = (descriptorKey: symbol, entityId: number): void => {
    pushLifecycleEntity(pendingChangedComponents, descriptorKey, entityId)
  }

  const recordRemovedComponent = (descriptorKey: symbol, entityId: number): void => {
    pushLifecycleEntity(pendingRemovedComponents, descriptorKey, entityId)
  }

  const recordDespawnedEntity = (entityId: number): void => {
    pendingDespawnedEntities.add(entityId)
  }

  const matchesLifecycleFilters = (entityId: number, store: Map<symbol, unknown>, query: Query.Query.Any<Root>): boolean => {
    for (const filter of query.filters) {
      if (!store.has(filter.descriptor.key)) {
        return false
      }
      if (filter.kind === "added") {
        if (!readableAddedComponents.get(filter.descriptor.key)?.has(entityId)) {
          return false
        }
        continue
      }
      if (!readableChangedComponents.get(filter.descriptor.key)?.has(entityId)) {
        return false
      }
    }
    return true
  }

  const matchesRelationFilters = (entityId: number, query: Query.Query.Any<Root>): boolean => {
    for (const relation of query.withRelations) {
      if (!relationTargets.get(relation.key)?.has(entityId)) {
        return false
      }
    }
    for (const relation of query.withoutRelations) {
      if (relationTargets.get(relation.key)?.has(entityId)) {
        return false
      }
    }
    for (const relation of query.withRelated) {
      if (!hasRelatedSources(relation, entityId)) {
        return false
      }
    }
    for (const relation of query.withoutRelated) {
      if (hasRelatedSources(relation, entityId)) {
        return false
      }
    }
    return true
  }

  /**
   * Compiles a query spec into a runtime query handle.
   *
   * The handle performs filtering, builds typed cells, and attaches the
   * matching entity proof for each result.
   */
  const makeQueryHandle = <Q extends Query.Query.Any<Root>>(query: Q): QueryHandle<S, Q> => ({
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
        if (!matchesLifecycleFilters(idValue, store, query)) {
          continue
        }
        if (!matchesRelationFilters(idValue, query)) {
          continue
        }

        const data = {} as Record<string, unknown>
        for (const [slot, access] of Object.entries(query.selection) as Array<[string, Q["selection"][keyof Q["selection"]]]>) {
          if (access.mode === "optional") {
            data[slot] = store.has(access.descriptor.key)
              ? makePresentOptionalReadCell(() => store.get(access.descriptor.key) as never)
              : makeAbsentOptionalReadCell()
            continue
          }
          if (access.mode === "readRelation") {
            const targetId = relationTargets.get(access.descriptor.key)?.get(idValue)
            if (targetId === undefined) {
              include = false
              break
            }
            data[slot] = makeReadCell(() => Entity.makeEntityId<S, Root>(targetId) as never)
            continue
          }
          if (access.mode === "optionalRelation") {
            const targetId = relationTargets.get(access.descriptor.key)?.get(idValue)
            data[slot] = targetId === undefined
              ? makeAbsentOptionalReadCell()
              : makePresentOptionalReadCell(() => Entity.makeEntityId<S, Root>(targetId) as never)
            continue
          }
          if (access.mode === "readRelated") {
            const sourceIds = getRelatedSourceIds(access.descriptor, idValue)
            if (sourceIds.length === 0) {
              include = false
              break
            }
            data[slot] = makeReadCell(
              () => sourceIds.map((sourceId) => Entity.makeEntityId<S, Root>(sourceId)) as never
            )
            continue
          }
          if (access.mode === "optionalRelated") {
            const sourceIds = getRelatedSourceIds(access.descriptor, idValue)
            data[slot] = sourceIds.length === 0
              ? makeAbsentOptionalReadCell()
              : makePresentOptionalReadCell(
                  () => sourceIds.map((sourceId) => Entity.makeEntityId<S, Root>(sourceId)) as never
                )
            continue
          }
          if (!store.has(access.descriptor.key)) {
            include = false
            break
          }
          if (access.mode === "read") {
            data[slot] = makeReadCell(() => store.get(access.descriptor.key) as never)
          } else {
            const constructor = DescriptorModule.hasConstructor(access.descriptor)
              ? DescriptorModule.constructorOf(access.descriptor)
              : undefined
            data[slot] = constructor === undefined
              ? makeWriteCell(
                  () => store.get(access.descriptor.key) as never,
                  (value) => {
                    store.set(access.descriptor.key, value)
                    recordChangedComponent(access.descriptor.key, idValue)
                  }
                )
              : makeWriteCell(
                  () => store.get(access.descriptor.key) as never,
                  (value) => {
                    store.set(access.descriptor.key, value)
                    recordChangedComponent(access.descriptor.key, idValue)
                  },
                  constructor
                )
          }
        }
        if (!include) {
          continue
        }

        const readProof = Object.fromEntries(
          (Object.entries(query.selection) as Array<[string, Q["selection"][keyof Q["selection"]]]>)
            .filter(([, access]) => access.mode === "read" || access.mode === "write")
            .map(([slot, access]) => [slot, store.get(access.descriptor.key)])
        )
        const writeProof = Object.fromEntries(
          (Object.entries(query.selection) as Array<[string, Q["selection"][keyof Q["selection"]]]>)
            .filter(([, access]) => access.mode === "write")
            .map(([slot, access]) => [slot, store.get(access.descriptor.key)])
        )
        const entityId = Entity.makeEntityId<S, Query.Query.Root<Q>>(idValue)
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
    },
    singleOptional() {
      const matches = this.each()
      if (matches.length === 0) {
        return Query.success(undefined)
      }
      if (matches.length > 1) {
        return Query.failure(Query.multipleEntitiesError(matches.length))
      }
      return Query.success(matches[0]!)
    }
  })

  const lookup = {
    get<Q extends Query.Query.Any<Root>>(entityId: Entity.EntityId<S, Root>, query: Q): Query.Query.Result<QueryMatch<S, Q>, Query.Query.LookupError> {
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
      if (!matchesLifecycleFilters(entityId.value, store, query)) {
        return Query.failure(Query.queryMismatchError(entityId.value))
      }
      if (!matchesRelationFilters(entityId.value, query)) {
        return Query.failure(Query.queryMismatchError(entityId.value))
      }
      const data = {} as Record<string, unknown>
      for (const [slot, access] of Object.entries(query.selection) as Array<[string, Q["selection"][keyof Q["selection"]]]>) {
        if (access.mode === "optional") {
          data[slot] = store.has(access.descriptor.key)
            ? makePresentOptionalReadCell(() => store.get(access.descriptor.key) as never)
            : makeAbsentOptionalReadCell()
          continue
        }
        if (access.mode === "readRelation") {
          const targetId = relationTargets.get(access.descriptor.key)?.get(entityId.value)
          if (targetId === undefined) {
            return Query.failure(Query.queryMismatchError(entityId.value))
          }
          data[slot] = makeReadCell(() => Entity.makeEntityId<S, Root>(targetId) as never)
          continue
        }
        if (access.mode === "optionalRelation") {
          const targetId = relationTargets.get(access.descriptor.key)?.get(entityId.value)
          data[slot] = targetId === undefined
            ? makeAbsentOptionalReadCell()
            : makePresentOptionalReadCell(() => Entity.makeEntityId<S, Root>(targetId) as never)
          continue
        }
        if (access.mode === "readRelated") {
          const sourceIds = getRelatedSourceIds(access.descriptor, entityId.value)
          if (sourceIds.length === 0) {
            return Query.failure(Query.queryMismatchError(entityId.value))
          }
          data[slot] = makeReadCell(
            () => sourceIds.map((sourceId) => Entity.makeEntityId<S, Root>(sourceId)) as never
          )
          continue
        }
        if (access.mode === "optionalRelated") {
          const sourceIds = getRelatedSourceIds(access.descriptor, entityId.value)
          data[slot] = sourceIds.length === 0
            ? makeAbsentOptionalReadCell()
            : makePresentOptionalReadCell(
                () => sourceIds.map((sourceId) => Entity.makeEntityId<S, Root>(sourceId)) as never
              )
          continue
        }
        if (!store.has(access.descriptor.key)) {
          return Query.failure(Query.queryMismatchError(entityId.value))
        }
        if (access.mode === "read") {
          data[slot] = makeReadCell(() => store.get(access.descriptor.key) as never)
          continue
        }
        const constructor = DescriptorModule.hasConstructor(access.descriptor)
          ? DescriptorModule.constructorOf(access.descriptor)
          : undefined
        data[slot] = constructor === undefined
          ? makeWriteCell(
              () => store.get(access.descriptor.key) as never,
              (value) => {
                store.set(access.descriptor.key, value)
                recordChangedComponent(access.descriptor.key, entityId.value)
              }
            )
          : makeWriteCell(
              () => store.get(access.descriptor.key) as never,
              (value) => {
                store.set(access.descriptor.key, value)
                recordChangedComponent(access.descriptor.key, entityId.value)
              },
              constructor
            )
      }
      const readProof = Object.fromEntries(
        (Object.entries(query.selection) as Array<[string, Q["selection"][keyof Q["selection"]]]>)
          .filter(([, access]) => access.mode === "read" || access.mode === "write")
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
    },
    getHandle(handle, query) {
      return this.get(Entity.makeEntityId<S, Root>(handle.value), query)
    },
    related(entityId, relation) {
      if (!entityExists(entityId.value)) {
        return Relation.failure(Relation.missingEntityError(entityId.value))
      }
      const targetId = relationTargets.get(relation.key)?.get(entityId.value)
      if (targetId === undefined) {
        return Relation.failure(Relation.missingRelationError(entityId.value, relation.name))
      }
      return Relation.success(Entity.makeEntityId<S, Root>(targetId))
    },
    relatedSources(entityId, relation) {
      if (!entityExists(entityId.value)) {
        return Relation.failure(Relation.missingEntityError(entityId.value))
      }
      return Relation.success(
        getRelatedSourceIds(relation, entityId.value).map((sourceId) => Entity.makeEntityId<S, Root>(sourceId))
      )
    },
    childMatches(entityId, relation, query) {
      if (!entityExists(entityId.value)) {
        return Relation.failure(Relation.missingEntityError(entityId.value))
      }
      const matches: Array<QueryMatch<S, typeof query>> = []
      for (const sourceId of getRelatedSourceIds(relation, entityId.value)) {
        const resolved = this.get(Entity.makeEntityId<S, Root>(sourceId), query)
        if (resolved.ok) {
          matches.push(resolved.value)
        }
      }
      return Relation.success(matches)
    },
    parent(entityId, relation) {
      if (!entityExists(entityId.value)) {
        return Relation.failure(Relation.missingEntityError(entityId.value))
      }
      const targetId = relationTargets.get(relation.key)?.get(entityId.value)
      if (targetId === undefined) {
        return Relation.failure(Relation.missingRelationError(entityId.value, relation.name))
      }
      return Relation.success(Entity.makeEntityId<S, Root>(targetId))
    },
    ancestors(entityId, relation) {
      if (!entityExists(entityId.value)) {
        return Relation.failure(Relation.missingEntityError(entityId.value))
      }
      const ancestors: Array<Entity.EntityId<S, Root>> = []
      let current = relationTargets.get(relation.key)?.get(entityId.value)
      while (current !== undefined) {
        ancestors.push(Entity.makeEntityId<S, Root>(current))
        current = relationTargets.get(relation.key)?.get(current)
      }
      return Relation.success(ancestors)
    },
    descendants(entityId, relation, options) {
      if (!entityExists(entityId.value)) {
        return Relation.failure(Relation.missingEntityError(entityId.value))
      }
      const order = options?.order ?? "depth"
      const descendants: Array<Entity.EntityId<S, Root>> = []
      const pending = [...getRelatedSourceIds(relation, entityId.value)]
      while (pending.length > 0) {
        const nextId = order === "breadth" ? pending.shift()! : pending.pop()!
        descendants.push(Entity.makeEntityId<S, Root>(nextId))
        const children = [...getRelatedSourceIds(relation, nextId)]
        if (order === "breadth") {
          pending.push(...children)
        } else {
          pending.push(...children.reverse())
        }
      }
      return Relation.success(descendants)
    },
    descendantMatches(entityId, relation, query, options) {
      const descendants = this.descendants(entityId, relation, options)
      if (!descendants.ok) {
        return descendants
      }
      const matches: Array<QueryMatch<S, typeof query>> = []
      for (const descendantId of descendants.value) {
        const resolved = this.get(descendantId, query)
        if (resolved.ok) {
          matches.push(resolved.value)
        }
      }
      return Relation.success(matches)
    },
    root(entityId, relation) {
      if (!entityExists(entityId.value)) {
        return Relation.failure(Relation.missingEntityError(entityId.value))
      }
      let current = entityId.value
      let parentId = relationTargets.get(relation.key)?.get(current)
      while (parentId !== undefined) {
        current = parentId
        parentId = relationTargets.get(relation.key)?.get(current)
      }
      return Relation.success(Entity.makeEntityId<S, Root>(current))
    }
  } satisfies import("./system.ts").LookupApi<S, Root>

  /**
   * Creates a read-only resource or state view.
   */
  const makeResourceReadView = <T>(descriptorKey: symbol, source: Map<symbol, unknown>): ResourceReadView<T> =>
    makeReadCell(() => source.get(descriptorKey) as T)

  /**
   * Creates a writable resource or state view.
   */
  const makeResourceWriteView = <D extends Descriptor<"resource" | "state", string, any>>(
    descriptor: D,
    source: Map<symbol, unknown>
  ) => {
    if (DescriptorModule.hasConstructor(descriptor)) {
      const constructor = DescriptorModule.constructorOf(descriptor)
      return makeWriteCell(
        () => source.get(descriptor.key) as Descriptor.Value<D>,
        (value) => {
          source.set(descriptor.key, value)
        },
        constructor
      )
    }
    return makeWriteCell(
      () => source.get(descriptor.key) as Descriptor.Value<D>,
      (value) => {
        source.set(descriptor.key, value)
      }
    )
  }

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
   * Creates a read-only machine transition-event stream view.
   */
  const makeTransitionEventReadView = <M extends Machine.StateMachine.Any>(stateMachine: M): TransitionEventReadView<M> => ({
    all() {
      return (readableTransitionEvents.get(stateMachine.key) ?? []) as unknown as ReadonlyArray<Machine.TransitionSnapshot<M>>
    }
  })

  /**
   * Creates a read-only removed-component lifecycle stream view.
   */
  const makeRemovedReadView = (descriptorKey: symbol): RemovedReadView<S, Root> => ({
    all() {
      return [...(readableRemovedComponents.get(descriptorKey) ?? new Set<number>())]
        .map((entityId) => Entity.makeEntityId<S, Root>(entityId))
    }
  })

  /**
   * Creates a read-only despawned-entity lifecycle stream view.
   */
  const makeDespawnedReadView = (): DespawnedReadView<S, Root> => ({
    all() {
      return [...readableDespawnedEntities].map((entityId) => Entity.makeEntityId<S, Root>(entityId))
    }
  })

  /**
   * Creates a read-only relation-mutation failure stream view.
   */
  const makeRelationFailureReadView = <R extends Relation.Relation.Any>(
    relation: R
  ): RelationFailureReadView<R, S, Root> => ({
    all() {
      return (readableRelationFailures.get(relation.key) ?? []) as unknown as ReadonlyArray<Relation.Relation.MutationFailure<R, S, Root>>
    }
  })

  /**
   * Creates a read-only machine view.
   */
  const makeMachineReadView = <M extends Machine.StateMachine.Any>(stateMachine: M): MachineReadView<M> => ({
    get: () => currentMachines.get(stateMachine.key) as Machine.StateMachine.Value<M>,
    is: (value) => currentMachines.get(stateMachine.key) === value
  })

  /**
   * Creates a queued-write machine transition view.
   */
  const makeNextMachineWriteView = <M extends Machine.StateMachine.Any>(stateMachine: M): NextMachineWriteView<M> => ({
    getPending: () => pendingMachines.get(stateMachine.key)?.value as Machine.StateMachine.Value<M> | undefined,
    set(value) {
      pendingMachines.set(stateMachine.key, {
        value,
        skipIfSame: false
      })
    },
    setIfChanged(value) {
      pendingMachines.set(stateMachine.key, {
        value,
        skipIfSame: true
      })
    },
    reset() {
      pendingMachines.delete(stateMachine.key)
    }
  })

  /**
   * Creates a transition payload view for transition schedules.
   */
  const makeTransitionReadView = <M extends Machine.StateMachine.Any>(stateMachine: M): TransitionReadView<M> => ({
    get: () => activeTransitions.get(stateMachine.key) as Machine.TransitionSnapshot<M>
  })

  /**
   * Evaluates one declarative machine-based run condition.
   */
  const evaluateCondition = (condition: Machine.Condition): boolean => {
    switch (condition.kind) {
      case "inState":
        return currentMachines.get(condition.machine.key) === condition.value
      case "stateChanged":
        return changedMachines.has(condition.machine.key)
      case "not":
        return !evaluateCondition(condition.condition)
      case "and":
        return condition.conditions.every(evaluateCondition)
      case "or":
        return condition.conditions.some(evaluateCondition)
    }
  }

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
    const commands = Command.makeCommands<S, Root>(() => internalWorld.nextEntityId())
    const queries = Object.fromEntries(
      Object.entries(system.spec.queries as Record<string, Query.Query.Any<Root>>).map(([key, query]) => [key, makeQueryHandle(query)])
    )
    const resourceViews = Object.fromEntries(
      Object.entries(system.spec.resources as Record<string, any>).map(([key, access]) => [
        key,
        access.mode === "read"
          ? makeResourceReadView(access.descriptor.key, resources)
          : makeResourceWriteView(access.descriptor, resources)
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
          ? makeResourceWriteView(access.descriptor, states)
          : makeResourceReadView(access.descriptor.key, states)
      ])
    )
    const machineViews = Object.fromEntries(
      Object.entries((system.spec.machines ?? {}) as Record<string, any>).map(([key, access]) => [
        key,
        makeMachineReadView(access.machine)
      ])
    )
    const nextMachineViews = Object.fromEntries(
      Object.entries((system.spec.nextMachines ?? {}) as Record<string, any>).map(([key, access]) => [
        key,
        makeNextMachineWriteView(access.machine)
      ])
    )
    const transitionEventViews = Object.fromEntries(
      Object.entries((system.spec.transitionEvents ?? {}) as Record<string, any>).map(([key, access]) => [
        key,
        makeTransitionEventReadView(access.machine)
      ])
    )
    const transitionViews = Object.fromEntries(
      Object.entries((system.spec.transitions ?? {}) as Record<string, any>).map(([key, access]) => [
        key,
        makeTransitionReadView(access.machine)
      ])
    )
    const removedViews = Object.fromEntries(
      Object.entries((system.spec.removed ?? {}) as Record<string, any>).map(([key, access]) => [
        key,
        makeRemovedReadView(access.descriptor.key)
      ])
    )
    const despawnedViews = Object.fromEntries(
      Object.entries((system.spec.despawned ?? {}) as Record<string, any>).map(([key]) => [
        key,
        makeDespawnedReadView()
      ])
    )
    const relationFailureViews = Object.fromEntries(
      Object.entries((system.spec.relationFailures ?? {}) as Record<string, any>).map(([key, access]) => [
        key,
        makeRelationFailureReadView(access.relation)
      ])
    )
    const serviceViews = Object.fromEntries(
      Object.entries(system.spec.services as Record<string, any>).map(([key, access]) => [
        key,
        providedServices[access.descriptor.name as keyof RuntimeServicesOf<ProvidedServices>]
      ])
    )

    return {
      queries,
      lookup,
      resources: resourceViews,
      events: eventViews,
      states: stateViews,
      machines: machineViews,
      nextMachines: nextMachineViews,
      transitionEvents: transitionEventViews,
      removed: removedViews,
      despawned: despawnedViews,
      relationFailures: relationFailureViews,
      transitions: transitionViews,
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
    if ((system.spec.when as ReadonlyArray<Machine.Condition> | undefined)?.some((condition) => !evaluateCondition(condition))) {
      return []
    }
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
    readableTransitionEvents = pendingTransitionEvents
    pendingTransitionEvents = new Map()
  }

  /**
   * Advances readable lifecycle buffers to the latest pending writes.
   */
  const updateLifecycle = (): void => {
    readableAddedComponents = pendingAddedComponents
    pendingAddedComponents = new Map()
    readableChangedComponents = pendingChangedComponents
    pendingChangedComponents = new Map()
    readableRemovedComponents = pendingRemovedComponents
    pendingRemovedComponents = new Map()
    readableDespawnedEntities = pendingDespawnedEntities
    pendingDespawnedEntities = new Set()
  }

  /**
   * Advances readable relation-failure buffers to the latest pending writes.
   */
  const updateRelationFailures = (): void => {
    readableRelationFailures = pendingRelationFailures
    pendingRelationFailures = new Map()
  }

  const hasPendingEvents = (): boolean =>
    pendingEvents.size > 0 || pendingTransitionEvents.size > 0

  const hasPendingLifecycle = (): boolean =>
    pendingAddedComponents.size > 0
    || pendingChangedComponents.size > 0
    || pendingRemovedComponents.size > 0
    || pendingDespawnedEntities.size > 0

  const hasPendingRelationFailures = (): boolean =>
    pendingRelationFailures.size > 0

  /**
   * Runs one internal transition schedule with an active transition snapshot.
   */
  const runTransitionSchedule = (
    schedule: Machine.StateMachine.AnyTransitionSchedule<S, Root>,
    snapshot: Machine.TransitionSnapshot
  ): void => {
    if (schedule.steps.some((step) => !Schedule.isSystemStep(step) && step.kind === "applyStateTransitions")) {
      throw new Error("Transition schedules cannot contain applyStateTransitions() steps")
    }
    activeTransitions.set(schedule.transition.machine.key, snapshot)
    runScheduleUnsafe(schedule as unknown as ScheduleDefinition<S, AnyRequirements, Root>, {
      resetChangedMachines: false
    })
    activeTransitions.delete(schedule.transition.machine.key)
  }

  /**
   * Applies queued machine transitions and runs matching transition schedules.
   */
  const applyStateTransitions = (
    deferred: Array<Command.DeferredCommand<S>>,
    bundle?: Schedule.TransitionBundleDefinition<S, ReadonlyArray<Machine.StateMachine.AnyTransitionSchedule<S, Root>>, any, Root>
  ): void => {
    applyDeferred(deferred)
    changedMachines = new Set()
    const scheduledTransitions = Array.from(pendingMachines.entries())
      .sort(([leftKey], [rightKey]) =>
        (machineDefinitionOrder.get(leftKey) ?? Number.MAX_SAFE_INTEGER)
        - (machineDefinitionOrder.get(rightKey) ?? Number.MAX_SAFE_INTEGER)
      )

    for (const [machineKey] of scheduledTransitions) {
      pendingMachines.delete(machineKey)
    }

    for (const [machineKey, pending] of scheduledTransitions) {
      const current = currentMachines.get(machineKey)
      if (current === undefined) {
        continue
      }
      if (pending.skipIfSame && current === pending.value) {
        continue
      }

      previousMachines.set(machineKey, current)
      const snapshot = {
        from: current as Machine.StateValue,
        to: pending.value as Machine.StateValue
      }

      const schedules = bundle?.entries ?? []
      const exitSchedules = schedules.filter((schedule) =>
        schedule.transition.phase === "exit"
        && schedule.transition.machine.key === machineKey
        && schedule.transition.state === snapshot.from
      )
      const transitionSchedules = schedules.filter((schedule) =>
        schedule.transition.phase === "transition"
        && schedule.transition.machine.key === machineKey
        && schedule.transition.from === snapshot.from
        && schedule.transition.to === snapshot.to
      )

      for (const schedule of exitSchedules) {
        runTransitionSchedule(schedule, snapshot)
      }
      for (const schedule of transitionSchedules) {
        runTransitionSchedule(schedule, snapshot)
      }

      currentMachines.set(machineKey, pending.value)
      changedMachines.add(machineKey)
      const transitionEvents = pendingTransitionEvents.get(machineKey) ?? []
      transitionEvents.push(snapshot)
      pendingTransitionEvents.set(machineKey, transitionEvents)

      const enterSchedules = schedules.filter((schedule) =>
        schedule.transition.phase === "enter"
        && schedule.transition.machine.key === machineKey
        && schedule.transition.state === snapshot.to
      )
      for (const schedule of enterSchedules) {
        runTransitionSchedule(schedule, snapshot)
      }
    }
  }

  /**
   * The final loop-agnostic runtime value returned to users.
   */
  const runScheduleUnsafe = (
    schedule: ScheduleDefinition<S, AnyRequirements, Root>,
    options: {
      readonly resetChangedMachines?: boolean
    } = {}
  ): void => {
    const deferred: Array<Command.DeferredCommand<S>> = []
    if (options.resetChangedMachines ?? true) {
      changedMachines = new Set()
    }
    for (const step of schedule.steps) {
      if (Schedule.isSystemStep(step)) {
        const blockedByWhen = step.spec.when.some((condition: Machine.Condition) => !evaluateCondition(condition))
        if (!blockedByWhen) {
          deferred.push(...runSystem(step as SystemDefinition<any, any, any>))
        }
        continue
      }
      if (step.kind === "applyDeferred") {
        applyDeferred(deferred)
        continue
      }
      if (step.kind === "applyStateTransitions") {
        applyStateTransitions(deferred, step.bundle as never)
        continue
      }
      if (step.kind === "eventUpdate") {
        updateEvents()
        continue
      }
      if (step.kind === "lifecycleUpdate") {
        updateLifecycle()
        continue
      }
      updateRelationFailures()
    }
    const lastStep = schedule.steps.at(-1)
    applyDeferred(deferred)
    if (!lastStep || Schedule.isSystemStep(lastStep) || lastStep.kind !== "eventUpdate") {
      updateEvents()
    }
    if ((!lastStep || Schedule.isSystemStep(lastStep) || lastStep.kind !== "lifecycleUpdate") && hasPendingLifecycle()) {
      updateLifecycle()
    }
    if ((!lastStep || Schedule.isSystemStep(lastStep) || lastStep.kind !== "relationFailureUpdate") && hasPendingRelationFailures()) {
      updateRelationFailures()
    }
  }

  /**
   * Executes multiple schedules after their requirement checks have passed.
   */
  const tickUnsafe = (schedules: ReadonlyArray<ExecutableScheduleDefinition<S, AnyRequirements, Root>>): void => {
    for (const schedule of schedules) {
      runScheduleUnsafe(schedule as ScheduleDefinition<S, AnyRequirements, Root>)
    }
  }

  /**
   * The final loop-agnostic runtime value returned to users.
   */
  const runtime: Runtime<
    S,
    Simplify<RuntimeServicesOf<ProvidedServices>>,
    Resources,
    States,
    Root,
    RuntimeMachinesOf<ProvidedMachines>
  > = {
    schema: options.schema,
    services: providedServices,
    resourceValues: (options.resources ?? {}) as Resources,
    stateValues: (options.states ?? {}) as States,
    machineValues: providedMachines as RuntimeMachinesOf<ProvidedMachines>,
    initialize(...schedules) {
      tickUnsafe(schedules)
    },
    runSchedule(schedule) {
      runScheduleUnsafe(schedule as unknown as ScheduleDefinition<S, AnyRequirements, Root>)
    },
    tick(...schedules) {
      tickUnsafe(schedules)
    }
  }

  return runtime
}

/**
 * Builds one runtime from explicit result-wrapped resource and state values.
 *
 * @example
 * ```ts
 * const runtime = Game.Runtime.makeResult({
 *   services: Game.Runtime.services(),
 *   resources: {
 *     viewport: Size2.result({ width: 800, height: 600 })
 *   }
 * })
 * ```
 */
export const makeRuntimeResult = <
  S extends Schema.Any,
  const ProvidedServices extends RuntimeServices<any>,
  const Resources extends RuntimeResultResources<S> = {},
  const States extends RuntimeResultStates<S> = {},
  Root = unknown,
  const ProvidedMachines extends RuntimeMachines<any> = RuntimeMachines<{}>
>(options: {
  readonly schema: S
  readonly services: ProvidedServices
  readonly resources?: Resources
  readonly states?: States
  readonly machines?: ProvidedMachines
  readonly machineDefinitions?: ReadonlyArray<Machine.StateMachine.Any>
}): Result.Result<
  Runtime<
    S,
    Simplify<RuntimeServicesOf<ProvidedServices>>,
    ValidatedRuntimeResources<S, Resources>,
    ValidatedRuntimeStates<S, States>,
    Root,
    RuntimeMachinesOf<ProvidedMachines>
  >,
  RuntimeConstructionError<S, Resources, States>
> => {
  const resources = collectRegistryResults(options.schema.resources, options.resources)
  const states = collectRegistryResults(options.schema.states, options.states)

  if (!resources.ok || !states.ok) {
    return Result.failure({
      resources: resources.ok ? {} : resources.error,
      states: states.ok ? {} : states.error
    } as RuntimeConstructionError<S, Resources, States>)
  }

  return Result.success(
    makeRuntime<S, ProvidedServices, ValidatedRuntimeResources<S, Resources>, ValidatedRuntimeStates<S, States>, Root, ProvidedMachines>({
      schema: options.schema,
      services: options.services,
      resources: resources.value as ValidatedRuntimeResources<S, Resources>,
      states: states.value as ValidatedRuntimeStates<S, States>,
      ...(options.machines === undefined ? {} : { machines: options.machines }),
      ...(options.machineDefinitions === undefined ? {} : { machineDefinitions: options.machineDefinitions })
    })
  )
}

/**
 * Builds one runtime from raw values routed through constructed resource and
 * state descriptors.
 *
 * Use this when runtime bootstrap naturally starts from raw host or authored
 * data and you want descriptor-carried validation to stay explicit at the
 * bootstrap boundary.
 *
 * @example
 * ```ts
 * const runtime = Game.Runtime.makeConstructed({
 *   services: Game.Runtime.services(),
 *   resources: {
 *     viewport: { width: 800, height: 600 }
 *   }
 * })
 * ```
 */
export const makeRuntimeConstructed = <
  S extends Schema.Any,
  const ProvidedServices extends RuntimeServices<any>,
  const ProvidedMachines extends RuntimeMachines<any> = RuntimeMachines<{}>,
  const Resources extends RuntimeConstructedResources<S> = {},
  const States extends RuntimeConstructedStates<S> = {},
  Root = unknown
>(options: {
  readonly schema: S
  readonly services: ProvidedServices
  readonly resources?: Resources
  readonly states?: States
  readonly machines?: ProvidedMachines
  readonly machineDefinitions?: ReadonlyArray<Machine.StateMachine.Any>
}): Result.Result<
  Runtime<
    S,
    Simplify<RuntimeServicesOf<ProvidedServices>>,
    ValidatedConstructedRuntimeResources<S, Resources>,
    ValidatedConstructedRuntimeStates<S, States>,
    Root,
    RuntimeMachinesOf<ProvidedMachines>
  >,
  RuntimeConstructedConstructionError<S, Resources, States>
> => {
  const resources = collectConstructedRegistryValues(options.schema.resources, options.resources)
  const states = collectConstructedRegistryValues(options.schema.states, options.states)

  if (!resources.ok || !states.ok) {
    return Result.failure({
      resources: resources.ok ? {} : resources.error,
      states: states.ok ? {} : states.error
    } as RuntimeConstructedConstructionError<S, Resources, States>)
  }

  return Result.success(
    makeRuntime<S, ProvidedServices, ValidatedConstructedRuntimeResources<S, Resources>, ValidatedConstructedRuntimeStates<S, States>, Root, ProvidedMachines>({
      schema: options.schema,
      services: options.services,
      resources: resources.value as ValidatedConstructedRuntimeResources<S, Resources>,
      states: states.value as ValidatedConstructedRuntimeStates<S, States>,
      ...(options.machines === undefined ? {} : { machines: options.machines }),
      ...(options.machineDefinitions === undefined ? {} : { machineDefinitions: options.machineDefinitions })
    })
  )
}

/**
 * Builds one runtime from raw values routed through constructed resource and
 * state descriptors.
 *
 * Use this when runtime bootstrap naturally starts from raw host or authored
 * data and you want descriptor-carried validation to stay explicit at the
 * bootstrap boundary.
 *
 * @example
 * ```ts
 * const runtime = Game.Runtime.makeConstructed({
 *   services: Game.Runtime.services(),
 *   resources: {
 *     viewport: { width: 800, height: 600 }
 *   }
 * })
 * ```
 */

/**
 * Builds the descriptor-backed runtime service environment.
 *
 * Use this instead of writing service objects keyed by strings manually. The
 * helper derives the runtime map directly from service descriptors, so the key
 * used at runtime can never drift from the declared service identity.
 *
 * @example
 * ```ts
 * const services = Game.Runtime.services(
 *   Game.Runtime.service(Logger, { log: console.log }),
 *   Game.Runtime.service(Random, { next: Math.random })
 * )
 * ```
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

/**
 * Builds the machine initialization environment from machine definitions.
 *
 * Use this when the runtime must start with committed machine values.
 */
export const machines = <
  const Entries extends ReadonlyArray<MachineProvision>
>(...entries: Entries): RuntimeMachines<MachineEntriesToRecord<Entries>> => {
  const provided: Record<string, unknown> = {}
  for (const { machine, initial } of entries) {
    provided[machine.name] = initial
  }
  return {
    ...provided,
    [runtimeMachinesEntries]: entries
  } as unknown as RuntimeMachines<MachineEntriesToRecord<Entries>>
}

/**
 * Creates one machine initialization provision.
 *
 * @example
 * ```ts
 * const machines = Game.Runtime.machines(
 *   Game.Runtime.machine(GameFlow, "Menu")
 * )
 * ```
 */
export const machine = <
  M extends Machine.StateMachine.Any
>(
  stateMachine: M,
  initial: Machine.StateMachine.Value<M>
): MachineProvision<M> => ({
  machine: stateMachine,
  initial
})
