/**
 * Schema authoring, binding, and pre-bind feature composition.
 *
 * The normal authoring flow is:
 *
 * 1. declare descriptors with `Descriptor.define...`
 * 2. group them into reusable `Schema.fragment(...)` values
 * 3. close the schema with `Schema.build(...)`
 * 4. bind one `Game` with `Schema.bind(...)`
 * 5. build a runtime or composed project from that bound `Game`
 *
 * `Schema.Feature` lives on the same pre-bind layer. Features contribute schema
 * fragments and build schedules only after the final merged schema is known.
 *
 * @module schema
 * @docGroup core
 *
 * @groupDescription Namespaces
 * Grouped schema helper types for fragments, bound game APIs, and feature composition.
 *
 * @groupDescription Interfaces
 * Public schema and feature contracts used before and after binding one root game API.
 *
 * @groupDescription Type Aliases
 * Shared schema registry, merge, feature, and binding helper types.
 *
 * @groupDescription Variables
 * Stable schema-level runtime markers used to brand bound roots and feature outputs.
 *
 * @groupDescription Functions
 * Public helpers for defining roots, building schemas, binding `Game`, and composing features.
 *
 * @example
 * ```ts
 * const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
 * const Score = Descriptor.defineResource<number>()("Score")
 *
 * const Core = Schema.fragment({
 *   components: { Position },
 *   resources: { Score }
 * })
 *
 * const schema = Schema.build(Core)
 * const Root = Schema.defineRoot("Game")
 * const Game = Schema.bind(schema, Root)
 * ```
 */
import * as Command from "./command.ts"
import type { Descriptor } from "./descriptor.ts"
import * as Entity from "./entity.ts"
import * as Machine from "./machine.ts"
import * as QueryModule from "./query.ts"
import * as Relation from "./relation.ts"
import * as Runtime from "./runtime.ts"
import * as Schedule from "./schedule.ts"
import * as System from "./system.ts"
import type { Fx } from "./fx.ts"
import type { Label } from "./label.ts"
import type { Query } from "./query.ts"
import type * as Result from "./Result.ts"

/**
 * A mapping from schema names to nominal descriptors.
 *
 * Registries are used separately for components, resources, events, and states.
 */
export type Registry = Record<string, Descriptor.Any>

/**
 * A fully built closed schema definition.
 *
 * Every runtime, system, and command API is parameterized by one of these
 * schema values so the public surface always knows the allowed world contents.
 */
export interface SchemaDefinition<
  out Components extends Registry = {},
  out Resources extends Registry = {},
  out Events extends Registry = {},
  out States extends Registry = {},
  out Relations extends Record<string, Relation.Relation.Any> = {}
