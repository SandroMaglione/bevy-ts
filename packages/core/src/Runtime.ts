/**
 * Runtime creation, world storage, and schedule execution.
 *
 * The runtime is the concrete owner of the ECS world. It holds entities,
 * resources, relation graphs, machines, event buffers, lifecycle
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
 * // Viewport is a constructed resource, so the runtime comes back as a Result.
 * const runtime = Game.Runtime.make({
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
 * runtime.value.tick(setupSchedule)
 * runtime.value.tick(updateSchedule)
 * ```
 *
 * @module Runtime
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
import * as Command from "./Command.ts"
import * as DescriptorModule from "./Descriptor.ts"
import type { Descriptor } from "./Descriptor.ts"
import type * as Entity from "./Entity.ts"
import type * as Inspector from "./Inspector.ts"
import * as Cells from "./internal/cells.ts"
import { makeQueryEngine } from "./internal/queries.ts"
import { makeWorld } from "./internal/world.ts"
import type * as Machine from "./Machine.ts"
import * as Query from "./Query.ts"
import type { QueryMatch, ReadonlyValue } from "./Query.ts"
import * as Relation from "./Relation.ts"
import type * as Requirement from "./Requirement.ts"
import * as Result from "./Result.ts"
import * as Schedule from "./Schedule.ts"
import * as Snapshot from "./Snapshot.ts"
import type { ExecutableScheduleDefinition } from "./Schedule.ts"
import type { Registry, Schema } from "./Schema.ts"
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
} from "./System.ts"

/**
 * Runtime provisioning and schedule execution.
 *
 * `Runtime` owns ECS state and host-provided services, but not the outer game
 * loop. Host code decides when to call `tick(...)`.
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
 * Initial resource values accepted by `Game.Runtime.make(...)`, keyed by
 * schema key. Resources owned by a constructed descriptor take the raw input
 * of their constructor and are validated when the runtime is made.
 */
export type RuntimeResources<S extends Schema.Any> = Partial<{
  readonly [K in keyof Schema.Resources<S>]:
    Schema.Resources<S>[K] extends DescriptorModule.ConstructedDescriptor<"resource", string, any, infer Raw, any>
      ? Raw
      : Schema.ResourceValue<S, K>
}>

type ConstructedKeys<S extends Schema.Any, Provided> = {
  readonly [K in keyof Provided]: K extends keyof Schema.Resources<S>
    ? Schema.Resources<S>[K] extends DescriptorModule.ConstructedDescriptor<"resource", string, any, any, any> ? K : never
    : never
}[keyof Provided]

/**
 * The provided resources after validation, carried by the runtime type for
 * requirement checks.
 */
export type ProvidedResources<S extends Schema.Any, Provided> = Simplify<{
  readonly [K in keyof Provided]: K extends keyof Schema.Resources<S> ? Schema.ResourceValue<S, K> : never
}>

/**
 * Validation failures for constructed resources, keyed by schema key.
 */
export type RuntimeConstructionError<S extends Schema.Any, Provided> = Simplify<{
  readonly resources: Partial<{
    readonly [K in ConstructedKeys<S, Provided>]:
      Schema.Resources<S>[K & keyof Schema.Resources<S>] extends DescriptorModule.ConstructedDescriptor<"resource", string, any, any, infer Error>
        ? Error
        : never
  }>
}>

/**
 * The runtime returned by `make`, wrapped in a `Result` exactly when a
 * provided resource goes through a constructor and can therefore fail.
 */
export type MakeRuntimeResult<
  S extends Schema.Any,
  Services extends Record<string, unknown>,
  Provided,
  Root,
  Machines extends Record<string, unknown>
> = [ConstructedKeys<S, Provided>] extends [never]
  ? Runtime<S, Services, ProvidedResources<S, Provided>, Root, Machines>
  : Result.Result<Runtime<S, Services, ProvidedResources<S, Provided>, Root, Machines>, RuntimeConstructionError<S, Provided>>

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
  Machines extends object
> = Needs extends Requirement.Requirement
  ? RequirementErrorFor<Needs, S, Services, Resources, Machines>
  : never

