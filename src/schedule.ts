/**
 * Schedule definitions and explicit visibility-boundary markers.
 *
 * Schedules order systems and define when deferred writes, events, lifecycle
 * buffers, relation failures, and machine transitions become visible.
 *
 * @example
 * ```ts
 * const update = Game.Schedule.define(
 *   move,
 *   Game.Schedule.applyDeferred(),
 *   sync
 * )
 * ```
 *
 * @module schedule
 * @docGroup core
 *
 * @groupDescription Namespaces
 * Grouped schedule helper types for ordering, transitions, and schedule-aware requirements.
 *
 * @groupDescription Interfaces
 * Public schedule contracts for named and anonymous execution plans.
 *
 * @groupDescription Type Aliases
 * Shared schedule step, transition, and requirement helper types.
 *
 * @groupDescription Functions
 * Public constructors for schedules and explicit schedule marker steps.
 */
import type { StateMachine } from "./machine.ts"
import type { Schema } from "./schema.ts"
import type { RuntimeRequirements, SystemDefinition, SystemRequirements } from "./system.ts"

/**
 * Schedule construction and explicit runtime boundaries.
 *
 * Schedules are the orchestration layer on top of systems. They define:
 *
 * - which systems are included
 * - how those systems are ordered
 * - where deferred runtime boundaries occur
 *
 * The important mental model is that visibility changes are explicit. Commands,
 * events, lifecycle buffers, relation failures, and machine transitions advance
 * only when the schedule contains the matching marker step.
 *
 * @example
 * ```ts
 * const update = Game.Schedule.define(
 *   writeHits,
 *   Game.Schedule.updateEvents(),
 *   reactToHits
 * )
 * ```
 */

/**
 * A typed schedule marker that applies all queued commands.
 *
 * This is the explicit deferred-mutation boundary for the runtime.
 */
export interface ApplyDeferredStep {
  readonly kind: "applyDeferred"
}

/**
 * A typed schedule marker that updates the readable event/message buffers.
 *
 * Systems before this point write pending events. Systems after this point read
 * the flushed readable events for the current schedule execution.
 */
export interface EventUpdateStep {
  readonly kind: "eventUpdate"
}

/**
 * A typed schedule marker that updates readable lifecycle buffers.
 */
export interface LifecycleUpdateStep {
  readonly kind: "lifecycleUpdate"
}

/**
 * A typed schedule marker that updates readable relation-mutation failures.
 */
export interface RelationFailureUpdateStep {
  readonly kind: "relationFailureUpdate"
}

const scheduleExactRequirementsTypeId = Symbol("bevy-ts/Schedule/exactRequirements")
const scheduleRuntimeRequirementsTypeId = Symbol("bevy-ts/Schedule/runtimeRequirements")
const scheduleProofTypeId = Symbol("bevy-ts/Schedule/proof")

type Simplify<A> = {
  readonly [K in keyof A]: A[K]
}

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

export type NormalizeRuntimeRequirements<Requirements extends RuntimeRequirements> = Simplify<RuntimeRequirements<
  Simplify<Requirements["services"]>,
  Simplify<Requirements["resources"]>,
  Simplify<Requirements["states"]>,
  NormalizeMachineRequirementObject<Requirements["machines"]>
>>

/**
 * A typed schedule marker that applies queued finite-state-machine transitions.
 */
export interface ApplyStateTransitionsStep<
  out Bundle extends TransitionBundleDefinition<any, any, any, any> | undefined = undefined,
  out Root = unknown
> {
  readonly kind: "applyStateTransitions"
  readonly bundle?: Bundle
  readonly __schemaRoot?: Root | undefined
}

/**
 * Any non-system execution step supported by the schedule runtime.
 */
export type ScheduleMarkerStep =
  | ApplyDeferredStep
  | EventUpdateStep
  | LifecycleUpdateStep
  | RelationFailureUpdateStep
  | ApplyStateTransitionsStep<any, any>

/**
 * A typed collection of transition schedules that can be attached to one
 * explicit `applyStateTransitions(...)` marker.
 */
export interface TransitionBundleDefinition<
  S extends Schema.Any = Schema.Any,
  out Entries extends ReadonlyArray<StateMachine.AnyTransitionSchedule<S, any>> = ReadonlyArray<StateMachine.AnyTransitionSchedule<S, any>>,
  out Requirements extends RuntimeRequirements<any, any, any, any> = RuntimeRequirements<any, any, any, any>,
  out Root = unknown,
  out RuntimeRequirementValue extends RuntimeRequirements<any, any, any, any> = NormalizeRuntimeRequirements<Requirements>
> {
  readonly kind: "transitionBundle"
  readonly entries: Entries
  readonly requirements: AnyRuntimeRequirements
  readonly [scheduleExactRequirementsTypeId]?: Requirements | undefined
  readonly [scheduleRuntimeRequirementsTypeId]?: RuntimeRequirementValue | undefined
  readonly __schemaRoot?: Root | undefined
}

interface ScheduleProof<
  out Systems extends ReadonlyArray<SystemDefinition<any, any, any>> = ReadonlyArray<SystemDefinition<any, any, any>>,
  out Steps extends ReadonlyArray<ScheduleStep> = ReadonlyArray<ScheduleStep>,
  out ExactRequirements extends RuntimeRequirements = RuntimeRequirements,
  out RuntimeRequirementValue extends RuntimeRequirements = NormalizeRuntimeRequirements<ExactRequirements>