> {
  readonly components: Components
  readonly resources: Resources
  readonly events: Events
  readonly states: States
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

type EmptySchemaDefinition = SchemaDefinition<{}, {}, {}, {}, {}>

type MergeSchemaDefinitions<
  A extends Schema.Any,
  B extends Schema.Any
> = SchemaDefinition<
  Schema.Components<A> & Schema.Components<B>,
  Schema.Resources<A> & Schema.Resources<B>,
  Schema.Events<A> & Schema.Events<B>,
  Schema.States<A> & Schema.States<B>,
  Schema.Relations<A> & Schema.Relations<B>
>

type AnyFeatureDefinition = {
  readonly kind: "feature"
  readonly name: string
  readonly schema: Schema.Any
  readonly requires: ReadonlyArray<AnyFeatureDefinition>
  readonly build: unknown
  readonly output: FeatureBuildOutput
}

type MergeFeatureSchemas<Features extends ReadonlyArray<AnyFeatureDefinition>> =
  Features extends readonly [infer Head extends AnyFeatureDefinition, ...infer Tail extends Array<AnyFeatureDefinition>]
    ? MergeSchemaDefinitions<FeatureClosureSchema<Head>, MergeFeatureSchemas<Tail>>
    : EmptySchemaDefinition

type FeatureClosureSchema<F extends AnyFeatureDefinition> =
  F extends FeatureDefinition<any, infer FeatureSchema extends Schema.Any, infer Requires extends ReadonlyArray<AnyFeatureDefinition>, any>
    ? MergeSchemaDefinitions<FeatureSchema, MergeFeatureSchemas<Requires>>
    : EmptySchemaDefinition

type FeatureNames<Features extends ReadonlyArray<AnyFeatureDefinition>> = Features[number]["name"]

type DuplicateFeatureNames<
  Features extends ReadonlyArray<AnyFeatureDefinition>,
  Seen extends string = never
> = Features extends readonly [infer Head extends AnyFeatureDefinition, ...infer Tail extends Array<AnyFeatureDefinition>]
  ? Head["name"] extends Seen
    ? Head["name"] | DuplicateFeatureNames<Tail, Seen>
    : DuplicateFeatureNames<Tail, Seen | Head["name"]>
  : never

type RequiredFeatureNames<Features extends ReadonlyArray<AnyFeatureDefinition>> =
  Features[number]["requires"][number]["name"]

type MissingFeatureDependencies<Features extends ReadonlyArray<AnyFeatureDefinition>> =
  Exclude<RequiredFeatureNames<Features>, FeatureNames<Features>>

type ValidateFeatureSelection<Features extends ReadonlyArray<AnyFeatureDefinition>> =
  [DuplicateFeatureNames<Features>] extends [never]
    ? [MissingFeatureDependencies<Features>] extends [never]
      ? unknown
      : {
          readonly __fixFeatureDependencies__: MissingFeatureDependencies<Features>
        }
    : {
        readonly __fixFeatureSelection__: DuplicateFeatureNames<Features>
      }

type RebindFeatureSchedule<ScheduleValue, S extends Schema.Any, Root> =
  ScheduleValue extends Schedule.Schedule.Definition<any, infer Requirements, any, infer RuntimeRequirementValue>
    ? Schedule.Schedule.Definition<S, Requirements, Root, RuntimeRequirementValue>
    : never

type FeatureScheduleArray<Output, Key extends "bootstrap" | "update"> =
  Key extends keyof Output
    ? Extract<Output[Key], ReadonlyArray<Schedule.ScheduleDefinition<any, any, any>>>
    : readonly []

type NormalizeFeatureOutput<
  Output extends object,
  S extends Schema.Any,
  Root
> = {
  readonly [K in Exclude<keyof Output, "bootstrap" | "update">]: Output[K]
} & {
  readonly bootstrap: ReadonlyArray<RebindFeatureSchedule<FeatureScheduleArray<Output, "bootstrap">[number], S, Root>>
  readonly update: ReadonlyArray<RebindFeatureSchedule<FeatureScheduleArray<Output, "update">[number], S, Root>>
}

type FeatureOutputRecord<
  Features extends ReadonlyArray<AnyFeatureDefinition>,
  S extends Schema.Any,
  Root
> = {
  readonly [K in FeatureNames<Features>]:
    NormalizeFeatureOutput<
      Extract<Features[number], { readonly name: K }>["output"],
      S,
      Root
    >
}

type FeatureBootstrapScheduleUnion<
  Features extends ReadonlyArray<AnyFeatureDefinition>,
  S extends Schema.Any,
  Root
> = FeatureOutputRecord<Features, S, Root>[FeatureNames<Features>]["bootstrap"][number]

type FeatureUpdateScheduleUnion<
  Features extends ReadonlyArray<AnyFeatureDefinition>,
  S extends Schema.Any,
  Root
> = FeatureOutputRecord<Features, S, Root>[FeatureNames<Features>]["update"][number]

type FeatureComponentDescriptor<S extends Schema.Any> = Extract<Schema.Components<S>[keyof Schema.Components<S>], Descriptor<"component", string, any>>
type FeatureConstructedComponentDescriptor<S extends Schema.Any> = Extract<Schema.Components<S>[keyof Schema.Components<S>], import("./descriptor.ts").ConstructedDescriptor<"component", string, any, any, any>>
type FeatureResourceDescriptor<S extends Schema.Any> = Extract<Schema.Resources<S>[keyof Schema.Resources<S>], Descriptor<"resource", string, any>>
type FeatureConstructedResourceDescriptor<S extends Schema.Any> = Extract<Schema.Resources<S>[keyof Schema.Resources<S>], import("./descriptor.ts").ConstructedDescriptor<"resource", string, any, any, any>>
type FeatureEventDescriptor<S extends Schema.Any> = Extract<Schema.Events<S>[keyof Schema.Events<S>], Descriptor<"event", string, any>>
type FeatureStateDescriptor<S extends Schema.Any> = Extract<Schema.States<S>[keyof Schema.States<S>], Descriptor<"state", string, any>>
type FeatureConstructedStateDescriptor<S extends Schema.Any> = Extract<Schema.States<S>[keyof Schema.States<S>], import("./descriptor.ts").ConstructedDescriptor<"state", string, any, any, any>>
type FeatureRelationDescriptor<S extends Schema.Any> = Extract<Schema.Relations<S>[keyof Schema.Relations<S>], Relation.Relation.Any>
type RuntimeServicesOf<Provided extends Runtime.RuntimeServices<any>> =
  [Provided] extends [Runtime.RuntimeServices<infer Services>] ? Services : never
type RuntimeMachinesOf<Provided extends Runtime.RuntimeMachines<any>> =
  [Provided] extends [Runtime.RuntimeMachines<infer Machines>] ? Machines : {}
type FeatureQuerySelectionAccess<Accessible extends Schema.Any, Root> =
  | QueryModule.Access<FeatureComponentDescriptor<Accessible>>
  | Relation.SelectionAccess<Accessible, Root>

type BoundScheduleEntryValue<S extends Schema.Any, Root> =
  | Schema.BoundSystem<any, Root, any, any, any>
  | Schedule.ApplyDeferredStep
  | Schedule.EventUpdateStep
  | Schedule.LifecycleUpdateStep
  | Schedule.RelationFailureUpdateStep
  | Schedule.ApplyStateTransitionsStep<any, Root>
  | Schema.BoundScheduleFragment<S, Root, any>
  | Schema.BoundSchedulePhase<S, Root, any>
  | Schema.BoundSchedule<S, Root, any>

type BoundTransitionEntryValue<S extends Schema.Any, Root> =
  | Schema.BoundSystem<any, Root, any, any, any>
  | Schedule.ApplyDeferredStep
  | Schedule.EventUpdateStep
  | Schedule.LifecycleUpdateStep
  | Schedule.RelationFailureUpdateStep
  | Schema.BoundScheduleFragment<S, Root, any>
  | Schema.BoundSchedulePhase<S, Root, any>
  | Schema.BoundSchedule<S, Root, any>

type BoundScheduleStepValue<S extends Schema.Any, Root> =
  | Schema.BoundSystem<any, Root, any, any, any>
  | Schedule.ApplyDeferredStep
  | Schedule.EventUpdateStep
  | Schedule.LifecycleUpdateStep
  | Schedule.RelationFailureUpdateStep
  | Schedule.ApplyStateTransitionsStep<any, Root>

type BoundTransitionStepValue<S extends Schema.Any, Root> =
  | Schema.BoundSystem<any, Root, any, any, any>
  | Schedule.ApplyDeferredStep
  | Schedule.EventUpdateStep
  | Schedule.LifecycleUpdateStep
  | Schedule.RelationFailureUpdateStep

type BoundScheduleDefineResult<
  S extends Schema.Any,
  Root,
  Entries extends ReadonlyArray<BoundScheduleEntryValue<S, Root>>
> = Schedule.AnonymousScheduleBuildFor<S, Entries, Root>

type BoundTransitionScheduleResult<
  S extends Schema.Any,
  Root,
  M extends Schema.BoundStateMachine<Root>,
  Entries extends ReadonlyArray<BoundTransitionEntryValue<S, Root>>
> = Machine.TransitionScheduleDefinition<
  S,
  M,
  Schedule.CompositionExactRequirements<Entries>,
  Root
>

type BoundTransitionBundleInputValue<S extends Schema.Any, Root> =
  | Schema.BoundTransitionSchedule<S, Root, any, any>
  | Schema.BoundTransitionBundle<S, Root, any, any>

type BoundTransitionBundleResult<
  S extends Schema.Any,
  Root,
  Entries extends ReadonlyArray<BoundTransitionBundleInputValue<S, Root>>
> = Schedule.TransitionBundleDefinition<
  S,
  ReadonlyArray<Schedule.FlattenTransitionEntries<Entries>[number]>,
  Schedule.TransitionBundleRequirements<Schedule.FlattenTransitionEntries<Entries>>,
  Root
>

export interface FeatureBuildGame<
  Accessible extends Schema.Any,
  Root = unknown
> {
  readonly schema: Accessible
  readonly Entity: {
    handle: (entityId: Entity.EntityId<Accessible, Root>) => Entity.Handle<Root>
    handleFrom: <P extends Entity.ComponentProof, W extends Entity.ComponentProof>(
      entity: Entity.EntityRef<Accessible, P, Root> | Entity.EntityMut<Accessible, P, W, Root>
    ) => Entity.Handle<Root>
    handleAs: <D extends FeatureComponentDescriptor<Accessible>>(descriptor: D, entityId: Entity.EntityId<Accessible, Root>) => Entity.Handle<Root, D>
    handleAsFrom: <D extends FeatureComponentDescriptor<Accessible>, P extends Entity.ComponentProof, W extends Entity.ComponentProof>(
      descriptor: D,
      entity: Entity.EntityRef<Accessible, P, Root> | Entity.EntityMut<Accessible, P, W, Root>
    ) => Entity.Handle<Root, D>
  }
  readonly Query: {
    define: <
      const Selection extends Record<string, FeatureQuerySelectionAccess<Accessible, Root>>,
      const With extends ReadonlyArray<FeatureComponentDescriptor<Accessible>> = [],
      const Without extends ReadonlyArray<FeatureComponentDescriptor<Accessible>> = [],
      const Filters extends ReadonlyArray<QueryModule.Filter<FeatureComponentDescriptor<Accessible>>> = [],
      const WithRelations extends ReadonlyArray<FeatureRelationDescriptor<Accessible>> = [],
      const WithoutRelations extends ReadonlyArray<FeatureRelationDescriptor<Accessible>> = [],
      const WithRelated extends ReadonlyArray<FeatureRelationDescriptor<Accessible>> = [],
      const WithoutRelated extends ReadonlyArray<FeatureRelationDescriptor<Accessible>> = []
    >(spec: {
      readonly selection: Selection
      readonly with?: With
      readonly without?: Without
      readonly filters?: Filters
      readonly withRelations?: WithRelations
      readonly withoutRelations?: WithoutRelations
      readonly withRelated?: WithRelated
      readonly withoutRelated?: WithoutRelated
    }) => QueryModule.QuerySpec<Selection, With, Without, Filters, WithRelations, WithoutRelations, WithRelated, WithoutRelated, Root>
    read: <D extends FeatureComponentDescriptor<Accessible>>(descriptor: D) => QueryModule.ReadAccess<D>
    write: <D extends FeatureComponentDescriptor<Accessible>>(descriptor: D) => QueryModule.WriteAccess<D>
    optional: <D extends FeatureComponentDescriptor<Accessible>>(descriptor: D) => QueryModule.OptionalReadAccess<D>
    added: <D extends FeatureComponentDescriptor<Accessible>>(descriptor: D) => QueryModule.AddedFilter<D>
    changed: <D extends FeatureComponentDescriptor<Accessible>>(descriptor: D) => QueryModule.ChangedFilter<D>
    readRelation: <R extends FeatureRelationDescriptor<Accessible>>(descriptor: R) => Relation.RelationReadAccess<R, Accessible, Root>
    optionalRelation: <R extends FeatureRelationDescriptor<Accessible>>(descriptor: R) => Relation.OptionalRelationReadAccess<R, Accessible, Root>
    readRelated: <R extends FeatureRelationDescriptor<Accessible>>(descriptor: R) => Relation.RelatedReadAccess<R, Accessible, Root>
    optionalRelated: <R extends FeatureRelationDescriptor<Accessible>>(descriptor: R) => Relation.OptionalRelatedReadAccess<R, Accessible, Root>
  }
  readonly Command: {
    spawn: () => Entity.EntityDraft<Accessible, {}, Root>
    entry: <D extends FeatureComponentDescriptor<Accessible>>(descriptor: D, value: Descriptor.Value<D>) => Command.Entry<D>
    entryResult: <D extends FeatureComponentDescriptor<Accessible>, E>(
      descriptor: D,
      result: Result.Result<Descriptor.Value<D>, E>
    ) => Result.Result<Command.Entry<D>, E>
    entryRaw: <D extends FeatureConstructedComponentDescriptor<Accessible>>(
      descriptor: D,
      raw: Descriptor.Raw<D>
    ) => Result.Result<Command.Entry<D>, Descriptor.ConstructionError<D>>
    insert: <P extends Entity.ComponentProof, D extends FeatureComponentDescriptor<Accessible>>(
      draft: Entity.EntityDraft<Accessible, P, Root>,
      descriptor: D,
      value: Descriptor.Value<D>
    ) => Entity.EntityDraft<Accessible, Command.Draft.Insert<P, Descriptor.Name<D>, Descriptor.Value<D>>, Root>
    insertResult: <P extends Entity.ComponentProof, D extends FeatureComponentDescriptor<Accessible>, E>(
      draft: Entity.EntityDraft<Accessible, P, Root>,
      result: Result.Result<Command.Entry<D>, E>
    ) => Result.Result<Entity.EntityDraft<Accessible, Command.Draft.Insert<P, Descriptor.Name<D>, Descriptor.Value<D>>, Root>, E>
    insertRaw: <P extends Entity.ComponentProof, D extends FeatureConstructedComponentDescriptor<Accessible>>(
      draft: Entity.EntityDraft<Accessible, P, Root>,
      descriptor: D,
      raw: Descriptor.Raw<D>
    ) => Result.Result<Entity.EntityDraft<Accessible, Command.Draft.Insert<P, Descriptor.Name<D>, Descriptor.Value<D>>, Root>, Descriptor.ConstructionError<D>>
    insertMany: <P extends Entity.ComponentProof, const Entries extends ReadonlyArray<Command.SchemaEntry<Accessible>>>(
      draft: Entity.EntityDraft<Accessible, P, Root>,
      ...entries: Entries
    ) => Entity.EntityDraft<Accessible, Command.Draft.FoldEntries<Entries, P>, Root>
    spawnWith: <const Entries extends ReadonlyArray<Command.SchemaEntry<Accessible>>>(
      ...entries: Entries
    ) => Entity.EntityDraft<Accessible, Command.Draft.FoldEntries<Entries>, Root>
    spawnWithResult: <const Entries extends ReadonlyArray<Result.Result<Command.SchemaEntry<Accessible>, any>>>(
      ...entries: Entries
    ) => Result.Result<Entity.EntityDraft<Accessible, Command.FoldResultEntries<Entries>, Root>, Command.ResultEntryErrors<Entries>>
    spawnWithMixed: <const Entries extends ReadonlyArray<Command.MixedEntry<Accessible>>>(
      ...entries: Entries
    ) => Result.Result<Entity.EntityDraft<Accessible, Command.FoldMixedEntries<Entries>, Root>, Command.MixedEntryErrors<Entries>>
    relate: <P extends Entity.ComponentProof, R extends FeatureRelationDescriptor<Accessible>>(
      draft: Entity.EntityDraft<Accessible, P, Root>,
      relation: R,
      target: Entity.EntityId<Accessible, Root>
    ) => Entity.EntityDraft<Accessible, P, Root>
  }
  readonly StateMachine: Schema.Game<Accessible, Root>["StateMachine"]
  readonly Condition: Schema.Game<Accessible, Root>["Condition"]
    readonly System: {
      define: <
        const Name extends string,
        const Queries extends Record<string, Query.Any<Root>> = {},
        const Resources extends Record<string, System.ResourceRead<FeatureResourceDescriptor<Accessible>> | System.ResourceWrite<FeatureResourceDescriptor<Accessible>>> = {},
        const Events extends Record<string, System.EventRead<FeatureEventDescriptor<Accessible>> | System.EventWrite<FeatureEventDescriptor<Accessible>>> = {},
        const Services extends Record<string, System.ServiceRead<Descriptor<"service", string, any>>> = {},
        const States extends Record<string, System.StateRead<FeatureStateDescriptor<Accessible>> | System.StateWrite<FeatureStateDescriptor<Accessible>>> = {},
        const Machines extends Record<string, Machine.MachineRead<Schema.BoundStateMachine<Root>>> = {},
        const NextMachines extends Record<string, Machine.NextMachineWrite<Schema.BoundStateMachine<Root>>> = {},
        const TransitionEvents extends Record<string, Machine.TransitionEventRead<Schema.BoundStateMachine<Root>>> = {},
      const Removed extends Record<string, System.RemovedRead<FeatureComponentDescriptor<Accessible>>> = {},
      const Despawned extends Record<string, System.DespawnedRead> = {},
      const RelationFailures extends Record<string, System.RelationFailureRead<FeatureRelationDescriptor<Accessible>>> = {},
      const When extends ReadonlyArray<Machine.Condition<Root>> = [],
      const Transitions extends Record<string, Machine.TransitionRead<Schema.BoundStateMachine<Root>>> = {},
      A = void,
      E = never
    >(
      name: Name,
      spec: {
        readonly queries?: Queries
        readonly resources?: Resources
        readonly events?: Events
        readonly services?: Services
        readonly states?: States
        readonly machines?: Machines
        readonly nextMachines?: NextMachines
        readonly transitionEvents?: TransitionEvents
        readonly removed?: Removed
        readonly despawned?: Despawned
        readonly relationFailures?: RelationFailures
        readonly when?: When
        readonly transitions?: Transitions
      },
      run: (context: System.SystemContext<System.SystemSpec<Accessible, Queries, Resources, Events, Services, States, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>) => Fx<
        A,
        E,
        System.SystemDependencies<System.SystemSpec<Accessible, Queries, Resources, Events, Services, States, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>
      >
    ) => Schema.BoundSystem<
      Accessible,
      Root,
      System.SystemSpec<Accessible, Queries, Resources, Events, Services, States, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>,
      A,
      E,
      Name
    >
    readResource: <D extends FeatureResourceDescriptor<Accessible>>(descriptor: D) => System.ResourceRead<D>
    writeResource: <D extends FeatureResourceDescriptor<Accessible>>(descriptor: D) => System.ResourceWrite<D>
    readEvent: <D extends FeatureEventDescriptor<Accessible>>(descriptor: D) => System.EventRead<D>
    writeEvent: <D extends FeatureEventDescriptor<Accessible>>(descriptor: D) => System.EventWrite<D>
    readState: <D extends FeatureStateDescriptor<Accessible>>(descriptor: D) => System.StateRead<D>
    writeState: <D extends FeatureStateDescriptor<Accessible>>(descriptor: D) => System.StateWrite<D>
    service: Schema.Game<Accessible, Root>["System"]["service"]
    machine: Schema.Game<Accessible, Root>["System"]["machine"]
    nextState: Schema.Game<Accessible, Root>["System"]["nextState"]
    readTransitionEvent: Schema.Game<Accessible, Root>["System"]["readTransitionEvent"]
    readRemoved: <D extends FeatureComponentDescriptor<Accessible>>(descriptor: D) => System.RemovedRead<D>
    readDespawned: Schema.Game<Accessible, Root>["System"]["readDespawned"]
    readRelationFailures: <R extends FeatureRelationDescriptor<Accessible>>(relation: R) => System.RelationFailureRead<R>
    transition: Schema.Game<Accessible, Root>["System"]["transition"]
  }
  readonly Schedule: {
    define: <
      const Entries extends ReadonlyArray<BoundScheduleEntryValue<Accessible, Root>>
    >(...entries: Entries) => BoundScheduleDefineResult<Accessible, Root, Entries>
    fragment: <
      const Entries extends ReadonlyArray<BoundScheduleEntryValue<Accessible, Root>>
    >(options: {
      readonly entries?: Entries
      readonly steps?: ReadonlyArray<Extract<Entries[number], BoundScheduleStepValue<Accessible, Root>>>
    }) => Schedule.ScheduleFragmentFor<Accessible, Entries, Root>
    phase: <
      const Steps extends ReadonlyArray<BoundScheduleStepValue<Accessible, Root>>
    >(options: {
      readonly steps: Steps
    }) => Schema.BoundSchedulePhase<Accessible, Root>
    compose: <
      const Entries extends ReadonlyArray<BoundScheduleEntryValue<Accessible, Root>>
    >(options: {
      readonly entries: Entries
    }) => Schedule.ScheduleCompositionFor<Entries>
    transitions: <
      const Entries extends ReadonlyArray<BoundTransitionBundleInputValue<Accessible, Root>>
    >(...entries: Entries) => BoundTransitionBundleResult<Accessible, Root, Entries>
    onEnter: <
      M extends Schema.BoundStateMachine<Root>,
      const Entries extends ReadonlyArray<BoundTransitionEntryValue<Accessible, Root>>
    >(machine: M, state: Machine.StateMachine.Value<M>, plan: readonly [...Entries]) => BoundTransitionScheduleResult<Accessible, Root, M, Entries>
    onExit: <
      M extends Schema.BoundStateMachine<Root>,
      const Entries extends ReadonlyArray<BoundTransitionEntryValue<Accessible, Root>>
    >(machine: M, state: Machine.StateMachine.Value<M>, plan: readonly [...Entries]) => BoundTransitionScheduleResult<Accessible, Root, M, Entries>
    onTransition: <
      M extends Schema.BoundStateMachine<Root>,
      const Entries extends ReadonlyArray<BoundTransitionEntryValue<Accessible, Root>>
    >(machine: M, transition: readonly [Machine.StateMachine.Value<M>, Machine.StateMachine.Value<M>], plan: readonly [...Entries]) => BoundTransitionScheduleResult<Accessible, Root, M, Entries>
    applyDeferred: Schema.Game<Accessible, Root>["Schedule"]["applyDeferred"]
    updateEvents: Schema.Game<Accessible, Root>["Schedule"]["updateEvents"]
    updateLifecycle: Schema.Game<Accessible, Root>["Schedule"]["updateLifecycle"]
    updateRelationFailures: Schema.Game<Accessible, Root>["Schedule"]["updateRelationFailures"]
    applyStateTransitions: Schema.Game<Accessible, Root>["Schedule"]["applyStateTransitions"]
  }
}

type FeatureBuildOutput = {
  readonly bootstrap?: ReadonlyArray<Schedule.ScheduleDefinition<any, any, any>>
  readonly update?: ReadonlyArray<Schedule.ScheduleDefinition<any, any, any>>
}

type FeatureBuildFunction<
  Accessible extends Schema.Any,
  Output extends FeatureBuildOutput = FeatureBuildOutput
> = (
  Game: FeatureBuildGame<Accessible>
) => Output

export interface FeatureDefinition<
  Name extends string = string,
  FeatureSchema extends Schema.Any = Schema.Any,
  Requires extends ReadonlyArray<AnyFeatureDefinition> = ReadonlyArray<AnyFeatureDefinition>,
  Output extends FeatureBuildOutput = FeatureBuildOutput
> {
  readonly kind: "feature"
  readonly name: Name
  readonly schema: FeatureSchema
  readonly requires: Requires
  readonly build: FeatureBuildFunction<MergeSchemaDefinitions<FeatureSchema, MergeFeatureSchemas<Requires>>, Output>
  readonly output: Output
}

export interface ComposedFeatureProject<
  Features extends ReadonlyArray<AnyFeatureDefinition>,
  Root = unknown,
  S extends Schema.Any = MergeFeatureSchemas<Features>
> {
  readonly schema: S
  readonly Game: Schema.Game<S, Root>
  readonly features: FeatureOutputRecord<Features, S, Root>
  readonly schedules: {
    readonly bootstrap: ReadonlyArray<FeatureBootstrapScheduleUnion<Features, S, Root>>
    readonly update: ReadonlyArray<FeatureUpdateScheduleUnion<Features, S, Root>>
  }
    readonly App: {
      readonly make: <
      const ProvidedServices extends Runtime.RuntimeServices<any>,
      const Resources extends Runtime.RuntimeResources<S> = {},
      const States extends Runtime.RuntimeStates<S> = {},
      const ProvidedMachines extends Runtime.RuntimeMachines<any> = Runtime.RuntimeMachines<{}>
    >(options: {
      readonly services: ProvidedServices
      readonly resources?: Resources
      readonly states?: States
      readonly machines?: ProvidedMachines
    } & Runtime.ValidateScheduleArray<
      ReadonlyArray<FeatureBootstrapScheduleUnion<Features, S, Root> | FeatureUpdateScheduleUnion<Features, S, Root>>,
      RuntimeServicesOf<ProvidedServices>,
      Resources,
      States,
      RuntimeMachinesOf<ProvidedMachines>
    >) => {
      readonly runtime: Schema.BoundRuntime<S, Root, RuntimeServicesOf<ProvidedServices>, Resources, States, RuntimeMachinesOf<ProvidedMachines>>
      readonly bootstrap: () => void
      readonly update: () => void
    }
  }
}

/**
 * Type-level helpers for schema-driven programming.
 */
export namespace Schema {
  /**
   * Any complete schema definition.
   */
  export type Any = SchemaDefinition<Registry, Registry, Registry, Registry, Record<string, Relation.Relation.Any>>

  /**
   * Extracts the component registry from a schema.
   */
  export type Components<T extends Any> = T["components"]
  /**
   * Extracts the resource registry from a schema.
   */
  export type Resources<T extends Any> = T["resources"]
  /**
   * Extracts the event registry from a schema.
   */
  export type Events<T extends Any> = T["events"]
  /**
   * Extracts the state registry from a schema.
   */
  export type States<T extends Any> = T["states"]
  /**
   * Extracts the relation registry from a schema.
   */
  export type Relations<T extends Any> = T["relations"]

  /**
   * Looks up the value type of a component descriptor inside a schema.
   */
  export type ComponentValue<T extends Any, K extends keyof Components<T>> = Descriptor.Value<Components<T>[K]>
  /**
   * Looks up the value type of a resource descriptor inside a schema.
   */
  export type ResourceValue<T extends Any, K extends keyof Resources<T>> = Descriptor.Value<Resources<T>[K]>
  /**
   * Looks up the value type of an event descriptor inside a schema.
   */
  export type EventValue<T extends Any, K extends keyof Events<T>> = Descriptor.Value<Events<T>[K]>
  /**
   * Looks up the value type of a state descriptor inside a schema.
   */
  export type StateValue<T extends Any, K extends keyof States<T>> = Descriptor.Value<States<T>[K]>

  /**
   * A schema-bound system definition branded to one bound schema root.
   */
  export type BoundSystem<
    S extends Any,
    Root,
    Spec extends System.AnySystemSpec = System.AnySystemSpec,
    A = void,
    E = never,
    Name extends string = string
  > = {
    readonly name: Name
    readonly spec: Spec & { readonly schema: S }
    readonly requirements: System.SystemRequirements<Spec>
    readonly __schemaRoot: Root
    readonly ordering: System.SystemOrderingSpec
    readonly run: (context: any) => Fx<A, E, any>
  }

  /**
   * A schema-bound schedule definition branded to one bound schema root.
   */
  export type BoundSchedule<
    S extends Any,
    Root,
    Requirements extends System.RuntimeRequirements = System.RuntimeRequirements
  > = Schedule.ScheduleDefinition<S, Requirements, Root>

  export type BoundScheduleFragment<
    S extends Any,
    Root,
    Requirements extends System.RuntimeRequirements = System.RuntimeRequirements
  > = Schedule.ScheduleFragmentDefinition<S, Root, Requirements>

  export type BoundSchedulePhase<
    S extends Any,
    Root,
    Requirements extends System.RuntimeRequirements = System.RuntimeRequirements
  > = Schedule.SchedulePhaseDefinition<S, Requirements, BoundSystem<any, Root, any, any, any>, Schedule.ScheduleStep, Root, any, any>

  export type BoundScheduleComposition<
    Root,
    SystemValue extends BoundSystem<any, Root, any, any, any> = BoundSystem<any, Root, any, any, any>,
    StepValue extends Schedule.ScheduleStep = Schedule.ScheduleStep
  > = Schedule.ScheduleCompositionDefinition<SystemValue, StepValue, any, any>

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
    Requirements extends System.RuntimeRequirements<any, any, any, any> = System.RuntimeRequirements<any, any, any, any>
  > = Machine.TransitionScheduleDefinition<S, M, Requirements, Root>

  export type BoundTransitionBundle<
    S extends Any,
    Root,
    Entries extends ReadonlyArray<BoundTransitionSchedule<S, Root, any, any>> = ReadonlyArray<BoundTransitionSchedule<S, Root, any, any>>,
    Requirements extends System.RuntimeRequirements<any, any, any, any> = System.RuntimeRequirements<any, any, any, any>
  > = Schedule.TransitionBundleDefinition<S, Entries, Requirements, Root>

  /**
   * A schema-bound runtime branded to one bound schema root.
   */
  export type BoundRuntime<
    S extends Any,
    Root,
    Services extends Record<string, unknown>,
    Resources extends Runtime.RuntimeResources<S> = {},
    States extends Runtime.RuntimeStates<S> = {},
    Machines extends Record<string, unknown> = {}
  > = Runtime.Runtime<S, Services, Resources, States, Root, Machines>

  /**
   * One fully bound public authoring surface.
   */
  export interface Game<S extends Any, Root = S> {
    readonly schema: S
    readonly Entity: {
      handle: (entityId: Entity.EntityId<S, Root>) => Entity.Handle<Root>
      handleFrom: <P extends Entity.ComponentProof, W extends Entity.ComponentProof>(
        entity: Entity.EntityRef<S, P, Root> | Entity.EntityMut<S, P, W, Root>
      ) => Entity.Handle<Root>
      handleAs: <D extends ComponentDescriptor<S>>(descriptor: D, entityId: Entity.EntityId<S, Root>) => Entity.Handle<Root, D>
      handleAsFrom: <D extends ComponentDescriptor<S>, P extends Entity.ComponentProof, W extends Entity.ComponentProof>(
        descriptor: D,
        entity: Entity.EntityRef<S, P, Root> | Entity.EntityMut<S, P, W, Root>
      ) => Entity.Handle<Root, D>
    }
    readonly Query: {
      define: <
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
      }) => QueryModule.QuerySpec<Selection, With, Without, Filters, WithRelations, WithoutRelations, WithRelated, WithoutRelated, Root>
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
      spawn: () => Entity.EntityDraft<S, {}, Root>
      entry: <D extends ComponentDescriptor<S>>(descriptor: D, value: Descriptor.Value<D>) => Command.Entry<D>
      entryResult: <D extends ComponentDescriptor<S>, E>(
        descriptor: D,
        result: Result.Result<Descriptor.Value<D>, E>
      ) => Result.Result<Command.Entry<D>, E>
      entryRaw: <D extends Extract<ComponentDescriptor<S>, import("./descriptor.ts").ConstructedDescriptor<"component", string, any, any, any>>>(
        descriptor: D,
        raw: Descriptor.Raw<D>
      ) => Result.Result<Command.Entry<D>, Descriptor.ConstructionError<D>>
      insert: <P extends Entity.ComponentProof, D extends ComponentDescriptor<S>>(
        draft: Entity.EntityDraft<S, P, Root>,
        descriptor: D,
        value: Descriptor.Value<D>
      ) => Entity.EntityDraft<S, Command.Draft.Insert<P, Descriptor.Name<D>, Descriptor.Value<D>>, Root>
      insertResult: <P extends Entity.ComponentProof, D extends ComponentDescriptor<S>, E>(
        draft: Entity.EntityDraft<S, P, Root>,
        result: Result.Result<Command.Entry<D>, E>
      ) => Result.Result<Entity.EntityDraft<S, Command.Draft.Insert<P, Descriptor.Name<D>, Descriptor.Value<D>>, Root>, E>
      insertRaw: <P extends Entity.ComponentProof, D extends Extract<ComponentDescriptor<S>, import("./descriptor.ts").ConstructedDescriptor<"component", string, any, any, any>>>(
        draft: Entity.EntityDraft<S, P, Root>,
        descriptor: D,
        raw: Descriptor.Raw<D>
      ) => Result.Result<Entity.EntityDraft<S, Command.Draft.Insert<P, Descriptor.Name<D>, Descriptor.Value<D>>, Root>, Descriptor.ConstructionError<D>>
      insertMany: <P extends Entity.ComponentProof, const Entries extends ReadonlyArray<Command.SchemaEntry<S>>>(
        draft: Entity.EntityDraft<S, P, Root>,
        ...entries: Entries
      ) => Entity.EntityDraft<S, Command.Draft.FoldEntries<Entries, P>, Root>
      spawnWith: <const Entries extends ReadonlyArray<Command.SchemaEntry<S>>>(
        ...entries: Entries
      ) => Entity.EntityDraft<S, Command.Draft.FoldEntries<Entries>, Root>
      spawnWithResult: <const Entries extends ReadonlyArray<Result.Result<Command.SchemaEntry<S>, any>>>(
        ...entries: Entries
      ) => Result.Result<Entity.EntityDraft<S, Command.FoldResultEntries<Entries>, Root>, Command.ResultEntryErrors<Entries>>
      spawnWithMixed: <const Entries extends ReadonlyArray<Command.MixedEntry<S>>>(
        ...entries: Entries
      ) => Result.Result<Entity.EntityDraft<S, Command.FoldMixedEntries<Entries>, Root>, Command.MixedEntryErrors<Entries>>
      relate: <P extends Entity.ComponentProof, R extends RelationDescriptor<S>>(
        draft: Entity.EntityDraft<S, P, Root>,
        relation: R,
        target: Entity.EntityId<S, Root>
      ) => Entity.EntityDraft<S, P, Root>
    }
    readonly StateMachine: {
      define: <
        const Name extends string,
        const Values extends readonly [Machine.StateValue, ...Machine.StateValue[]]
      >(name: Name, values: Values) => Schema.BoundStateMachine<Root, Name, Values>
    }
    readonly Condition: {
      inState: typeof Machine.inState
      stateChanged: typeof Machine.stateChanged
      not: typeof Machine.not
      and: typeof Machine.and
      or: typeof Machine.or
    }
    readonly System: {
      define: <
        const Name extends string,
        const Queries extends Record<string, Query.Any<Root>> = {},
        const Resources extends Record<string, System.ResourceRead<ResourceDescriptor<S>> | System.ResourceWrite<ResourceDescriptor<S>>> = {},
        const Events extends Record<string, System.EventRead<EventDescriptor<S>> | System.EventWrite<EventDescriptor<S>>> = {},
        const Services extends Record<string, System.ServiceRead<Descriptor<"service", string, any>>> = {},
        const States extends Record<string, System.StateRead<StateDescriptor<S>> | System.StateWrite<StateDescriptor<S>>> = {},
        const Machines extends Record<string, Machine.MachineRead<Schema.BoundStateMachine<Root>>> = {},
        const NextMachines extends Record<string, Machine.NextMachineWrite<Schema.BoundStateMachine<Root>>> = {},
        const TransitionEvents extends Record<string, Machine.TransitionEventRead<Schema.BoundStateMachine<Root>>> = {},
        const Removed extends Record<string, System.RemovedRead<ComponentDescriptor<S>>> = {},
        const Despawned extends Record<string, System.DespawnedRead> = {},
        const RelationFailures extends Record<string, System.RelationFailureRead<RelationDescriptor<S>>> = {},
        const When extends ReadonlyArray<Machine.Condition<Root>> = [],
        const Transitions extends Record<string, Machine.TransitionRead<Schema.BoundStateMachine<Root>>> = {},
        A = void,
        E = never
      >(
        name: Name,
        spec: {
          readonly queries?: Queries
          readonly resources?: Resources
          readonly events?: Events
          readonly services?: Services
          readonly states?: States
          readonly machines?: Machines
          readonly nextMachines?: NextMachines
          readonly transitionEvents?: TransitionEvents
          readonly removed?: Removed
          readonly despawned?: Despawned
          readonly relationFailures?: RelationFailures
          readonly when?: When
          readonly transitions?: Transitions
        },
        run: (context: System.SystemContext<System.SystemSpec<S, Queries, Resources, Events, Services, States, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>) => Fx<
          A,
          E,
          System.SystemDependencies<System.SystemSpec<S, Queries, Resources, Events, Services, States, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>
        >
      ) => Schema.BoundSystem<S, Root, any, A, E, Name>
      readResource: <D extends ResourceDescriptor<S>>(descriptor: D) => System.ResourceRead<D>
      writeResource: <D extends ResourceDescriptor<S>>(descriptor: D) => System.ResourceWrite<D>
      readEvent: <D extends EventDescriptor<S>>(descriptor: D) => System.EventRead<D>
      writeEvent: <D extends EventDescriptor<S>>(descriptor: D) => System.EventWrite<D>
      readState: <D extends StateDescriptor<S>>(descriptor: D) => System.StateRead<D>
      writeState: <D extends StateDescriptor<S>>(descriptor: D) => System.StateWrite<D>
      service: typeof System.service
      machine: typeof System.machine
      nextState: typeof System.nextState
      readTransitionEvent: typeof System.readTransitionEvent
      readRemoved: <D extends ComponentDescriptor<S>>(descriptor: D) => System.RemovedRead<D>
      readDespawned: () => System.DespawnedRead
      readRelationFailures: <R extends RelationDescriptor<S>>(relation: R) => System.RelationFailureRead<R>
      transition: typeof System.transition
    }
    readonly Schedule: {
      define: <
    const Entries extends ReadonlyArray<BoundScheduleEntryValue<S, Root>>
      >(...entries: Entries) => BoundScheduleDefineResult<S, Root, Entries>
      fragment: <
        const Entries extends ReadonlyArray<BoundScheduleEntryValue<S, Root>>
      >(options: {
        readonly entries?: Entries
        readonly steps?: ReadonlyArray<Extract<Entries[number], BoundScheduleStepValue<S, Root>>>
      }) => RebindScheduleFragment<Schedule.ScheduleFragmentFor<S, Entries>, Root>
      phase: <
        const Steps extends ReadonlyArray<BoundScheduleStepValue<S, Root>>
      >(options: {
        readonly steps: Steps
      }) => Schema.BoundSchedulePhase<S, Root>
      compose: <
        const Entries extends ReadonlyArray<BoundScheduleEntryValue<S, Root>>
      >(options: {
        readonly entries: Entries
      }) => Schedule.ScheduleCompositionFor<Entries>
      transitions: <
        const Entries extends ReadonlyArray<BoundTransitionBundleInputValue<S, Root>>
      >(...entries: Entries) => BoundTransitionBundleResult<S, Root, Entries>
      onEnter: <
        M extends Schema.BoundStateMachine<Root>,
        const Entries extends ReadonlyArray<BoundTransitionEntryValue<S, Root>>
      >(machine: M, state: Machine.StateMachine.Value<M>, plan: readonly [...Entries]) => BoundTransitionScheduleResult<S, Root, M, Entries>
      onExit: <
        M extends Schema.BoundStateMachine<Root>,
        const Entries extends ReadonlyArray<BoundTransitionEntryValue<S, Root>>
      >(machine: M, state: Machine.StateMachine.Value<M>, plan: readonly [...Entries]) => BoundTransitionScheduleResult<S, Root, M, Entries>
      onTransition: <
        M extends Schema.BoundStateMachine<Root>,
        const Entries extends ReadonlyArray<BoundTransitionEntryValue<S, Root>>
      >(machine: M, transition: readonly [Machine.StateMachine.Value<M>, Machine.StateMachine.Value<M>], plan: readonly [...Entries]) => BoundTransitionScheduleResult<S, Root, M, Entries>
      applyDeferred: typeof Schedule.applyDeferred
      updateEvents: typeof Schedule.updateEvents
      updateLifecycle: typeof Schedule.updateLifecycle
      updateRelationFailures: typeof Schedule.updateRelationFailures
      applyStateTransitions: <Bundle extends Schema.BoundTransitionBundle<S, Root> | undefined = undefined>(bundle?: Bundle) => Schedule.ApplyStateTransitionsStep<Bundle, Root>
    }
    readonly Runtime: {
      make: <
        const ProvidedServices extends Runtime.RuntimeServices<any>,
        const Resources extends Runtime.RuntimeResources<S> = {},
        const States extends Runtime.RuntimeStates<S> = {},
        const ProvidedMachines extends Runtime.RuntimeMachines<any> = Runtime.RuntimeMachines<{}>
      >(options: {
        readonly services: ProvidedServices
        readonly resources?: Resources
        readonly states?: States
        readonly machines?: ProvidedMachines
      }) => Schema.BoundRuntime<S, Root, RuntimeServicesOf<ProvidedServices>, Resources, States, RuntimeMachinesOf<ProvidedMachines>>
      makeResult: <
        const ProvidedServices extends Runtime.RuntimeServices<any>,
        const Resources extends Runtime.RuntimeResultResources<S> = {},
        const States extends Runtime.RuntimeResultStates<S> = {},
        const ProvidedMachines extends Runtime.RuntimeMachines<any> = Runtime.RuntimeMachines<{}>
      >(options: {
        readonly services: ProvidedServices
        readonly resources?: Resources
        readonly states?: States
        readonly machines?: ProvidedMachines
      }) => Result.Result<
        Schema.BoundRuntime<S, Root, RuntimeServicesOf<ProvidedServices>, Runtime.ValidatedRuntimeResources<S, Resources>, Runtime.ValidatedRuntimeStates<S, States>, RuntimeMachinesOf<ProvidedMachines>>,
        Runtime.RuntimeConstructionError<S, Resources, States>
      >
      makeConstructed: <
        const ProvidedServices extends Runtime.RuntimeServices<any>,
        const ProvidedMachines extends Runtime.RuntimeMachines<any> = Runtime.RuntimeMachines<{}>,
        const Resources extends Runtime.RuntimeConstructedResources<S> = {},
        const States extends Runtime.RuntimeConstructedStates<S> = {}
      >(options: {
        readonly services: ProvidedServices
        readonly resources?: Resources
        readonly states?: States
        readonly machines?: ProvidedMachines
      }) => Result.Result<
        Schema.BoundRuntime<S, Root, RuntimeServicesOf<ProvidedServices>, Runtime.ValidatedConstructedRuntimeResources<S, Resources>, Runtime.ValidatedConstructedRuntimeStates<S, States>, RuntimeMachinesOf<ProvidedMachines>>,
        Runtime.RuntimeConstructedConstructionError<S, Resources, States>
      >
      service: typeof Runtime.service
      services: typeof Runtime.services
      machine: typeof Runtime.machine
      machines: typeof Runtime.machines
    }
  }
}

