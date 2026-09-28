/**
 * Finite-state machine definitions and transition metadata.
 *
 * State machines model queued discrete phase changes whose commit boundaries
 * matter to schedule execution.
 *
 * Use this module when gameplay depends not only on the current mode, but also
 * on exactly when a mode change becomes committed and which schedules should
 * run around that boundary. Menus, rounds, encounter phases, pause flows, and
 * restart/reset pipelines are the canonical cases.
 *
 * @example
 * ```ts
 * // Model a gameplay phase whose transition timing matters.
 * const GameFlow = Machine.StateMachine("GameFlow", ["Menu", "Playing"] as const)
 *
 * // Gate one system so it only runs in the committed playing phase.
 * const isPlaying = Machine.inState(GameFlow, "Playing")
 * ```
 *
 * @module Machine
 * @docGroup core
 *
 * @groupDescription Namespaces
 * Grouped machine helper types for conditions, transitions, and machine-aware requirements.
 *
 * @groupDescription Interfaces
 * Public state-machine contracts and transition bundle shapes.
 *
 * @groupDescription Type Aliases
 * Shared machine state, transition, and requirement helper types.
 *
 * @groupDescription Functions
 * Public constructors for machines, conditions, and explicit transition bundles.
 */
import type { Schedule } from "./Schedule.ts"
import * as Requirement from "./Requirement.ts"
import type { Schema } from "./Schema.ts"
import type { SystemFailure } from "./System.ts"

/**
 * Allowed literal values for the first finite-state-machine API.
 *
 * This stays intentionally small and serializable. String and number literals
 * cover the common "phase enum" use cases cleanly in TypeScript.
 */
export type StateValue = string | number

/**
 * One schema-bound finite state machine definition.
 */
export interface StateMachineDefinition<
  out Name extends string = string,
  out Values extends readonly [StateValue, ...StateValue[]] = readonly [StateValue, ...StateValue[]],
  out Root = unknown
> {
  readonly kind: "stateMachine"
  readonly name: Name
  readonly key: symbol
  readonly values: Values
  readonly __schemaRoot?: Root | undefined
}

/**
 * The runtime-visible transition payload for one machine.
 */
export interface TransitionSnapshot<M extends StateMachineDefinition = StateMachineDefinition> {
  readonly from: StateMachine.Value<M>
  readonly to: StateMachine.Value<M>
}

/**
 * A typed read-only view over the current committed state.
 */
export interface MachineView<M extends StateMachineDefinition = StateMachineDefinition> {
  get(): StateMachine.Value<M>
  is(value: StateMachine.Value<M>): boolean
}

/**
 * A typed queued-write view over the next state.
 */
export interface NextMachineView<M extends StateMachineDefinition = StateMachineDefinition> {
  getPending(): StateMachine.Value<M> | undefined
  set(value: StateMachine.Value<M>): void
  setIfChanged(value: StateMachine.Value<M>): void
  reset(): void
}

/**
 * A typed read-only view over the last applied transition.
 *
 * This view is only meaningful inside transition schedules and is therefore
 * only exposed to systems that explicitly declare transition access.
 */
export interface TransitionView<M extends StateMachineDefinition = StateMachineDefinition> {
  get(): TransitionSnapshot<M>
}

/**
 * A typed read-only stream of committed machine transition events.
 *
 * These snapshots are published by `applyStateTransitions(...)` when a
 * transition commits. Like events, each reader sees the transitions published
 * since its own previous run.
 */
export interface TransitionEventView<M extends StateMachineDefinition = StateMachineDefinition> {
  all(): ReadonlyArray<TransitionSnapshot<M>>
}

/**
 * Read access to the current committed state in a system spec.
 */
export interface MachineRead<M extends StateMachineDefinition = StateMachineDefinition> {
  readonly machine: M
}

/**
 * Queued write access to the next state in a system spec.
 */
export interface NextMachineWrite<M extends StateMachineDefinition = StateMachineDefinition> {
  readonly machine: M
}

/**
 * Read access to transition metadata in a system spec.
 */
export interface TransitionRead<M extends StateMachineDefinition = StateMachineDefinition> {
  readonly machine: M
}

/**
 * Read access to committed transition events in a system spec.
 */
export interface TransitionEventRead<M extends StateMachineDefinition = StateMachineDefinition> {
  readonly machine: M
}

/**
 * A typed declarative run condition.
 */
export type Condition<Root = unknown> =
  | InStateCondition<StateMachineDefinition<string, readonly [StateValue, ...StateValue[]], Root>>
  | StateChangedCondition<StateMachineDefinition<string, readonly [StateValue, ...StateValue[]], Root>>
  | NotCondition<Condition<Root>, Requirement.Requirement>
  | AndCondition<ReadonlyArray<Condition<Root>>, Requirement.Requirement>
  | OrCondition<ReadonlyArray<Condition<Root>>, Requirement.Requirement>
  | CheckCondition<Root>

