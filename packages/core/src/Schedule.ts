/**
 * Explicit schedule construction and visibility boundaries.
 *
 * Authoring-time structure is validated once, then schedules carry only their
 * normalized steps, systems, and nominal requirement union.
 *
 * Steps run in authored order. `when(conditions, ...entries)` gates a whole
 * group of systems on run conditions at once. Marker steps are the only way queued
 * structural work is applied, and nothing is flushed implicitly when a
 * schedule ends:
 *
 * - `applyDeferred()` applies queued commands
 * - `applyStateTransitions(...)` applies queued commands, then queued machine
 *   transitions
 *
 * Reads need no marker. Change detection (`added`, `changed`, removed and
 * despawned reads), events, transition events, and relation failures are
 * per-reader streams: each system sees what was published since its own
 * previous run, once, in order. Removed/despawned records, events,
 * transition events, and relation failures are kept until every system that
 * reads them has run, so schedules may be ticked at different rates.
 *
 * @module Schedule
 * @docGroup runtime
 */
import type { Condition, MachineNeedsFromConditions, StateMachine } from "./Machine.ts"
import * as Requirement from "./Requirement.ts"
import type { Schema } from "./Schema.ts"
import type { FailureOf as SystemFailureOf, SystemDefinition, SystemFailure } from "./System.ts"

export interface ApplyDeferredStep {
  readonly kind: "applyDeferred"
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
}

/**
 * Anything a schedule can contain: systems, marker steps, and other schedules
 * (which are flattened in place).
 */
export type ScheduleEntry =
  | ScheduleStep
  | ScheduleDefinition<any, any, any, any, any>

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

/**
 * The schedule built by `when(conditions, ...entries)`: the entries' needs
 * plus the machines the conditions read.
 */
export type ConditionalScheduleBuildFor<
  S extends Schema.Any,
  Conditions extends ReadonlyArray<Condition>,
  Entries extends ReadonlyArray<ScheduleEntry>,
  Root = unknown
> = ScheduleDefinition<
  S,
  CompositionExactRequirements<Entries> | MachineNeedsFromConditions<Conditions>,
  Root,
  CompositionExactRequirements<Entries> | MachineNeedsFromConditions<Conditions>,
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


/**
 * Applies every command queued so far, including commands queued by earlier
 * schedule runs.
 */
export const applyDeferred = (): ApplyDeferredStep => ({ kind: "applyDeferred" })

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

export const applyStateTransitions = <
  const Bundle extends TransitionBundleDefinition<any, any, any, any, any, any> | undefined = undefined
>(bundle?: Bundle): ApplyStateTransitionsStep<Bundle> => ({
  kind: "applyStateTransitions",
  bundle
}) as ApplyStateTransitionsStep<Bundle>

/**
 * Builds one schedule from systems, marker steps, and nested schedules.
 *
 * Nested schedules are flattened in place, so reusable pieces compose into
 * one ordered step list. The schema is inferred from the first system or
 * nested schedule; `Game.Schedule(...)` supplies it from the bound game
 * instead, so marker-only schedules are valid there.
 */
export function Schedule<const Entries extends ReadonlyArray<ScheduleEntry>>(
  ...entries: Entries
): AnonymousScheduleBuildFor<EntrySchema<Entries[number]>, Entries> {
  validateEntries(entries)
  return make(findPlanSchema(entries), entries)
}

/**
 * Builds one schedule for a known schema.
 */
export const make = <S extends Schema.Any, const Entries extends ReadonlyArray<ScheduleEntry>>(
  schema: S,
  entries: Entries
): AnonymousScheduleBuildFor<S, Entries> => {
  const steps = normalizeEntries(entries)
  validateUniqueSystemSteps(steps, "schedule")
  return {
    kind: "schedule",
    schema,
    steps,
    systems: collectUniqueSystems(steps),
    requirements: collectStepRequirements(steps)
  } as AnonymousScheduleBuildFor<S, Entries>
}

