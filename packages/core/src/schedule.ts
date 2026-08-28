/**
 * Explicit schedule construction and visibility boundaries.
 *
 * Authoring-time structure is validated once, then schedules carry only their
 * normalized steps, systems, and nominal requirement union.
 *
 * @module schedule
 * @docGroup runtime
 */
import type { StateMachine } from "./machine.ts"
import * as Requirement from "./requirement.ts"
import type { Schema } from "./schema.ts"
import type { FailureOf as SystemFailureOf, SystemDefinition, SystemFailure } from "./system.ts"

export interface ApplyDeferredStep {
  readonly kind: "applyDeferred"
}

export interface EventUpdateStep {
  readonly kind: "eventUpdate"
}

export interface LifecycleUpdateStep {
  readonly kind: "lifecycleUpdate"
}

export interface RelationFailureUpdateStep {
  readonly kind: "relationFailureUpdate"
}

export interface ApplyStateTransitionsStep<
  out Bundle extends TransitionBundleDefinition<any, any, any, any, any, any> | undefined = undefined,
  out Root = unknown
> {
  readonly kind: "applyStateTransitions"
  readonly bundle?: Bundle
  readonly __schemaRoot?: Root | undefined
}

export type ScheduleMarkerStep =
  | ApplyDeferredStep
  | EventUpdateStep
  | LifecycleUpdateStep
  | RelationFailureUpdateStep
  | ApplyStateTransitionsStep<any, any>

type AnySystem = SystemDefinition<any, any, any, any, any, any>

export type ScheduleStep = AnySystem | ScheduleMarkerStep

export interface TransitionBundleDefinition<
  S extends Schema.Any = Schema.Any,
  out Entries extends ReadonlyArray<StateMachine.AnyTransitionSchedule<S, any>> = ReadonlyArray<StateMachine.AnyTransitionSchedule<S, any>>,
  out Needs extends Requirement.Requirement = Requirement.Requirement,
  out Root = unknown,
  out CarriedNeeds extends Requirement.Requirement = Needs,
  out Failure extends SystemFailure = never
> {
  readonly kind: "transitionBundle"
  readonly entries: Entries
  readonly requirements: ReadonlyArray<CarriedNeeds>
  readonly __failure?: (_: never) => Failure
  readonly __schemaRoot?: Root | undefined
}

export interface ScheduleFragmentDefinition<
  S extends Schema.Any = Schema.Any,
  out Root = unknown,
  out Needs extends Requirement.Requirement = Requirement.Requirement,
  out CarriedNeeds extends Requirement.Requirement = Needs,
  out Failure extends SystemFailure = never
> {
  readonly kind: "fragment"
  readonly steps: ReadonlyArray<ScheduleStep>
  readonly systems: ReadonlyArray<AnySystem>
  readonly schema: S
  readonly requirements: ReadonlyArray<CarriedNeeds>
  readonly __failure?: (_: never) => Failure
  readonly __schemaRoot?: Root | undefined
}

export interface SchedulePhaseDefinition<
  S extends Schema.Any = Schema.Any,
  out Needs extends Requirement.Requirement = Requirement.Requirement,
  out SystemValue extends AnySystem = AnySystem,
  out StepValue extends ScheduleStep = ScheduleStep,
  out Root = unknown,
  out ExactNeeds extends Requirement.Requirement = Needs,
  out CarriedNeeds extends Requirement.Requirement = ExactNeeds,
  out Failure extends SystemFailure = never
> {
  readonly kind: "phase"
  readonly steps: ReadonlyArray<StepValue>
  readonly systems: ReadonlyArray<SystemValue>
  readonly schema: S
  readonly requirements: ReadonlyArray<CarriedNeeds>
  readonly __failure?: (_: never) => Failure
  readonly __schemaRoot?: Root | undefined
}

export interface ScheduleCompositionDefinition<
  out SystemValue extends AnySystem = AnySystem,
  out StepValue extends ScheduleStep = ScheduleStep,
  out Needs extends Requirement.Requirement = Requirement.Requirement,
  out CarriedNeeds extends Requirement.Requirement = Needs,
  out Failure extends SystemFailure = never
