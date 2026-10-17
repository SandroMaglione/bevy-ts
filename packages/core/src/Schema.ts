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
 * There is no plugin or feature object. A reusable slice of a game is a
 * fragment (its descriptors) plus plain functions `(Game, options) => System |
 * Schedule` that build its systems from the bound `Game`, like
 * `RenderSync.system(Game, ...)` and `InputCapture.system(Game, ...)`. List
 * every fragment in one `Schema.bind(...)` call.
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
import type * as Condition from "./Condition.ts"
import type * as Inspector from "./Inspector.ts"
import type * as Machine from "./Machine.ts"
import type * as QueryModule from "./Query.ts"
import type { Query } from "./Query.ts"
import type * as Relation from "./Relation.ts"
import type * as Requirement from "./Requirement.ts"
import type * as Result from "./Result.ts"
import type * as Debug from "./Debug.ts"
import type * as Runtime from "./Runtime.ts"
import type * as Schedule from "./Schedule.ts"
import type * as System from "./System.ts"

/**
 * A mapping from schema keys to nominal descriptors.
 */
export type Registry = Record<string, Descriptor.Any>

/**
 * A closed schema: the components, resources, events, and relations a world
 * may contain, and the component requirements (`Schema.requires`) every
 * entity of it keeps.
 */
export interface SchemaDefinition<
  out Components extends Registry = {},
  out Resources extends Registry = {},
  out Events extends Registry = {},
  out Relations extends Record<string, Relation.Relation.Any> = {},
  out Requires extends RequirementPair = never
> {
  readonly components: Components
  readonly resources: Resources
  readonly events: Events
  readonly relations: Relations
  /** Component requirements declared with `Schema.requires(...)`. */
  readonly requires: ReadonlyArray<ComponentRequirement<Requires>>
}

/**
 * One requirement carried in a schema type, by component name:
 * `[requirer, required]`. One pair per required component, so lookups by
 * either end stay exact.
 */
export type RequirementPair = readonly [string, string]

/**
 * One `Schema.requires(...)` declaration: every entity holding `component`
 * also holds each of `required`.
 */
export interface ComponentRequirement<out Pairs extends RequirementPair = RequirementPair> {
  readonly kind: "requires"
  readonly component: Descriptor<"component", string, any>
  readonly required: ReadonlyArray<Descriptor<"component", string, any>>
  readonly __pairs?: (_: never) => Pairs
}

type AnyComponentDescriptor = Descriptor<"component", string, any>

/** One `[from, to]` pair per required name. */
type RequirementPairs<From extends string, To extends string> = To extends string ? readonly [From, To] : never

type PairsOf<R> = R extends ComponentRequirement<infer Pairs> ? Pairs : never

/**
 * Declares that every entity holding `component` also holds each of
 * `required`. List it in a fragment's `requires`.
 *
 * The compiler then rejects every command that would break it:
 * `commands.spawn` / `spawnIn` of a draft missing a required entry,
 * `commands.insert` of `component` on an entity not proven to hold the
 * rest, and `commands.remove` of a required component while a requirer may
 * stay. `Game.System.spawns(component)` also allows spawning what it
 * requires. Nothing is ever filled in with a default: the draft must carry
 * every value.
 *
 * Requirements chain (`A` requires `B`, `B` requires `C`) and may name
 * components of other fragments of the same `Schema.bind`.
 *
 * @example
 * ```ts
 * const Gameplay = Schema.fragment({
 *   components: { Player, Position, Velocity },
 *   requires: [Schema.requires(Player, Position, Velocity)]
 * })
 * ```
 */
export const requires = <
  D extends AnyComponentDescriptor,
  const Required extends readonly [AnyComponentDescriptor, ...Array<AnyComponentDescriptor>]
>(
  component: D,
  ...required: Required
): ComponentRequirement<RequirementPairs<D["name"], Required[number]["name"]>> => ({ kind: "requires", component, required })

const schemaRootTypeId = "~ritmo/SchemaRoot" as const

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
  Schema.Relations<A> & Schema.Relations<B>,
  Schema.Requires<A> | Schema.Requires<B>
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

type UnregisteredRequirements<S extends Schema.Any> =
  Exclude<Schema.Requires<S>[0] | Schema.Requires<S>[1], Schema.ComponentDescriptor<S>["name"]>