> {
  readonly systems: Systems
  readonly steps: Steps
  readonly exactRequirements: ExactRequirements
  readonly runtimeRequirements: RuntimeRequirementValue
}

type AnyScheduleProof = ScheduleProof<
  ReadonlyArray<SystemDefinition<any, any, any>>,
  ReadonlyArray<ScheduleStep>,
  AnyRuntimeRequirements,
  AnyRuntimeRequirements
>

/**
 * One opaque reusable explicit schedule fragment.
 *
 * Fragments normalize systems, markers, and nested fragments once, then carry
 * the exact proof only on hidden symbols. They are authoring tokens, not
 * executable schedules.
 */
export interface ScheduleFragmentDefinition<
  S extends Schema.Any = Schema.Any,
  out Root = unknown,
  out ExactRequirements extends RuntimeRequirements = RuntimeRequirements,
  out RuntimeRequirementValue extends RuntimeRequirements = NormalizeRuntimeRequirements<ExactRequirements>
> {
  readonly kind: "fragment"
  readonly schema: S
  readonly [scheduleProofTypeId]: ScheduleProof<
    ReadonlyArray<SystemDefinition<any, any, any>>,
    ReadonlyArray<ScheduleStep>,
    ExactRequirements,
    RuntimeRequirementValue
  >
  readonly [scheduleExactRequirementsTypeId]?: ExactRequirements | undefined
  readonly [scheduleRuntimeRequirementsTypeId]?: RuntimeRequirementValue | undefined
  readonly __schemaRoot?: Root | undefined
}

/**
 * A reusable explicit schedule fragment.
 *
 * Phases normalize explicit step groups once so larger schedules can reuse the
 * same execution slice without copying every system and marker by hand.
 */
export interface SchedulePhaseDefinition<
  S extends Schema.Any = Schema.Any,
  out Requirements extends RuntimeRequirements = RuntimeRequirements,
  out SystemValue extends SystemDefinition<any, any, any> = SystemDefinition<any, any, any>,
  out StepValue extends ScheduleStep = ScheduleStep,
  out Root = unknown,
  out ExactRequirements extends RuntimeRequirements = Requirements,
  out RuntimeRequirementValue extends RuntimeRequirements = NormalizeRuntimeRequirements<ExactRequirements>
> {
  readonly kind: "phase"
  readonly steps: ReadonlyArray<StepValue>
  readonly systems: ReadonlyArray<SystemValue>
  readonly schema: S
  readonly requirements: AnyRuntimeRequirements
  readonly [scheduleProofTypeId]: ScheduleProof<
    ReadonlyArray<SystemValue>,
    ReadonlyArray<StepValue>,
    ExactRequirements,
    RuntimeRequirementValue
  >
  readonly [scheduleExactRequirementsTypeId]?: ExactRequirements | undefined
  readonly [scheduleRuntimeRequirementsTypeId]?: RuntimeRequirementValue | undefined
  readonly __schemaRoot?: Root | undefined
}

/**
 * One executable step in a schedule.
 */
export type ScheduleStep = SystemDefinition<any, any, any> | ScheduleMarkerStep

/**
 * One authoring entry accepted by schedule composition helpers.
 */
export type ScheduleEntry =
  | ScheduleStep
  | ScheduleDefinition<any, any, any, any>
  | ScheduleFragmentDefinition<any, any, any, any>
  | SchedulePhaseDefinition<any, any, any>

/**
 * One reusable schedule fragment produced by `compose(...)`.
 */
export interface ScheduleCompositionDefinition<
  out SystemValue extends SystemDefinition<any, any, any> = SystemDefinition<any, any, any>,
  out StepValue extends ScheduleStep = ScheduleStep,
  out ExactRequirements extends RuntimeRequirements = RuntimeRequirements,
  out RuntimeRequirementValue extends RuntimeRequirements = NormalizeRuntimeRequirements<ExactRequirements>
> {
  readonly systems: ReadonlyArray<SystemValue>
  readonly steps: ReadonlyArray<StepValue>
  readonly [scheduleProofTypeId]: ScheduleProof<
    ReadonlyArray<SystemValue>,
    ReadonlyArray<StepValue>,
    ExactRequirements,
    RuntimeRequirementValue
  >
  readonly [scheduleExactRequirementsTypeId]?: ExactRequirements | undefined
  readonly [scheduleRuntimeRequirementsTypeId]?: RuntimeRequirementValue | undefined
}

/**
 * Shared executable schedule shape.
 *
 * Schedules are the unit the runtime executes. They can be called from any
 * external loop in any order you choose.
 */
interface ScheduleBase<
  S extends Schema.Any,
  out Requirements extends RuntimeRequirements = RuntimeRequirements
> {
  /**
   * Explicit execution steps for the schedule.
   */
  readonly steps: ReadonlyArray<ScheduleStep>
  /**
   * Systems included in this schedule, in authored order.
   */
  readonly systems: ReadonlyArray<SystemDefinition<any, any, any>>
  /**
   * The closed schema all systems in the schedule are expected to target.
   */
  readonly schema: S
  /**
   * Type-only aggregate requirements needed to execute this schedule safely.
   */
  readonly requirements: AnyRuntimeRequirements
}

/**
 * Compact carried schedule shape used by runtime/app execution boundaries.
 *
 * This keeps execution validation focused on the normalized carried data rather
 * than the full authoring-time schedule structure.
 */