> {
  readonly systems: ReadonlyArray<SystemValue>
  readonly steps: ReadonlyArray<StepValue>
  readonly requirements: ReadonlyArray<CarriedNeeds>
  readonly __failure?: (_: never) => Failure
}

export interface ExecutableScheduleDefinition<
  S extends Schema.Any,
  out Needs extends Requirement.Requirement = Requirement.Requirement,
  out Root = unknown,
  out CarriedNeeds extends Requirement.Requirement = Needs,
  out Failure extends SystemFailure = never
> {
  readonly kind: "schedule"
  readonly steps: ReadonlyArray<ScheduleStep>
  readonly systems: ReadonlyArray<AnySystem>
  readonly schema: S
  readonly requirements: ReadonlyArray<CarriedNeeds>
  readonly __failure?: (_: never) => Failure
  readonly __schemaRoot?: Root | undefined
}

export type ScheduleDefinition<
  S extends Schema.Any,
  Needs extends Requirement.Requirement = Requirement.Requirement,
  Root = unknown,
  CarriedNeeds extends Requirement.Requirement = Needs,
  Failure extends SystemFailure = never
> = ExecutableScheduleDefinition<S, Needs, Root, CarriedNeeds, Failure>

export namespace Schedule {
  export type Definition<
    S extends Schema.Any,
    Needs extends Requirement.Requirement = Requirement.Requirement,
    Root = unknown,
    CarriedNeeds extends Requirement.Requirement = Needs,
    Failure extends SystemFailure = never
  > = ScheduleDefinition<S, Needs, Root, CarriedNeeds, Failure>
  export type Step = ScheduleStep
  export type TransitionBundle<
    S extends Schema.Any,
    Entries extends ReadonlyArray<StateMachine.AnyTransitionSchedule<S, any>> = ReadonlyArray<StateMachine.AnyTransitionSchedule<S, any>>,
    Needs extends Requirement.Requirement = Requirement.Requirement,
    Root = unknown,
    CarriedNeeds extends Requirement.Requirement = Needs,
    Failure extends SystemFailure = never
  > = TransitionBundleDefinition<S, Entries, Needs, Root, CarriedNeeds, Failure>
  export type Fragment<
    S extends Schema.Any,
    Root = unknown,
    Needs extends Requirement.Requirement = Requirement.Requirement,
    CarriedNeeds extends Requirement.Requirement = Needs,
    Failure extends SystemFailure = never
  > = ScheduleFragmentDefinition<S, Root, Needs, CarriedNeeds, Failure>
  export type Phase<
    S extends Schema.Any,
    Needs extends Requirement.Requirement = Requirement.Requirement,
    SystemValue extends AnySystem = AnySystem,
    StepValue extends ScheduleStep = ScheduleStep,
    Root = unknown,
    ExactNeeds extends Requirement.Requirement = Needs,
    CarriedNeeds extends Requirement.Requirement = ExactNeeds,
    Failure extends SystemFailure = never
  > = SchedulePhaseDefinition<S, Needs, SystemValue, StepValue, Root, ExactNeeds, CarriedNeeds, Failure>
  export type Composition<
    SystemValue extends AnySystem = AnySystem,
    StepValue extends ScheduleStep = ScheduleStep,
    Needs extends Requirement.Requirement = Requirement.Requirement,
    CarriedNeeds extends Requirement.Requirement = Needs,
    Failure extends SystemFailure = never
  > = ScheduleCompositionDefinition<SystemValue, StepValue, Needs, CarriedNeeds, Failure>
}

export type ScheduleEntry =
  | ScheduleStep
  | ScheduleDefinition<any, any, any, any, any>
  | ScheduleFragmentDefinition<any, any, any, any, any>
  | SchedulePhaseDefinition<any, any, any, any, any, any, any, any>

type EntrySystems<Entry> =
  Entry extends { readonly systems: ReadonlyArray<infer SystemValue extends AnySystem> } ? SystemValue
  : Entry extends AnySystem ? Entry
  : never

type EntrySteps<Entry> =
  Entry extends { readonly steps: ReadonlyArray<infer Step extends ScheduleStep> } ? Step
  : Entry extends ScheduleStep ? Entry
  : never

type EntrySchema<Entry> =
  Entry extends { readonly schema: infer S extends Schema.Any } ? S
  : Entry extends SystemDefinition<infer Spec, any, any, any, any, any> ? Spec["schema"]
  : never