/**
 * Builds one schedule whose systems run only while every condition passes,
 * in addition to their own `when` conditions: the group equivalent of a
 * system's `when`, for gating many systems on one mode (playing, paused,
 * a hit-stop) without repeating it on each.
 *
 * Conditions gate every system in `entries`, nested schedules included.
 * Marker steps (`applyDeferred`, `applyStateTransitions`) in the group still
 * run. A gated system is the same system as far as the runtime is concerned:
 * it shares change detection and event cursors with the original and with
 * any other gated copy, so using one system in two groups of one schedule is
 * a duplicate like any other.
 */
export const when = <
  S extends Schema.Any,
  const Conditions extends ReadonlyArray<Condition>,
  const Entries extends ReadonlyArray<ScheduleEntry>
>(
  schema: S,
  conditions: Conditions,
  entries: Entries
): ConditionalScheduleBuildFor<S, Conditions, Entries> => {
  const steps = normalizeEntries(entries).map((step) => isSystemStep(step) ? gate(step, conditions) : step)
  validateUniqueSystemSteps(steps, "schedule")
  return {
    kind: "schedule",
    schema,
    steps,
    systems: collectUniqueSystems(steps),
    requirements: collectStepRequirements(steps)
  } as unknown as ConditionalScheduleBuildFor<S, Conditions, Entries>
}

/** A copy of `system` that also requires `conditions`, sharing runtime state with the original. */
const gate = (system: AnySystem, conditions: ReadonlyArray<Condition>): AnySystem => ({
  ...system,
  spec: { ...system.spec, when: [...conditions, ...system.spec.when] },
  requirements: Requirement.collect([...system.requirements, ...conditions.flatMap((condition) => condition.requirements)]),
  base: system.base ?? system
})

export const isSystemStep = (step: ScheduleStep | ScheduleEntry): step is AnySystem =>
  typeof step === "object" && step !== null && "spec" in step

const isScheduleEntry = (entry: ScheduleEntry): entry is ScheduleDefinition<any, any, any, any, any> =>
  typeof entry === "object" && entry !== null && "kind" in entry && entry.kind === "schedule"

const describeValue = (value: unknown): string =>
  value === null ? "null"
  : typeof value !== "object" ? `${typeof value} ${String(value)}`
  : `an object with keys ${Object.keys(value).join(", ") || "(none)"}`

/**
 * Rejects entries that are not systems, schedules, or marker steps, with a
 * message naming the entry. The types already prevent this; it catches
 * values that bypassed them (a stale import that is `undefined`, a
 * dynamically built list), which otherwise fail deep inside with an
 * unhelpful error.
 */
const validateEntries = (entries: ReadonlyArray<unknown>): void => {
  entries.forEach((entry, index) => {
    const valid = typeof entry === "object" && entry !== null && (
      "spec" in entry ||
      ("kind" in entry && (entry.kind === "schedule" || entry.kind === "applyDeferred" || entry.kind === "applyStateTransitions"))
    )
    if (!valid) {
      throw new Error(`Schedule entry ${index} is not a system, a schedule, or a marker step: got ${describeValue(entry)}. Is an import undefined?`)
    }
  })
}

const normalizeEntries = (entries: ReadonlyArray<ScheduleEntry>): ReadonlyArray<ScheduleStep> => {
  validateEntries(entries)
  return entries.flatMap((entry) =>
    isScheduleEntry(entry)
      ? [...entry.steps]
      : [entry]
  )
}

const findPlanSchema = <Entries extends ReadonlyArray<ScheduleEntry>>(
  entries: Entries
): EntrySchema<Entries[number]> => {
  const owner = entries.find((entry) => isSystemStep(entry) || "schema" in entry)
  if (!owner) {
    throw new Error("Schedule plan must include at least one system or schedule to infer its schema; use Game.Schedule(...) for marker-only schedules")
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