type ComponentDescriptor<S extends Schema.Any> = Extract<Schema.Components<S>[keyof Schema.Components<S>], Descriptor<"component", string, any>>
type ResourceDescriptor<S extends Schema.Any> = Extract<Schema.Resources<S>[keyof Schema.Resources<S>], Descriptor<"resource", string, any>>
type EventDescriptor<S extends Schema.Any> = Extract<Schema.Events<S>[keyof Schema.Events<S>], Descriptor<"event", string, any>>
type StateDescriptor<S extends Schema.Any> = Extract<Schema.States<S>[keyof Schema.States<S>], Descriptor<"state", string, any>>
type RelationDescriptor<S extends Schema.Any> = Extract<Schema.Relations<S>[keyof Schema.Relations<S>], Relation.Relation.Any>
type QuerySelectionAccess<S extends Schema.Any, Root> =
  | QueryModule.Access<ComponentDescriptor<S>>
  | Relation.SelectionAccess<S, Root>

type RebindAnonymousSchedule<ScheduleValue, Root> =
  ScheduleValue extends Schedule.Schedule.Definition<infer S, infer Requirements, any>
    ? Schedule.Schedule.Definition<S, Requirements, Root>
    : never

type RebindScheduleFragment<FragmentValue, Root> =
  FragmentValue extends Schedule.Schedule.Fragment<infer S, any, infer ExactRequirements, infer RuntimeRequirementsValue>
    ? Schedule.Schedule.Fragment<S, Root, ExactRequirements, RuntimeRequirementsValue>
    : never

