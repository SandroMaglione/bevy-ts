/**
 * Schema authoring and binding.
 *
 * This module is the bridge between raw descriptor declarations and the bound
 * `Game` API that systems, schedules, queries, commands, and runtimes use. It
 * answers "what world is allowed to exist in this game?" before any runtime
 * value is built.
 *
 * The normal authoring flow is:
 *
 * 1. declare descriptors with `Descriptor.*`
 * 2. group them into reusable `Schema.fragment(...)` values
 * 3. bind one `Game` with `Schema.bind(...)`
 * 4. build a runtime from that bound `Game`
 *
 * `Schema.Feature` composes fragments and their schedules before binding; see
 * the `feature` module.
 *
 * @module Schema
 * @docGroup core
 *
 * @groupDescription Namespaces
 * Grouped schema helper types for fragments and the bound game API.
 *
 * @groupDescription Interfaces
 * Public schema contracts used before and after binding one root game API.
 *
 * @groupDescription Type Aliases
 * Shared schema registry, merge, validation, and binding helper types.
 *
 * @groupDescription Functions
 * Public helpers for defining roots, creating fragments, and binding `Game`.
 *
 * @example
 * ```ts
 * const Position = Descriptor.Component<{ x: number; y: number }>()("Position")
 * const Velocity = Descriptor.Component<{ x: number; y: number }>()("Velocity")
 * const Score = Descriptor.Resource<number>()("Score")
 *
 * const Core = Schema.fragment({
 *   components: { Position, Velocity },
 *   resources: { Score }
 * })
 *
 * const Root = Schema.defineRoot("Game")
 * const Game = Schema.bind(Core, Root)
 * ```
 */
import type * as Command from "./Command.ts"
import type { ConstructedDescriptor, Descriptor } from "./Descriptor.ts"
import type * as Entity from "./Entity.ts"
import type * as EntityScope from "./EntityScope.ts"
import { buildSchema, emptySchema, mergeSchemas } from "./internal/fragments.ts"
import { makeGame } from "./internal/game.ts"
import type * as Inspector from "./Inspector.ts"
import type * as Machine from "./Machine.ts"
import type * as QueryModule from "./Query.ts"
import type { Query } from "./Query.ts"
import type * as Relation from "./Relation.ts"
import type * as Requirement from "./Requirement.ts"
import type * as Result from "./Result.ts"
import type * as Runtime from "./Runtime.ts"
import type * as Schedule from "./Schedule.ts"
import type * as System from "./System.ts"

export { Feature } from "./Feature.ts"

/**
 * A mapping from schema keys to nominal descriptors.
 */
export type Registry = Record<string, Descriptor.Any>

/**
 * A closed schema: the components, resources, events, and relations a world
 * may contain.
 */
export interface SchemaDefinition<
  out Components extends Registry = {},
  out Resources extends Registry = {},
  out Events extends Registry = {},
  out Relations extends Record<string, Relation.Relation.Any> = {}
> {
  readonly components: Components
  readonly resources: Resources
  readonly events: Events
  readonly relations: Relations
}

const schemaRootTypeId = "~bevy-ts/SchemaRoot" as const

export type RootToken<Name extends string = string> = {
  readonly kind: "SchemaRoot"
  readonly name: Name
  readonly [schemaRootTypeId]: {
    readonly _Name: (_: never) => Name
  }
}

const isRootToken = (value: unknown): value is RootToken =>
  typeof value === "object"
  && value !== null
  && "kind" in value
  && value.kind === "SchemaRoot"

export type MergeSchemaDefinitions<
  A extends Schema.Any,
  B extends Schema.Any
> = SchemaDefinition<
  Schema.Components<A> & Schema.Components<B>,
  Schema.Resources<A> & Schema.Resources<B>,
  Schema.Events<A> & Schema.Events<B>,
  Schema.Relations<A> & Schema.Relations<B>
>

/**
 * Type-level fold for fragment composition.
 */
export type BuildFragments<Fragments extends readonly [Schema.Any, ...Array<Schema.Any>]> =
  Fragments extends readonly [infer Head extends Schema.Any, ...infer Tail extends Array<Schema.Any>]
    ? Tail extends readonly [Schema.Any, ...Array<Schema.Any>]
      ? MergeSchemaDefinitions<Head, BuildFragments<Tail>>
      : Head
    : never