export interface ExecutableScheduleDefinition<
  S extends Schema.Any,
  out Requirements extends RuntimeRequirements = RuntimeRequirements,
  out Root = unknown,
  out RuntimeRequirementValue extends RuntimeRequirements = NormalizeRuntimeRequirements<Requirements>
> extends ScheduleBase<S, Requirements> {
  readonly kind: "schedule"
  readonly [scheduleProofTypeId]: ScheduleProof<
    ReadonlyArray<SystemDefinition<any, any, any>>,
    ReadonlyArray<ScheduleStep>,
    Requirements,
    RuntimeRequirementValue
  >
  readonly [scheduleRuntimeRequirementsTypeId]?: RuntimeRequirementValue | undefined
  readonly __schemaRoot?: Root | undefined
}

export type ScheduleDefinition<
  S extends Schema.Any,
  Requirements extends RuntimeRequirements = RuntimeRequirements,
  Root = unknown,
  RuntimeRequirementValue extends RuntimeRequirements = NormalizeRuntimeRequirements<Requirements>
> = ExecutableScheduleDefinition<S, Requirements, Root, RuntimeRequirementValue>

/**
 * Type-level and value-level helpers for schedule construction.
 */
export namespace Schedule {
  export type Definition<
    S extends Schema.Any,
    Requirements extends RuntimeRequirements = RuntimeRequirements,
    Root = unknown,
    RuntimeRequirementValue extends RuntimeRequirements = NormalizeRuntimeRequirements<Requirements>
  > = ScheduleDefinition<S, Requirements, Root, RuntimeRequirementValue>
  /**
   * Any supported execution step.
   */
  export type Step = ScheduleStep
  export type TransitionBundle<
    S extends Schema.Any,
    Entries extends ReadonlyArray<StateMachine.AnyTransitionSchedule<S, any>> = ReadonlyArray<StateMachine.AnyTransitionSchedule<S, any>>,
    Requirements extends RuntimeRequirements<any, any, any, any> = RuntimeRequirements<any, any, any, any>,
    Root = unknown,
    RuntimeRequirementValue extends RuntimeRequirements<any, any, any, any> = NormalizeRuntimeRequirements<Requirements>
  > = TransitionBundleDefinition<S, Entries, Requirements, Root, RuntimeRequirementValue>
  export type Fragment<
    S extends Schema.Any,
    Root = unknown,
    ExactRequirements extends RuntimeRequirements = RuntimeRequirements,
    RuntimeRequirementValue extends RuntimeRequirements = NormalizeRuntimeRequirements<ExactRequirements>
  > = ScheduleFragmentDefinition<S, Root, ExactRequirements, RuntimeRequirementValue>
  export type Phase<
    S extends Schema.Any,
    Requirements extends RuntimeRequirements = RuntimeRequirements,
    SystemValue extends SystemDefinition<any, any, any> = SystemDefinition<any, any, any>,
    StepValue extends ScheduleStep = ScheduleStep,
    Root = unknown,
    ExactRequirements extends RuntimeRequirements = Requirements,
    RuntimeRequirementValue extends RuntimeRequirements = NormalizeRuntimeRequirements<ExactRequirements>
  > = SchedulePhaseDefinition<S, Requirements, SystemValue, StepValue, Root, ExactRequirements, RuntimeRequirementValue>
  export type Composition<
    SystemValue extends SystemDefinition<any, any, any> = SystemDefinition<any, any, any>,
    StepValue extends ScheduleStep = ScheduleStep,
    ExactRequirements extends RuntimeRequirements = RuntimeRequirements,
    RuntimeRequirementValue extends RuntimeRequirements = NormalizeRuntimeRequirements<ExactRequirements>
  > = ScheduleCompositionDefinition<SystemValue, StepValue, ExactRequirements, RuntimeRequirementValue>
}

type AnySystem = SystemDefinition<any, any, any>
export type AnyRuntimeRequirements = RuntimeRequirements<any, any, any, any>

/**
 * Converts a union of object types into one merged intersection.
 */
type UnionToIntersection<A> =
  (A extends unknown ? (value: A) => void : never) extends ((value: infer I) => void) ? I : never

/**
 * Returns `{}` for empty unions before intersection folding.
 */
type IntersectOrEmpty<A> = [A] extends [never] ? {} : UnionToIntersection<A>
type EmptyRequirements = RuntimeRequirements<{}, {}, {}, {}>
type WidenArray<Values extends ReadonlyArray<unknown>> = ReadonlyArray<Values[number]>
type WidenTransitionEntries<Entries extends ReadonlyArray<StateMachine.AnyTransitionSchedule<any, any>>> =
  ReadonlyArray<Entries[number]>
type WidenSteps<Steps extends ReadonlyArray<ScheduleStep> | undefined> =
  Steps extends ReadonlyArray<ScheduleStep> ? WidenArray<Steps> : undefined
type ScheduleSystemName<SystemValue> =
  SystemValue extends { readonly name: infer Name extends string } ? Name : never
type StepSystems<Steps extends ReadonlyArray<ScheduleStep>> = Extract<Steps[number], AnySystem>
type StepSystemNames<Steps extends ReadonlyArray<ScheduleStep>> = ScheduleSystemName<StepSystems<Steps>>
type ProofOf<Value> =
  Value extends { readonly [scheduleProofTypeId]: infer Proof extends AnyScheduleProof }
    ? Proof
    : AnyScheduleProof