type RebindSchedulePhase<PhaseValue, Root> =
  PhaseValue extends Schedule.Schedule.Phase<infer S, infer Requirements, infer SystemValue, infer StepValue, any, infer ExactRequirements, infer RuntimeRequirementsValue>
    ? Schedule.Schedule.Phase<S, Requirements, SystemValue, StepValue, Root, ExactRequirements, RuntimeRequirementsValue>
    : never

type RebindTransitionSchedule<ScheduleValue, M extends Machine.StateMachine.Any, Root> =
  ScheduleValue extends Schedule.Schedule.Definition<infer S, infer Requirements, any>
    ? Machine.TransitionScheduleDefinition<S, M, Requirements, Root>
    : never

type RebindTransitionBundle<BundleValue, Root> =
  BundleValue extends Schedule.TransitionBundleDefinition<infer S, infer Entries, infer Requirements, any>
    ? Schedule.TransitionBundleDefinition<S, Entries, Requirements, Root>
    : never

/**
 * Computes overlapping keys between two registries.
 *
 * This is used to reject accidental duplicate schema entries when fragments are
 * composed.
 */
type Overlap<A extends object, B extends object> = Extract<keyof A, keyof B>

/**
 * Produces an impossible type when two registries contain duplicate keys.
 *
 * The runtime still validates duplicates too, but this type catches many
 * mistakes earlier during authoring.
 */