type SchemaKind = "components" | "resources" | "events" | "relations"

type EntryName<Entry> = Entry extends { readonly name: infer Name extends string }
  ? string extends Name ? never : Name
  : never

/**
 * Registry keys known at compile time. Erased registries (`Record<string, ...>`)
 * cannot be checked statically; the runtime merge guard covers them.
 */
type LiteralKeys<R> = {
  readonly [K in keyof R]-?: string extends K ? never : K
}[keyof R]

/**
 * Descriptor names declared more than once inside one registry.
 */
type DuplicateNamesIn<R> = {
  readonly [K in LiteralKeys<R>]: [EntryName<R[K]>] extends [EntryName<R[Exclude<LiteralKeys<R>, K>]>]
    ? EntryName<R[K]>
    : never
}[LiteralKeys<R>]

/**
 * Every identity one schema claims: its registry keys and its descriptor names.
 *
 * Descriptor identity is `(kind, name)`. Types are structural over the same
 * pair, so a closed schema must never contain two descriptors of one kind with
 * the same name: at runtime they would share storage while the compiler
 * treats them as different values.
 */
type SchemaIdentities<S extends Schema.Any> = {
  readonly [Kind in SchemaKind]:
    | `${Kind} key "${LiteralKeys<S[Kind]> & string}"`
    | `${Kind} name "${EntryName<S[Kind][LiteralKeys<S[Kind]>]>}"`
}[SchemaKind]

type SchemaDuplicateNames<S extends Schema.Any> = {
  readonly [Kind in SchemaKind]: `${Kind} name "${DuplicateNamesIn<S[Kind]>}"`
}[SchemaKind]

type FragmentConflicts<
  Fragments extends ReadonlyArray<Schema.Any>,
  Seen = never
> = Fragments extends readonly [infer Head extends Schema.Any, ...infer Tail extends ReadonlyArray<Schema.Any>]
  ? SchemaDuplicateNames<Head> | Extract<SchemaIdentities<Head>, Seen> | FragmentConflicts<Tail, Seen | SchemaIdentities<Head>>
  : never

/**
 * Rejects schema fragments whose registry keys or descriptor names collide.
 *
 * Resolves to `unknown` when the fragments compose cleanly, otherwise to an
 * object type naming every conflicting key or descriptor name.
 */
export type ValidateFragments<Fragments extends ReadonlyArray<Schema.Any>> =
  [FragmentConflicts<Fragments>] extends [never]
    ? unknown
    : {
        readonly __schemaConflicts__: FragmentConflicts<Fragments>
      }

/**
 * Creates one explicit root token for schema-bound long-lived references.
 *
 * Root tokens exist before schema construction so durable entity handles can be
 * stored in descriptor payload types without widening to `Schema.Any`.
 *
 * @example
 * ```ts
 * const Root = Schema.defineRoot("Game")
 *
 * const Target = Descriptor.Component<{
 *   handle: Entity.Handle<typeof Root>
 * }>()("Target")
 * ```
 */
export const defineRoot = <const Name extends string>(name: Name): RootToken<Name> => ({
  kind: "SchemaRoot",
  name,
  [schemaRootTypeId]: {
    _Name: (_: never) => undefined as unknown as Name
  }
}) as RootToken<Name>

/**
 * Creates an empty schema.
 */
export const empty = (): SchemaDefinition => emptySchema()

/**
 * Creates a schema fragment.
 *
 * Fragments are the composition unit for game modules: each says "this
 * subsystem contributes these components/resources/events/relations" and
 * nothing more. Binding and runtime assembly happen later.
 *
 * @example
 * ```ts
 * const Combat = Schema.fragment({
 *   components: { Health, Damage },
 *   events: { Hit }
 * })
 * ```
 */
export const fragment = <
  const Components extends Registry = {},
  const Resources extends Registry = {},
  const Events extends Registry = {},
  const Relations extends Record<string, Relation.Relation.Any> = {}
