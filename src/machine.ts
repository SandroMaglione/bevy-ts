/**
 * Finite-state machine definitions and transition metadata.
 *
 * State machines model queued discrete phase changes whose commit boundaries
 * matter to schedule execution.
 *
 * @example
 * ```ts
 * const GameFlow = Machine.define("GameFlow", ["Menu", "Playing"] as const)
 * const isPlaying = Machine.inState(GameFlow, "Playing")
 * ```
 *
 * @module machine
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
import type { Schedule } from "./schedule.ts"
import type { Schema } from "./schema.ts"

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
 * These snapshots are emitted by `applyStateTransitions(...)` and become
 * readable only after the normal `updateEvents()` marker advances event
 * visibility for the current schedule.
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
  | NotCondition<Condition<Root>>
  | AndCondition<ReadonlyArray<Condition<Root>>>
  | OrCondition<ReadonlyArray<Condition<Root>>>

export interface InStateCondition<M extends StateMachineDefinition = StateMachineDefinition> {
  readonly kind: "inState"
  readonly machine: M
  readonly value: StateMachine.Value<M>
}

export interface StateChangedCondition<M extends StateMachineDefinition = StateMachineDefinition> {
  readonly kind: "stateChanged"
  readonly machine: M
}

export interface NotCondition<C extends Condition = Condition> {
  readonly kind: "not"
  readonly condition: C
}

export interface AndCondition<C extends ReadonlyArray<Condition> = ReadonlyArray<Condition>> {
  readonly kind: "and"
  readonly conditions: C
}

export interface OrCondition<C extends ReadonlyArray<Condition> = ReadonlyArray<Condition>> {
  readonly kind: "or"
  readonly conditions: C
}

/**
 * A machine-bound transition schedule created through the schema-bound API.
 */
export interface TransitionScheduleDefinition<
  S extends Schema.Any = Schema.Any,
  M extends StateMachineDefinition = StateMachineDefinition,
  Requirements = unknown,
  Root = unknown
> {
  readonly steps: ReadonlyArray<Schedule.Step>
  readonly systems: ReadonlyArray<unknown>
  readonly schema: S
  readonly requirements: Requirements
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
    TransitionScheduleDefinition<S, Any, unknown, Root>
}

/**
 * Extracts the runtime initialization requirements implied by one machine access object.
 */
type RequirementForAccess<Access> =
  Access extends { readonly machine: infer M extends StateMachine.Any }
    ? { readonly [K in M["name"]]: StateMachine.Value<M> }
    : {}

type ConditionRequirements<C> =
  C extends InStateCondition<infer M> ? { readonly [K in M["name"]]: StateMachine.Value<M> }
  : C extends StateChangedCondition<infer M> ? { readonly [K in M["name"]]: StateMachine.Value<M> }
  : C extends NotCondition<infer Inner> ? ConditionRequirements<Inner>
  : C extends AndCondition<infer Many> ? UnionToIntersection<ConditionRequirements<Many[number]>>
  : C extends OrCondition<infer Many> ? UnionToIntersection<ConditionRequirements<Many[number]>>
  : never

type UnionToIntersection<A> =
  (A extends unknown ? (value: A) => void : never) extends ((value: infer I) => void) ? I : never

type RecordAccessUnion<R extends Record<string, unknown>> =
  R extends Record<string, unknown> ? R[keyof R] : never

/**
 * Derives machine requirements from declared machine access slots.
 */
export type MachineRequirementsFromRecord<R extends Record<string, unknown>> = {
  readonly [K in keyof UnionToIntersection<RequirementForAccess<RecordAccessUnion<R>>>]:
    UnionToIntersection<RequirementForAccess<RecordAccessUnion<R>>>[K]
}

/**
 * Derives machine requirements from declared conditions.
 */
export type MachineRequirementsFromConditions<C extends ReadonlyArray<Condition>> = {
  readonly [K in keyof UnionToIntersection<ConditionRequirements<C[number]>>]:
    UnionToIntersection<ConditionRequirements<C[number]>>[K]
}

/**
 * Creates a schema-bound finite-state machine definition.
 *
 * This is the intended default for gameplay phases and other discrete modes
 * where the transition boundary itself matters.
 *
 * Prefer a machine over `Descriptor.defineState(...)` when code depends on:
 *
 * - queued `nextState(...)` writes
 * - explicit `applyStateTransitions(...)`
 * - `inState(...)` gating
 * - transition events or enter/exit schedules
 */
export const define = <
  const Name extends string,
  const Values extends readonly [StateValue, ...StateValue[]],
  Root = unknown
>(
  name: Name,
  values: Values
): StateMachineDefinition<Name, Values, Root> => ({
  kind: "stateMachine",
  name,
  key: Symbol(name),
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
 * If you need this kind of gating, the value should generally be modeled as a
 * finite-state machine rather than a plain state descriptor.
 */
export const inState = <M extends StateMachine.Any>(
  machine: M,
  value: StateMachine.Value<M>
): InStateCondition<M> => ({
  kind: "inState",
  machine,
  value
})

/**
 * Creates a condition that passes when the machine changed during the current schedule execution.
 */
export const stateChanged = <M extends StateMachine.Any>(
  machine: M
): StateChangedCondition<M> => ({
  kind: "stateChanged",
  machine
})

/**
 * Negates another condition.
 */
export const not = <C extends Condition>(condition: C): NotCondition<C> => ({
  kind: "not",
  condition
})

/**
 * Requires every child condition to pass.
 */
export const and = <const C extends ReadonlyArray<Condition>>(...conditions: C): AndCondition<C> => ({
  kind: "and",
  conditions
})

/**
 * Requires at least one child condition to pass.
 */
export const or = <const C extends ReadonlyArray<Condition>>(...conditions: C): OrCondition<C> => ({
  kind: "or",
  conditions
})