type MarkerNeeds<Step> =
  Step extends ApplyStateTransitionsStep<infer Bundle, any>
    ? Requirement.Of<NonNullable<Bundle>>
    : never

type EntryNeeds<Entry> = Requirement.Of<Entry> | MarkerNeeds<Entry>

type CarriedFailure<Entry> =
  "__failure" extends keyof Entry
    ? Entry extends { readonly __failure?: (_: never) => infer Failure extends SystemFailure }
      ? Failure
      : never
    : never

/** Extracts the expected failure union carried by a built schedule value. */
export type FailureOf<Value> = CarriedFailure<Value>

type MarkerFailure<Step> =
  Step extends ApplyStateTransitionsStep<infer Bundle, any>
    ? CarriedFailure<NonNullable<Bundle>>
    : never

/** Extracts the normalized expected failure carried by one schedule entry. */
export type EntryFailure<Entry> =
  Entry extends AnySystem ? SystemFailureOf<Entry>
  : MarkerFailure<Entry> | CarriedFailure<Entry>

/** Failure union for one authored schedule plan. */
export type CompositionFailure<Entries extends ReadonlyArray<ScheduleEntry>> =
  EntryFailure<Entries[number]>

export type CompositionExactRequirements<Entries extends ReadonlyArray<ScheduleEntry>> =
  EntryNeeds<Entries[number]>

export type ScheduleCompositionFor<Entries extends ReadonlyArray<ScheduleEntry>> =
  ScheduleCompositionDefinition<
    EntrySystems<Entries[number]>,
    EntrySteps<Entries[number]>,
    CompositionExactRequirements<Entries>,
    CompositionExactRequirements<Entries>,
    CompositionFailure<Entries>
  >

export type ScheduleFragmentFor<
  S extends Schema.Any,
  Entries extends ReadonlyArray<ScheduleEntry>,
  Root = unknown
> = ScheduleFragmentDefinition<
  S,
  Root,
  CompositionExactRequirements<Entries>,
  CompositionExactRequirements<Entries>,
  CompositionFailure<Entries>
>

export type AnonymousScheduleBuildFor<
  S extends Schema.Any,
  Entries extends ReadonlyArray<ScheduleEntry>,
  Root = unknown
> = ScheduleDefinition<
  S,
  CompositionExactRequirements<Entries>,
  Root,
  CompositionExactRequirements<Entries>,
  CompositionFailure<Entries>
>

export type TransitionBundleInput<S extends Schema.Any = Schema.Any, Root = unknown> =
  | StateMachine.AnyTransitionSchedule<S, Root>
  | TransitionBundleDefinition<S, ReadonlyArray<StateMachine.AnyTransitionSchedule<S, Root>>, any, Root, any, any>

type FlattenTransitionEntry<Entry> =
  Entry extends TransitionBundleDefinition<any, infer InnerEntries, any, any, any, any>
    ? InnerEntries[number]
    : Extract<Entry, StateMachine.AnyTransitionSchedule<any, any>>

export type FlattenTransitionEntries<
  Entries extends ReadonlyArray<TransitionBundleInput<any, any>>
> = ReadonlyArray<FlattenTransitionEntry<Entries[number]>>

export type TransitionBundleRequirements<
  Entries extends ReadonlyArray<StateMachine.AnyTransitionSchedule<any, any>>
> = Requirement.Of<Entries[number]>

export type TransitionBundleFailure<
  Entries extends ReadonlyArray<StateMachine.AnyTransitionSchedule<any, any>>
> = CarriedFailure<Entries[number]>

type StepSystems<Steps extends ReadonlyArray<ScheduleStep>> = Extract<Steps[number], AnySystem>
type StepNeeds<Steps extends ReadonlyArray<ScheduleStep>> = EntryNeeds<Steps[number]>
type StepFailure<Steps extends ReadonlyArray<ScheduleStep>> = EntryFailure<Steps[number]>

export type PhaseRequirements<Steps extends ReadonlyArray<ScheduleStep>> = StepNeeds<Steps>
export type PhaseFailure<Steps extends ReadonlyArray<ScheduleStep>> = StepFailure<Steps>

