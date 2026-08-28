/**
 * Read-only world projections for tests, saves, debugging, and host code.
 *
 * Inspectors declare the same reads as systems, but they cannot request write
 * queries, write resources, commands, events, or queued state transitions.
 * They run on demand through `runtime.inspect(...)` and return a value without
 * advancing schedule visibility.
 *
 * @module inspector
 * @docGroup runtime
 */
import * as Fx from "./fx.ts"
import type * as Machine from "./machine.ts"
import type * as Query from "./query.ts"
import type * as Relation from "./relation.ts"
import type * as Requirement from "./requirement.ts"
import type { Schema } from "./schema.ts"
import * as System from "./system.ts"
import type { Descriptor } from "./descriptor.ts"

type AnyQuery = Query.Query.Any<any>

type QueryWriteAccess<Q extends AnyQuery> =
  Extract<Q["selection"][keyof Q["selection"]], { readonly mode: "write" }>

type ReadonlyQuery<Q extends AnyQuery> =
  [QueryWriteAccess<Q>] extends [never] ? Q : never

type ReadonlyQueries<Queries extends Record<string, AnyQuery>> = {
  readonly [K in keyof Queries]: ReadonlyQuery<Queries[K]>
}

/** Access categories allowed in a read-only inspector. */
export interface InspectorAccessInput {
  readonly queries?: Record<string, AnyQuery>
  readonly resources?: Record<string, System.ResourceRead<Descriptor<"resource", string, any>>>
  readonly events?: Record<string, System.EventRead<Descriptor<"event", string, any>>>
  readonly services?: Record<string, System.ServiceRead<Descriptor<"service", string, any>>>
  readonly states?: Record<string, System.StateRead<Descriptor<"state", string, any>>>
  readonly machines?: Record<string, Machine.MachineRead<Machine.StateMachine.Any>>
  readonly transitionEvents?: Record<string, Machine.TransitionEventRead<Machine.StateMachine.Any>>
  readonly removed?: Record<string, System.RemovedRead<Descriptor<"component", string, any>>>
  readonly despawned?: Record<string, System.DespawnedRead>
  readonly relationFailures?: Record<string, System.RelationFailureRead<Relation.Relation.Any>>
}

/** Rejects unknown categories and writable query selections. */
export type ExactInspectorAccess<Access extends InspectorAccessInput> =
  System.ExactAccess<Access> & {
    readonly queries?: Access["queries"] extends Record<string, AnyQuery>
      ? ReadonlyQueries<Access["queries"]>
      : never
  }

/** The capabilities visible to one inspector projection. */
export type InspectorContext<Spec extends System.AnySystemSpec> = Pick<
  System.SystemContext<Spec>,
  | "queries"
  | "resources"
  | "events"
  | "states"
  | "machines"
  | "transitionEvents"
  | "removed"
  | "despawned"
  | "relationFailures"
  | "services"
>

/** A built read-only projection tied to one schema and root. */
export interface InspectorDefinition<
  Spec extends System.AnySystemSpec = System.AnySystemSpec,
  out Value = unknown,
  out Root = unknown,
  out Name extends string = string,
  out Needs extends Requirement.Requirement = Requirement.Requirement
> {
  readonly kind: "inspector"
  readonly name: Name
  readonly system: System.SystemDefinition<Spec, void, never, Root, Name, Needs>
  readonly requirements: ReadonlyArray<Needs>
  readonly read: (context: InspectorContext<Spec>) => Value
  readonly __schemaRoot?: Root | undefined
}

/** Type-level helpers for built inspectors. */
export namespace Inspector {
  export type Any = InspectorDefinition<any, any, any, any, any>
  export type Value<T extends Any> = T extends InspectorDefinition<any, infer Value, any, any, any> ? Value : never
  export type Needs<T extends Any> = T extends InspectorDefinition<any, any, any, any, infer Needs> ? Needs : never
}

/** Low-level constructor used by the schema-bound `Game.Inspector` interface. */
export const make = <
  S extends Schema.Any,
  const Name extends string,
  const Access extends InspectorAccessInput,
  Value,
  Root = unknown
>(
  name: Name,
  spec: { readonly schema: S } & ExactInspectorAccess<Access>,
  read: (context: InspectorContext<System.SystemSpec<S, Access, Root>>) => Value
): InspectorDefinition<
  System.SystemSpec<S, Access, Root>,
  Value,
  Root,
  Name,
  System.SystemAccessNeeds<Access>
> => {
  const system = System.System(
    name,
    spec as { readonly schema: S } & Access,
    () => Fx.succeed(undefined)
  ) as unknown as System.SystemDefinition<
    System.SystemSpec<S, Access, Root>,
    void,
    never,
    Root,
    Name,
    System.SystemAccessNeeds<Access>
  >

  return {
    kind: "inspector",
    name,
    system,
    requirements: system.requirements,
    read
  }
}