>(definition: {
  readonly components?: Components
  readonly resources?: Resources
  readonly events?: Events
  readonly relations?: Relations
} & ValidateFragments<[SchemaDefinition<Components, Resources, Events, Relations>]>): SchemaDefinition<Components, Resources, Events, Relations> =>
  mergeSchemas(emptySchema(), {
    components: definition.components ?? {},
    resources: definition.resources ?? {},
    events: definition.events ?? {},
    relations: definition.relations ?? {}
  }) as SchemaDefinition<Components, Resources, Events, Relations>

/**
 * Merges two schema fragments into a larger closed schema.
 *
 * Duplicate keys and descriptor names are rejected at the type level and at
 * runtime.
 */
export const merge = <
  A extends Schema.Any,
  B extends Schema.Any
>(
  left: A,
  right: B & ValidateFragments<[A, B]>
): MergeSchemaDefinitions<A, B> => mergeSchemas(left, right) as MergeSchemaDefinitions<A, B>

/**
 * Composes one or more fragments and returns one bound `Game` surface.
 *
 * Everything created from the returned object carries the same hidden root
 * brand, so systems, schedules, and runtimes from different bound schemas
 * cannot be connected accidentally.
 *
 * @example
 * ```ts
 * const Root = Schema.defineRoot("Game")
 * const Game = Schema.bind(Core, Combat, Root)
 * ```
 */
export function bind<
  S extends Schema.Any
>(schema: S & ValidateFragments<[S]>): Schema.Game<S, S>
export function bind<
  S extends Schema.Any,
  const Name extends string
>(schema: S & ValidateFragments<[S]>, root: RootToken<Name>): Schema.Game<S, RootToken<Name>>
export function bind<
  const Fragments extends readonly [Schema.Any, Schema.Any, ...Array<Schema.Any>]
>(...fragments: Fragments & ValidateFragments<Fragments>): Schema.Game<BuildFragments<Fragments>, BuildFragments<Fragments>>
export function bind<
  const Fragments extends readonly [Schema.Any, Schema.Any, ...Array<Schema.Any>],
  const Name extends string
>(...args: [...Fragments, RootToken<Name>] & ValidateFragments<Fragments>): Schema.Game<BuildFragments<Fragments>, RootToken<Name>>
export function bind(...args: ReadonlyArray<Schema.Any | RootToken>) {
  const maybeRoot = args[args.length - 1]
  const fragments = (isRootToken(maybeRoot) ? args.slice(0, -1) : args) as Array<Schema.Any>
  const schema = buildSchema(fragments)
  return isRootToken(maybeRoot) ? makeGame(schema, maybeRoot) : makeGame(schema, schema)
}

type RuntimeServicesOf<Provided extends Runtime.RuntimeServices<any>> =
  [Provided] extends [Runtime.RuntimeServices<infer Services>] ? Services : never

type RuntimeMachinesOf<Provided extends Runtime.RuntimeMachines<any>> =
  [Provided] extends [Runtime.RuntimeMachines<infer Machines>] ? Machines : {}

type ComponentDescriptor<S extends Schema.Any> = Schema.ComponentDescriptor<S>
type ResourceDescriptor<S extends Schema.Any> = Schema.ResourceDescriptor<S>
type EventDescriptor<S extends Schema.Any> = Schema.EventDescriptor<S>
type RelationDescriptor<S extends Schema.Any> = Schema.RelationDescriptor<S>

type QuerySelectionAccess<S extends Schema.Any, Root> =
  | QueryModule.Access<ComponentDescriptor<S>>
  | Relation.SelectionAccess<S, Root>

interface BoundSystemAccess<S extends Schema.Any, Root> extends System.SystemAccessInput {
  readonly queries?: Record<string, Query.Any<Root>>
  readonly resources?: Record<string, System.ResourceRead<ResourceDescriptor<S>> | System.ResourceWrite<ResourceDescriptor<S>>>
  readonly events?: Record<string, System.EventRead<EventDescriptor<S>> | System.EventWrite<EventDescriptor<S>>>
  readonly machines?: Record<string, Machine.MachineRead<Schema.BoundStateMachine<Root>>>
  readonly nextMachines?: Record<string, Machine.NextMachineWrite<Schema.BoundStateMachine<Root>>>
  readonly transitionEvents?: Record<string, Machine.TransitionEventRead<Schema.BoundStateMachine<Root>>>
  readonly removed?: Record<string, System.RemovedRead<ComponentDescriptor<S>>>
  readonly relationFailures?: Record<string, System.RelationFailureRead<RelationDescriptor<S>>>
  readonly when?: ReadonlyArray<Machine.Condition<Root>>
  readonly transitions?: Record<string, Machine.TransitionRead<Schema.BoundStateMachine<Root>>>
}

