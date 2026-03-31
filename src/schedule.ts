import type { Label } from "./label.ts"
import type { StateMachine } from "./machine.ts"
import type { Schema } from "./schema.ts"
import type { OrderTarget, RuntimeRequirements, SystemDefinition, SystemRequirements } from "./system.ts"

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
 * const update = Game.Schedule.define({
 *   systems: [writeHits, reactToHits],
 *   steps: [
 *     writeHits,
 *     Game.Schedule.updateEvents(),
 *     reactToHits
 *   ]
 * })
 * ```
 */

/**
 * A typed set-level ordering configuration.
 *
 * This is the Bevy-inspired grouping layer used to order multiple systems as a
 * unit without falling back to string identifiers.
 */
export interface SystemSetConfig<
  out Set extends Label.SystemSet = Label.SystemSet,
  out After extends ReadonlyArray<OrderTarget> = ReadonlyArray<OrderTarget>,
  out Before extends ReadonlyArray<OrderTarget> = ReadonlyArray<OrderTarget>
> {
  /**
   * Nominal identity of the configured system set.
   */
  readonly label: Set
  /**
   * Other systems or sets that must run before this set.
   */
  readonly after: After
  /**
   * Other systems or sets that must run after this set.
   */
  readonly before: Before
  /**
   * Typed conditions that must pass for this set to run.
   */
  readonly when: ReadonlyArray<StateMachine.AnyCondition>
  /**
   * Whether systems assigned to this set should run in declaration order.
   */
  readonly chain: boolean
}

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
  out Root = unknown
> {
  readonly kind: "transitionBundle"
  readonly entries: Entries
  readonly requirements: Requirements
  readonly __schemaRoot?: Root | undefined
}

/**
 * One executable step in a schedule.
 */
export type ScheduleStep = SystemDefinition<any, any, any> | ScheduleMarkerStep

/**
 * Shared schedule shape used by both anonymous and named schedules.
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
   * Systems included in this schedule, sorted by dependency order.
   */
  readonly systems: ReadonlyArray<SystemDefinition<any, any, any>>
  /**
   * Typed set configurations applied to this schedule.
   */
  readonly sets: ReadonlyArray<SystemSetConfig>
  /**
   * The closed schema all systems in the schedule are expected to target.
   */
  readonly schema: S
  /**
   * Type-only aggregate requirements needed to execute this schedule safely.
   */
  readonly requirements: Requirements
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
  out Root = unknown
> extends ScheduleBase<S, Requirements> {
  readonly kind: "anonymous" | "named"
  readonly __schemaRoot?: Root | undefined
}

/**
 * A directly executable schedule value with no external typed identity.
 *
 * Anonymous schedules are the default form. They can be passed to the runtime
 * and app directly, but they intentionally do not expose a schedule label.
 */
export interface AnonymousScheduleDefinition<
  S extends Schema.Any,
  out Requirements extends RuntimeRequirements = RuntimeRequirements,
  out Root = unknown
> extends ExecutableScheduleDefinition<S, Requirements, Root> {
  readonly kind: "anonymous"
}

/**
 * A directly executable schedule value with external typed identity.
 *
 * Named schedules are only needed when some other API must refer to the
 * schedule by a stable typed label outside the literal value itself.
 */
export interface NamedScheduleDefinition<
  S extends Schema.Any,
  out Requirements extends RuntimeRequirements = RuntimeRequirements,
  out L extends Label.Schedule = Label.Schedule,
  out Root = unknown
> extends ExecutableScheduleDefinition<S, Requirements, Root> {
  readonly kind: "named"
  readonly label: L
}

/**
 * Any supported schedule definition.
 */
export type ScheduleDefinition<
  S extends Schema.Any,
  Requirements extends RuntimeRequirements = RuntimeRequirements,
  Root = unknown
> = AnonymousScheduleDefinition<S, Requirements, Root> | NamedScheduleDefinition<S, Requirements, Label.Schedule, Root>

/**
 * Type-level and value-level helpers for schedule construction.
 */
export namespace Schedule {
  /**
   * Any anonymous schedule.
   */
  export type Anonymous<
    S extends Schema.Any,
    Requirements extends RuntimeRequirements = RuntimeRequirements,
    Root = unknown
  > = AnonymousScheduleDefinition<S, Requirements, Root>
  /**
   * Any named schedule.
   */
  export type Named<
    S extends Schema.Any,
    Requirements extends RuntimeRequirements = RuntimeRequirements,
    L extends Label.Schedule = Label.Schedule,
    Root = unknown
  > = NamedScheduleDefinition<S, Requirements, L, Root>
  /**
   * Any supported execution step.
   */
  export type Step = ScheduleStep
  export type TransitionBundle<
    S extends Schema.Any,
    Entries extends ReadonlyArray<StateMachine.AnyTransitionSchedule<S, any>> = ReadonlyArray<StateMachine.AnyTransitionSchedule<S, any>>,
    Requirements extends RuntimeRequirements<any, any, any, any> = RuntimeRequirements<any, any, any, any>,
    Root = unknown
  > = TransitionBundleDefinition<S, Entries, Requirements, Root>
}

type AnySystem = SystemDefinition<any, any, any>
type AnySetConfig = SystemSetConfig<any, any, any>
type AnyOrderTarget = OrderTarget
export type AnyRuntimeRequirements = RuntimeRequirements<any, any, any, any>

/**
 * Flattens an inferred object type for cleaner public signatures.
 */
type Simplify<A> = {
  readonly [K in keyof A]: A[K]
}

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
type WidenSteps<Steps extends ReadonlyArray<ScheduleStep> | undefined> =
  Steps extends ReadonlyArray<ScheduleStep> ? WidenArray<Steps> : undefined
type ScheduleSystemName<SystemValue> =
  SystemValue extends { readonly name: infer Name extends string } ? Name : never
type StepSystems<Steps extends ReadonlyArray<ScheduleStep>> = Extract<Steps[number], AnySystem>
type StepSystemNames<Steps extends ReadonlyArray<ScheduleStep>> = ScheduleSystemName<StepSystems<Steps>>

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

type ScheduleSchemaOf<Base extends ScheduleDefinition<any, any, any>> =
  Base extends ScheduleDefinition<infer S, any, any> ? S : never

type ScheduleRootOf<Base extends ScheduleDefinition<any, any, any>> =
  Base extends ScheduleDefinition<any, any, infer Root> ? Root : never

type ScheduleRequirementsOf<Base extends ScheduleDefinition<any, any, any>> =
  Base extends ScheduleDefinition<any, infer Requirements, any>
    ? Requirements
    : EmptyRequirements

type StepRequirementPart<Step, Category extends keyof RuntimeRequirements> =
  Step extends { readonly requirements: infer Requirements }
    ? Requirements extends RuntimeRequirements
      ? Requirements[Category]
      : Step extends ApplyStateTransitionsStep<infer Bundle, any>
        ? Bundle extends TransitionBundleDefinition<any, any, infer TransitionRequirements, any>
          ? TransitionRequirements[Category]
          : never
        : never
    : Step extends ApplyStateTransitionsStep<infer Bundle, any>
      ? Bundle extends TransitionBundleDefinition<any, any, infer TransitionRequirements, any>
        ? TransitionRequirements[Category]
        : never
      : never

type ExtensionRequirements<Step> = Simplify<RuntimeRequirements<
  Simplify<IntersectOrEmpty<StepRequirementPart<Step, "services">>>,
  Simplify<IntersectOrEmpty<StepRequirementPart<Step, "resources">>>,
  Simplify<IntersectOrEmpty<StepRequirementPart<Step, "states">>>,
  Simplify<IntersectOrEmpty<StepRequirementPart<Step, "machines">>>
>>

type MergeRequirements<
  Base extends RuntimeRequirements,
  Extra extends RuntimeRequirements
> = Simplify<RuntimeRequirements<
  Simplify<Base["services"] & Extra["services"]>,
  Simplify<Base["resources"] & Extra["resources"]>,
  Simplify<Base["states"] & Extra["states"]>,
  Simplify<Base["machines"] & Extra["machines"]>
>>

export type ExtendedScheduleFor<
  Base extends ScheduleDefinition<any, any, any>,
  BeforeStep extends ScheduleStep,
  AfterStep extends ScheduleStep
> = AnonymousScheduleDefinition<
  ScheduleSchemaOf<Base>,
  MergeRequirements<
    ScheduleRequirementsOf<Base>,
    ExtensionRequirements<BeforeStep | AfterStep>
  >,
  ScheduleRootOf<Base>
>

/**
 * Extracts the union of internal system names included in one schedule.
 */
type ScheduleSystemNames<Systems extends ReadonlyArray<AnySystem>> = ScheduleSystems<Systems>["name"]

type ScheduleSetNames<Sets extends ReadonlyArray<AnySetConfig>> = Sets[number]["label"]["name"]

/**
 * The union of all system-level ordering targets declared in one schedule.
 */
type SystemOrderTargets<Systems extends ReadonlyArray<AnySystem>> =
  ScheduleSystems<Systems>["ordering"]["after"][number]
  | ScheduleSystems<Systems>["ordering"]["before"][number]

type TargetSystemNames<Targets> =
  Targets extends infer Target
    ? Target extends { readonly ordering: { readonly label: Label.System }, readonly name: infer Name extends string }
      ? Name
      : Target extends Label.System
        ? Target["name"]
        : never
    : never

type TargetSetNames<Targets> =
  Targets extends infer Target
    ? Target extends Label.SystemSet
      ? Target["name"]
      : never
    : never

/**
 * Collects undeclared set memberships from `system.spec.inSets`.
 */
type InvalidSystemMemberships<
  Systems extends ReadonlyArray<AnySystem>,
  Sets extends ReadonlyArray<AnySetConfig>
> = Exclude<ScheduleSystems<Systems>["ordering"]["inSets"][number]["name"], ScheduleSetNames<Sets>>

/**
 * Collects undeclared ordering targets from system-level `after` / `before`.
 */
type InvalidSystemOrderTargets<
  Systems extends ReadonlyArray<AnySystem>,
  Sets extends ReadonlyArray<AnySetConfig>
> =
  | Exclude<TargetSystemNames<SystemOrderTargets<Systems>>, ScheduleSystemNames<Systems>>
  | Exclude<TargetSetNames<SystemOrderTargets<Systems>>, ScheduleSetNames<Sets>>

type HasInvalidSystemMemberships<
  Systems extends ReadonlyArray<AnySystem>,
  Sets extends ReadonlyArray<AnySetConfig>
> = [InvalidSystemMemberships<Systems, Sets>] extends [never] ? false : true

type HasInvalidSystemOrderTargets<
  Systems extends ReadonlyArray<AnySystem>,
  Sets extends ReadonlyArray<AnySetConfig>
> = [InvalidSystemOrderTargets<Systems, Sets>] extends [never] ? false : true

/**
 * Intersects schedule options with a required impossible property only when the
 * schedule contains unresolved typed references.
 */
type ValidateScheduleOptions<
  Systems extends ReadonlyArray<AnySystem>,
  Sets extends ReadonlyArray<AnySetConfig>
> = HasInvalidSystemMemberships<Systems, Sets> extends false
  ? HasInvalidSystemOrderTargets<Systems, Sets> extends false
    ? {}
    : {
        readonly __fixScheduleReferences__: "Unknown ordering target in system.after/system.before"
      }
  : {
      readonly __fixScheduleReferences__: "Unknown system set in system.inSets"
    }

/**
 * Creates a typed system-set configuration.
 *
 * Use sets to order groups of systems as one unit. Sets stay fully typed: no
 * open string references are allowed.
 */
export const configureSet = <
  const Set extends Label.SystemSet,
  const After extends ReadonlyArray<OrderTarget> = [],
  const Before extends ReadonlyArray<OrderTarget> = []
>(config: {
  readonly label: Set
  readonly after?: After
  readonly before?: Before
  readonly when?: ReadonlyArray<StateMachine.AnyCondition>
  readonly chain?: boolean
}): SystemSetConfig<Set, After, Before> => ({
  label: config.label,
  after: (config.after ?? []) as After,
  before: (config.before ?? []) as Before,
  when: config.when ?? [],
  chain: config.chain ?? false
})

/**
 * Creates an explicit command-application marker step.
 *
 * Systems before this marker can enqueue commands. Systems after it see the
 * fully applied world changes.
 */
export const applyDeferred = (): ApplyDeferredStep => ({
  kind: "applyDeferred"
})

/**
 * Creates an explicit event/message update marker step.
 *
 * Systems before this marker can write events. Systems after it read the
 * committed readable event buffers for the current schedule execution.
 */
export const updateEvents = (): EventUpdateStep => ({
  kind: "eventUpdate"
})

/**
 * Creates an explicit lifecycle update marker step.
 *
 * This commits readable `added`, `changed`, `removed`, and `despawned`
 * lifecycle buffers for later systems in the same schedule.
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
>(...entries: Entries): TransitionBundleDefinition<S, FlattenTransitionEntries<Entries>, TransitionBundleRequirements<FlattenTransitionEntries<Entries>>> => ({
  kind: "transitionBundle",
  entries: entries.flatMap((entry) => "entries" in entry ? [...entry.entries] : [entry]) as unknown as FlattenTransitionEntries<Entries>,
  requirements: undefined as unknown as TransitionBundleRequirements<FlattenTransitionEntries<Entries>>
}) as TransitionBundleDefinition<S, FlattenTransitionEntries<Entries>, TransitionBundleRequirements<FlattenTransitionEntries<Entries>>>

/**
 * Creates an explicit machine-transition application marker step.
 *
 * Queued machine writes are committed only at this boundary. If a transition
 * bundle is provided, matching enter/exit/transition schedules run as part of
 * the same boundary.
 */
export const applyStateTransitions = <
  const Bundle extends TransitionBundleDefinition<any, any, any, any> | undefined = undefined
>(bundle?: Bundle): ApplyStateTransitionsStep<Bundle> => ({
  kind: "applyStateTransitions",
  bundle
}) as ApplyStateTransitionsStep<Bundle>

type BaseScheduleOptions<
  S extends Schema.Any,
  Systems extends ReadonlyArray<AnySystem>,
  Sets extends ReadonlyArray<AnySetConfig>
> = {
  readonly schema: S
  readonly systems: Systems
  readonly sets?: Sets
} & ValidateScheduleOptions<Systems, Sets>

type ScheduleOptionsWithSteps<
  S extends Schema.Any,
  Systems extends ReadonlyArray<AnySystem>,
  Sets extends ReadonlyArray<AnySetConfig>,
  Steps extends ReadonlyArray<ScheduleStep>
> = BaseScheduleOptions<S, Systems, Sets> & {
  readonly steps: Steps
}

type ScheduleOptionsWithoutSteps<
  S extends Schema.Any,
  Systems extends ReadonlyArray<AnySystem>,
  Sets extends ReadonlyArray<AnySetConfig>
> = BaseScheduleOptions<S, Systems, Sets> & {
  readonly steps?: undefined
}

export type AnonymousScheduleFor<
  S extends Schema.Any,
  SystemValue extends AnySystem,
  StepValue extends ScheduleStep | undefined
> = AnonymousScheduleDefinition<
  S,
  [StepValue] extends [undefined]
    ? SystemRequirementsForSchedule<ReadonlyArray<SystemValue>>
    : ScheduleRequirements<ReadonlyArray<SystemValue>, ReadonlyArray<Extract<StepValue, ScheduleStep>>>
>

export type NamedScheduleFor<
  S extends Schema.Any,
  L extends Label.Schedule,
  SystemValue extends AnySystem,
  StepValue extends ScheduleStep | undefined
> = NamedScheduleDefinition<
  S,
  [StepValue] extends [undefined]
    ? SystemRequirementsForSchedule<ReadonlyArray<SystemValue>>
    : ScheduleRequirements<ReadonlyArray<SystemValue>, ReadonlyArray<Extract<StepValue, ScheduleStep>>>,
  L
>

/**
 * Creates an anonymous schedule value from an ordered execution plan.
 *
 * When only `systems` are provided, the schedule uses the resolved system order
 * followed by an implicit `applyDeferred()`, `updateEvents()`,
 * `updateLifecycle()`, and `updateRelationFailures()` sequence.
 *
 * Use explicit `steps` when systems in the same schedule must observe
 * intermediate deferred, event, lifecycle, relation-failure, or transition
 * boundaries.
 *
 * @example
 * ```ts
 * const update = Game.Schedule.define({
 *   systems: [spawnEnemies, reactToSpawns],
 *   steps: [
 *     spawnEnemies,
 *     Game.Schedule.applyDeferred(),
 *     Game.Schedule.updateLifecycle(),
 *     reactToSpawns
 *   ]
 * })
 * ```
 */
export function define<
  S extends Schema.Any,
  const Systems extends ReadonlyArray<AnySystem>,
  const Sets extends ReadonlyArray<AnySetConfig> = [],
  StepValue extends ScheduleStep | undefined = undefined
>(
  options: BaseScheduleOptions<S, Systems, Sets> & { readonly steps?: ReadonlyArray<Extract<StepValue, ScheduleStep>> }
): AnonymousScheduleFor<S, Systems[number], StepValue> {
  const orderedSystems = resolveSystems(options.systems, options.sets ?? [])
  const orderedSystemMap = new Map(
    orderedSystems.map((system) => [system.ordering.label.key, system] as const)
  )

  const steps = options.steps
    ? options.steps.map((step) => isSystemStep(step)
      ? orderedSystemMap.get(step.ordering.label.key) ?? step
      : step)
    : [...orderedSystems, applyDeferred(), updateEvents(), updateLifecycle(), updateRelationFailures()]

  return {
    kind: "anonymous",
    steps,
    systems: orderedSystems,
    sets: options.sets ?? [],
    schema: options.schema,
    requirements: undefined as unknown as AnonymousScheduleFor<S, Systems[number], StepValue>["requirements"]
  } as AnonymousScheduleFor<S, Systems[number], StepValue>
}

/**
 * Creates a named schedule value from a typed label and an ordered execution plan.
 *
 * Use this only when some other API needs to refer to the schedule by a stable
 * external identity.
 */
export function named<
  S extends Schema.Any,
  L extends Label.Schedule,
  const Systems extends ReadonlyArray<AnySystem>,
  const Sets extends ReadonlyArray<AnySetConfig> = [],
  StepValue extends ScheduleStep | undefined = undefined
>(
  label: L,
  options: BaseScheduleOptions<S, Systems, Sets> & { readonly steps?: ReadonlyArray<Extract<StepValue, ScheduleStep>> }
): NamedScheduleFor<S, L, Systems[number], StepValue> {
  const anonymous = define(options)
  return {
    ...anonymous,
    kind: "named",
    label
  } as NamedScheduleFor<S, L, Systems[number], StepValue>
}

/**
 * Creates an anonymous schedule by wrapping an existing base schedule with
 * explicit prefix and suffix steps.
 *
 * `extend(...)` is intentionally narrow:
 *
 * - `before` runs exactly before `base.steps`
 * - `after` runs exactly after `base.steps`
 * - `base.steps` stay unchanged
 * - no implicit markers are inserted
 *
 * Use this to keep one headless gameplay schedule as the source of truth, then
 * add host-only capture or sync phases around it.
 *
 * @example
 * ```ts
 * const browserUpdate = Game.Schedule.extend(gameplayUpdate, {
 *   before: [CaptureInputSystem],
 *   after: [
 *     Game.Schedule.updateLifecycle(),
 *     DestroyNodesSystem,
 *     CreateNodesSystem,
 *     SyncNodesSystem
 *   ]
 * })
 * ```
 */
export function extend<
  Base extends ScheduleDefinition<any, any, any>,
  BeforeStep extends ScheduleStep = never,
  AfterStep extends ScheduleStep = never
>(
  base: Base,
  options: {
    readonly before?: ReadonlyArray<BeforeStep>
    readonly after?: ReadonlyArray<AfterStep>
  }
): ExtendedScheduleFor<Base, BeforeStep, AfterStep> {
  const before = (options.before ?? []) as ReadonlyArray<BeforeStep>
  const after = (options.after ?? []) as ReadonlyArray<AfterStep>
  const baseSystemKeys = new Set(base.systems.map((system) => system.ordering.label.key))
  const extensionSystemKeys = new Set<symbol>()

  for (const step of [...before, ...after]) {
    if (!isSystemStep(step)) {
      continue
    }
    if (baseSystemKeys.has(step.ordering.label.key)) {
      throw new Error(`Extended schedule reuses base system: ${step.ordering.label.name}`)
    }
    if (extensionSystemKeys.has(step.ordering.label.key)) {
      throw new Error(`Extended schedule reuses extension system: ${step.ordering.label.name}`)
    }
    extensionSystemKeys.add(step.ordering.label.key)
  }

  const steps = [...before, ...base.steps, ...after] as ReadonlyArray<ScheduleStep>
  const systems = collectUniqueSystems(steps)

  return {
    kind: "anonymous",
    steps,
    systems,
    sets: base.sets,
    schema: base.schema,
    requirements: undefined as unknown as ExtendedScheduleFor<Base, BeforeStep, AfterStep>["requirements"],
    __schemaRoot: base.__schemaRoot
  } as ExtendedScheduleFor<Base, BeforeStep, AfterStep>
}

/**
 * Runtime check used to distinguish system steps from schedule markers.
 */
export const isSystemStep = (step: ScheduleStep): step is SystemDefinition<any, any, any> =>
  "spec" in step

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

const resolveSystems = (
  systems: ReadonlyArray<SystemDefinition<any, any, any>>,
  setConfigs: ReadonlyArray<SystemSetConfig>
): ReadonlyArray<SystemDefinition<any, any, any>> => {
  const byKey = new Map<symbol, SystemDefinition<any, any, any>>()
  const inputOrder = new Map<symbol, number>()
  for (const [index, system] of systems.entries()) {
    const key = system.ordering.label.key
    if (byKey.has(key)) {
      throw new Error(`Duplicate system label in schedule: ${system.ordering.label.name}`)
    }
    byKey.set(key, system)
    inputOrder.set(key, index)
  }

  const setByKey = new Map<symbol, SystemSetConfig>()
  for (const set of setConfigs) {
    if (setByKey.has(set.label.key)) {
      throw new Error(`Duplicate system set label in schedule: ${set.label.name}`)
    }
    setByKey.set(set.label.key, set)
  }

  const systemsInSet = new Map<symbol, Array<SystemDefinition<any, any, any>>>()
  for (const set of setConfigs) {
    systemsInSet.set(set.label.key, [])
  }
  for (const system of systems) {
    for (const set of system.ordering.inSets) {
      const members = systemsInSet.get(set.key)
      if (!members) {
        throw new Error(`Missing system set '${set.name}' referenced by '${system.ordering.label.name}'`)
      }
      members.push(system)
    }
  }

  const dependencies = new Map<symbol, Set<symbol>>()
  for (const system of systems) {
    dependencies.set(system.ordering.label.key, new Set())
  }

  const resolveTargetSystems = (target: OrderTarget, sourceName: string): ReadonlyArray<SystemDefinition<any, any, any>> => {
    if ("ordering" in target) {
      const system = byKey.get(target.ordering.label.key)
      if (!system) {
        throw new Error(`Missing system dependency '${target.name}' referenced by '${sourceName}'`)
      }
      return [system]
    }
    if (target.kind === "system") {
      const system = byKey.get(target.key)
      if (!system) {
        throw new Error(`Missing system dependency '${target.name}' referenced by '${sourceName}'`)
      }
      return [system]
    }
    const systems = systemsInSet.get(target.key)
    if (!systems) {
      throw new Error(`Missing system set dependency '${target.name}' referenced by '${sourceName}'`)
    }
    return systems
  }

  const addDependency = (
    dependent: SystemDefinition<any, any, any>,
    dependency: SystemDefinition<any, any, any>
  ): void => {
    if (dependent.ordering.label.key === dependency.ordering.label.key) {
      return
    }
    dependencies.get(dependent.ordering.label.key)?.add(dependency.ordering.label.key)
  }

  for (const system of systems) {
    for (const target of system.ordering.after) {
      for (const dependency of resolveTargetSystems(target, system.ordering.label.name)) {
        addDependency(system, dependency)
      }
    }
    for (const target of system.ordering.before) {
      for (const dependent of resolveTargetSystems(target, system.ordering.label.name)) {
        addDependency(dependent, system)
      }
    }
  }

  for (const set of setConfigs) {
    const members = systemsInSet.get(set.label.key) ?? []
    if (set.chain) {
      const orderedMembers = [...members].sort((left, right) =>
        (inputOrder.get(left.ordering.label.key) ?? 0) - (inputOrder.get(right.ordering.label.key) ?? 0)
      )
      for (let index = 1; index < orderedMembers.length; index += 1) {
        addDependency(orderedMembers[index]!, orderedMembers[index - 1]!)
      }
    }

    for (const target of set.after) {
      const targetSystems = resolveTargetSystems(target, set.label.name)
      for (const member of members) {
        for (const dependency of targetSystems) {
          addDependency(member, dependency)
        }
      }
    }

    for (const target of set.before) {
      const targetSystems = resolveTargetSystems(target, set.label.name)
      for (const member of members) {
        for (const dependent of targetSystems) {
          addDependency(dependent, member)
        }
      }
    }
  }

  const order: Array<SystemDefinition<any, any, any>> = []
  const visited = new Set<symbol>()
  const stack = new Set<symbol>()

  const visit = (key: symbol): void => {
    if (stack.has(key)) {
      const system = byKey.get(key)
      throw new Error(`Circular system dependency detected at '${system?.ordering.label.name ?? "unknown"}'`)
    }
    if (visited.has(key)) {
      return
    }
    stack.add(key)
    const deps = [...(dependencies.get(key) ?? [])].sort((left, right) =>
      (inputOrder.get(left) ?? 0) - (inputOrder.get(right) ?? 0)
    )
    for (const dep of deps) {
      visit(dep)
    }
    stack.delete(key)
    visited.add(key)
    order.push(byKey.get(key)!)
  }

  const orderedKeys = [...byKey.keys()].sort((left, right) =>
    (inputOrder.get(left) ?? 0) - (inputOrder.get(right) ?? 0)
  )
  for (const key of orderedKeys) {
    visit(key)
  }

  return order
}
