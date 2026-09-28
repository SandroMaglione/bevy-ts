/**
 * Runtime creation, world storage, and schedule execution.
 *
 * The runtime is the concrete owner of the ECS world. It holds entities,
 * resources, states, relation graphs, machines, event buffers, lifecycle
 * buffers, and the host-provided services declared by systems.
 *
 * This module is where the library's explicit execution model becomes real:
 *
 * - systems never run without a runtime
 * - schedules are the only way world visibility advances
 * - service injection stays separate from world storage
 * - construction-time validation remains visible through result-returning APIs
 *
 * Reach for this module when wiring the final game object that a browser loop,
 * server process, test, or custom engine adapter will actually execute.
 *
 * @example
 * ```ts
 * // Provide the services systems declared in their specs.
 * const services = Game.Runtime.services(
 *   Game.Runtime.service(RenderClock, { now: () => performance.now() }),
 *   Game.Runtime.service(Random, { next: Math.random })
 * )
 *
 * // Bootstrap the runtime from raw host values through constructed descriptors.
 * const runtime = Game.Runtime.makeConstructed({
 *   services,
 *   resources: {
 *     viewport: { width: 800, height: 600 }
 *   },
 *   machines: Game.Runtime.machines(
 *     Game.Runtime.machine(GameFlow, "Boot")
 *   )
 * })
 *
 * if (!runtime.ok) {
 *   throw new Error("Invalid runtime bootstrap data")
 * }
 *
 * // The runtime owns the world and executes explicit schedules.
 * runtime.value.initialize(setupSchedule)
 * runtime.value.tick(updateSchedule)
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
import type * as Entity from "./entity.ts"
import type * as Inspector from "./inspector.ts"
import * as Cells from "./internal/cells.ts"
import { makeQueryEngine } from "./internal/queries.ts"
import { makeWorld } from "./internal/world.ts"
import type * as Machine from "./machine.ts"
import * as Query from "./query.ts"
import type { QueryMatch, ReadonlyValue } from "./query.ts"
import * as Relation from "./relation.ts"
import type * as Requirement from "./requirement.ts"
import * as Result from "./Result.ts"
import * as Schedule from "./schedule.ts"
import type { ExecutableScheduleDefinition } from "./schedule.ts"
import type { Registry, Schema } from "./schema.ts"
import type {
  DespawnedReadView,
  EventReadView,
  EventWriteView,
  LookupApi,
  QueryHandle,
  RelationFailureReadView,
  RemovedReadView,
  TransitionEventReadView,
  MachineReadView,
  NextMachineWriteView,
  SystemContext,
  SystemDefinition,
  SystemFailure,
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

type RegistryKeysForDescriptor<
  Values extends Registry,
  D extends Descriptor.Any
> = {
  readonly [K in keyof Values]:
    [Values[K]] extends [D]
      ? [D] extends [Values[K]] ? K : never
      : never
}[keyof Values]

type ProvisionedDescriptorValue<
  Values extends Registry,
  Provided extends object,
  D extends Descriptor.Any
> = Provided[Extract<RegistryKeysForDescriptor<Values, D>, keyof Provided>]

type DescriptorProvisionError<
  Kind extends string,
  Values extends Registry,
  Provided extends object,
  D extends Descriptor.Any
> = [Extract<RegistryKeysForDescriptor<Values, D>, keyof Provided>] extends [never]
  ? {
      readonly __runtimeRequirementError__: `Missing ${Kind}`
      readonly __requirement__: Descriptor.Name<D>
    }
  : [ProvisionedDescriptorValue<Values, Provided, D>] extends [Descriptor.Value<D>]
    ? never
    : {
        readonly __runtimeRequirementError__: `Incompatible ${Kind}`
        readonly __requirement__: Descriptor.Name<D>
      }

type RequirementErrorFor<
  Need extends Requirement.Requirement,
  S extends Schema.Any,
  Services extends Record<string, unknown>,
  Resources extends object,
  States extends object,
  Machines extends object
> = Need extends Descriptor<"service", infer Name, infer Value>
  ? Name extends keyof Services
    ? [Services[Name]] extends [Value] ? never : {
        readonly __runtimeRequirementError__: "Incompatible service"
        readonly __requirement__: Name
      }
    : {
        readonly __runtimeRequirementError__: "Missing service"
        readonly __requirement__: Name
      }
  : Need extends Descriptor<"resource", string, any>
    ? DescriptorProvisionError<"resource", Schema.Resources<S>, Resources, Need>
  : Need extends Descriptor<"state", string, any>
    ? DescriptorProvisionError<"state", Schema.States<S>, States, Need>
  : Need extends Machine.StateMachineDefinition<infer Name, infer Values, any>
    ? Name extends keyof Machines
      ? [Machines[Name]] extends [Values[number]] ? never : {
          readonly __runtimeRequirementError__: "Incompatible machine"
          readonly __requirement__: Name
        }
      : {
          readonly __runtimeRequirementError__: "Missing machine"
          readonly __requirement__: Name
        }
  : never

type RequirementErrorsFor<
  Needs extends Requirement.Requirement,
  S extends Schema.Any,
  Services extends Record<string, unknown>,
  Resources extends object,
  States extends object,
  Machines extends object
> = Needs extends Requirement.Requirement
  ? RequirementErrorFor<Needs, S, Services, Resources, States, Machines>
  : never

type RequirementErrorsOfSchedule<
  Selected extends ExecutableScheduleDefinition<any, any, any, any, any>,
  Services extends Record<string, unknown>,
  Resources extends object,
  States extends object,
  Machines extends object
> = Selected extends ExecutableScheduleDefinition<infer S, any, any, any, any>
  ? RequirementErrorsFor<Requirement.Of<Selected>, S, Services, Resources, States, Machines>
  : never

export type ValidateSchedules<
  Schedules extends ReadonlyArray<ExecutableScheduleDefinition<any, any, any, any, any>>,
  Services extends Record<string, unknown>,
  Resources extends object,
  States extends object,
  Machines extends object
> = {
  readonly [K in keyof Schedules]:
    Schedules[K] & ValidateSchedule<
      Extract<Schedules[K], ExecutableScheduleDefinition<any, any, any, any, any>>,
      Services,
      Resources,
      States,
      Machines
    >
}

export type ValidateScheduleArray<
  Schedules extends ReadonlyArray<ExecutableScheduleDefinition<any, any, any, any, any>>,
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
  Schedules extends ReadonlyArray<ExecutableScheduleDefinition<any, any, any, any, any>>,
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
  Schedule extends ExecutableScheduleDefinition<any, any, any, any, any>,
  Services extends Record<string, unknown>,
  Resources extends object,
  States extends object,
  Machines extends object
> = [RequirementErrorsOfSchedule<Schedule, Services, Resources, States, Machines>] extends [never]
  ? unknown
  : {
      readonly __fixRuntimeRequirements__: RequirementErrorsOfSchedule<Schedule, Services, Resources, States, Machines>
    }

type RequirementErrorsOfInspector<
  Selected extends Inspector.Inspector.Any,
  Services extends Record<string, unknown>,
  Resources extends object,
  States extends object,
  Machines extends object
> = Selected extends Inspector.InspectorDefinition<infer Spec, any, any, any, infer Needs>
  ? RequirementErrorsFor<Needs, Spec["schema"], Services, Resources, States, Machines>
  : never

type ValidateInspector<
  Selected extends Inspector.Inspector.Any,
  Services extends Record<string, unknown>,
  Resources extends object,
  States extends object,
  Machines extends object
> = [RequirementErrorsOfInspector<Selected, Services, Resources, States, Machines>] extends [never]
  ? unknown
  : {
      readonly __fixRuntimeRequirements__: RequirementErrorsOfInspector<Selected, Services, Resources, States, Machines>
    }

export type AnyRequirements = Requirement.Requirement

/** One runtime requirement that is not currently provisioned. */
export interface MissingRuntimeRequirement {
  readonly kind: Requirement.RequirementValue["kind"]
  readonly name: string
}