interface BoundInspectorAccess<S extends Schema.Any, Root> extends Inspector.InspectorAccessInput {
  readonly queries?: Record<string, Query.Any<Root>>
  readonly resources?: Record<string, System.ResourceRead<ResourceDescriptor<S>>>
  readonly events?: Record<string, System.EventRead<EventDescriptor<S>>>
  readonly machines?: Record<string, Machine.MachineRead<Schema.BoundStateMachine<Root>>>
  readonly transitionEvents?: Record<string, Machine.TransitionEventRead<Schema.BoundStateMachine<Root>>>
  readonly removed?: Record<string, System.RemovedRead<ComponentDescriptor<S>>>
  readonly relationFailures?: Record<string, System.RelationFailureRead<RelationDescriptor<S>>>
}

type BoundScheduleEntry<S extends Schema.Any, Root> =
  | Schema.BoundSystem<S, Root, any, any, any>
  | Schedule.ApplyDeferredStep
  | Schedule.ApplyStateTransitionsStep<any, Root>
  | Schema.BoundSchedule<S, Root, any, any>

type BoundTransitionEntry<S extends Schema.Any, Root> =
  Exclude<BoundScheduleEntry<S, Root>, Schedule.ApplyStateTransitionsStep<any, Root>>

type BoundTransitionScheduleResult<
  S extends Schema.Any,
  Root,
  M extends Schema.BoundStateMachine<Root>,
  Entries extends ReadonlyArray<BoundTransitionEntry<S, Root>>
> = Machine.TransitionScheduleDefinition<
  S,
  M,
  Schedule.CompositionExactRequirements<Entries>,
  Root,
  Schedule.CompositionFailure<Entries>
>

type BoundTransitionBundleInput<S extends Schema.Any, Root> =
  | Schema.BoundTransitionSchedule<S, Root, any, any, any>
  | Schema.BoundTransitionBundle<S, Root, any, any, any>

type BoundTransitionBundleResult<
  S extends Schema.Any,
  Root,
  Entries extends ReadonlyArray<BoundTransitionBundleInput<S, Root>>
> = Schedule.TransitionBundleDefinition<
  S,
  ReadonlyArray<Schedule.FlattenTransitionEntries<Entries>[number]>,
  Schedule.TransitionBundleRequirements<Schedule.FlattenTransitionEntries<Entries>>,
  Root,
  Schedule.TransitionBundleRequirements<Schedule.FlattenTransitionEntries<Entries>>,
  Schedule.TransitionBundleFailure<Schedule.FlattenTransitionEntries<Entries>>
>

/**
 * Type-level helpers for schema-driven programming.
 */
export namespace Schema {
  /**
   * Any complete schema definition.
   */
  export type Any = SchemaDefinition<Registry, Registry, Registry, Record<string, Relation.Relation.Any>>

  export type Components<T extends Any> = T["components"]
  export type Resources<T extends Any> = T["resources"]
  export type Events<T extends Any> = T["events"]
  export type Relations<T extends Any> = T["relations"]

  export type ComponentValue<T extends Any, K extends keyof Components<T>> = Descriptor.Value<Components<T>[K]>
  export type ResourceValue<T extends Any, K extends keyof Resources<T>> = Descriptor.Value<Resources<T>[K]>
  export type EventValue<T extends Any, K extends keyof Events<T>> = Descriptor.Value<Events<T>[K]>

  /** Union of the component descriptors registered in a schema. */
  export type ComponentDescriptor<S extends Any> = Extract<Components<S>[keyof Components<S>], Descriptor<"component", string, any>>
  /** Union of the resource descriptors registered in a schema. */
  export type ResourceDescriptor<S extends Any> = Extract<Resources<S>[keyof Resources<S>], Descriptor<"resource", string, any>>
  /** Union of the event descriptors registered in a schema. */
  export type EventDescriptor<S extends Any> = Extract<Events<S>[keyof Events<S>], Descriptor<"event", string, any>>
  /** Union of the relations registered in a schema. */
  export type RelationDescriptor<S extends Any> = Extract<Relations<S>[keyof Relations<S>], Relation.Relation.Any>