type EntrySystems<Entry> =
  Entry extends ExecutableScheduleDefinition<any, any, any, any>
    ? Extract<ProofOf<Entry>["systems"][number], AnySystem>
    : Entry extends ScheduleFragmentDefinition<any, any, any, any>
    ? Extract<ProofOf<Entry>["systems"][number], AnySystem>
    : Entry extends SchedulePhaseDefinition<any, any, any>
    ? Extract<ProofOf<Entry>["systems"][number], AnySystem>
    : Entry extends AnySystem
      ? Entry
      : never
type EntrySteps<Entry> =
  Entry extends ExecutableScheduleDefinition<any, any, any, any>
    ? Extract<ProofOf<Entry>["steps"][number], ScheduleStep>
    : Entry extends ScheduleFragmentDefinition<any, any, any, any>
    ? Extract<ProofOf<Entry>["steps"][number], ScheduleStep>
    : Entry extends SchedulePhaseDefinition<any, any, any>
    ? Extract<ProofOf<Entry>["steps"][number], ScheduleStep>
    : Entry extends ScheduleStep
      ? Entry
      : never
type EntrySchema<Entry> =
  Entry extends { readonly schema: infer S extends Schema.Any }
    ? S
    : never
type DirectEntrySystems<Entry> =
  Entry extends AnySystem
    ? Entry
    : Entry extends ScheduleFragmentDefinition<any, any, any, any>
      ? Extract<ProofOf<Entry>["systems"][number], AnySystem>
      : Entry extends SchedulePhaseDefinition<any, any, any>
        ? Extract<ProofOf<Entry>["systems"][number], AnySystem>
        : never

/**
 * Extracts the union of systems included in one schedule.
 */
type ScheduleSystems<Systems extends ReadonlyArray<AnySystem>> = Systems[number]

type SystemRequirementPart<SystemValue, Category extends keyof RuntimeRequirements> =
  SystemValue extends { readonly requirements: infer Requirements }
    ? Requirements extends RuntimeRequirements
      ? Requirements[Category]
      : never
    : never

/**
 * Derives the aggregate runtime requirements from the systems in one schedule.
 */
type TransitionRequirementPart<Entry, Category extends keyof RuntimeRequirements> =
  Entry extends { readonly requirements: infer Requirements }
    ? Requirements extends RuntimeRequirements
      ? Requirements[Category]
      : {}
    : {}

export type TransitionBundleRequirements<Entries extends ReadonlyArray<StateMachine.AnyTransitionSchedule<any, any>>> = Simplify<RuntimeRequirements<
  Simplify<IntersectOrEmpty<TransitionRequirementPart<Entries[number], "services">>>,
  Simplify<IntersectOrEmpty<TransitionRequirementPart<Entries[number], "resources">>>,
  Simplify<IntersectOrEmpty<TransitionRequirementPart<Entries[number], "states">>>,
  Simplify<IntersectOrEmpty<TransitionRequirementPart<Entries[number], "machines">>>
>>

type EmptyCarriedRequirements = RuntimeRequirements<{}, {}, {}, {}>

export type CarriedExactRequirementsOf<Value> =
  Value extends { readonly [scheduleProofTypeId]: infer Proof extends AnyScheduleProof }
    ? Proof extends { readonly exactRequirements: infer Requirements extends RuntimeRequirements }
      ? Requirements
      : EmptyCarriedRequirements
    : Value extends { readonly [scheduleExactRequirementsTypeId]?: infer Requirements extends RuntimeRequirements | undefined }
      ? NonNullable<Requirements>
    : Value extends { readonly requirements: infer Requirements extends RuntimeRequirements }
      ? Requirements
      : EmptyCarriedRequirements

export type CarriedRuntimeRequirementsOf<Value> =
  Value extends { readonly [scheduleProofTypeId]: infer Proof extends AnyScheduleProof }
    ? Proof extends { readonly runtimeRequirements: infer Requirements extends RuntimeRequirements }
      ? Requirements
      : NormalizeRuntimeRequirements<CarriedExactRequirementsOf<Value>>
    : Value extends { readonly [scheduleRuntimeRequirementsTypeId]?: infer Requirements extends RuntimeRequirements | undefined }
      ? NonNullable<Requirements>
    : NormalizeRuntimeRequirements<CarriedExactRequirementsOf<Value>>

export type PhaseRequirements<Steps extends ReadonlyArray<ScheduleStep>> = ScheduleRequirements<
  ReadonlyArray<StepSystems<Steps>>,
  Steps
>

type CompositionRequirementPart<Entry, Category extends keyof RuntimeRequirements> =
  CarriedExactRequirementsOf<Entry>[Category]

export type CompositionExactRequirements<Entries extends ReadonlyArray<ScheduleEntry>> = Simplify<RuntimeRequirements<
  Simplify<IntersectOrEmpty<CompositionRequirementPart<Entries[number], "services">>>,
  Simplify<IntersectOrEmpty<CompositionRequirementPart<Entries[number], "resources">>>,
  Simplify<IntersectOrEmpty<CompositionRequirementPart<Entries[number], "states">>>,
  Simplify<IntersectOrEmpty<CompositionRequirementPart<Entries[number], "machines">>>
>>

export type ScheduleCompositionFor<Entries extends ReadonlyArray<ScheduleEntry>> = ScheduleCompositionDefinition<
  EntrySystems<Entries[number]>,
  EntrySteps<Entries[number]>,
  CompositionExactRequirements<Entries>,
  NormalizeRuntimeRequirements<CompositionExactRequirements<Entries>>