type Distinct<A extends object, B extends object> = [Overlap<A, B>] extends [never]
  ? unknown
  : {
      readonly __duplicate_keys: Overlap<A, B>
    }

/**
 * Merges two runtime registries after checking for duplicate keys.
 */
const mergeRegistry = <A extends Registry, B extends Registry>(
  left: A,
  right: B
): A & B => {
  for (const key of Object.keys(right)) {
    if (key in left) {
      throw new Error(`Duplicate schema key: ${key}`)
    }
  }
  return {
    ...left,
    ...right
  } as A & B
}

const mergeRelations = <
  A extends Record<string, Relation.Relation.Any>,
  B extends Record<string, Relation.Relation.Any>
>(
  left: A,
  right: B
): A & B => {
  for (const key of Object.keys(right)) {
    if (key in left) {
      throw new Error(`Duplicate schema key: ${key}`)
    }
  }
  return {
    ...left,
    ...right
  } as A & B
}

/**
 * Creates one explicit root token for schema-bound long-lived references.
 *
 * Root tokens exist before schema construction so durable entity handles can be
 * stored in descriptor payload types without widening to `Schema.Any`.
 *
 * Use one root token for the whole application. Anything created from
 * `Schema.bind(schema, Root)` will carry the same hidden root brand.
 *
 * @example
 * ```ts
 * const Root = Schema.defineRoot("Game")
 *
 * const Target = Descriptor.defineComponent<{
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
 *
 * This is mostly useful as an implementation detail when folding fragments
 * together into a final closed schema.
 */
export const empty = (): SchemaDefinition => ({
  components: {},
  resources: {},
  events: {},
  states: {},
  relations: {}
})