/**
 * Rejects requirements naming a component the bound schema does not
 * register. Checked at `bind`, so a fragment may require a component another
 * fragment registers. Erased schemas (`Schema.Any`) are checked by `bind` at
 * runtime instead.
 */
export type ValidateRequires<S extends Schema.Any> =
  [UnregisteredRequirements<S>] extends [never]
    ? unknown
    : string extends Schema.Requires<S>[1]
    ? unknown
    : {
        readonly __schemaRequires__: `${UnregisteredRequirements<S>} is named in Schema.requires(...) but no fragment registers it: add it to a fragment's components`
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
 *   components: { Health, Damage, Enemy },
 *   events: { Hit },
 *   requires: [Schema.requires(Enemy, Health)]
 * })
 * ```
 */
export const fragment = <
  const Components extends Registry = {},
  const Resources extends Registry = {},
  const Events extends Registry = {},
  const Relations extends Record<string, Relation.Relation.Any> = {},
  const Requires extends ReadonlyArray<ComponentRequirement> = readonly []
>(definition: {
  readonly components?: Components
  readonly resources?: Resources
  readonly events?: Events
  readonly relations?: Relations
  readonly requires?: Requires
} & ValidateFragments<[SchemaDefinition<Components, Resources, Events, Relations>]>): SchemaDefinition<Components, Resources, Events, Relations, PairsOf<Requires[number]>> =>
  mergeSchemas(emptySchema(), {
    components: definition.components ?? {},
    resources: definition.resources ?? {},
    events: definition.events ?? {},
    relations: definition.relations ?? {},
    requires: definition.requires ?? []
  }) as SchemaDefinition<Components, Resources, Events, Relations, PairsOf<Requires[number]>>

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
>(schema: S & ValidateFragments<[S]> & ValidateRequires<S>): Schema.Game<S, S>
export function bind<
  S extends Schema.Any,
  const Name extends string
>(schema: S & ValidateFragments<[S]> & ValidateRequires<S>, root: RootToken<Name>): Schema.Game<S, RootToken<Name>>
export function bind<
  const Fragments extends readonly [Schema.Any, Schema.Any, ...Array<Schema.Any>]
>(...fragments: Fragments & ValidateFragments<Fragments> & ValidateRequires<BuildFragments<Fragments>>): Schema.Game<BuildFragments<Fragments>, BuildFragments<Fragments>>
export function bind<
  const Fragments extends readonly [Schema.Any, Schema.Any, ...Array<Schema.Any>],
  const Name extends string
>(...args: [...Fragments, RootToken<Name>] & ValidateFragments<Fragments> & ValidateRequires<BuildFragments<Fragments>>): Schema.Game<BuildFragments<Fragments>, RootToken<Name>>
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
  readonly resources?: Record<string, System.ResourceRead<ResourceDescriptor<S>> | System.ResourceChanged<ResourceDescriptor<S>> | System.ResourceWrite<ResourceDescriptor<S>>>
  readonly events?: Record<string, System.EventRead<EventDescriptor<S>> | System.EventWrite<EventDescriptor<S>>>
  readonly machines?: Record<string, Machine.MachineRead<Schema.BoundStateMachine<Root>>>
  readonly nextMachines?: Record<string, Machine.NextMachineWrite<Schema.BoundStateMachine<Root>>>
  readonly transitionEvents?: Record<string, Machine.TransitionEventRead<Schema.BoundStateMachine<Root>>>
  readonly removed?: Record<string, System.RemovedRead<ComponentDescriptor<S>>>
  readonly relationFailures?: Record<string, System.RelationFailureRead<RelationDescriptor<S>>>
  readonly when?: ReadonlyArray<Machine.Condition<Root>>
  readonly pauseWhen?: ReadonlyArray<Machine.Condition<Root>>
  readonly transitions?: Record<string, Machine.TransitionRead<Schema.BoundStateMachine<Root>>>
  readonly local?: () => unknown
  readonly commands?: Command.CommandAccess<ComponentDescriptor<S>, ComponentDescriptor<S>, ComponentDescriptor<S>, ComponentDescriptor<S>, EntityScope.EntityScope<string, Root>, RelationDescriptor<S>>
}

interface BoundCheckAccess<S extends Schema.Any, Root> extends Condition.CheckAccessInput {
  readonly queries?: Record<string, Query.Any<Root>>
  readonly resources?: Record<string, System.ResourceRead<ResourceDescriptor<S>> | System.ResourceChanged<ResourceDescriptor<S>> | System.ResourceWrite<ResourceDescriptor<S>>>
  readonly machines?: Record<string, Machine.MachineRead<Schema.BoundStateMachine<Root>>>
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
  | Schema.BoundSystem<S, Root, any, any>
  | Schedule.ApplyDeferredStep
  | Schedule.ApplyStateTransitionsStep<any, Root>
  | Schedule.ScheduleDefinition<S, any, Root, any, any, Schedule.AnyScheduleOrder>

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
  Schedule.CompositionFailure<Entries>,
  Schedule.CompositionOrder<Entries>
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
  Schedule.TransitionBundleFailure<Schedule.FlattenTransitionEntries<Entries>>,
  Schedule.CompositionOrder<Entries>
>

/**
 * Type-level helpers for schema-driven programming.
 */
export namespace Schema {
  /**
   * Any complete schema definition.
   */
  export type Any = SchemaDefinition<Registry, Registry, Registry, Record<string, Relation.Relation.Any>, RequirementPair>

  export type Components<T extends Any> = T["components"]
  export type Resources<T extends Any> = T["resources"]
  export type Events<T extends Any> = T["events"]
  export type Relations<T extends Any> = T["relations"]
  /** The component requirements of a schema, as `[requirer, required]` name pairs (`Schema.requires`). */
  export type Requires<T extends Any> = T extends SchemaDefinition<any, any, any, any, infer Pairs> ? Pairs : never

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
    E = never,
    Name extends string = string,
    Needs extends Requirement.Requirement = Requirement.Requirement
  > = System.SystemDefinition<Spec & { readonly schema: S }, E, Root, Name, Needs>

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
  > = Schedule.ScheduleDefinition<S, Needs, Root, Needs, Failure, Schedule.ScheduleOrder>

  /**
   * A schema-bound finite-state machine.
   */
  export type BoundStateMachine<
    Root,
    Name extends string = string,
    Values extends readonly [Machine.StateValue, ...Machine.StateValue[]] = readonly [Machine.StateValue, ...Machine.StateValue[]],
    Parent = unknown
  > = Machine.StateMachineDefinition<Name, Values, Root, Parent>

  export type BoundTransitionSchedule<
    S extends Any,
    Root,
    M extends BoundStateMachine<Root> = BoundStateMachine<Root>,
    Needs extends Requirement.Requirement = Requirement.Requirement,
    Failure extends System.SystemFailure = never,
    Order extends Schedule.AnyScheduleOrder = Schedule.AnyScheduleOrder
  > = Machine.TransitionScheduleDefinition<S, M, Needs, Root, Failure, Order>

  export type BoundTransitionBundle<
    S extends Any,
    Root,
    Entries extends ReadonlyArray<BoundTransitionSchedule<S, Root, any, any, any>> = ReadonlyArray<BoundTransitionSchedule<S, Root, any, any, any>>,
    Needs extends Requirement.Requirement = Requirement.Requirement,
    Failure extends System.SystemFailure = never,
    Order extends Schedule.AnyScheduleOrder = Schedule.AnyScheduleOrder
  > = Schedule.TransitionBundleDefinition<S, Entries, Needs, Root, Needs, Failure, Order>

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
    /**
     * Creates a typed ownership scope for scene or level entities: a flat
     * group whose members are spawned with `commands.spawnIn(...)` and
     * despawned together. Use `Descriptor.Hierarchy` instead for a
     * parent-child tree with ordered children, traversal, and recursive
     * despawn.
     *
     * When the group lives exactly as long as a state, name the state change
     * that ends it: `despawnOnExit: [Flow, "Playing"]` despawns every member
     * when `applyStateTransitions(...)` commits leaving `Playing` (after its
     * `onExit` schedules, which still see the members), and
     * `despawnOnEnter: [Flow, "Playing"]` when it commits entering it (before
     * its `onEnter` schedules, so what they spawn survives). Use
     * `commands.despawnScope(...)` instead when the wipe is not tied to a
     * state change. Scope names are unique per game.
     *
     * @example
     * ```ts
     * const RunScope = Game.EntityScope("Shooter/Run", { despawnOnExit: [Flow, "Playing"] })
     * ```
     */
    readonly EntityScope: <
      const Name extends string,
      Enter extends Machine.StateMachine.Any = never,
      Exit extends Machine.StateMachine.Any = never
    >(
      name: Name,
      options?: {
        /** Despawns every member when the machine enters this state, before its `onEnter` schedules run. */
        readonly despawnOnEnter?: readonly [Enter & Machine.SameGame<Enter, Root>, Machine.StateMachine.Value<Enter>]
        /** Despawns every member when the machine leaves this state, after its `onExit` schedules run. */
        readonly despawnOnExit?: readonly [Exit & Machine.SameGame<Exit, Root>, Machine.StateMachine.Value<Exit>]
      }
    ) => EntityScope.EntityScope<Name, Root>
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
        // Uninferred: an omitted list is `[]`, never inferred from the spec it is written in (`queries: { ... }`).
      }): QueryModule.QuerySpec<Selection, QueryModule.Uninferred<With, ReadonlyArray<ComponentDescriptor<S>>>, QueryModule.Uninferred<Without, ReadonlyArray<ComponentDescriptor<S>>>, QueryModule.Uninferred<Filters, ReadonlyArray<QueryModule.Filter<ComponentDescriptor<S>>>>, QueryModule.Uninferred<WithRelations, ReadonlyArray<Relation.Relation.Any>>, QueryModule.Uninferred<WithoutRelations, ReadonlyArray<Relation.Relation.Any>>, QueryModule.Uninferred<WithRelated, ReadonlyArray<Relation.Relation.Any>>, QueryModule.Uninferred<WithoutRelated, ReadonlyArray<Relation.Relation.Any>>, Root>
      read: <D extends ComponentDescriptor<S>>(descriptor: D) => QueryModule.ReadAccess<D>
      write: <D extends ComponentDescriptor<S>>(descriptor: D & QueryModule.Writable<D>) => QueryModule.WriteAccess<D>
      optional: <D extends ComponentDescriptor<S>>(descriptor: D) => QueryModule.OptionalReadAccess<D>
      added: <D extends ComponentDescriptor<S>>(descriptor: D) => QueryModule.AddedFilter<D>
      changed: <D extends ComponentDescriptor<S>>(descriptor: D) => QueryModule.ChangedFilter<D>
      anyOf: <
        const Filters extends readonly [
          QueryModule.LifecycleFilter<ComponentDescriptor<S>>,
          QueryModule.LifecycleFilter<ComponentDescriptor<S>>,
          ...ReadonlyArray<QueryModule.LifecycleFilter<ComponentDescriptor<S>>>
        ]
      >(...filters: Filters) => QueryModule.AnyOfFilter<Filters[number]["descriptor"]>
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
      /**
       * Adds entries to a draft (a value not yet spawned). Use
       * `commands.insert` for an entity that already exists.
       */
      extend: <P extends Entity.ComponentProof, const Entries extends ReadonlyArray<Command.SpawnEntry<S>>>(
        draft: Entity.EntityDraft<S, P, Root>,
        ...entries: Entries
      ) => Command.DraftFor<S, Entries, P, Root>
      entry: <D extends ComponentDescriptor<S>>(descriptor: D, value: Descriptor.Value<D>) => Command.Entry<D>
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
    /**
     * Declares one game-wide mode (menu, playing, paused): queued with
     * `nextState`, committed at `applyStateTransitions(...)`, gating systems
     * with `Game.Condition.inState(...)`. Use `Descriptor.EntityState(...)`
     * instead for a state each entity has on its own.
     */
    readonly StateMachine: {
      <
        const Name extends string,
        const Values extends readonly [Machine.StateValue, ...Machine.StateValue[]]
      >(name: Name, values: Values): Schema.BoundStateMachine<Root, Name, Values>
      /**
       * Declares a sub-state: a machine that exists only while `within[0]` is
       * in state `within[1]` (a battle phase that only means something while
       * playing). Whenever the parent enters that state, the sub-state enters
       * the value given to `Game.Runtime.machine(...)`; when the parent leaves
       * it, the sub-state exits and has no value: `get()` is `undefined`,
       * `Game.Condition.inState(Sub, x)` is false, and `nextMachines.sub.set(...)`
       * returns a `SubStateInactive` failure. So `inState(Sub, x)` alone
       * implies the parent's state.
       *
       * Use a second top-level machine instead when the two modes are
       * independent (each keeps its value whatever the other does).
       *
       * @example
       * ```ts
       * const Phase = Game.StateMachine("Phase", ["Setup", "Battle"], { within: [Session, "Playing"] })
       * ```
       */
      <
        const Name extends string,
        const Values extends readonly [Machine.StateValue, ...Machine.StateValue[]],
        Parent extends Machine.StateMachine.Any
      >(
        name: Name,
        values: Values,
        options: { readonly within: readonly [Parent & Machine.SameGame<Parent, Root>, Machine.StateMachine.Value<Parent>] }
      ): Schema.BoundStateMachine<Root, Name, Values, Parent>
    }
    readonly Condition: {
      /**
       * Passes while the machine's committed value is `value`. For a
       * sub-state it fails while the parent is in another state. A machine
       * of another game fails to compile with a message naming the fix.
       */
      inState: <M extends Machine.StateMachine.Any>(
        machine: M & Machine.SameGame<M, Root>,
        value: Machine.StateMachine.Value<M>
      ) => Machine.InStateCondition<M>
      /** Passes in the schedule run where `applyStateTransitions(...)` changed the machine. */
      stateChanged: <M extends Machine.StateMachine.Any>(machine: M & Machine.SameGame<M, Root>) => Machine.StateChangedCondition<M>
      not: typeof Machine.not
      and: typeof Machine.and
      or: typeof Machine.or
      /**
       * A condition computed by a read-only predicate over declared resources,
       * machines, and plain queries; see the `Condition` module. The reads
       * become requirements of whatever the check gates.
       */
      check: <const Name extends string, const Access extends BoundCheckAccess<S, Root>>(
        name: Name,
        spec: Condition.ExactCheckAccess<Access>,
        predicate: (context: Condition.CheckContext<System.SystemSpec<S, Access, Root>>) => boolean
      ) => Machine.CheckCondition<Root, System.SystemAccessNeeds<Access>>
    }
    readonly System: {
      <
        const Name extends string,
        const Access extends BoundSystemAccess<S, Root>,
        E = never
      >(
        name: Name,
        spec: System.ExactAccess<Access>,
        run: System.SystemRun<System.SystemSpec<S, Access, Root>, E>
      ): BoundSystem<S, Root, System.SystemSpec<S, Access, Root>, E, Name, System.SystemAccessNeeds<Access>>
      readResource: <D extends ResourceDescriptor<S>>(descriptor: D) => System.ResourceRead<D>
      writeResource: <D extends ResourceDescriptor<S>>(descriptor: D) => System.ResourceWrite<D>
      changedResource: <D extends ResourceDescriptor<S>>(descriptor: D) => System.ResourceChanged<D>
      readEvent: <D extends EventDescriptor<S>>(descriptor: D) => System.EventRead<D>
      writeEvent: <D extends EventDescriptor<S>>(descriptor: D) => System.EventWrite<D>
      /**
       * Requires every writer of this event or resource to run earlier in the
       * same `runtime.tick(...)` call; checked at compile time by `tick`.
       * Accepts `readEvent(...)`, `readResource(...)`, or a query.
       */
      thisTick: <Read extends System.EventRead<EventDescriptor<S>> | System.ResourceRead<ResourceDescriptor<S>> | System.ResourceChanged<ResourceDescriptor<S>> | Query.Any<Root>>(
        read: Read
      ) => Read & System.ThisTick
      service: typeof System.service
      machine: <M extends BoundStateMachine<Root>>(machine: M) => Machine.MachineRead<M>
      nextState: <M extends BoundStateMachine<Root>>(machine: M) => Machine.NextMachineWrite<M>
      readTransitionEvent: <M extends BoundStateMachine<Root>>(machine: M) => Machine.TransitionEventRead<M>
      transition: <M extends BoundStateMachine<Root>>(machine: M) => Machine.TransitionRead<M>
      readRemoved: <D extends ComponentDescriptor<S>>(descriptor: D) => System.RemovedRead<D>
      readDespawned: () => System.DespawnedRead
      readRelationFailures: <R extends RelationDescriptor<S>>(relation: R) => System.RelationFailureRead<R>
      /**
       * Declares the commands a system may queue, for its spec's `commands`:
       * `Game.System.commands(Game.System.spawns(Enemy, Position), Game.System.despawns(Enemy))`.
       */
      commands: typeof Command.commands
      /** Allows spawning drafts whose components are all among these and what they require (`Schema.requires`); see `Command.spawns`. */
      spawns: <const Components extends ReadonlyArray<ComponentDescriptor<S>>>(...components: Components) => Command.Permission<"spawns", Components[number] | Command.RequiredDescriptors<S, Components[number]["name"]>>
      /** Allows `insert` (add or replace at the next `applyDeferred()`) of these; see `Command.inserts`. */
      inserts: <const Components extends ReadonlyArray<ComponentDescriptor<S>>>(...components: Components) => Command.Permission<"inserts", Components[number]>
      /** Allows `remove` of these. */
      removes: <const Components extends ReadonlyArray<ComponentDescriptor<S>>>(...components: Components) => Command.Permission<"removes", Components[number]>
      /** Allows `despawn` of entities a query proves have one of these; see `Command.despawns`. */
      despawns: <const Components extends ReadonlyArray<ComponentDescriptor<S>>>(...components: Components) => Command.Permission<"despawns", Components[number]>
      /** Allows `despawnScope` of this scope. */
      despawnsScope: <const Scope extends EntityScope.EntityScope<string, Root>>(scope: Scope) => Command.Permission<"despawnsScope", Scope>
      /** Allows `relate`, `unrelate`, and `reorderChildren` of these relations. */
      relates: <const Relations extends ReadonlyArray<RelationDescriptor<S>>>(...relations: Relations) => Command.Permission<"relates", Relations[number]>
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
      /**
       * Builds a schedule whose systems run only while every condition
       * passes (in addition to their own `when`). Nested schedules are
       * gated too; marker steps still run. Gated systems drop the events
       * published while gated; use `pauseWhen` to keep them. For one system,
       * use `when` in its spec.
       */
      when: <
        const Conditions extends readonly [Machine.Condition<Root>, ...Array<Machine.Condition<Root>>],
        const Entries extends ReadonlyArray<BoundScheduleEntry<S, Root>>
      >(
        conditions: Conditions,
        ...entries: Entries
      ) => Schedule.ConditionalScheduleBuildFor<S, Conditions, Entries, Root>
      /**
       * Builds a schedule whose systems are paused while any condition
       * fails: unlike `when`, a paused system keeps its place in the event
       * streams it reads and sees everything published meanwhile once it
       * runs again. For freezes whose events stay valid (hit-stop, pause).
       * For one system, use `pauseWhen` in its spec.
       */
      pauseWhen: <
        const Conditions extends readonly [Machine.Condition<Root>, ...Array<Machine.Condition<Root>>],
        const Entries extends ReadonlyArray<BoundScheduleEntry<S, Root>>
      >(
        conditions: Conditions,
        ...entries: Entries
      ) => Schedule.ConditionalScheduleBuildFor<S, Conditions, Entries, Root>
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
        const ProvidedMachines extends Runtime.RuntimeMachines<any> = Runtime.RuntimeMachines<{}>,
        const Enabled extends Debug.Option | undefined = undefined
      >(options: {
        readonly services: ProvidedServices
        readonly resources?: Resources
        readonly machines?: ProvidedMachines
        /** Attaches a `debug` handle to the runtime; see the `Debug` module. */
        readonly debug?: Enabled
      }) => Runtime.MakeRuntimeResult<S, RuntimeServicesOf<ProvidedServices>, Resources, Root, RuntimeMachinesOf<ProvidedMachines>, Enabled>
      service: typeof Runtime.service
      services: typeof Runtime.services
      machine: typeof Runtime.machine
      machines: typeof Runtime.machines
    }
  }
}