  /**
   * A schema-bound system definition branded to one bound schema root.
   */
  export type BoundSystem<
    S extends Any,
    Root,
    Spec extends System.AnySystemSpec = System.AnySystemSpec,
    A = void,
    E = never,
    Name extends string = string,
    Needs extends Requirement.Requirement = Requirement.Requirement
  > = System.SystemDefinition<Spec & { readonly schema: S }, A, E, Root, Name, Needs>

  /** A schema-bound read-only world projection. */
  export type BoundInspector<
    S extends Any,
    Root,
    Spec extends System.AnySystemSpec = System.AnySystemSpec,
    Value = unknown,
    Name extends string = string,
    Needs extends Requirement.Requirement = Requirement.Requirement
  > = Inspector.InspectorDefinition<Spec & { readonly schema: S }, Value, Root, Name, Needs>

  /**
   * A schema-bound schedule definition branded to one bound schema root.
   */
  export type BoundSchedule<
    S extends Any,
    Root,
    Needs extends Requirement.Requirement = Requirement.Requirement,
    Failure extends System.SystemFailure = never
  > = Schedule.ScheduleDefinition<S, Needs, Root, Needs, Failure>

  /**
   * A schema-bound finite-state machine.
   */
  export type BoundStateMachine<
    Root,
    Name extends string = string,
    Values extends readonly [Machine.StateValue, ...Machine.StateValue[]] = readonly [Machine.StateValue, ...Machine.StateValue[]]
  > = Machine.StateMachineDefinition<Name, Values, Root>

  export type BoundTransitionSchedule<
    S extends Any,
    Root,
    M extends BoundStateMachine<Root> = BoundStateMachine<Root>,
    Needs extends Requirement.Requirement = Requirement.Requirement,
    Failure extends System.SystemFailure = never
  > = Machine.TransitionScheduleDefinition<S, M, Needs, Root, Failure>

  export type BoundTransitionBundle<
    S extends Any,
    Root,
    Entries extends ReadonlyArray<BoundTransitionSchedule<S, Root, any, any, any>> = ReadonlyArray<BoundTransitionSchedule<S, Root, any, any, any>>,
    Needs extends Requirement.Requirement = Requirement.Requirement,
    Failure extends System.SystemFailure = never
  > = Schedule.TransitionBundleDefinition<S, Entries, Needs, Root, Needs, Failure>

  /**
   * A schema-bound runtime branded to one bound schema root.
   */
  export type BoundRuntime<
    S extends Any,
    Root,
    Services extends Record<string, unknown>,
    Resources extends object = {},
    Machines extends Record<string, unknown> = {}
  > = Runtime.Runtime<S, Services, Resources, Root, Machines>