/**
 * Creates a schema fragment.
 *
 * Modules should export fragments instead of mutating global registries. Later
 * the application can merge these fragments into one final schema.
 *
 * Use fragments as the reusable lego blocks of schema composition.
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
  const States extends Registry = {},
  const Relations extends Record<string, Relation.Relation.Any> = {}
>(definition: {
  readonly components?: Components
  readonly resources?: Resources
  readonly events?: Events
  readonly states?: States
  readonly relations?: Relations
}): SchemaDefinition<Components, Resources, Events, States, Relations> => ({
  components: (definition.components ?? {}) as Components,
  resources: (definition.resources ?? {}) as Resources,
  events: (definition.events ?? {}) as Events,
  states: (definition.states ?? {}) as States,
  relations: (definition.relations ?? {}) as Relations
})

/**
 * Merges two schema fragments into a larger closed schema.
 *
 * Duplicate keys are rejected both at the type level and at runtime so schema
 * composition stays predictable.
 */
export const merge = <
  A extends Schema.Any,
  B extends Schema.Any
>(
  left: A,
  right: B
    & Distinct<Schema.Components<A>, Schema.Components<B>>
    & Distinct<Schema.Resources<A>, Schema.Resources<B>>
    & Distinct<Schema.Events<A>, Schema.Events<B>>
    & Distinct<Schema.States<A>, Schema.States<B>>
    & Distinct<Schema.Relations<A>, Schema.Relations<B>>
): SchemaDefinition<
  Schema.Components<A> & Schema.Components<B>,
  Schema.Resources<A> & Schema.Resources<B>,
  Schema.Events<A> & Schema.Events<B>,
  Schema.States<A> & Schema.States<B>,
  Schema.Relations<A> & Schema.Relations<B>
> => ({
  components: mergeRegistry(left.components, right.components),
  resources: mergeRegistry(left.resources, right.resources),
  events: mergeRegistry(left.events, right.events),
  states: mergeRegistry(left.states, right.states),
  relations: mergeRelations(left.relations, right.relations)
})

/**
 * Builds one final schema from a non-empty list of fragments.
 *
 * This is the typical application-level entrypoint for schema composition.
 *
 * Duplicate schema keys are rejected both at the type level and at runtime.
 *
 * @example
 * ```ts
 * const schema = Schema.build(Core, Combat, Dialogue)
 * ```
 */
export const build = <
  Fragments extends readonly [Schema.Any, ...Array<Schema.Any>]
>(
  ...fragments: Fragments
): BuildFragments<Fragments> => {
  let current = empty()
  for (const fragmentValue of fragments) {
    current = merge(current, fragmentValue as never)
  }
  return current as BuildFragments<Fragments>
}

/**
 * Type-level fold for `Schema.build(...)`.
 *
 * This reconstructs the final merged schema type from a tuple of fragments.
 */
type BuildFragments<Fragments extends readonly [Schema.Any, ...Array<Schema.Any>]> =
  Fragments extends readonly [infer Head extends Schema.Any, ...infer Tail extends Array<Schema.Any>]
    ? Tail["length"] extends 0
      ? Head
      : Tail extends readonly [Schema.Any, ...Array<Schema.Any>]
        ? SchemaDefinition<
            Schema.Components<Head> & Schema.Components<BuildFragments<Tail>>,
            Schema.Resources<Head> & Schema.Resources<BuildFragments<Tail>>,
            Schema.Events<Head> & Schema.Events<BuildFragments<Tail>>,
            Schema.States<Head> & Schema.States<BuildFragments<Tail>>,
            Schema.Relations<Head> & Schema.Relations<BuildFragments<Tail>>
          >
        : Head
    : never

/**
 * Binds a closed schema once and returns schema-scoped constructors.
 *
 * This is the canonical high-safety API. Everything created from the returned
 * object carries the same hidden schema-root brand, so systems, schedules, and
 * runtimes from different bound schemas cannot be connected accidentally.
 *
 * The returned `Game` object is the main public authoring surface for:
 * queries, systems, schedules, runtimes, commands, handles, and machines.
 *
 * @example
 * ```ts
 * const schema = Schema.build(Core)
 * const Root = Schema.defineRoot("Game")
 * const Game = Schema.bind(schema, Root)
 *
 * const Move = Game.System.define("Move", {
 *   queries: {
 *     moving: Game.Query.define({
 *       selection: {
 *         position: Game.Query.write(Position),
 *         velocity: Game.Query.read(Velocity)
 *       }
 *     })
 *   }
 * }, ({ queries }) => Fx.sync(() => {
 *   for (const { data } of queries.moving.each()) {
 *     const velocity = data.velocity.get()
 *     data.position.update((position) => ({
 *       x: position.x + velocity.x,
 *       y: position.y + velocity.y
 *     }))
 *   }
 * }))
 * ```
 */