/** Explicit failure returned by the dynamic schedule execution path. */
export interface MissingRuntimeRequirements {
  readonly kind: "MissingRuntimeRequirements"
  readonly requirements: ReadonlyArray<MissingRuntimeRequirement>
}

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
    <const Schedules extends ReadonlyArray<ExecutableScheduleDefinition<S, any, Root, any, any>>>(
      ...schedules: ValidateScheduleArgs<Schedules, Services, Resources, States, Machines>
    ): Result.Result<void, Schedule.FailureOf<Schedules[number]>>
  }
  /**
   * Runs one schedule once.
   *
   * Deferred commands, events, lifecycle records, and relation failures
   * advance only at explicit schedule marker steps. Nothing is flushed when
   * the schedule ends: anything still pending stays pending, across schedule
   * runs, until a later marker advances it.
   *
   * Use this when you want one explicit schedule execution rather than a batch
   * of schedules.
   */
  readonly runSchedule: {
    <const Selected extends ExecutableScheduleDefinition<S, any, Root, any, any>>(
      schedule: Selected
        & ValidateSchedule<NoInfer<Selected>, Services, Resources, States, Machines>
    ): Result.Result<void, Schedule.FailureOf<Selected>>
  }
  /**
   * Runs a schedule whose exact requirements are not statically known.
   *
   * This path validates the carried nominal tokens against current runtime
   * provisioning and returns missing requirements as data.
   */
  readonly tryRunSchedule: <const Selected extends ExecutableScheduleDefinition<S, any, any, any, any>>(
    schedule: Selected
  ) => Result.Result<void, MissingRuntimeRequirements | Schedule.FailureOf<Selected>>
  /**
   * Evaluates one read-only projection without advancing schedule visibility.
   */
  readonly inspect: {
    <const Selected extends Inspector.InspectorDefinition<any, any, Root, any, any>>(
      inspector: Selected & ValidateInspector<Selected, Services, Resources, States, Machines>
    ): Inspector.Inspector.Value<Selected>
  }
  /**
   * Runs multiple schedules in sequence.
   *
   * Schedules share the runtime's pending buffers, so a later schedule
   * observes an earlier schedule's commands or events once it (or anything
   * before it) runs the matching marker, such as `applyDeferred()` or
   * `updateEvents()`.
   */
  readonly tick: {
    <const Schedules extends ReadonlyArray<ExecutableScheduleDefinition<S, any, Root, any, any>>>(
      ...schedules: ValidateScheduleArgs<Schedules, Services, Resources, States, Machines>
    ): Result.Result<void, Schedule.FailureOf<Schedules[number]>>
  }
}