>

export type ScheduleFragmentFor<
  S extends Schema.Any,
  Entries extends ReadonlyArray<ScheduleEntry>,
  Root = unknown
> = ScheduleFragmentDefinition<
  S,
  Root,
  CompositionExactRequirements<Entries>,
  NormalizeRuntimeRequirements<CompositionExactRequirements<Entries>>
>

export type AnonymousScheduleBuildFor<
  S extends Schema.Any,
  Entries extends ReadonlyArray<ScheduleEntry>,
  Root = unknown
> = ScheduleDefinition<
  S,
  CompositionExactRequirements<Entries>,
  Root,
  NormalizeRuntimeRequirements<CompositionExactRequirements<Entries>>
>

export type TransitionBundleInput<S extends Schema.Any = Schema.Any, Root = unknown> =
  | StateMachine.AnyTransitionSchedule<S, Root>
  | TransitionBundleDefinition<S, ReadonlyArray<StateMachine.AnyTransitionSchedule<S, Root>>, any, Root>

export type FlattenTransitionEntries<
  Entries extends ReadonlyArray<TransitionBundleInput<any, any>>
> = Entries extends readonly [infer Head, ...infer Tail]
  ? Head extends TransitionBundleDefinition<any, infer InnerEntries, any, any>
    ? Tail extends ReadonlyArray<TransitionBundleInput<any, any>>
      ? readonly [...InnerEntries, ...FlattenTransitionEntries<Tail>]
      : readonly [...InnerEntries]
    : Head extends StateMachine.AnyTransitionSchedule<any, any>
      ? Tail extends ReadonlyArray<TransitionBundleInput<any, any>>
        ? readonly [Head, ...FlattenTransitionEntries<Tail>]
        : readonly [Head]
      : readonly []
  : readonly []

type StepRequirementsExact<Steps extends ReadonlyArray<ScheduleStep>> = Simplify<RuntimeRequirements<
  Simplify<IntersectOrEmpty<
    Steps[number] extends ApplyStateTransitionsStep<infer Bundle, any>
      ? Bundle extends TransitionBundleDefinition<any, any, infer Requirements, any>
        ? Requirements["services"]
        : never
      : never
  >>,
  Simplify<IntersectOrEmpty<
    Steps[number] extends ApplyStateTransitionsStep<infer Bundle, any>
      ? Bundle extends TransitionBundleDefinition<any, any, infer Requirements, any>
        ? Requirements["resources"]
        : never
      : never
  >>,
  Simplify<IntersectOrEmpty<
    Steps[number] extends ApplyStateTransitionsStep<infer Bundle, any>
      ? Bundle extends TransitionBundleDefinition<any, any, infer Requirements, any>
        ? Requirements["states"]
        : never
      : never
  >>,
  Simplify<IntersectOrEmpty<
    Steps[number] extends ApplyStateTransitionsStep<infer Bundle, any>
      ? Bundle extends TransitionBundleDefinition<any, any, infer Requirements, any>
        ? Requirements["machines"]
        : never
      : never
  >>
>>

type StepRequirements<Steps extends ReadonlyArray<ScheduleStep>> =
  number extends Steps["length"] ? EmptyRequirements : StepRequirementsExact<Steps>

export type SystemRequirementsForSchedule<Systems extends ReadonlyArray<AnySystem>> = Simplify<RuntimeRequirements<
  Simplify<IntersectOrEmpty<
    SystemRequirementPart<ScheduleSystems<Systems>, "services">
  >>,
  Simplify<IntersectOrEmpty<
    SystemRequirementPart<ScheduleSystems<Systems>, "resources">
  >>,
  Simplify<IntersectOrEmpty<
    SystemRequirementPart<ScheduleSystems<Systems>, "states">
  >>,
  Simplify<IntersectOrEmpty<
    SystemRequirementPart<ScheduleSystems<Systems>, "machines">
  >>
>>

export type ScheduleRequirements<Systems extends ReadonlyArray<AnySystem>, Steps extends ReadonlyArray<ScheduleStep> = []> =
  Simplify<SystemRequirementsForSchedule<Systems> & StepRequirements<Steps>>

type DuplicateNames<
  Values extends ReadonlyArray<string>,
  Seen extends string = never
> = number extends Values["length"]
  ? never
  : Values extends readonly [infer Head extends string, ...infer Tail extends ReadonlyArray<string>]
    ? Head extends Seen
      ? Head | DuplicateNames<Tail, Seen>
      : DuplicateNames<Tail, Seen | Head>
    : never

type DuplicateExtensionSystemNames<
  Base extends ScheduleDefinition<any, any, any>,
  Before extends ReadonlyArray<ScheduleStep>,
  After extends ReadonlyArray<ScheduleStep>
> =
  | Extract<StepSystemNames<Before>, ScheduleSystemName<Base["systems"][number]>>
  | Extract<StepSystemNames<After>, ScheduleSystemName<Base["systems"][number]>>
  | Extract<StepSystemNames<Before>, StepSystemNames<After>>
  | DuplicateNames<{
      readonly [K in keyof Before]: Before[K] extends AnySystem ? ScheduleSystemName<Before[K]> : never
    } & ReadonlyArray<string>>
  | DuplicateNames<{
      readonly [K in keyof After]: After[K] extends AnySystem ? ScheduleSystemName<After[K]> : never
    } & ReadonlyArray<string>>