  /**
   * One fully bound public authoring surface.
   */
  export interface Game<S extends Any, Root = S> {
    readonly schema: S
    /** Creates a typed ownership scope for scene or level entities. */
    readonly EntityScope: <const Name extends string>(name: Name) => EntityScope.EntityScope<Name, Root>
    /** Declares a reusable, requirement-checked read-only world projection. */
    readonly Inspector: <
      const Name extends string,
      const Access extends BoundInspectorAccess<S, Root>,
      Value
    >(
      name: Name,
      spec: Inspector.ExactInspectorAccess<Access>,
      read: (context: Inspector.InspectorContext<System.SystemSpec<S, Access, Root>>) => Value
    ) => BoundInspector<S, Root, System.SystemSpec<S, Access, Root>, Value, Name, System.SystemAccessNeeds<Access>>
    readonly Entity: {
      /**
       * Converts an entity id or query match into a durable handle, optionally
       * with an intent component that later resolution must prove.
       */
      handle: <const D extends ComponentDescriptor<S> | undefined = undefined>(
        target: Entity.HandleTarget<S, Root>,
        intent?: D
      ) => Entity.Handle<Root, D>
    }
    readonly Query: {
      <
        const Selection extends Record<string, QuerySelectionAccess<S, Root>>,
        const With extends ReadonlyArray<ComponentDescriptor<S>> = [],
        const Without extends ReadonlyArray<ComponentDescriptor<S>> = [],
        const Filters extends ReadonlyArray<QueryModule.Filter<ComponentDescriptor<S>>> = [],
        const WithRelations extends ReadonlyArray<RelationDescriptor<S>> = [],
        const WithoutRelations extends ReadonlyArray<RelationDescriptor<S>> = [],
        const WithRelated extends ReadonlyArray<RelationDescriptor<S>> = [],
        const WithoutRelated extends ReadonlyArray<RelationDescriptor<S>> = []
      >(spec: {
        readonly selection: Selection
        readonly with?: With
        readonly without?: Without
        readonly filters?: Filters
        readonly withRelations?: WithRelations
        readonly withoutRelations?: WithoutRelations
        readonly withRelated?: WithRelated
        readonly withoutRelated?: WithoutRelated
      }): QueryModule.QuerySpec<Selection, With, Without, Filters, WithRelations, WithoutRelations, WithRelated, WithoutRelated, Root>
      read: <D extends ComponentDescriptor<S>>(descriptor: D) => QueryModule.ReadAccess<D>
      write: <D extends ComponentDescriptor<S>>(descriptor: D) => QueryModule.WriteAccess<D>
      optional: <D extends ComponentDescriptor<S>>(descriptor: D) => QueryModule.OptionalReadAccess<D>
      added: <D extends ComponentDescriptor<S>>(descriptor: D) => QueryModule.AddedFilter<D>
      changed: <D extends ComponentDescriptor<S>>(descriptor: D) => QueryModule.ChangedFilter<D>
      readRelation: <R extends RelationDescriptor<S>>(descriptor: R) => Relation.RelationReadAccess<R, S, Root>
      optionalRelation: <R extends RelationDescriptor<S>>(descriptor: R) => Relation.OptionalRelationReadAccess<R, S, Root>
      readRelated: <R extends RelationDescriptor<S>>(descriptor: R) => Relation.RelatedReadAccess<R, S, Root>
      optionalRelated: <R extends RelationDescriptor<S>>(descriptor: R) => Relation.OptionalRelatedReadAccess<R, S, Root>
    }
    readonly Command: {
      /** Starts an entity draft from `[Descriptor, value]` entries and entry results. */
      spawn: <const Entries extends ReadonlyArray<Command.SpawnEntry<S>> = readonly []>(
        ...entries: Entries
      ) => Command.DraftFor<S, Entries, {}, Root>
      /** Adds entries to a draft. */
      insert: <P extends Entity.ComponentProof, const Entries extends ReadonlyArray<Command.SpawnEntry<S>>>(
        draft: Entity.EntityDraft<S, P, Root>,
        ...entries: Entries
      ) => Command.DraftFor<S, Entries, P, Root>
      entry: <D extends ComponentDescriptor<S>>(descriptor: D, value: Descriptor.Value<D>) => Command.Entry<D>
      entryResult: <D extends ComponentDescriptor<S>, E>(
        descriptor: D,
        result: Result.Result<Descriptor.Value<D>, E>
      ) => Result.Result<Command.Entry<D>, E>
      entryRaw: <D extends Extract<ComponentDescriptor<S>, ConstructedDescriptor<"component", string, any, any, any>>>(
        descriptor: D,
        raw: Descriptor.Raw<D>
      ) => Result.Result<Command.Entry<D>, Descriptor.ConstructionError<D>>
      relate: <P extends Entity.ComponentProof, R extends RelationDescriptor<S>>(
        draft: Entity.EntityDraft<S, P, Root>,
        relation: R,
        target: Entity.EntityId<S, Root>
      ) => Entity.EntityDraft<S, P, Root>
    }
    readonly StateMachine: {
      <
        const Name extends string,
        const Values extends readonly [Machine.StateValue, ...Machine.StateValue[]]
      >(name: Name, values: Values): Schema.BoundStateMachine<Root, Name, Values>
    }
    readonly Condition: {
      inState: typeof Machine.inState
      stateChanged: typeof Machine.stateChanged
      not: typeof Machine.not
      and: typeof Machine.and
      or: typeof Machine.or
    }
    readonly System: {
      <
        const Name extends string,
        const Access extends BoundSystemAccess<S, Root>,
        A = void,
        E = never
      >(
        name: Name,
        spec: System.ExactAccess<Access>,
        run: System.SystemRun<System.SystemSpec<S, Access, Root>, A, E>
      ): BoundSystem<S, Root, System.SystemSpec<S, Access, Root>, A, E, Name, System.SystemAccessNeeds<Access>>
      readResource: <D extends ResourceDescriptor<S>>(descriptor: D) => System.ResourceRead<D>
      writeResource: <D extends ResourceDescriptor<S>>(descriptor: D) => System.ResourceWrite<D>
      readEvent: <D extends EventDescriptor<S>>(descriptor: D) => System.EventRead<D>
      writeEvent: <D extends EventDescriptor<S>>(descriptor: D) => System.EventWrite<D>
      service: typeof System.service
      machine: <M extends BoundStateMachine<Root>>(machine: M) => Machine.MachineRead<M>
      nextState: <M extends BoundStateMachine<Root>>(machine: M) => Machine.NextMachineWrite<M>
      readTransitionEvent: <M extends BoundStateMachine<Root>>(machine: M) => Machine.TransitionEventRead<M>
      transition: <M extends BoundStateMachine<Root>>(machine: M) => Machine.TransitionRead<M>
      readRemoved: <D extends ComponentDescriptor<S>>(descriptor: D) => System.RemovedRead<D>
      readDespawned: () => System.DespawnedRead
      readRelationFailures: <R extends RelationDescriptor<S>>(relation: R) => System.RelationFailureRead<R>
    }
    readonly Schedule: {
      /**
       * Builds one schedule from systems, marker steps, and nested schedules.
       * Nested schedules are flattened in place.
       */
      <const Entries extends ReadonlyArray<BoundScheduleEntry<S, Root>>>(
        ...entries: Entries
      ): Schedule.AnonymousScheduleBuildFor<S, Entries, Root>
      transitions: <const Entries extends ReadonlyArray<BoundTransitionBundleInput<S, Root>>>(
        ...entries: Entries
      ) => BoundTransitionBundleResult<S, Root, Entries>
      onEnter: <M extends BoundStateMachine<Root>, const Entries extends ReadonlyArray<BoundTransitionEntry<S, Root>>>(
        machine: M,
        state: Machine.StateMachine.Value<M>,
        plan: readonly [...Entries]
      ) => BoundTransitionScheduleResult<S, Root, M, Entries>
      onExit: <M extends BoundStateMachine<Root>, const Entries extends ReadonlyArray<BoundTransitionEntry<S, Root>>>(
        machine: M,
        state: Machine.StateMachine.Value<M>,
        plan: readonly [...Entries]
      ) => BoundTransitionScheduleResult<S, Root, M, Entries>
      onTransition: <M extends BoundStateMachine<Root>, const Entries extends ReadonlyArray<BoundTransitionEntry<S, Root>>>(
        machine: M,
        transition: readonly [Machine.StateMachine.Value<M>, Machine.StateMachine.Value<M>],
        plan: readonly [...Entries]
      ) => BoundTransitionScheduleResult<S, Root, M, Entries>
      applyDeferred: typeof Schedule.applyDeferred
      applyStateTransitions: <Bundle extends BoundTransitionBundle<S, Root, any, any, any> | undefined = undefined>(
        bundle?: Bundle
      ) => Schedule.ApplyStateTransitionsStep<Bundle, Root>
    }
    readonly Runtime: {
      /**
       * Builds a runtime. Returns a `Result` exactly when a provided resource
       * goes through a constructed descriptor and can fail validation.
       */
      make: <
        const ProvidedServices extends Runtime.RuntimeServices<any>,
        const Resources extends Runtime.RuntimeResources<S> = {},
        const ProvidedMachines extends Runtime.RuntimeMachines<any> = Runtime.RuntimeMachines<{}>
      >(options: {
        readonly services: ProvidedServices
        readonly resources?: Resources
        readonly machines?: ProvidedMachines
      }) => Runtime.MakeRuntimeResult<S, RuntimeServicesOf<ProvidedServices>, Resources, Root, RuntimeMachinesOf<ProvidedMachines>>
      service: typeof Runtime.service
      services: typeof Runtime.services
      machine: typeof Runtime.machine
      machines: typeof Runtime.machines
    }
  }
}