/**
 * Creates a runtime for a fully built schema and a set of external services.
 *
 * Use this when bootstrap data is already in carried form and you want the
 * most direct path from bound schema to executable world. This is the final
 * assembly step that turns the type-level ECS design into a concrete runtime
 * value.
 *
 * The runtime does not own the outer frame loop. It only owns ECS state plus
 * the host-provided services that systems are allowed to depend on.
 *
 * @example
 * ```ts
 * // Assemble the world once all schema and schedules are defined.
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
  const world = makeWorld(options.schema)
  const queries = makeQueryEngine(world)

  /**
   * Descriptor-keyed world resource and state storage.
   */
  const resources = new Map<symbol, unknown>()
  const states = new Map<symbol, unknown>()
  seedRegistryStore(options.schema.resources, options.resources, resources)
  seedRegistryStore(options.schema.states, options.states, states)

  /**
   * Machine-keyed committed, pending, and previous values.
   */
  const currentMachines = new Map<symbol, unknown>()
  const pendingMachines = new Map<symbol, { value: unknown; skipIfSame: boolean }>()
  const previousMachines = new Map<symbol, unknown>()
  /**
   * Machine keys changed by transitions applied during the current schedule run.
   */
  let changedMachines = new Set<symbol>()
  /**
   * Active transition payloads for schedules running inside a transition phase.
   */
  const activeTransitions = new Map<symbol, Machine.TransitionSnapshot>()

  /**
   * Double-buffered event, transition-event, and relation-failure streams.
   * Writes land in `pending*`; the matching schedule marker swaps them into
   * `readable*`.
   */
  let readableEvents = new Map<symbol, Array<unknown>>()
  let pendingEvents = new Map<symbol, Array<unknown>>()
  let readableTransitionEvents = new Map<symbol, Array<Machine.TransitionSnapshot>>()
  let pendingTransitionEvents = new Map<symbol, Array<Machine.TransitionSnapshot>>()
  let readableRelationFailures = new Map<symbol, Array<Relation.Relation.MutationFailure<Relation.Relation.Any, S, Root>>>()
  let pendingRelationFailures = new Map<symbol, Array<Relation.Relation.MutationFailure<Relation.Relation.Any, S, Root>>>()

  /**
   * Commands queued by systems and not yet applied. They persist across
   * schedule runs until an `applyDeferred()` or `applyStateTransitions(...)`
   * step applies them.
   */
  const pendingCommands: Array<Command.DeferredCommand<S>> = []

  const providedServices = options.services as unknown as Simplify<RuntimeServicesOf<ProvidedServices>>
  const providedMachines = (options.machines ?? machines()) as unknown as Simplify<RuntimeMachinesOf<ProvidedMachines>>
  const machineEntries = (options.machines ?? machines())[runtimeMachinesEntries]
  const machineDefinitionOrder = new Map(
    (options.machineDefinitions ?? []).map((machine, index) => [machine.key, index] as const)
  )

  for (const provision of machineEntries) {
    currentMachines.set(provision.machine.key, provision.initial)
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
        world.entityIdOf(sourceId) as Entity.EntityId<S, Root>,
        world.entityIdOf(targetId) as Entity.EntityId<S, Root>,
        error
      )
    )
    pendingRelationFailures.set(relation.key, failures)
  }

  /**
   * World adapter used by deferred commands.
   */
  const commandWorld: Command.InternalWorld<S> = {
    spawnEntity(id, components) {
      world.spawnEntity(id, components)
    },
    destroyEntity(id) {
      world.destroyEntity(id.value)
    },
    assignEntityScope(id, scope) {
      world.assignEntityScope(id.value, scope.key)
    },
    destroyEntityScope(scope) {
      world.destroyEntityScope(scope.key)
    },
    removeComponent(id, descriptor) {
      world.removeComponent(id.value, descriptor)
    },
    writeComponent(id, descriptor, value) {
      world.writeComponent(id.value, descriptor, value)
    },
    tryRelate(id, relation, target) {
      const result = world.tryRelate(id.value, relation, target.value)
      if (!result.ok) {
        appendRelationFailure(relation, "relate", id.value, target.value, result.error)
      }
      return result
    },
    unrelate(id, relation) {
      world.unrelate(id.value, relation)
    },
    reorderChildren(id, relation, children) {
      const result = world.reorderChildren(id.value, relation, children.map((child) => child.value))
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

  const entityId = (id: number): Entity.EntityId<S, Root> => world.entityIdOf(id) as Entity.EntityId<S, Root>

  const resolve = <Q extends Query.Query.Any<Root>>(id: number, query: Q) =>
    queries.get(id, query) as Query.Query.Result<QueryMatch<S, Q>, Query.Query.LookupError>

  const relatedTarget = (
    target: Entity.EntityId<S, Root>,
    relation: Relation.Relation.Any
  ): Relation.Relation.Result<Entity.EntityId<S, Root>, Relation.Relation.LookupError> => {
    if (!world.records.has(target.value)) {
      return Relation.failure(Relation.missingEntityError(target.value))
    }
    const targetId = world.relationTarget(relation, target.value)
    if (targetId === undefined) {
      return Relation.failure(Relation.missingRelationError(target.value, relation.name))
    }
    return Relation.success(entityId(targetId))
  }

  const lookup: LookupApi<S, Root> = {
    get(target, query) {
      return resolve(target.value, query)
    },
    getHandle(handle, query) {
      return resolve(handle.value, query)
    },
    related: relatedTarget,
    relatedSources(target, relation) {
      if (!world.records.has(target.value)) {
        return Relation.failure(Relation.missingEntityError(target.value))
      }
      return Relation.success(world.relatedSourceIds(relation, target.value).map(entityId))
    },
    childMatches(target, relation, query) {
      if (!world.records.has(target.value)) {
        return Relation.failure(Relation.missingEntityError(target.value))
      }
      const matches: Array<QueryMatch<S, typeof query>> = []
      for (const sourceId of world.relatedSourceIds(relation, target.value)) {
        const resolved = resolve(sourceId, query)
        if (resolved.ok) {
          matches.push(resolved.value)
        }
      }
      return Relation.success(matches)
    },
    parent: relatedTarget,
    ancestors(target, relation) {
      if (!world.records.has(target.value)) {
        return Relation.failure(Relation.missingEntityError(target.value))
      }
      const ancestors: Array<Entity.EntityId<S, Root>> = []
      let current = world.relationTarget(relation, target.value)
      while (current !== undefined) {
        ancestors.push(entityId(current))
        current = world.relationTarget(relation, current)
      }
      return Relation.success(ancestors)
    },
    descendants(target, relation, options) {
      if (!world.records.has(target.value)) {
        return Relation.failure(Relation.missingEntityError(target.value))
      }
      const descendants: Array<Entity.EntityId<S, Root>> = []
      if (options?.order === "breadth") {
        const pending = [...world.relatedSourceIds(relation, target.value)]
        for (let index = 0; index < pending.length; index++) {
          const nextId = pending[index]!
          descendants.push(entityId(nextId))
          pending.push(...world.relatedSourceIds(relation, nextId))
        }
      } else {
        const pending = [...world.relatedSourceIds(relation, target.value)].reverse()
        while (pending.length > 0) {
          const nextId = pending.pop()!
          descendants.push(entityId(nextId))
          const children = world.relatedSourceIds(relation, nextId)
          for (let index = children.length - 1; index >= 0; index--) {
            pending.push(children[index]!)
          }
        }
      }
      return Relation.success(descendants)
    },
    descendantMatches(target, relation, query, options) {
      const descendants = lookup.descendants(target, relation, options)
      if (!descendants.ok) {
        return descendants
      }
      const matches: Array<QueryMatch<S, typeof query>> = []
      for (const descendantId of descendants.value) {
        const resolved = resolve(descendantId.value, query)
        if (resolved.ok) {
          matches.push(resolved.value)
        }
      }
      return Relation.success(matches)
    },
    root(target, relation) {
      if (!world.records.has(target.value)) {
        return Relation.failure(Relation.missingEntityError(target.value))
      }
      let current = target.value
      let parentId = world.relationTarget(relation, current)
      while (parentId !== undefined) {
        current = parentId
        parentId = world.relationTarget(relation, current)
      }
      return Relation.success(entityId(current))
    }
  }

  const makeQueryHandle = <Q extends Query.Query.Any<Root>>(query: Q): QueryHandle<S, Q> => {
    const each = () => queries.each(query) as ReadonlyArray<QueryMatch<S, Q>>
    return {
      each,
      get(target) {
        return lookup.get(target, query)
      },
      single() {
        const matches = each()
        if (matches.length === 0) {
          return Query.failure(Query.noEntitiesError())
        }
        if (matches.length > 1) {
          return Query.failure(Query.multipleEntitiesError(matches.length))
        }
        return Query.success(matches[0]!)
      },
      singleOptional() {
        const matches = each()
        if (matches.length > 1) {
          return Query.failure(Query.multipleEntitiesError(matches.length))
        }
        return Query.success(matches[0])
      }
    }
  }

  /**
   * Journal for the running system's resource, state, event, and queued
   * machine writes. Component writes are journaled by the world. On an
   * expected failure everything is restored and the system's commands are
   * discarded; on success, buffered events are published.
   */
  const absentValue = Symbol("bevy-ts/absent-value")
  const resourceOriginals = new Map<symbol, unknown>()
  const stateOriginals = new Map<symbol, unknown>()
  const machineOriginals = new Map<symbol, { value: unknown; skipIfSame: boolean } | typeof absentValue>()
  const emittedEvents = new Map<symbol, Array<unknown>>()

  const journalStoreWrite = (store: Map<symbol, unknown>, originals: Map<symbol, unknown>) =>
    (key: symbol, value: unknown): void => {
      if (!originals.has(key)) {
        originals.set(key, store.has(key) ? store.get(key) : absentValue)
      }
      store.set(key, value)
    }
  const writeResource = journalStoreWrite(resources, resourceOriginals)
  const writeState = journalStoreWrite(states, stateOriginals)

  const journalMachine = (key: symbol): void => {
    if (!machineOriginals.has(key)) {
      machineOriginals.set(key, pendingMachines.get(key) ?? absentValue)
    }
  }

  const beginSystemTransaction = (): void => {
    world.beginTransaction()
  }

  const commitSystemTransaction = (): void => {
    world.commitTransaction()
    for (const [key, values] of emittedEvents) {
      const pending = pendingEvents.get(key)
      if (pending) {
        pending.push(...values)
      } else {
        pendingEvents.set(key, values)
      }
    }
    emittedEvents.clear()
    resourceOriginals.clear()
    stateOriginals.clear()
    machineOriginals.clear()
  }

  const restoreStore = (store: Map<symbol, unknown>, originals: Map<symbol, unknown>): void => {
    for (const [key, value] of originals) {
      if (value === absentValue) {
        store.delete(key)
      } else {
        store.set(key, value)
      }
    }
    originals.clear()
  }

  const rollbackSystemTransaction = (): void => {
    world.rollbackTransaction()
    restoreStore(resources, resourceOriginals)
    restoreStore(states, stateOriginals)
    for (const [key, value] of machineOriginals) {
      if (value === absentValue) {
        pendingMachines.delete(key)
      } else {
        pendingMachines.set(key, value)
      }
    }
    machineOriginals.clear()
    emittedEvents.clear()
  }

  const makeResourceWriteView = (
    descriptor: Descriptor<"resource" | "state", string, any>,
    store: Map<symbol, unknown>,
    write: (key: symbol, value: unknown) => void
  ) => Cells.storeWrite(store, descriptor.key, write, DescriptorModule.constructorOf(descriptor))

  const makeEventReadView = <T>(descriptorKey: symbol): EventReadView<T> => ({
    all() {
      return (readableEvents.get(descriptorKey) ?? []) as ReadonlyArray<ReadonlyValue<T>>
    }
  })

  const makeEventWriteView = <T>(descriptorKey: symbol): EventWriteView<T> => ({
    emit(value) {
      const queue = emittedEvents.get(descriptorKey)
      if (queue) {
        queue.push(value)
      } else {
        emittedEvents.set(descriptorKey, [value])
      }
    }
  })

  const makeTransitionEventReadView = <M extends Machine.StateMachine.Any>(stateMachine: M): TransitionEventReadView<M> => ({
    all() {
      return (readableTransitionEvents.get(stateMachine.key) ?? []) as unknown as ReadonlyArray<Machine.TransitionSnapshot<M>>
    }
  })

  const makeRemovedReadView = (descriptor: Descriptor<"component", string, any>): RemovedReadView<S, Root> => {
    const ordinal = world.ordinalOf(descriptor)
    return {
      all() {
        return [...(world.readableRemoved(ordinal) ?? [])].map(entityId)
      }
    }
  }

  const makeDespawnedReadView = (): DespawnedReadView<S, Root> => ({
    all() {
      return [...world.readableDespawned()].map(entityId)
    }
  })

  const makeRelationFailureReadView = <R extends Relation.Relation.Any>(
    relation: R
  ): RelationFailureReadView<R, S, Root> => ({
    all() {
      return (readableRelationFailures.get(relation.key) ?? []) as unknown as ReadonlyArray<Relation.Relation.MutationFailure<R, S, Root>>
    }
  })

  const makeMachineReadView = <M extends Machine.StateMachine.Any>(stateMachine: M): MachineReadView<M> => ({
    get: () => currentMachines.get(stateMachine.key) as Machine.StateMachine.Value<M>,
    is: (value) => currentMachines.get(stateMachine.key) === value
  })

  const makeNextMachineWriteView = <M extends Machine.StateMachine.Any>(stateMachine: M): NextMachineWriteView<M> => ({
    getPending: () => pendingMachines.get(stateMachine.key)?.value as Machine.StateMachine.Value<M> | undefined,
    set(value) {
      journalMachine(stateMachine.key)
      pendingMachines.set(stateMachine.key, { value, skipIfSame: false })
    },
    setIfChanged(value) {
      journalMachine(stateMachine.key)
      pendingMachines.set(stateMachine.key, { value, skipIfSame: true })
    },
    reset() {
      journalMachine(stateMachine.key)
      pendingMachines.delete(stateMachine.key)
    }
  })

  const makeTransitionReadView = <M extends Machine.StateMachine.Any>(stateMachine: M): TransitionReadView<M> => ({
    get: () => activeTransitions.get(stateMachine.key) as Machine.TransitionSnapshot<M>
  })

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

  const mapRecord = <A, B>(record: Record<string, A>, f: (value: A) => B): Record<string, B> => {
    const result: Record<string, B> = {}
    for (const key in record) {
      result[key] = f(record[key]!)
    }
    return result
  }

  /**
   * Derives the runtime system context from the explicit system spec.
   *
   * The spec is the source of truth: the runtime materializes exactly the
   * views the implementation is allowed to see. Views read live storage, so
   * one context is built per system and reused for every run.
   */
  const makeContext = (system: SystemDefinition<any, any, any>): SystemContext<any> => {
    const spec = system.spec
    return {
      queries: mapRecord(spec.queries as Record<string, Query.Query.Any<Root>>, makeQueryHandle),
      lookup,
      resources: mapRecord(spec.resources as Record<string, any>, (access) =>
        access.mode === "read"
          ? Cells.storeRead(resources, access.descriptor.key)
          : makeResourceWriteView(access.descriptor, resources, writeResource)),
      events: mapRecord(spec.events as Record<string, any>, (access) =>
        access.mode === "read"
          ? makeEventReadView(access.descriptor.key)
          : makeEventWriteView(access.descriptor.key)),
      states: mapRecord(spec.states as Record<string, any>, (access) =>
        access.mode === "write"
          ? makeResourceWriteView(access.descriptor, states, writeState)
          : Cells.storeRead(states, access.descriptor.key)),
      machines: mapRecord(spec.machines as Record<string, any>, (access) => makeMachineReadView(access.machine)),
      nextMachines: mapRecord(spec.nextMachines as Record<string, any>, (access) => makeNextMachineWriteView(access.machine)),
      transitionEvents: mapRecord(spec.transitionEvents as Record<string, any>, (access) => makeTransitionEventReadView(access.machine)),
      transitions: mapRecord(spec.transitions as Record<string, any>, (access) => makeTransitionReadView(access.machine)),
      removed: mapRecord(spec.removed as Record<string, any>, (access) => makeRemovedReadView(access.descriptor)),
      despawned: mapRecord(spec.despawned as Record<string, any>, makeDespawnedReadView),
      relationFailures: mapRecord(spec.relationFailures as Record<string, any>, (access) => makeRelationFailureReadView(access.relation)),
      services: mapRecord(spec.services as Record<string, any>, (access) =>
        providedServices[access.descriptor.name as keyof RuntimeServicesOf<ProvidedServices>]),
      commands: Command.makeCommands<S, Root>(() => world.allocateEntity() as Entity.EntityId<S, Root>)
    } as SystemContext<any>
  }

  const contexts = new WeakMap<SystemDefinition<any, any, any>, SystemContext<any>>()

  const contextOf = (system: SystemDefinition<any, any, any>): SystemContext<any> => {
    let context = contexts.get(system)
    if (!context) {
      context = makeContext(system)
      contexts.set(system, context)
    }
    return context
  }

  const succeeded = Result.success(undefined)

  /**
   * Runs one system atomically when its run conditions pass.
   *
   * On success its writes are committed and its commands queued. On an
   * expected failure its ECS writes are rolled back and its commands dropped.
   * A thrown defect is rethrown after the same rollback.
   */
  const runSystem = (system: SystemDefinition<any, any, any>): Result.Result<void, SystemFailure> => {
    for (const condition of system.spec.when as ReadonlyArray<Machine.Condition>) {
      if (!evaluateCondition(condition)) {
        return succeeded
      }
    }
    const context = contextOf(system)
    beginSystemTransaction()
    let outcome: Result.Result<unknown, unknown>
    try {
      // Equivalent to `Fx.runSync(Fx.provide(effect, services))` without the wrapper allocations.
      outcome = system.run(context).run(context.services)
    } catch (defect) {
      rollbackSystemTransaction()
      context.commands.flush()
      throw defect
    }
    if (!outcome.ok) {
      rollbackSystemTransaction()
      context.commands.flush()
      return Result.failure({ kind: "SystemFailure", system: system.name, error: outcome.error })
    }
    commitSystemTransaction()
    const queued = context.commands.flush()
    for (let index = 0; index < queued.length; index++) {
      pendingCommands.push(queued[index]!)
    }
    return succeeded
  }

  const applyDeferred = (): void => {
    // Commands applied here may not queue further commands, so one drain is enough.
    const commands = pendingCommands.splice(0, pendingCommands.length)
    for (const command of commands) {
      command.apply(commandWorld)
    }
  }

  const updateEvents = (): void => {
    readableEvents = pendingEvents
    pendingEvents = new Map()
    readableTransitionEvents = pendingTransitionEvents
    pendingTransitionEvents = new Map()
  }

  const updateRelationFailures = (): void => {
    readableRelationFailures = pendingRelationFailures
    pendingRelationFailures = new Map()
  }

  const runTransitionSchedule = (
    schedule: Machine.StateMachine.AnyTransitionSchedule<S, Root>,
    snapshot: Machine.TransitionSnapshot
  ): Result.Result<void, SystemFailure> => {
    if (schedule.steps.some((step) => !Schedule.isSystemStep(step) && step.kind === "applyStateTransitions")) {
      throw new Error("Transition schedules cannot contain applyStateTransitions() steps")
    }
    activeTransitions.set(schedule.transition.machine.key, snapshot)
    try {
      return runSteps(schedule.steps)
    } finally {
      activeTransitions.delete(schedule.transition.machine.key)
    }
  }

  /**
   * Applies queued commands, then queued machine transitions, running the
   * matching exit, transition, and enter schedules from the bundle.
   */
  const applyStateTransitions = (
    bundle?: Schedule.TransitionBundleDefinition<S, ReadonlyArray<Machine.StateMachine.AnyTransitionSchedule<S, Root>>, any, Root, any, any>
  ): Result.Result<void, SystemFailure> => {
    applyDeferred()
    changedMachines = new Set()
    const scheduledTransitions = Array.from(pendingMachines.entries())
      .sort(([leftKey], [rightKey]) =>
        (machineDefinitionOrder.get(leftKey) ?? Number.MAX_SAFE_INTEGER)
        - (machineDefinitionOrder.get(rightKey) ?? Number.MAX_SAFE_INTEGER)
      )

    const schedules = bundle?.entries ?? []
    for (const [machineKey, pending] of scheduledTransitions) {
      pendingMachines.delete(machineKey)
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

      for (const schedule of schedules) {
        const transition = schedule.transition
        if (transition.phase === "exit" && transition.machine.key === machineKey && transition.state === snapshot.from) {
          const result = runTransitionSchedule(schedule, snapshot)
          if (!result.ok) {
            // The transition did not happen; keep it queued for a later attempt.
            pendingMachines.set(machineKey, pending)
            return result
          }
        }
      }
      for (const schedule of schedules) {
        const transition = schedule.transition
        if (
          transition.phase === "transition"
          && transition.machine.key === machineKey
          && transition.from === snapshot.from
          && transition.to === snapshot.to
        ) {
          const result = runTransitionSchedule(schedule, snapshot)
          if (!result.ok) {
            pendingMachines.set(machineKey, pending)
            return result
          }
        }
      }

      currentMachines.set(machineKey, pending.value)
      changedMachines.add(machineKey)
      const transitionEvents = pendingTransitionEvents.get(machineKey) ?? []
      transitionEvents.push(snapshot)
      pendingTransitionEvents.set(machineKey, transitionEvents)

      for (const schedule of schedules) {
        const transition = schedule.transition
        if (transition.phase === "enter" && transition.machine.key === machineKey && transition.state === snapshot.to) {
          const result = runTransitionSchedule(schedule, snapshot)
          if (!result.ok) {
            return result
          }
        }
      }
    }
    return succeeded
  }

  /**
   * Executes schedule steps in authored order.
   *
   * Nothing advances implicitly: queued commands, events, lifecycle records,
   * and relation failures stay pending, across schedule runs if needed, until
   * a marker step advances them.
   */
  function runSteps(steps: ReadonlyArray<Schedule.ScheduleStep>): Result.Result<void, SystemFailure> {
    for (const step of steps) {
      if (Schedule.isSystemStep(step)) {
        const result = runSystem(step as SystemDefinition<any, any, any>)
        if (!result.ok) {
          return result
        }
        continue
      }
      switch (step.kind) {
        case "applyDeferred":
          applyDeferred()
          break
        case "applyStateTransitions": {
          const result = applyStateTransitions(step.bundle as never)
          if (!result.ok) {
            return result
          }
          break
        }
        case "eventUpdate":
          updateEvents()
          break
        case "lifecycleUpdate":
          world.updateLifecycle()
          break
        case "relationFailureUpdate":
          updateRelationFailures()
          break
      }
    }
    return succeeded
  }

  /**
   * Runs one schedule. A failing system stops the schedule; systems that
   * already succeeded stay committed, and their pending work stays pending.
   */
  const runScheduleUnsafe = (schedule: ExecutableScheduleDefinition<S, any, any, any, any>): Result.Result<void, SystemFailure> => {
    changedMachines = new Set()
    return runSteps(schedule.steps)
  }

  const tickUnsafe = (schedules: ReadonlyArray<ExecutableScheduleDefinition<S, any, any, any, any>>): Result.Result<void, SystemFailure> => {
    for (const schedule of schedules) {
      const result = runScheduleUnsafe(schedule)
      if (!result.ok) {
        return result
      }
    }
    return succeeded
  }

  const hasRequirement = (requirement: Requirement.RequirementValue): boolean => {
    switch (requirement.kind) {
      case "service":
        return Object.prototype.hasOwnProperty.call(providedServices, requirement.name)
      case "resource":
        return resources.has(requirement.key)
      case "state":
        return states.has(requirement.key)
      case "stateMachine":
        return currentMachines.has(requirement.key)
    }
  }

  const tryRunSchedule = <const Selected extends ExecutableScheduleDefinition<S, any, any, any, any>>(
    schedule: Selected
  ): Result.Result<void, MissingRuntimeRequirements | Schedule.FailureOf<Selected>> => {
    const missing = schedule.requirements
      .filter((requirement) => !hasRequirement(requirement))
      .map(({ kind, name }) => ({ kind, name }))

    if (missing.length > 0) {
      return Result.failure({
        kind: "MissingRuntimeRequirements",
        requirements: missing
      })
    }

    return runScheduleUnsafe(schedule) as Result.Result<void, Schedule.FailureOf<Selected>>
  }

  /**
   * Evaluates a declared read-only projection without running a schedule or
   * advancing any visibility boundary.
   */
  const inspect = <const Selected extends Inspector.InspectorDefinition<any, any, Root, any, any>>(
    inspector: Selected
  ): Inspector.Inspector.Value<Selected> =>
    inspector.read(contextOf(inspector.system)) as Inspector.Inspector.Value<Selected>

  return {
    schema: options.schema,
    services: providedServices,
    resourceValues: (options.resources ?? {}) as Resources,
    stateValues: (options.states ?? {}) as States,
    machineValues: providedMachines as RuntimeMachinesOf<ProvidedMachines>,
    initialize(...schedules) {
      return tickUnsafe(schedules) as never
    },
    runSchedule(schedule) {
      return runScheduleUnsafe(schedule) as never
    },
    tryRunSchedule,
    inspect,
    tick(...schedules) {
      return tickUnsafe(schedules) as never
    }
  }
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
 * Builds the descriptor-backed runtime service environment.
 *
 * This is the runtime-side counterpart to `Game.System.service(...)`. Use it
 * to assemble the host implementations the game exposes to systems, such as
 * clocks, random generators, render bridges, audio sinks, or network clients.
 *
 * The helper keeps the runtime map keyed by service descriptors instead of
 * ad hoc strings, so the provision site cannot drift from the declaration site.
 *
 * @example
 * ```ts
 * // Bundle host capabilities once when building the runtime.
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
 * Use this at the runtime assembly boundary to pair a service descriptor with
 * its concrete host implementation. Passing the descriptor first keeps the
 * implementation object contextually typed and makes the dependency relation
 * obvious in docs and code review.
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
 * Use this when gameplay phases need a known committed starting state before
 * any schedule runs, for example `"Boot"`, `"Menu"`, or `"Playing"`.
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
 * This is the machine-side equivalent of `Runtime.service(...)`: it pairs one
 * machine definition with the committed initial value the runtime should start
 * from before any transition schedule runs.
 *
 * @example
 * ```ts
 * // Start the game in a known committed phase.
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