/**
 * Creates an explicit command-application marker step.
 *
 * Systems before this marker can enqueue commands. Systems after it see the
 * fully applied world changes.
 *
 * This is the normal boundary between setup/simulation work and any later
 * system that depends on spawned entities, inserted components, or queued
 * despawns becoming visible in the current schedule.
 *
 * @example
 * ```ts
 * const update = Game.Schedule.define(
 *   simulateSystem,
 *   Game.Schedule.applyDeferred(),
 *   observeSpawnedSystem
 * )
 * ```
 */
export const applyDeferred = (): ApplyDeferredStep => ({
  kind: "applyDeferred"
})

/**
 * Creates an explicit event/message update marker step.
 *
 * Systems before this marker can write events. Systems after it read the
 * committed readable event buffers for the current schedule execution.
 *
 * Use this when a later system in the same schedule should observe events that
 * earlier systems just emitted. If those event payloads carry entity handles,
 * later systems should re-resolve them through `lookup.getHandle(...)` after
 * this marker.
 *
 * @example
 * ```ts
 * const update = Game.Schedule.define(
 *   emitTickSystem,
 *   Game.Schedule.updateEvents(),
 *   observeTickSystem
 * )
 * ```
 */
export const updateEvents = (): EventUpdateStep => ({
  kind: "eventUpdate"
})

/**
 * Creates an explicit lifecycle update marker step.
 *
 * This commits readable `added`, `changed`, `removed`, and `despawned`
 * lifecycle buffers for later systems in the same schedule.
 *
 * This is the required boundary before lifecycle-driven host sync. Systems
 * using `Game.Query.added(...)`, `Game.Query.changed(...)`,
 * `Game.System.readRemoved(...)`, or `Game.System.readDespawned()` only observe
 * the current schedule's structural changes after this marker. {@link extend}
 * is the preferred wrapper when the host slice is just a prefix or suffix
 * around a headless gameplay schedule.
 *
 * @example
 * ```ts
 * const browserUpdate = Game.Schedule.define(
 *   simulationSystem,
 *   Game.Schedule.applyDeferred(),
 *   Game.Schedule.updateLifecycle(),
 *   destroyNodesSystem,
 *   createNodesSystem,
 *   syncTransformsSystem
 * )
 * ```
 */
export const updateLifecycle = (): LifecycleUpdateStep => ({
  kind: "lifecycleUpdate"
})

/**
 * Creates an explicit relation-failure update marker step.
 *
 * Deferred relation mutation failures become readable only after this marker.
 */
export const updateRelationFailures = (): RelationFailureUpdateStep => ({
  kind: "relationFailureUpdate"
})

/**
 * Creates a typed reusable transition bundle.
 *
 * Use bundles to group multiple machine transition schedules and then attach
 * them to one `applyStateTransitions(...)` marker.
 */
export const transitions = <
  S extends Schema.Any,
  const Entries extends ReadonlyArray<TransitionBundleInput<S, any>>
>(...entries: Entries): TransitionBundleDefinition<
  S,
  WidenTransitionEntries<FlattenTransitionEntries<Entries>>,
  TransitionBundleRequirements<FlattenTransitionEntries<Entries>>,
  unknown,
  NormalizeRuntimeRequirements<TransitionBundleRequirements<FlattenTransitionEntries<Entries>>>
> => ({
  kind: "transitionBundle",
  entries: entries.flatMap((entry) => "entries" in entry ? [...entry.entries] : [entry]) as unknown as WidenTransitionEntries<FlattenTransitionEntries<Entries>>,
  requirements: undefined as unknown as AnyRuntimeRequirements,
  [scheduleExactRequirementsTypeId]: undefined as unknown as TransitionBundleRequirements<FlattenTransitionEntries<Entries>>,
  [scheduleRuntimeRequirementsTypeId]: undefined as unknown as NormalizeRuntimeRequirements<TransitionBundleRequirements<FlattenTransitionEntries<Entries>>>
}) as TransitionBundleDefinition<
  S,
  WidenTransitionEntries<FlattenTransitionEntries<Entries>>,
  TransitionBundleRequirements<FlattenTransitionEntries<Entries>>,
  unknown,
  NormalizeRuntimeRequirements<TransitionBundleRequirements<FlattenTransitionEntries<Entries>>>
>

/**
 * Creates a reusable explicit schedule fragment.
 *
 * Fragments are the only reusable authoring unit for explicit schedules.
 * They can contain systems, explicit boundary markers, and nested fragments.
 *
 * @example
 * ```ts
 * const hostMirror = Game.Schedule.fragment({
 *   schema,
 *   entries: [
 *     Game.Schedule.updateLifecycle(),
 *     destroyNodesSystem,
 *     createNodesSystem,
 *     syncTransformsSystem
 *   ]
 * })
 * ```
 */
export const fragment = <
  S extends Schema.Any,
  const Entries extends ReadonlyArray<ScheduleEntry>,
  Root = unknown