export type SystemRequirementsForSchedule<Systems extends ReadonlyArray<AnySystem>> =
  Requirement.Of<Systems[number]>

export type ScheduleRequirements<
  Systems extends ReadonlyArray<AnySystem>,
  Steps extends ReadonlyArray<ScheduleStep> = []
> = SystemRequirementsForSchedule<Systems> | StepNeeds<Steps>

export const applyDeferred = (): ApplyDeferredStep => ({ kind: "applyDeferred" })
export const updateEvents = (): EventUpdateStep => ({ kind: "eventUpdate" })
export const updateLifecycle = (): LifecycleUpdateStep => ({ kind: "lifecycleUpdate" })
export const updateRelationFailures = (): RelationFailureUpdateStep => ({ kind: "relationFailureUpdate" })

export const transitions = <
  S extends Schema.Any,
  const Entries extends ReadonlyArray<TransitionBundleInput<S, any>>
>(...entries: Entries): TransitionBundleDefinition<
  S,
  FlattenTransitionEntries<Entries>,
  TransitionBundleRequirements<FlattenTransitionEntries<Entries>>,
  unknown,
  TransitionBundleRequirements<FlattenTransitionEntries<Entries>>,
  TransitionBundleFailure<FlattenTransitionEntries<Entries>>
> => {
  const flattened = entries.flatMap((entry) =>
    "kind" in entry && entry.kind === "transitionBundle" ? [...entry.entries] : [entry]
  ) as unknown as FlattenTransitionEntries<Entries>

  return {
    kind: "transitionBundle",
    entries: flattened,
    requirements: Requirement.collect(flattened.flatMap((entry) => entry.requirements))
  } as TransitionBundleDefinition<
    S,
    FlattenTransitionEntries<Entries>,
    TransitionBundleRequirements<FlattenTransitionEntries<Entries>>,
    unknown,
    TransitionBundleRequirements<FlattenTransitionEntries<Entries>>,
    TransitionBundleFailure<FlattenTransitionEntries<Entries>>
  >
}

export const fragment = <
  S extends Schema.Any,
  const Entries extends ReadonlyArray<ScheduleEntry> = readonly [],
  Root = unknown
>(options: {
  readonly schema: S
  readonly entries?: Entries
  readonly steps?: ReadonlyArray<Extract<Entries[number], ScheduleStep>>
}): ScheduleFragmentFor<S, Entries, Root> => {
  const steps = normalizeEntries((options.entries ?? options.steps ?? []) as ReadonlyArray<ScheduleEntry>)
  validateUniqueSystemSteps(steps, "fragment")
  return {
    kind: "fragment",
    schema: options.schema,
    steps,
    systems: collectUniqueSystems(steps),
    requirements: collectStepRequirements(steps)
  } as ScheduleFragmentFor<S, Entries, Root>
}

export const phase = <
  S extends Schema.Any,
  const Steps extends ReadonlyArray<ScheduleStep>
>(options: {
  readonly schema: S
  readonly steps: Steps
}): SchedulePhaseDefinition<
  S,
  PhaseRequirements<Steps>,
  StepSystems<Steps>,
  ScheduleStep,
  unknown,
  PhaseRequirements<Steps>,
  PhaseRequirements<Steps>,
  PhaseFailure<Steps>
> => {
  const steps = [...options.steps]
  validateUniqueSystemSteps(steps, "phase")
  return {
    kind: "phase",
    schema: options.schema,
    steps,
    systems: collectUniqueSystems(steps),
    requirements: collectStepRequirements(steps)
  } as unknown as SchedulePhaseDefinition<
    S,
    PhaseRequirements<Steps>,
    StepSystems<Steps>,
    ScheduleStep,
    unknown,
    PhaseRequirements<Steps>,
    PhaseRequirements<Steps>,
    PhaseFailure<Steps>
  >
}

export function build<const Entries extends ReadonlyArray<ScheduleEntry>>(
  ...entries: Entries
): AnonymousScheduleBuildFor<EntrySchema<Entries[number]>, Entries> {
  return Schedule(...entries)
}