export const bind = <S extends Schema.Any, Root = S>(
  schema: S,
  _root: Root = schema as unknown as Root
) => {
  type BoundAnySystem = Schema.BoundSystem<any, Root, any, any, any>
  type BoundMachine = Schema.BoundStateMachine<Root>
  type BoundTransitionSchedule = Schema.BoundTransitionSchedule<S, Root>
  type BoundTransitionBundleInput = BoundTransitionBundleInputValue<S, Root>
  type BoundTransitionBundleFor<Entries extends ReadonlyArray<BoundTransitionBundleInput>> =
    BoundTransitionBundleResult<S, Root, Entries>
  type BoundTransitionBundle = Schema.BoundTransitionBundle<S, Root>
  type BoundScheduleStep = BoundScheduleStepValue<S, Root>
  type BoundScheduleEntry = BoundScheduleEntryValue<S, Root>
  type BoundTransitionStep = BoundTransitionStepValue<S, Root>
  type BoundTransitionEntry = BoundTransitionEntryValue<S, Root>
  type BoundAnonymousScheduleFor<ScheduleValue> = RebindAnonymousSchedule<ScheduleValue, Root>
  type BoundTransitionScheduleFor<ScheduleValue, M extends BoundMachine> = RebindTransitionSchedule<ScheduleValue, M, Root>
  const definedMachines: Array<BoundMachine> = []
  const definedMachineNames = new Set<string>()

  const entityHandle = (entityId: Entity.EntityId<S, Root>): Entity.Handle<Root> => Entity.handle(entityId)
  const entityHandleFrom = <P extends Entity.ComponentProof, W extends Entity.ComponentProof>(
    entity: Entity.EntityRef<S, P, Root> | Entity.EntityMut<S, P, W, Root>
  ): Entity.Handle<Root> => Entity.handle(entity.id)
  const entityHandleAs = <D extends ComponentDescriptor<S>>(
    descriptor: D,
    entityId: Entity.EntityId<S, Root>
  ): Entity.Handle<Root, D> => Entity.handleAs(descriptor, entityId)
  const entityHandleAsFrom = <D extends ComponentDescriptor<S>, P extends Entity.ComponentProof, W extends Entity.ComponentProof>(
    descriptor: D,
    entity: Entity.EntityRef<S, P, Root> | Entity.EntityMut<S, P, W, Root>
  ): Entity.Handle<Root, D> => Entity.handleAs(descriptor, entity.id)

  const defineSystem = <
    const Name extends string,
    const Queries extends Record<string, Query.Any<Root>> = {},
    const Resources extends Record<string, System.ResourceRead<ResourceDescriptor<S>> | System.ResourceWrite<ResourceDescriptor<S>>> = {},
    const Events extends Record<string, System.EventRead<EventDescriptor<S>> | System.EventWrite<EventDescriptor<S>>> = {},
    const Services extends Record<string, System.ServiceRead<Descriptor<"service", string, any>>> = {},
    const States extends Record<string, System.StateRead<StateDescriptor<S>> | System.StateWrite<StateDescriptor<S>>> = {},
    const Machines extends Record<string, Machine.MachineRead<BoundMachine>> = {},
    const NextMachines extends Record<string, Machine.NextMachineWrite<BoundMachine>> = {},
    const TransitionEvents extends Record<string, Machine.TransitionEventRead<BoundMachine>> = {},
    const Removed extends Record<string, System.RemovedRead<ComponentDescriptor<S>>> = {},
    const Despawned extends Record<string, System.DespawnedRead> = {},
    const RelationFailures extends Record<string, System.RelationFailureRead<RelationDescriptor<S>>> = {},
    const When extends ReadonlyArray<Machine.Condition<Root>> = [],
    const Transitions extends Record<string, Machine.TransitionRead<BoundMachine>> = {},
    A = void,
    E = never
  >(
    name: Name,
    spec: {
      readonly queries?: Queries
      readonly resources?: Resources
      readonly events?: Events
      readonly services?: Services
      readonly states?: States
      readonly machines?: Machines
      readonly nextMachines?: NextMachines
      readonly transitionEvents?: TransitionEvents
      readonly removed?: Removed
      readonly despawned?: Despawned
      readonly relationFailures?: RelationFailures
      readonly when?: When
      readonly transitions?: Transitions
    },
    run: (context: System.SystemContext<System.SystemSpec<S, Queries, Resources, Events, Services, States, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>) => Fx<
      A,
      E,
      System.SystemDependencies<System.SystemSpec<S, Queries, Resources, Events, Services, States, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>
    >
  ) => {
    const system = System.define<S, Queries, Resources, Events, Services, States, Machines, NextMachines, TransitionEvents, Removed, Despawned, RelationFailures, When, Transitions, Root, A, E>(name, {
      schema,
      ...spec
    }, run)
    return system as Schema.BoundSystem<S, Root, typeof system.spec, A, E, Name>
  }

  const commandSpawn = () => Command.spawn<S, Root>()

  const commandEntry = <
    D extends Extract<Schema.Components<S>[keyof Schema.Components<S>], Descriptor<"component", string, any>>
  >(
    descriptor: D,
    value: Descriptor.Value<D>
  ) => Command.entry(descriptor, value)

  const commandEntryResult = <
    D extends Extract<Schema.Components<S>[keyof Schema.Components<S>], Descriptor<"component", string, any>>,
    E
  >(
    descriptor: D,
    result: Result.Result<Descriptor.Value<D>, E>
  ) => Command.entryResult(descriptor, result)

  const commandEntryRaw = <
    D extends Extract<Schema.Components<S>[keyof Schema.Components<S>], import("./descriptor.ts").ConstructedDescriptor<"component", string, any, any, any>>
  >(
    descriptor: D,
    raw: Descriptor.Raw<D>
  ) => Command.entryRaw(descriptor, raw)

  const commandInsert = <
    P extends Entity.ComponentProof,
    D extends Extract<Schema.Components<S>[keyof Schema.Components<S>], Descriptor<"component", string, any>>
  >(
    draft: Entity.EntityDraft<S, P, Root>,
    descriptor: D,
    value: Descriptor.Value<D>
  ) => Command.insert(draft, descriptor, value)

  const commandInsertResult = <
    P extends Entity.ComponentProof,
    D extends Extract<Schema.Components<S>[keyof Schema.Components<S>], Descriptor<"component", string, any>>,
    E
  >(
    draft: Entity.EntityDraft<S, P, Root>,
    result: Result.Result<Command.Entry<D>, E>
  ) => Command.insertResult(draft, result)

  const commandInsertRaw = <
    P extends Entity.ComponentProof,
    D extends Extract<Schema.Components<S>[keyof Schema.Components<S>], import("./descriptor.ts").ConstructedDescriptor<"component", string, any, any, any>>
  >(
    draft: Entity.EntityDraft<S, P, Root>,
    descriptor: D,
    raw: Descriptor.Raw<D>
  ) => Command.insertRaw(draft, descriptor, raw)

  const commandInsertMany = <
    P extends Entity.ComponentProof,
    const Entries extends ReadonlyArray<Command.SchemaEntry<S>> = ReadonlyArray<Command.SchemaEntry<S>>
  >(
    draft: Entity.EntityDraft<S, P, Root>,
    ...entries: Entries
  ) => Command.insertMany(draft, ...entries)

  const commandSpawnWith = <
    const Entries extends ReadonlyArray<Command.SchemaEntry<S>> = ReadonlyArray<Command.SchemaEntry<S>>
  >(
    ...entries: Entries
  ) => Command.spawnWith<S, Root, Entries>(...entries)

  const commandSpawnWithResult = <
    const Entries extends ReadonlyArray<Result.Result<Command.SchemaEntry<S>, any>>
  >(
    ...entries: Entries
  ) => Command.spawnWithResult<S, Entries, Root>(...entries)

  const commandSpawnWithMixed = <
    const Entries extends ReadonlyArray<Command.MixedEntry<S>>
  >(
    ...entries: Entries
  ) => Command.spawnWithMixed<S, Entries, Root>(...entries)

  const makeRuntimeConstructed = <
    const ProvidedServices extends Runtime.RuntimeServices<any>,
    const ProvidedMachines extends Runtime.RuntimeMachines<any> = Runtime.RuntimeMachines<{}>,
    const Resources extends Runtime.RuntimeConstructedResources<S> = {},
    const States extends Runtime.RuntimeConstructedStates<S> = {}
  >(options: {
    readonly services: ProvidedServices
    readonly resources?: Resources
    readonly states?: States
    readonly machines?: ProvidedMachines
  }) => Runtime.makeRuntimeConstructed<S, ProvidedServices, ProvidedMachines, Resources, States, Root>({
    schema,
    ...options,
    machineDefinitions: definedMachines
  })

  const commandRelate = <
    P extends Entity.ComponentProof,
    R extends RelationDescriptor<S>
  >(
    draft: Entity.EntityDraft<S, P, Root>,
    relation: R,
    target: Entity.EntityId<S, Root>
  ) => Command.relate(draft, relation, target)

  const queryDefine = <
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
  }) => QueryModule.define<Selection, With, Without, Filters, WithRelations, WithoutRelations, WithRelated, WithoutRelated, Root>(spec)

  const queryRead = <D extends ComponentDescriptor<S>>(descriptor: D) => QueryModule.read(descriptor)
  const queryWrite = <D extends ComponentDescriptor<S>>(descriptor: D) => QueryModule.write(descriptor)
  const queryOptional = <D extends ComponentDescriptor<S>>(descriptor: D) => QueryModule.optional(descriptor)
  const queryAdded = <D extends ComponentDescriptor<S>>(descriptor: D) => QueryModule.added(descriptor)
  const queryChanged = <D extends ComponentDescriptor<S>>(descriptor: D) => QueryModule.changed(descriptor)
  const queryReadRelation = <R extends RelationDescriptor<S>>(descriptor: R) => Relation.read<R, S, Root>(descriptor)
  const queryOptionalRelation = <R extends RelationDescriptor<S>>(descriptor: R) => Relation.optional<R, S, Root>(descriptor)
  const queryReadRelated = <R extends RelationDescriptor<S>>(descriptor: R) => Relation.readRelated<R, S, Root>(descriptor)
  const queryOptionalRelated = <R extends RelationDescriptor<S>>(descriptor: R) => Relation.optionalRelated<R, S, Root>(descriptor)

  const readResource = <D extends ResourceDescriptor<S>>(descriptor: D) => System.readResource(descriptor)
  const writeResource = <D extends ResourceDescriptor<S>>(descriptor: D) => System.writeResource(descriptor)
  const readEvent = <D extends EventDescriptor<S>>(descriptor: D) => System.readEvent(descriptor)
  const writeEvent = <D extends EventDescriptor<S>>(descriptor: D) => System.writeEvent(descriptor)
  const readState = <D extends StateDescriptor<S>>(descriptor: D) => System.readState(descriptor)
  const writeState = <D extends StateDescriptor<S>>(descriptor: D) => System.writeState(descriptor)

  const systemMachine = <M extends BoundMachine>(machine: M) => System.machine(machine)
  const systemNextState = <M extends BoundMachine>(machine: M) => System.nextState(machine)
  const systemReadTransitionEvent = <M extends BoundMachine>(machine: M) => System.readTransitionEvent(machine)
  const systemTransition = <M extends BoundMachine>(machine: M) => System.transition(machine)
  const systemReadRemoved = <D extends ComponentDescriptor<S>>(descriptor: D) => System.readRemoved(descriptor)
  const systemReadDespawned = () => System.readDespawned()
  const systemReadRelationFailures = <R extends RelationDescriptor<S>>(relation: R) => System.readRelationFailures(relation)

  const defineSchedule = <
    const Entries extends ReadonlyArray<BoundScheduleEntry>
  >(...entries: Entries) =>
    Schedule.define(...entries) as BoundScheduleDefineResult<S, Root, Entries>

  const makeScheduleFragment = <
    const Entries extends ReadonlyArray<BoundScheduleEntry>
  >(options: {
    readonly entries?: Entries
    readonly steps?: ReadonlyArray<Extract<Entries[number], BoundScheduleStep>>
  }) => {
    if (options.entries) {
      return Schedule.fragment({
        schema,
        entries: options.entries
      }) as RebindScheduleFragment<Schedule.ScheduleFragmentFor<S, Entries>, Root>
    }
    if (!options.steps) {
      return Schedule.fragment({
        schema
      } as any) as RebindScheduleFragment<Schedule.ScheduleFragmentFor<S, Entries>, Root>
    }
    return Schedule.fragment({
      schema,
      steps: options.steps as ReadonlyArray<Schedule.ScheduleStep>
    } as any) as RebindScheduleFragment<Schedule.ScheduleFragmentFor<S, Entries>, Root>
  }

  const makeSchedulePhase = <
    const Steps extends ReadonlyArray<BoundScheduleStep>
  >(options: {
    readonly steps: Steps
  }) =>
    Schedule.phase({
      schema,
      steps: options.steps
    }) as Schema.BoundSchedulePhase<S, Root>

  const composeSchedule = <
    const Entries extends ReadonlyArray<BoundScheduleEntry>
  >(options: {
    readonly entries: Entries
  }) =>
    Schedule.compose(options) as Schedule.ScheduleCompositionFor<Entries>

  const defineMachine = <
    const Name extends string,
    const Values extends readonly [Machine.StateValue, ...Machine.StateValue[]]
  >(name: Name, values: Values): Schema.BoundStateMachine<Root, Name, Values> => {
    if (definedMachineNames.has(name)) {
      throw new Error(`Duplicate state machine name: ${name}`)
    }
    const machine = Machine.define<Name, Values, Root>(name, values)
    definedMachines.push(machine)
    definedMachineNames.add(name)
    return machine
  }

  const makeTransitionSchedule = <
    const Entries extends ReadonlyArray<BoundTransitionEntry>,
    M extends BoundMachine = BoundMachine
  >(transition: Machine.TransitionScheduleDefinition<S, M, any, Root>["transition"], plan: readonly [...Entries]) => {
    const schedule = Schedule.define(...plan)
    const transitionSchedule = {
      ...schedule,
      transition
    } as BoundTransitionScheduleResult<S, Root, M, Entries>
    return transitionSchedule
  }

  const makeTransitionBundle = <
    Entries extends ReadonlyArray<BoundTransitionBundleInput>
  >(...entries: Entries): BoundTransitionBundleFor<Entries> => {
    const bundle = Schedule.transitions<S, Entries>(...entries)
    return bundle as unknown as BoundTransitionBundleFor<Entries>
  }

  /**
   * Creates a transition schedule that runs when one machine enters one exact state.
   *
   * This is the usual place for reset or setup work that should run only after
   * `applyStateTransitions(...)` commits the new current state.
   */
  const onEnter = <
    M extends BoundMachine,
    const Entries extends ReadonlyArray<BoundTransitionEntry>
  >(machine: M, state: Machine.StateMachine.Value<M>, plan: readonly [...Entries]) => makeTransitionSchedule<Entries, M>({
    machine,
    phase: "enter",
    state
  }, plan)
  const onExit = <
    M extends BoundMachine,
    const Entries extends ReadonlyArray<BoundTransitionEntry>
  >(machine: M, state: Machine.StateMachine.Value<M>, plan: readonly [...Entries]) => makeTransitionSchedule<Entries, M>({
    machine,
    phase: "exit",
    state
  }, plan)

  /**
   * Creates a transition schedule that runs only for one exact `from -> to` pair.
   *
   * Use this when reset or cleanup logic depends on the full transition, not
   * just the entered or exited state.
   */
  const onTransition = <
    M extends BoundMachine,
    const Entries extends ReadonlyArray<BoundTransitionEntry>
  >(machine: M, transition: readonly [Machine.StateMachine.Value<M>, Machine.StateMachine.Value<M>], plan: readonly [...Entries]) => makeTransitionSchedule<Entries, M>({
    machine,
    phase: "transition",
    from: transition[0],
    to: transition[1]
  }, plan)

  const makeRuntime = <
    const ProvidedServices extends Runtime.RuntimeServices<any>,
    const Resources extends Runtime.RuntimeResources<S> = {},
    const States extends Runtime.RuntimeStates<S> = {},
    const ProvidedMachines extends Runtime.RuntimeMachines<any> = Runtime.RuntimeMachines<{}>
  >(options: {
    readonly services: ProvidedServices
    readonly resources?: Resources
    readonly states?: States
    readonly machines?: ProvidedMachines
  }) => Runtime.makeRuntime<S, ProvidedServices, Resources, States, Root, ProvidedMachines>({
    schema,
    ...options,
    machineDefinitions: definedMachines
  })

  const makeRuntimeResult = <
    const ProvidedServices extends Runtime.RuntimeServices<any>,
    const Resources extends Runtime.RuntimeResultResources<S> = {},
    const States extends Runtime.RuntimeResultStates<S> = {},
    const ProvidedMachines extends Runtime.RuntimeMachines<any> = Runtime.RuntimeMachines<{}>
  >(options: {
    readonly services: ProvidedServices
    readonly resources?: Resources
    readonly states?: States
    readonly machines?: ProvidedMachines
  }) => Runtime.makeRuntimeResult<S, ProvidedServices, Resources, States, Root, ProvidedMachines>({
    schema,
    ...options,
    machineDefinitions: definedMachines
  })

  const runtimeMachine = <M extends BoundMachine>(
    machine: M,
    initial: Machine.StateMachine.Value<M>
  ) => Runtime.machine(machine, initial)

  return {
    schema,
    Entity: {
      handle: entityHandle,
      handleFrom: entityHandleFrom,
      handleAs: entityHandleAs,
      handleAsFrom: entityHandleAsFrom
    },
    Query: {
      define: queryDefine,
      read: queryRead,
      write: queryWrite,
      optional: queryOptional,
      added: queryAdded,
      changed: queryChanged,
      readRelation: queryReadRelation,
      optionalRelation: queryOptionalRelation,
      readRelated: queryReadRelated,
      optionalRelated: queryOptionalRelated
    },
    Command: {
      spawn: commandSpawn,
      entry: commandEntry,
      entryResult: commandEntryResult,
      entryRaw: commandEntryRaw,
      insert: commandInsert,
      insertResult: commandInsertResult,
      insertRaw: commandInsertRaw,
      insertMany: commandInsertMany,
      spawnWith: commandSpawnWith,
      spawnWithResult: commandSpawnWithResult,
      spawnWithMixed: commandSpawnWithMixed,
      relate: commandRelate
    },
    StateMachine: {
      define: defineMachine
    },
    Condition: {
      inState: Machine.inState,
      stateChanged: Machine.stateChanged,
      not: Machine.not,
      and: Machine.and,
      or: Machine.or
    },
    System: {
      define: defineSystem,
      readResource,
      writeResource,
      readEvent,
      writeEvent,
      readState,
      writeState,
      service: System.service,
      machine: systemMachine,
      nextState: systemNextState,
      readTransitionEvent: systemReadTransitionEvent,
      readRemoved: systemReadRemoved,
      readDespawned: systemReadDespawned,
      readRelationFailures: systemReadRelationFailures,
      transition: systemTransition
    },
    Schedule: {
      define: defineSchedule,
      fragment: makeScheduleFragment,
      phase: makeSchedulePhase,
      compose: composeSchedule,
      transitions: makeTransitionBundle,
      onEnter,
      onExit,
      onTransition,
      applyDeferred: Schedule.applyDeferred,
      updateEvents: Schedule.updateEvents,
      updateLifecycle: Schedule.updateLifecycle,
      updateRelationFailures: Schedule.updateRelationFailures,
      applyStateTransitions: <Bundle extends BoundTransitionBundle | undefined = undefined>(bundle?: Bundle) =>
        Schedule.applyStateTransitions(bundle) as Schedule.ApplyStateTransitionsStep<Bundle, Root>
    },
    Runtime: {
      make: makeRuntime,
      makeResult: makeRuntimeResult,
      makeConstructed: makeRuntimeConstructed,
      service: Runtime.service,
      services: Runtime.services,
      machine: runtimeMachine,
      machines: Runtime.machines
    }
  }
}