>(options: {
  readonly schema: S
  readonly entries?: Entries
  readonly steps?: ReadonlyArray<Extract<Entries[number], ScheduleStep>>
}): ScheduleFragmentFor<S, Entries, Root> => {
  const sourceEntries = (options.entries ?? options.steps ?? []) as ReadonlyArray<ScheduleEntry>
  const steps = normalizeEntries(sourceEntries)
  validateUniqueSystemSteps(steps, "fragment")
  const systems = collectUniqueSystems(steps)
  return {
    kind: "fragment",
    schema: options.schema,
    [scheduleProofTypeId]: {
      systems,
      steps,
      exactRequirements: undefined as unknown as CompositionExactRequirements<Entries>,
      runtimeRequirements: undefined as unknown as NormalizeRuntimeRequirements<CompositionExactRequirements<Entries>>
    } as ScheduleProof<
      ReadonlyArray<EntrySystems<Entries[number]>>,
      ReadonlyArray<EntrySteps<Entries[number]>>,
      CompositionExactRequirements<Entries>,
      NormalizeRuntimeRequirements<CompositionExactRequirements<Entries>>
    >,
    [scheduleExactRequirementsTypeId]: undefined as unknown as CompositionExactRequirements<Entries>,
    [scheduleRuntimeRequirementsTypeId]: undefined as unknown as NormalizeRuntimeRequirements<CompositionExactRequirements<Entries>>
  } as ScheduleFragmentFor<S, Entries, Root>
}

/**
 * Creates a reusable explicit schedule phase.
 *
 * Use this for repeated explicit step slices such as host-sync tails or other
 * lifecycle-driven suffixes that should stay visible in authored schedules.
 *
 * @example
 * ```ts
 * const hostMirrorPhase = Game.Schedule.phase({
 *   steps: [
 *     Game.Schedule.updateLifecycle(),
 *     destroyNodesSystem,
 *     createNodesSystem,
 *     syncTransformsSystem
 *   ]
 * })
 * ```
 */
export const phase = <
  S extends Schema.Any,
  const Steps extends ReadonlyArray<ScheduleStep>
>(options: {
  readonly schema: S
  readonly steps: Steps
}): SchedulePhaseDefinition<
  S,
  AnyRuntimeRequirements,
  StepSystems<Steps>,
  ScheduleStep,
  unknown,
  PhaseRequirements<Steps>,
  NormalizeRuntimeRequirements<PhaseRequirements<Steps>>
> => {
  const steps = [...options.steps] as ReadonlyArray<ScheduleStep>
  validateUniqueSystemSteps(steps, "phase")
  return {
    kind: "phase",
    steps,
    systems: collectUniqueSystems(steps),
    schema: options.schema,
    requirements: undefined as unknown as AnyRuntimeRequirements,
    [scheduleProofTypeId]: undefined as unknown as ScheduleProof<
      ReadonlyArray<StepSystems<Steps>>,
      ReadonlyArray<ScheduleStep>,
      PhaseRequirements<Steps>,
      NormalizeRuntimeRequirements<PhaseRequirements<Steps>>
    >,
    [scheduleExactRequirementsTypeId]: undefined as unknown as PhaseRequirements<Steps>,
    [scheduleRuntimeRequirementsTypeId]: undefined as unknown as NormalizeRuntimeRequirements<PhaseRequirements<Steps>>
  } as SchedulePhaseDefinition<
    S,
    AnyRuntimeRequirements,
    StepSystems<Steps>,
    ScheduleStep,
    unknown,
    PhaseRequirements<Steps>,
    NormalizeRuntimeRequirements<PhaseRequirements<Steps>>
  >
}

/**
 * Builds one final executable schedule from explicit entries.
 *
 * `build(...)` is the only final schedule constructor. Systems are derived
 * from the authored plan and kept in that exact order.
 */
export function build<
  const Entries extends ReadonlyArray<ScheduleEntry>,
>(
  ...entries: Entries
): AnonymousScheduleBuildFor<EntrySchema<Entries[number]>, Entries> {
  return define(...entries)
}

/**
 * Flattens mixed schedule entries into one `{ systems, steps }` pair.
 *
 * This is the preferred way to compose systems, markers, and reusable phases
 * without manually keeping `systems` and `steps` in sync.
 *
 * @example
 * ```ts
 * const plan = Game.Schedule.compose({
 *   entries: [
 *     captureInputSystem,
 *     gameplaySystem,
 *     Game.Schedule.applyDeferred(),
 *     hostMirrorPhase
 *   ]
 * })
 *
 * const update = Game.Schedule.build(...plan.steps)
 * ```
 */
export const compose = <
  const Entries extends ReadonlyArray<ScheduleEntry>
>(options: {
  readonly entries: Entries
}): ScheduleCompositionFor<Entries> => {
  const steps = normalizeEntries(options.entries)
  validateUniqueSystemSteps(steps, "schedule composition")
  return {
    systems: collectUniqueSystems(steps),
    steps,
    [scheduleProofTypeId]: undefined as unknown as ScheduleProof<
      ReadonlyArray<EntrySystems<Entries[number]>>,
      ReadonlyArray<EntrySteps<Entries[number]>>,
      CompositionExactRequirements<Entries>,
      NormalizeRuntimeRequirements<CompositionExactRequirements<Entries>>
    >,
    [scheduleExactRequirementsTypeId]: undefined as unknown as CompositionExactRequirements<Entries>,
    [scheduleRuntimeRequirementsTypeId]: undefined as unknown as NormalizeRuntimeRequirements<CompositionExactRequirements<Entries>>
  } as ScheduleCompositionFor<Entries>
}