type RequirementErrorsOfSchedule<
  Selected extends ExecutableScheduleDefinition<any, any, any, any, any>,
  Services extends Record<string, unknown>,
  Resources extends object,
  Machines extends object
> = Selected extends ExecutableScheduleDefinition<infer S, any, any, any, any>
  ? RequirementErrorsFor<Requirement.Of<Selected>, S, Services, Resources, Machines>
  : never

export type ValidateSchedules<
  Schedules extends ReadonlyArray<ExecutableScheduleDefinition<any, any, any, any, any>>,
  Services extends Record<string, unknown>,
  Resources extends object,
  Machines extends object
> = {
  readonly [K in keyof Schedules]:
    Schedules[K] & ValidateSchedule<
      Extract<Schedules[K], ExecutableScheduleDefinition<any, any, any, any, any>>,
      Services,
      Resources,
      Machines
    >
}

export type ValidateScheduleArray<
  Schedules extends ReadonlyArray<ExecutableScheduleDefinition<any, any, any, any, any>>,
  Services extends Record<string, unknown>,
  Resources extends object,
  Machines extends object
> = [RequirementErrorsOfSchedule<Schedules[number], Services, Resources, Machines>] extends [never]
  ? unknown
  : {
      readonly __fixRuntimeRequirements__: RequirementErrorsOfSchedule<Schedules[number], Services, Resources, Machines>
    }

type ValidateScheduleArgs<
  Schedules extends ReadonlyArray<ExecutableScheduleDefinition<any, any, any, any, any>>,
  Services extends Record<string, unknown>,
  Resources extends object,
  Machines extends object
> = [RequirementErrorsOfSchedule<NoInfer<Schedules[number]>, Services, Resources, Machines>] extends [never]
  ? Schedules
  : Schedules & {
      readonly __fixRuntimeRequirements__: RequirementErrorsOfSchedule<NoInfer<Schedules[number]>, Services, Resources, Machines>
    }

type ValidateSchedule<
  Schedule extends ExecutableScheduleDefinition<any, any, any, any, any>,
  Services extends Record<string, unknown>,
  Resources extends object,
  Machines extends object
> = [RequirementErrorsOfSchedule<Schedule, Services, Resources, Machines>] extends [never]
  ? unknown
  : {
      readonly __fixRuntimeRequirements__: RequirementErrorsOfSchedule<Schedule, Services, Resources, Machines>
    }

type RequirementErrorsOfInspector<
  Selected extends Inspector.Inspector.Any,
  Services extends Record<string, unknown>,
  Resources extends object,
  Machines extends object
> = Selected extends Inspector.InspectorDefinition<infer Spec, any, any, any, infer Needs>
  ? RequirementErrorsFor<Needs, Spec["schema"], Services, Resources, Machines>
  : never

type ValidateInspector<
  Selected extends Inspector.Inspector.Any,
  Services extends Record<string, unknown>,
  Resources extends object,
  Machines extends object