/**
 * Defines one pre-bind feature.
 *
 * Features are pure typed values. They contribute a schema fragment, declare
 * structural dependencies on other features, and build schedules only after
 * the final merged schema has been bound.
 *
 * Feature builders can only access descriptors from:
 *
 * - the feature's own fragment
 * - the fragments of features listed in `requires`
 *
 * @example
 * ```ts
 * const Combat = Schema.Feature.define("Combat", {
 *   schema: CombatSchema,
 *   requires: [Core],
 *   build: (Game) => ({
 *     update: [combatUpdate]
 *   })
 * })
 * ```
 */
export const defineFeature = <
  const Name extends string,
  FeatureSchema extends Schema.Any,
  const Requires extends ReadonlyArray<AnyFeatureDefinition> = [],
  Output extends FeatureBuildOutput = FeatureBuildOutput
>(
  name: Name,
  options: {
    readonly schema: FeatureSchema
    readonly requires?: Requires
    readonly build: FeatureBuildFunction<MergeSchemaDefinitions<FeatureSchema, MergeFeatureSchemas<Requires>>, Output>
  }
): FeatureDefinition<Name, FeatureSchema, Requires, Output> => ({
  kind: "feature",
  name,
  schema: options.schema,
  requires: (options.requires ?? []) as Requires,
  build: options.build,
  output: undefined as unknown as Output
})

export const composeFeatures = <
  Root,
  const Features extends readonly [AnyFeatureDefinition, ...Array<AnyFeatureDefinition>]
>(options: {
  readonly root: Root
  readonly features: Features
} & ValidateFeatureSelection<Features>): ComposedFeatureProject<Features, Root> => {
  const featureNames = new Set<string>()
  for (const feature of options.features) {
    if (featureNames.has(feature.name)) {
      throw new Error(`Duplicate feature name: ${feature.name}`)
    }
    featureNames.add(feature.name)
  }
  for (const feature of options.features) {
    for (const requirement of feature.requires) {
      if (!featureNames.has(requirement.name)) {
        throw new Error(`Missing required feature: ${requirement.name}`)
      }
    }
  }

  const schema = build(...options.features.map((feature) => feature.schema) as unknown as FeaturesToSchemaTuple<Features>)
  const Game = bind(schema, options.root)
  const builtFeatures = Object.create(null) as Record<string, object>
  const bootstrapSchedules: Array<Schedule.ScheduleDefinition<typeof schema, any, Root>> = []
  const updateSchedules: Array<Schedule.ScheduleDefinition<typeof schema, any, Root>> = []

  for (const feature of options.features) {
    const built = (feature.build as FeatureBuildFunction<FeatureClosureSchema<typeof feature>, FeatureBuildOutput>)(
      Game as unknown as FeatureBuildGame<FeatureClosureSchema<typeof feature>>
    ) as FeatureBuildOutput & Record<string, unknown>

    const normalized = {
      ...built,
      bootstrap: [...(built.bootstrap ?? [])],
      update: [...(built.update ?? [])]
    }

    bootstrapSchedules.push(...normalized.bootstrap as ReadonlyArray<Schedule.ScheduleDefinition<typeof schema, any, Root>>)
    updateSchedules.push(...normalized.update as ReadonlyArray<Schedule.ScheduleDefinition<typeof schema, any, Root>>)
    builtFeatures[feature.name] = normalized
  }

  const projectBootstrapSchedules =
    bootstrapSchedules as unknown as ReadonlyArray<FeatureBootstrapScheduleUnion<Features, typeof schema, Root>>
  const projectUpdateSchedules =
    updateSchedules as unknown as ReadonlyArray<FeatureUpdateScheduleUnion<Features, typeof schema, Root>>

  return {
    schema,
    Game,
    features: builtFeatures as FeatureOutputRecord<Features, typeof schema, Root>,
    schedules: {
      bootstrap: projectBootstrapSchedules,
      update: projectUpdateSchedules
    },
    App: {
      make<const Services extends Record<string, unknown>, const Resources extends Runtime.RuntimeResources<typeof schema> = {}, const States extends Runtime.RuntimeStates<typeof schema> = {}, const Machines extends Record<string, unknown> = {}>(runtimeOptions: {
        readonly services: Runtime.RuntimeServices<Services>
        readonly resources?: Resources
        readonly states?: States
        readonly machines?: Runtime.RuntimeMachines<Machines>
      }) {
        const runtime = Game.Runtime.make(runtimeOptions)
        const initializeSchedules = runtime.initialize as (
          ...schedules: ReadonlyArray<Schedule.ScheduleDefinition<typeof schema, any, Root>>
        ) => void
        const tickSchedules = runtime.tick as (
          ...schedules: ReadonlyArray<Schedule.ScheduleDefinition<typeof schema, any, Root>>
        ) => void
        return {
          runtime,
          bootstrap: () => {
            initializeSchedules(...bootstrapSchedules)
          },
          update: () => {
            tickSchedules(...updateSchedules)
          }
        }
      }
    }
  } as unknown as ComposedFeatureProject<Features, Root>
}

/**
 * Composes selected features into one merged schema, one bound `Game`, and one
 * aggregated app facade.
 *
 * Composition happens before runtime creation:
 *
 * 1. feature schemas are merged
 * 2. the final schema is bound once
 * 3. every feature builds against that same bound `Game`
 * 4. feature `bootstrap` and `update` schedules are normalized into arrays
 *
 * Aggregated schedule order is the selected feature order, not dependency
 * topological order. Use normal schedule and system ordering when features
 * need explicit execution ordering.
 *
 * @example
 * ```ts
 * const project = Schema.Feature.compose({
 *   root: Root,
 *   features: [Core, Combat, Dialogue]
 * })
 *
 * const app = project.App.make({
 *   services: project.Game.Runtime.services()
 * })
 *
 * app.update()
 * ```
 */

type FeaturesToSchemaTuple<Features extends readonly [AnyFeatureDefinition, ...Array<AnyFeatureDefinition>]> =
  Features extends readonly [infer Head extends AnyFeatureDefinition, ...infer Tail extends Array<AnyFeatureDefinition>]
    ? Tail["length"] extends 0
      ? readonly [Head["schema"]]
      : Tail extends readonly [AnyFeatureDefinition, ...Array<AnyFeatureDefinition>]
        ? readonly [Head["schema"], ...FeaturesToSchemaTuple<Tail>]
        : readonly [Head["schema"]]
    : never

export const Feature = {
  define: defineFeature,
  compose: composeFeatures
}