export const compose = <const Entries extends ReadonlyArray<ScheduleEntry>>(options: {
  readonly entries: Entries
}): ScheduleCompositionFor<Entries> => {
  const steps = normalizeEntries(options.entries)
  validateUniqueSystemSteps(steps, "schedule composition")
  return {
    systems: collectUniqueSystems(steps),
    steps,
    requirements: collectStepRequirements(steps)
  } as ScheduleCompositionFor<Entries>
}

export const applyStateTransitions = <
  const Bundle extends TransitionBundleDefinition<any, any, any, any, any, any> | undefined = undefined
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
  Requirement.Of<SystemValue> | EntryNeeds<Extract<StepValue, ScheduleStep>>,
  unknown,
  Requirement.Of<SystemValue> | EntryNeeds<Extract<StepValue, ScheduleStep>>,
  SystemFailureOf<SystemValue> | EntryFailure<Extract<StepValue, ScheduleStep>>
>

export function Schedule<const Entries extends ReadonlyArray<ScheduleEntry>>(
  ...entries: Entries
): AnonymousScheduleBuildFor<EntrySchema<Entries[number]>, Entries> {
  const schema = findPlanSchema(entries)
  const steps = normalizeEntries(entries)
  validateUniqueSystemSteps(steps, "schedule")
  return {
    kind: "schedule",
    schema,
    steps,
    systems: collectUniqueSystems(steps),
    requirements: collectStepRequirements(steps)
  } as AnonymousScheduleBuildFor<EntrySchema<Entries[number]>, Entries>
}

export const isSystemStep = (step: ScheduleStep | ScheduleEntry): step is AnySystem =>
  typeof step === "object" && step !== null && "spec" in step

const isScheduleEntry = (entry: ScheduleEntry): entry is ScheduleDefinition<any, any, any, any, any> =>
  typeof entry === "object" && entry !== null && "kind" in entry && entry.kind === "schedule"

const isPhaseEntry = (entry: ScheduleEntry): entry is SchedulePhaseDefinition<any, any, any, any, any, any, any, any> =>
  typeof entry === "object" && entry !== null && "kind" in entry && entry.kind === "phase"

const isFragmentEntry = (entry: ScheduleEntry): entry is ScheduleFragmentDefinition<any, any, any, any, any> =>
  typeof entry === "object" && entry !== null && "kind" in entry && entry.kind === "fragment"

const normalizeEntries = (entries: ReadonlyArray<ScheduleEntry>): ReadonlyArray<ScheduleStep> =>
  entries.flatMap((entry) =>
    isScheduleEntry(entry) || isFragmentEntry(entry) || isPhaseEntry(entry)
      ? [...entry.steps]
      : [entry]
  )

const findPlanSchema = <Entries extends ReadonlyArray<ScheduleEntry>>(
  entries: Entries
): EntrySchema<Entries[number]> => {
  const owner = entries.find((entry) => isSystemStep(entry) || "schema" in entry)
  if (!owner) {
    throw new Error("Schedule plan must include at least one system, schedule, fragment, or phase to infer schema")
  }
  return (isSystemStep(owner) ? owner.spec.schema : owner.schema) as EntrySchema<Entries[number]>
}

const collectUniqueSystems = (steps: ReadonlyArray<ScheduleStep>): ReadonlyArray<AnySystem> => {
  const unique = new Map<symbol, AnySystem>()
  for (const step of steps) {
    if (isSystemStep(step) && !unique.has(step.ordering.key)) {
      unique.set(step.ordering.key, step)
    }
  }
  return [...unique.values()]
}

const collectStepRequirements = (
  steps: ReadonlyArray<ScheduleStep>
): ReadonlyArray<Requirement.Requirement> => Requirement.collect(steps.flatMap((step) => {
  if (isSystemStep(step)) return step.requirements
  if (step.kind === "applyStateTransitions") return step.bundle?.requirements ?? []
  return []
})) as ReadonlyArray<Requirement.Requirement>

const validateUniqueSystemSteps = (
  steps: ReadonlyArray<ScheduleStep>,
  context: string
): void => {
  const keys = new Set<symbol>()
  for (const step of steps) {
    if (!isSystemStep(step)) continue
    if (keys.has(step.ordering.key)) {
      throw new Error(`Duplicate system step in ${context}: ${step.ordering.name}`)
    }
    keys.add(step.ordering.key)
  }
}