> = [RequirementErrorsOfInspector<Selected, Services, Resources, Machines>] extends [never]
  ? unknown
  : {
      readonly __fixRuntimeRequirements__: RequirementErrorsOfInspector<Selected, Services, Resources, Machines>
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
 * is the same key space exposed by `Schema.Resources<S>`.
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
 * The runtime owns world state and services, but not the outer game loop:
 * call `tick(...)` from whatever host drives the game.
 */
export interface Runtime<
  S extends Schema.Any,
  Services extends Record<string, unknown>,
  Resources extends object = {},
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
   * The validated resources provided when the runtime was made.
   */
  readonly resourceValues: Resources
  /**
   * The machine values provided when the runtime was made.
   */
  readonly machineValues: Machines
  /**
   * Hidden schema-root brand used by schema-bound APIs.
   */
  readonly __schemaRoot?: Root | undefined
  /**
   * Runs schedules in order.
   *
   * Every resource, service, and machine the schedules need must have been
   * provided when the runtime was made; missing ones are compile errors.
   *
   * Deferred commands, events, and relation failures advance only at explicit
   * schedule marker steps; change detection is per system and needs none. Nothing is flushed when a
   * schedule ends: pending work stays pending, across schedules and ticks,
   * until a later marker advances it.
   *
   * The first expected system failure stops the tick and is returned; that
   * system's ECS writes are rolled back and earlier systems stay committed.
   */
  readonly tick: {
    <const Schedules extends ReadonlyArray<ExecutableScheduleDefinition<S, any, Root, any, any>>>(
      ...schedules: ValidateScheduleArgs<Schedules, Services, Resources, Machines>
    ): Result.Result<void, Schedule.FailureOf<Schedules[number]>>
  }
  /**
   * Runs a schedule whose exact requirements are not statically known, for
   * example one loaded through a plugin boundary.
   *
   * Requirements are checked against current provisioning first and missing
   * ones are returned as data.
   */
  readonly tryTick: <const Selected extends ExecutableScheduleDefinition<S, any, any, any, any>>(
    schedule: Selected
  ) => Result.Result<void, MissingRuntimeRequirements | Schedule.FailureOf<Selected>>
  /**
   * Captures the world as plain data: entities with their ids, components,
   * relation edges, resources, and committed machine values.
   *
   * Values are shared with the world, not copied; serialize the snapshot
   * (for example with `JSON.stringify`) to detach it. Transient components and
   * resources are skipped.
   *
   * Callable only when every component and resource is constructed or
   * transient; see the `Snapshot` module.
   */
  readonly snapshot: Snapshot.Gate<S, () => Snapshot.WorldSnapshot>
  /**
   * Replaces the world with a snapshot after validating it against the
   * schema. On failure nothing changes. See the `Snapshot` module.
   */
  readonly restore: Snapshot.Gate<S, (data: unknown) => Result.Result<void, Snapshot.RestoreError>>
  /**
   * Evaluates one read-only projection without advancing schedule visibility.
   */
  readonly inspect: {
    <const Selected extends Inspector.InspectorDefinition<any, any, Root, any, any>>(
      inspector: Selected & ValidateInspector<Selected, Services, Resources, Machines>
    ): Inspector.Inspector.Value<Selected>
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
const makeValidatedRuntime = <
  S extends Schema.Any,
  Services extends Record<string, unknown>,
  Resources extends object,
  Root,
  Machines extends Record<string, unknown>
>(options: {
  readonly schema: S
  readonly services: RuntimeServices<any>
  readonly resources: Partial<Record<string, unknown>>
  readonly machines: RuntimeMachines<any> | undefined
  readonly machineDefinitions: ReadonlyArray<Machine.StateMachine.Any>
}): Runtime<S, Services, Resources, Root, Machines> => {
  const world = makeWorld(options.schema)
  const queries = makeQueryEngine(world)

  /**
   * Descriptor-keyed world resource and state storage.
   */
  const resources = new Map<symbol, unknown>()
  seedRegistryStore(options.schema.resources, options.resources as InitialRegistryValues<Registry>, resources)

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

  const providedServices = options.services as unknown as Services
  const providedMachines = (options.machines ?? machines()) as unknown as Machines
  const machineEntries = (options.machines ?? machines())[runtimeMachinesEntries]
  const machineDefinitionOrder = new Map(
    options.machineDefinitions.map((machine, index) => [machine.key, index] as const)
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

  /**
   * Change-detection state of one system (or inspector): `since` is the tick
   * of its previous completed run, which `added`/`changed` filters and
   * removed/despawned reads compare against.
   */
  interface ReaderState {
    since: number
    lastRun: number
  }

  const resolve = <Q extends Query.Query.Any<Root>>(id: number, query: Q, reader: ReaderState) =>
    queries.get(id, query, reader.since) as Result.Result<QueryMatch<S, Q>, Query.Query.LookupError>

  const relatedTarget = (
    target: Entity.EntityId<S, Root>,
    relation: Relation.Relation.Any
  ): Result.Result<Entity.EntityId<S, Root>, Relation.Relation.LookupError> => {
    if (!world.records.has(target.value)) {
      return Result.failure(Relation.missingEntityError(target.value))
    }
    const targetId = world.relationTarget(relation, target.value)
    if (targetId === undefined) {
      return Result.failure(Relation.missingRelationError(target.value, relation.name))
    }
    return Result.success(entityId(targetId))
  }

  const makeLookup = (reader: ReaderState): LookupApi<S, Root> => {
    const lookup: LookupApi<S, Root> = {
    get(target, query) {
      return resolve(target.value, query, reader)
    },
    getHandle(handle, query) {
      return resolve(handle.value, query, reader)
    },
    related: relatedTarget,
    relatedSources(target, relation) {
      if (!world.records.has(target.value)) {
        return Result.failure(Relation.missingEntityError(target.value))
      }
      return Result.success(world.relatedSourceIds(relation, target.value).map(entityId))
    },
    childMatches(target, relation, query) {
      if (!world.records.has(target.value)) {
        return Result.failure(Relation.missingEntityError(target.value))
      }
      const matches: Array<QueryMatch<S, typeof query>> = []
      for (const sourceId of world.relatedSourceIds(relation, target.value)) {
        const resolved = resolve(sourceId, query, reader)
        if (resolved.ok) {
          matches.push(resolved.value)
        }
      }
      return Result.success(matches)
    },
    parent: relatedTarget,
    ancestors(target, relation) {
      if (!world.records.has(target.value)) {
        return Result.failure(Relation.missingEntityError(target.value))
      }
      const ancestors: Array<Entity.EntityId<S, Root>> = []
      let current = world.relationTarget(relation, target.value)
      while (current !== undefined) {
        ancestors.push(entityId(current))
        current = world.relationTarget(relation, current)
      }
      return Result.success(ancestors)
    },
    descendants(target, relation, options) {
      if (!world.records.has(target.value)) {
        return Result.failure(Relation.missingEntityError(target.value))
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
      return Result.success(descendants)
    },
    descendantMatches(target, relation, query, options) {
      const descendants = lookup.descendants(target, relation, options)
      if (!descendants.ok) {
        return descendants
      }
      const matches: Array<QueryMatch<S, typeof query>> = []
      for (const descendantId of descendants.value) {
        const resolved = resolve(descendantId.value, query, reader)
        if (resolved.ok) {
          matches.push(resolved.value)
        }
      }
      return Result.success(matches)
    },
    root(target, relation) {
      if (!world.records.has(target.value)) {
        return Result.failure(Relation.missingEntityError(target.value))
      }
      let current = target.value
      let parentId = world.relationTarget(relation, current)
      while (parentId !== undefined) {
        current = parentId
        parentId = world.relationTarget(relation, current)
      }
      return Result.success(entityId(current))
    }
  }
    return lookup
  }

  const makeQueryHandle = <Q extends Query.Query.Any<Root>>(query: Q, reader: ReaderState): QueryHandle<S, Q> => {
    const each = () => queries.each(query, reader.since) as ReadonlyArray<QueryMatch<S, Q>>
    return {
      each,
      get(target) {
        return resolve(target.value, query, reader)
      },
      single() {
        const matches = each()
        if (matches.length === 0) {
          return Result.failure(Query.noEntitiesError())
        }
        if (matches.length > 1) {
          return Result.failure(Query.multipleEntitiesError(matches.length))
        }
        return Result.success(matches[0]!)
      },
      singleOptional() {
        const matches = each()
        if (matches.length > 1) {
          return Result.failure(Query.multipleEntitiesError(matches.length))
        }
        return Result.success(matches[0])
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
    descriptor: Descriptor<"resource", string, any>,
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

  const makeRemovedReadView = (descriptor: Descriptor<"component", string, any>, reader: ReaderState): RemovedReadView<S, Root> => {
    const ordinal = world.ordinalOf(descriptor)
    return {
      all() {
        return world.removedSince(ordinal, reader.since).map(entityId)
      }
    }
  }

  const makeDespawnedReadView = (reader: ReaderState): DespawnedReadView<S, Root> => ({
    all() {
      return world.despawnedSince(reader.since).map(entityId)
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
  const makeContext = (system: SystemDefinition<any, any, any>, reader: ReaderState): SystemContext<any> => {
    const spec = system.spec
    return {
      queries: mapRecord(spec.queries as Record<string, Query.Query.Any<Root>>, (query) => makeQueryHandle(query, reader)),
      lookup: makeLookup(reader),
      resources: mapRecord(spec.resources as Record<string, any>, (access) =>
        access.mode === "read"
          ? Cells.storeRead(resources, access.descriptor.key)
          : makeResourceWriteView(access.descriptor, resources, writeResource)),
      events: mapRecord(spec.events as Record<string, any>, (access) =>
        access.mode === "read"
          ? makeEventReadView(access.descriptor.key)
          : makeEventWriteView(access.descriptor.key)),
      machines: mapRecord(spec.machines as Record<string, any>, (access) => makeMachineReadView(access.machine)),
      nextMachines: mapRecord(spec.nextMachines as Record<string, any>, (access) => makeNextMachineWriteView(access.machine)),
      transitionEvents: mapRecord(spec.transitionEvents as Record<string, any>, (access) => makeTransitionEventReadView(access.machine)),
      transitions: mapRecord(spec.transitions as Record<string, any>, (access) => makeTransitionReadView(access.machine)),
      removed: mapRecord(spec.removed as Record<string, any>, (access) => makeRemovedReadView(access.descriptor, reader)),
      despawned: mapRecord(spec.despawned as Record<string, any>, () => makeDespawnedReadView(reader)),
      relationFailures: mapRecord(spec.relationFailures as Record<string, any>, (access) => makeRelationFailureReadView(access.relation)),
      services: mapRecord(spec.services as Record<string, any>, (access) =>
        providedServices[access.descriptor.name as keyof Services]),
      commands: Command.makeCommands<S, Root>(() => world.allocateEntity() as Entity.EntityId<S, Root>)
    } as SystemContext<any>
  }

  interface SystemSlot {
    readonly context: SystemContext<any>
    readonly reader: ReaderState
  }

  const slots = new WeakMap<SystemDefinition<any, any, any>, SystemSlot>()

  const slotOf = (system: SystemDefinition<any, any, any>): SystemSlot => {
    let slot = slots.get(system)
    if (!slot) {
      const reader: ReaderState = { since: 0, lastRun: 0 }
      slot = { context: makeContext(system, reader), reader }
      slots.set(system, slot)
    }
    return slot
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
    const { context, reader } = slotOf(system)
    // Changes stamped after the previous completed run are visible to this run.
    reader.since = reader.lastRun
    const thisRun = world.advanceTick()
    beginSystemTransaction()
    let outcome: Result.Result<unknown, unknown>
    try {
      // A system that returns nothing cannot fail. Otherwise run its effect,
      // equivalent to `Fx.runSync(Fx.provide(effect, services))` without the wrapper allocations.
      const effect = system.run(context)
      outcome = effect === undefined ? succeeded : effect.run(context.services)
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
    // A failed run leaves `lastRun` unchanged, so the next run sees the same changes again.
    reader.lastRun = thisRun
    const queued = context.commands.flush()
    for (let index = 0; index < queued.length; index++) {
      pendingCommands.push(queued[index]!)
    }
    return succeeded
  }

  const applyDeferred = (): void => {
    // Commands applied here may not queue further commands, so one drain is enough.
    const commands = pendingCommands.splice(0, pendingCommands.length)
    world.advanceTick()
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
   * Nothing advances implicitly: queued commands, events,
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
    world.advanceFrame()
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

    world.advanceFrame()
    return runScheduleUnsafe(schedule) as Result.Result<void, Schedule.FailureOf<Selected>>
  }

  /**
   * Evaluates a declared read-only projection without running a schedule.
   * Like a system, an inspector sees `added`/`changed`/removed records made
   * since its previous evaluation.
   */
  const inspect = <const Selected extends Inspector.InspectorDefinition<any, any, Root, any, any>>(
    inspector: Selected
  ): Inspector.Inspector.Value<Selected> => {
    const { context, reader } = slotOf(inspector.system)
    reader.since = reader.lastRun
    const value = inspector.read(context) as Inspector.Inspector.Value<Selected>
    reader.lastRun = world.advanceTick()
    return value
  }

  const componentsByName = new Map(
    (Object.values(options.schema.components) as ReadonlyArray<Descriptor<"component", string, any>>)
      .map((descriptor) => [descriptor.name, descriptor] as const)
  )
  const resourcesByName = new Map(
    (Object.values(options.schema.resources) as ReadonlyArray<Descriptor<"resource", string, any>>)
      .map((descriptor) => [descriptor.name, descriptor] as const)
  )
  const relationsByName = new Map(
    (Object.values(options.schema.relations) as ReadonlyArray<Relation.Relation.Any>)
      .map((relation) => [relation.name, relation] as const)
  )
  const machinesByName = new Map<string, Machine.StateMachine.Any>()
  for (const machine of options.machineDefinitions) machinesByName.set(machine.name, machine)
  for (const provision of machineEntries) machinesByName.set(provision.machine.name, provision.machine)

  const snapshot = (): Snapshot.WorldSnapshot => {
    const savedResources: Record<string, unknown> = {}
    for (const [name, descriptor] of resourcesByName) {
      if (!DescriptorModule.isTransient(descriptor) && resources.has(descriptor.key)) {
        savedResources[name] = resources.get(descriptor.key)
      }
    }
    const savedMachines: Record<string, Machine.StateValue> = {}
    for (const [name, machine] of machinesByName) {
      const value = currentMachines.get(machine.key)
      if (value !== undefined) savedMachines[name] = value as Machine.StateValue
    }
    return {
      version: 1,
      nextEntity: world.nextEntityValue(),
      entities: world.exportEntities(DescriptorModule.isTransient),
      relations: world.exportRelations(),
      resources: savedResources,
      machines: savedMachines
    }
  }

  // The public type only exposes `restore` when every saved descriptor has a
  // constructor; a descriptor without one still fails closed here.
  const validate = (value: unknown, descriptor: Descriptor.Any): Result.Result<unknown, unknown> | undefined =>
    DescriptorModule.hasConstructor(descriptor) ? DescriptorModule.decoderOf(descriptor)(value) : undefined

  const restore = (data: unknown): Result.Result<void, Snapshot.RestoreError> => {
    const parsed = Snapshot.parse(data)
    if (!parsed.ok) return parsed
    const saved = parsed.value

    // Validate everything before touching the world.
    const ids = new Set<number>()
    const entities: Array<{ readonly id: number; readonly components: Array<Entity.StagedComponent> }> = []
    for (const entity of saved.entities) {
      if (ids.has(entity.id)) return Result.failure({ _tag: "DuplicateEntity", entityId: entity.id })
      ids.add(entity.id)
      const components: Array<Entity.StagedComponent> = []
      for (const [name, raw] of Object.entries(entity.components)) {
        const descriptor = componentsByName.get(name)
        if (!descriptor || DescriptorModule.isTransient(descriptor)) {
          return Result.failure({ _tag: "UnknownComponent", entityId: entity.id, name })
        }
        const value = validate(raw, descriptor)
        if (value === undefined) return Result.failure({ _tag: "UnvalidatedDescriptor", name })
        if (!value.ok) return Result.failure({ _tag: "InvalidComponent", entityId: entity.id, name, error: value.error })
        components.push([descriptor, value.value])
      }
      entities.push({ id: entity.id, components })
    }
    const validatedResources: Array<readonly [symbol, unknown]> = []
    for (const [name, raw] of Object.entries(saved.resources)) {
      const descriptor = resourcesByName.get(name)
      if (!descriptor || DescriptorModule.isTransient(descriptor)) return Result.failure({ _tag: "UnknownResource", name })
      const value = validate(raw, descriptor)
      if (value === undefined) return Result.failure({ _tag: "UnvalidatedDescriptor", name })
      if (!value.ok) return Result.failure({ _tag: "InvalidResource", name, error: value.error })
      validatedResources.push([descriptor.key, value.value])
    }
    const edges: Array<readonly [Relation.Relation.Any, number, number]> = []
    for (const [name, groups] of Object.entries(saved.relations)) {
      const relation = relationsByName.get(name)
      if (!relation) return Result.failure({ _tag: "UnknownRelation", name })
      const parents = new Map<number, number>()
      for (const [target, sources] of groups) {
        for (const source of sources) {
          const valid = ids.has(source) && ids.has(target) && (relation.allowSelf || source !== target) && !parents.has(source)
          if (!valid) return Result.failure({ _tag: "InvalidRelation", name, sourceId: source, targetId: target })
          parents.set(source, target)
          edges.push([relation, source, target])
        }
      }
      if (relation.relationKind === "hierarchy") {
        for (const [source] of parents) {
          const seen = new Set<number>([source])
          for (let current = parents.get(source); current !== undefined; current = parents.get(current)) {
            if (seen.has(current)) {
              return Result.failure({ _tag: "InvalidRelation", name, sourceId: source, targetId: parents.get(source)! })
            }
            seen.add(current)
          }
        }
      }
    }
    const machineValues: Array<readonly [symbol, Machine.StateValue]> = []
    for (const [name, value] of Object.entries(saved.machines)) {
      const machine = machinesByName.get(name)
      if (!machine) return Result.failure({ _tag: "UnknownMachine", name })
      if (!machine.values.includes(value)) return Result.failure({ _tag: "InvalidMachineState", name, value })
      machineValues.push([machine.key, value])
    }

    // Apply: the old world is despawned and the saved one spawned, so change
    // detection and renderer sync observe the restore like any other change.
    pendingCommands.length = 0
    pendingMachines.clear()
    pendingEvents = new Map()
    readableEvents = new Map()
    pendingTransitionEvents = new Map()
    readableTransitionEvents = new Map()
    pendingRelationFailures = new Map()
    readableRelationFailures = new Map()
    world.advanceTick()
    world.despawnAll()
    world.setNextEntity(Math.max(saved.nextEntity, ...entities.map((entity) => entity.id + 1)))
    for (const entity of entities) {
      world.spawnEntity(world.entityIdOf(entity.id), entity.components)
    }
    for (const [relation, source, target] of edges) {
      world.tryRelate(source, relation, target)
    }
    for (const [key, value] of validatedResources) resources.set(key, value)
    for (const [key, value] of machineValues) currentMachines.set(key, value)
    return succeeded
  }

  return {
    schema: options.schema,
    services: providedServices,
    resourceValues: options.resources as Resources,
    machineValues: providedMachines,
    tick(...schedules) {
      return tickUnsafe(schedules) as never
    },
    tryTick: tryRunSchedule,
    // The gate is type-only: the functions exist on every runtime.
    snapshot: snapshot as unknown as Snapshot.Gate<S, typeof snapshot>,
    restore: restore as unknown as Snapshot.Gate<S, typeof restore>,
    inspect
  }
}

/**
 * Creates a runtime for a fully built schema and a set of external services.
 *
 * Resources owned by constructed descriptors take raw input and are validated
 * here; when any are provided the runtime comes back as a `Result`. Otherwise
 * the runtime is returned directly.
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
 *   resources: { Score: 0 },
 *   machines: Game.Runtime.machines(Game.Runtime.machine(Flow, "Menu"))
 * })
 * ```
 */
export const make = <
  S extends Schema.Any,
  const ProvidedServices extends RuntimeServices<any>,
  const Resources extends RuntimeResources<S> = {},
  Root = unknown,
  const ProvidedMachines extends RuntimeMachines<any> = RuntimeMachines<{}>
>(options: {
  readonly schema: S
  readonly services: ProvidedServices
  readonly resources?: Resources
  readonly machines?: ProvidedMachines
  readonly machineDefinitions?: ReadonlyArray<Machine.StateMachine.Any>
}): MakeRuntimeResult<S, Simplify<RuntimeServicesOf<ProvidedServices>>, Resources, Root, RuntimeMachinesOf<ProvidedMachines>> => {
  const fallible = Object.entries(options.schema.resources).some(([key, descriptor]) =>
    options.resources !== undefined
    && (options.resources as Record<string, unknown>)[key] !== undefined
    && DescriptorModule.hasConstructor(descriptor)
  )
  const validated = collectConstructedRegistryValues(options.schema.resources, options.resources)
  if (!validated.ok) {
    return Result.failure({ resources: validated.error }) as never
  }
  const runtime = makeValidatedRuntime({
    schema: options.schema,
    services: options.services,
    resources: validated.value,
    machines: options.machines,
    machineDefinitions: options.machineDefinitions ?? []
  })
  return (fallible ? Result.success(runtime) : runtime) as never
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