/**
 * Creates an explicit machine-transition application marker step.
 *
 * Queued machine writes are committed only at this boundary. If a transition
 * bundle is provided, matching enter/exit/transition schedules run as part of
 * the same boundary.
 *
 * This is the canonical restart/reset boundary: queue the next phase with
 * `Game.System.nextState(...)`, then let `applyStateTransitions(...)` commit
 * the new current state and run any attached reset schedules.
 *
 * @example
 * ```ts
 * const transitions = Game.Schedule.transitions(
 *   Game.Schedule.onEnter(Phase, "Playing", [ResetWorldSystem])
 * )
 *
 * const update = Game.Schedule.define(
 *   QueueRestartSystem,
 *   GameplaySystem,
 *   Game.Schedule.applyDeferred(),
 *   Game.Schedule.applyStateTransitions(transitions)
 * )
 * ```
 */
export const applyStateTransitions = <
  const Bundle extends TransitionBundleDefinition<any, any, any, any> | undefined = undefined
>(bundle?: Bundle): ApplyStateTransitionsStep<Bundle> => ({
  kind: "applyStateTransitions",
  bundle
}) as ApplyStateTransitionsStep<Bundle>

export type AnonymousScheduleFor<
  S extends Schema.Any,
  SystemValue extends AnySystem,
  StepValue extends ScheduleStep | undefined
> = ScheduleDefinition<
  S,
  [StepValue] extends [undefined]
    ? SystemRequirementsForSchedule<ReadonlyArray<SystemValue>>
    : ScheduleRequirements<ReadonlyArray<SystemValue>, ReadonlyArray<Extract<StepValue, ScheduleStep>>>
>

/**
 * Creates one explicit executable schedule from authored plan entries.
 */
export function define<
  const Entries extends ReadonlyArray<ScheduleEntry>
>(
  ...entries: Entries
): AnonymousScheduleBuildFor<EntrySchema<Entries[number]>, Entries> {
  const schema = findPlanSchema(entries)
  const steps = normalizeEntries(entries)
  validateUniqueSystemSteps(steps, "schedule")
  const systems = collectUniqueSystems(steps)

  return {
    kind: "schedule",
    steps,
    systems,
    schema,
    requirements: undefined as unknown as AnyRuntimeRequirements,
    [scheduleProofTypeId]: undefined as unknown as ScheduleProof<
      ReadonlyArray<EntrySystems<Entries[number]>>,
      ReadonlyArray<EntrySteps<Entries[number]>>,
      CompositionExactRequirements<Entries>,
      NormalizeRuntimeRequirements<CompositionExactRequirements<Entries>>
    >,
    [scheduleRuntimeRequirementsTypeId]: undefined as unknown as NormalizeRuntimeRequirements<CompositionExactRequirements<Entries>>
  } as AnonymousScheduleBuildFor<EntrySchema<Entries[number]>, Entries>
}

/**
 * Runtime check used to distinguish system steps from schedule markers.
 */
export const isSystemStep = (step: ScheduleStep | ScheduleEntry): step is SystemDefinition<any, any, any> =>
  typeof step === "object" && step !== null && "spec" in step

const isScheduleEntry = (entry: ScheduleEntry): entry is ScheduleDefinition<any, any, any, any> =>
  typeof entry === "object"
  && entry !== null
  && "kind" in entry
  && entry.kind === "schedule"

const isPhaseEntry = (entry: ScheduleEntry): entry is SchedulePhaseDefinition<any, any, any> =>
  "kind" in entry && entry.kind === "phase"

const isFragmentEntry = (entry: ScheduleEntry): entry is ScheduleFragmentDefinition<any, any, any, any> =>
  "kind" in entry && entry.kind === "fragment"

const normalizeEntries = (
  entries: ReadonlyArray<ScheduleEntry>
): ReadonlyArray<ScheduleStep> =>
  entries.flatMap((entry) =>
    isScheduleEntry(entry)
      ? [...entry.steps]
      : isFragmentEntry(entry)
      ? [...entry[scheduleProofTypeId].steps]
      : isPhaseEntry(entry)
        ? [...entry.steps]
        : [entry]
  )

const findPlanSchema = <Entries extends ReadonlyArray<ScheduleEntry>>(
  entries: Entries
): EntrySchema<Entries[number]> => {
  const owner = entries.find((entry) =>
    (typeof entry === "object"
      && entry !== null
      && "schema" in entry)
    || isSystemStep(entry)
  )
  if (!owner) {
    throw new Error("Schedule plan must include at least one system, schedule, fragment, or phase to infer schema")
  }
  return (isSystemStep(owner) ? owner.spec.schema : owner.schema) as EntrySchema<Entries[number]>
}

const collectUniqueSystems = (
  steps: ReadonlyArray<ScheduleStep>
): ReadonlyArray<SystemDefinition<any, any, any>> => {
  const unique = new Map<symbol, SystemDefinition<any, any, any>>()
  for (const step of steps) {
    if (!isSystemStep(step)) {
      continue
    }
    if (!unique.has(step.ordering.label.key)) {
      unique.set(step.ordering.label.key, step)
    }
  }
  return [...unique.values()]
}

const validateUniqueSystemSteps = (
  steps: ReadonlyArray<ScheduleStep>,
  context: string
) => {
  const names = new Set<symbol>()
  for (const step of steps) {
    if (!isSystemStep(step)) {
      continue
    }
    const key = step.ordering.label.key
    if (names.has(key)) {
      throw new Error(`Duplicate system step in ${context}: ${step.ordering.label.name}`)
    }
    names.add(key)
  }
}