export interface InStateCondition<M extends StateMachineDefinition = StateMachineDefinition> {
  readonly kind: "inState"
  readonly machine: M
  readonly value: StateMachine.Value<M>
  readonly requirements: ReadonlyArray<Requirement.RequirementValue>
  readonly __conditionNeeds?: M | undefined
}

export interface StateChangedCondition<M extends StateMachineDefinition = StateMachineDefinition> {
  readonly kind: "stateChanged"
  readonly machine: M
  readonly requirements: ReadonlyArray<Requirement.RequirementValue>
  readonly __conditionNeeds?: M | undefined
}

export interface NotCondition<
  C extends Condition = Condition,
  Needs extends Requirement.Requirement = Requirement.Requirement
> {
  readonly kind: "not"
  readonly condition: C
  readonly requirements: ReadonlyArray<Requirement.RequirementValue>
  readonly __conditionNeeds?: Needs | undefined
}

export interface AndCondition<
  C extends ReadonlyArray<Condition> = ReadonlyArray<Condition>,
  Needs extends Requirement.Requirement = Requirement.Requirement
> {
  readonly kind: "and"
  readonly conditions: C
  readonly requirements: ReadonlyArray<Requirement.RequirementValue>
  readonly __conditionNeeds?: Needs | undefined
}

export interface OrCondition<
  C extends ReadonlyArray<Condition> = ReadonlyArray<Condition>,
  Needs extends Requirement.Requirement = Requirement.Requirement
> {
  readonly kind: "or"
  readonly conditions: C
  readonly requirements: ReadonlyArray<Requirement.RequirementValue>
  readonly __conditionNeeds?: Needs | undefined
}

/**
 * A run condition computed by a read-only predicate over declared resources,
 * machines, and plain queries (see `Condition.check` / `Game.Condition.check`).
 *
 * The predicate is evaluated just before each gated system runs, against
 * committed values: writes by earlier systems in the same run are visible.
 * Its access excludes every read that consumes or advances a per-reader
 * cursor (events, `added`/`changed` filters, removed/despawned records), so
 * evaluating it any number of times gives the same answer until something it
 * reads is written.
 */
export interface CheckCondition<
  Root = unknown,
  Needs extends Requirement.Requirement = Requirement.Requirement
> {
  readonly kind: "check"
  /** Shown by devtools in place of the predicate. */
  readonly name: string
  /**
   * The read-only projection evaluated for the check. Opaque on purpose: the
   * runtime and devtools read it; keeping its type out of the `Condition`
   * union keeps every system's `when` cheap to check.
   */
  readonly projection: CheckProjection
  readonly requirements: ReadonlyArray<Requirement.RequirementValue>
  readonly __conditionNeeds?: Needs | undefined
  readonly __schemaRoot?: Root | undefined
}

/** The opaque read-only projection behind a `CheckCondition`. */
export interface CheckProjection {
  readonly kind: "inspector"
  readonly name: string
}

/**
 * A machine-bound transition schedule created through the schema-bound API.
 */
export interface TransitionScheduleDefinition<
  S extends Schema.Any = Schema.Any,
  M extends StateMachineDefinition = StateMachineDefinition,
  Needs extends Requirement.Requirement = Requirement.Requirement,
  Root = unknown,
  Failure extends SystemFailure = never
> {
  readonly steps: ReadonlyArray<Schedule.Step>
  readonly systems: ReadonlyArray<unknown>
  readonly schema: S
  readonly requirements: ReadonlyArray<Needs>
  readonly __failure?: (_: never) => Failure
  readonly __schemaRoot?: Root | undefined
  readonly transition: {
    readonly machine: M
    readonly phase: "enter" | "exit" | "transition"
    readonly state?: StateMachine.Value<M>
    readonly from?: StateMachine.Value<M>
    readonly to?: StateMachine.Value<M>
  }
}

/**
 * Type-level and value-level helpers for finite-state machines.
 */
export namespace StateMachine {
  export type Any = StateMachineDefinition<string, readonly [StateValue, ...StateValue[]], unknown>
  export type Value<M extends Any> = M["values"][number]
  export type Root<M extends Any> = M extends StateMachineDefinition<string, readonly [StateValue, ...StateValue[]], infer R> ? R : never
  export type AnyCondition<Root = unknown> = Condition<Root>
  export type AnyTransitionSchedule<S extends Schema.Any = Schema.Any, Root = unknown> =
    TransitionScheduleDefinition<S, Any, Requirement.Requirement, Root, SystemFailure>
}

/** Extracts the machine token from one declared machine access slot. */
type MachineFromAccess<Access> =
  Access extends { readonly machine: infer M extends StateMachine.Any } ? M : never

/**
 * Extracts every requirement (machines, and the resources a `check` reads)
 * mentioned by one run condition, through `not`/`and`/`or`.
 */
export type ConditionNeeds<C> =
  C extends { readonly __conditionNeeds?: infer N extends Requirement.Requirement | undefined }
    ? NonNullable<N>
    : never

/** Extracts the requirement union carried by a condition list. */
export type ConditionNeedsFromConditions<C extends ReadonlyArray<Condition>> =
  ConditionNeeds<C[number]>

/** Extracts only the machine tokens mentioned by one run condition. */
export type MachineNeedsFromCondition<C> = Extract<ConditionNeeds<C>, StateMachine.Any>

/** Extracts the machine-token union carried by a named access record. */
export type MachineNeedsFromRecord<R extends Record<string, unknown>> =
  MachineFromAccess<R[keyof R]>

/** Extracts the machine-token union carried by a condition list. */
export type MachineNeedsFromConditions<C extends ReadonlyArray<Condition>> =
  MachineNeedsFromCondition<C[number]>

/**
 * Creates a schema-bound finite-state machine definition.
 *
 * This is the intended default for gameplay phases and other discrete modes
 * where the transition boundary itself matters.
 *
 * Prefer a machine over a plain resource when code depends on:
 *
 * - queued `nextState(...)` writes
 * - explicit `applyStateTransitions(...)`
 * - `inState(...)` gating
 * - transition events or enter/exit schedules
 */
export const StateMachine = <
  const Name extends string,
  const Values extends readonly [StateValue, ...StateValue[]],
  Root = unknown
>(
  name: Name,
  values: Values
): StateMachineDefinition<Name, Values, Root> => ({
  kind: "stateMachine",
  name,
  key: Symbol.for(`bevy-ts/stateMachine/${name}`),
  values
}) as StateMachineDefinition<Name, Values, Root>

/**
 * Declares that a system wants to read the current committed state.
 *
 * Use this for the current committed phase value. Queued updates remain hidden
 * until the schedule reaches `applyStateTransitions(...)`.
 */
export const read = <M extends StateMachine.Any>(machine: M): MachineRead<M> => ({
  machine
})

/**
 * Declares that a system wants to queue the next state.
 *
 * This is the machine equivalent of "request a phase change later". The change
 * becomes committed only at `applyStateTransitions(...)`.
 */
export const write = <M extends StateMachine.Any>(machine: M): NextMachineWrite<M> => ({
  machine
})

/**
 * Declares that a system wants access to the last applied transition payload.
 */
export const transition = <M extends StateMachine.Any>(machine: M): TransitionRead<M> => ({
  machine
})

/**
 * Declares that a system wants to read committed transition events for one machine.
 *
 * Use this when later systems need to observe that a transition happened after
 * the schedule has already committed it.
 */
export const readTransitionEvent = <M extends StateMachine.Any>(machine: M): TransitionEventRead<M> => ({
  machine
})

/**
 * Creates a condition that only passes in one exact machine state.
 *
 * Use this to gate systems or schedule entries by the committed gameplay phase.
 * If you need this kind of gating, the value should generally be modeled as a
 * finite-state machine rather than a plain state descriptor.
 */
export const inState = <M extends StateMachine.Any>(
  machine: M,
  value: StateMachine.Value<M>
): InStateCondition<M> => ({
  kind: "inState",
  machine,
  value,
  requirements: [machine]
})

/**
 * Creates a condition that passes when the machine changed during the current schedule execution.
 */
export const stateChanged = <M extends StateMachine.Any>(
  machine: M
): StateChangedCondition<M> => ({
  kind: "stateChanged",
  machine,
  requirements: [machine]
})

/**
 * Negates another condition.
 */
export const not = <C extends Condition>(condition: C): NotCondition<C, ConditionNeeds<C>> => ({
  kind: "not",
  condition,
  requirements: condition.requirements
})

/**
 * Requires every child condition to pass.
 */
export const and = <const C extends ReadonlyArray<Condition>>(...conditions: C): AndCondition<C, ConditionNeeds<C[number]>> => ({
  kind: "and",
  conditions,
  requirements: Requirement.collect(conditions.flatMap((condition) => condition.requirements))
})

/**
 * Requires at least one child condition to pass.
 */
export const or = <const C extends ReadonlyArray<Condition>>(...conditions: C): OrCondition<C, ConditionNeeds<C[number]>> => ({
  kind: "or",
  conditions,
  requirements: Requirement.collect(conditions.flatMap((condition) => condition.requirements))
})
