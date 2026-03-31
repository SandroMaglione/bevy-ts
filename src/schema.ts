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
    E = never
  > = {
    readonly name: string
    readonly spec: Spec & { readonly schema: S }
    readonly requirements: System.SystemRequirements<Spec>
    readonly __schemaRoot: Root
    readonly ordering: System.SystemOrderingSpec<Spec["inSets"], Spec["after"], Spec["before"]>
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
      insert: <P extends Entity.ComponentProof, D extends ComponentDescriptor<S>>(
        draft: Entity.EntityDraft<S, P, Root>,
        descriptor: D,
        value: Descriptor.Value<D>
      ) => Entity.EntityDraft<S, Command.Draft.Insert<P, Descriptor.Name<D>, Descriptor.Value<D>>, Root>
      insertMany: <P extends Entity.ComponentProof, const Entries extends ReadonlyArray<Command.SchemaEntry<S>>>(
        draft: Entity.EntityDraft<S, P, Root>,
        ...entries: Entries
      ) => Entity.EntityDraft<S, Command.Draft.FoldEntries<Entries, P>, Root>
      spawnWith: <const Entries extends ReadonlyArray<Command.SchemaEntry<S>>>(
        ...entries: Entries
      ) => Entity.EntityDraft<S, Command.Draft.FoldEntries<Entries>, Root>
      relate: <P extends Entity.ComponentProof, R extends RelationDescriptor<S>>(
        draft: Entity.EntityDraft<S, P, Root>,
        relation: R,
        target: Entity.EntityId<S, Root>
      ) => Entity.EntityDraft<S, P, Root>
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
  ScheduleValue extends Schedule.Schedule.Anonymous<infer S, infer Requirements, any>
    ? Schedule.Schedule.Anonymous<S, Requirements, Root>
    : never

type RebindNamedSchedule<ScheduleValue, Root> =
  ScheduleValue extends Schedule.Schedule.Named<infer S, infer Requirements, infer L, any>
    ? Schedule.Schedule.Named<S, Requirements, L, Root>
    : never

type RebindTransitionSchedule<ScheduleValue, M extends Machine.StateMachine.Any, Root> =
  ScheduleValue extends Schedule.Schedule.Anonymous<infer S, infer Requirements, any>
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
 */
export const bind = <S extends Schema.Any, Root = S>(
  schema: S,
  _root: Root = schema as unknown as Root
) => {
  type BoundAnySystem = Schema.BoundSystem<any, Root, any, any, any>
  type BoundOrderTarget = BoundAnySystem | Label.System | Label.SystemSet
  type BoundMachine = Schema.BoundStateMachine<Root>
  type BoundTransitionSchedule = Schema.BoundTransitionSchedule<S, Root>
  type BoundTransitionBundleInput = BoundTransitionSchedule | Schema.BoundTransitionBundle<S, Root>
  type BoundTransitionBundleFor<Entries extends ReadonlyArray<BoundTransitionBundleInput>> =
    Schedule.TransitionBundleDefinition<
      S,
      Schedule.FlattenTransitionEntries<Entries>,
      Schedule.TransitionBundleRequirements<Schedule.FlattenTransitionEntries<Entries>>,
      Root
    >
  type BoundTransitionBundle = Schema.BoundTransitionBundle<S, Root>
  type BoundScheduleStep =
    | BoundAnySystem
    | Schedule.ApplyDeferredStep
    | Schedule.EventUpdateStep
    | Schedule.LifecycleUpdateStep
    | Schedule.RelationFailureUpdateStep
    | Schedule.ApplyStateTransitionsStep<any, Root>
  type BoundTransitionStep =
    | BoundAnySystem
    | Schedule.ApplyDeferredStep
    | Schedule.EventUpdateStep
    | Schedule.LifecycleUpdateStep
    | Schedule.RelationFailureUpdateStep
  type BoundScheduleOptions<
    SystemValue extends BoundAnySystem,
    SetValue extends Schedule.SystemSetConfig<any, any, any> = never
  > = {
    readonly systems: ReadonlyArray<SystemValue>
    readonly sets?: ReadonlyArray<SetValue>
    readonly steps?: ReadonlyArray<BoundScheduleStep>
  }
  type BoundAnonymousScheduleFor<ScheduleValue> = RebindAnonymousSchedule<ScheduleValue, Root>
  type BoundNamedScheduleFor<ScheduleValue> = RebindNamedSchedule<ScheduleValue, Root>
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
    const Queries extends Record<string, Query.Any<Root>> = {},
    const Resources extends Record<string, System.ResourceRead<ResourceDescriptor<S>> | System.ResourceWrite<ResourceDescriptor<S>>> = {},
    const Events extends Record<string, System.EventRead<EventDescriptor<S>> | System.EventWrite<EventDescriptor<S>>> = {},
    const Services extends Record<string, System.ServiceRead<Descriptor<"service", string, any>>> = {},
    const States extends Record<string, System.StateRead<StateDescriptor<S>> | System.StateWrite<StateDescriptor<S>>> = {},
    const InSets extends ReadonlyArray<Label.SystemSet> = [],
    const After extends ReadonlyArray<BoundOrderTarget> = [],
    const Before extends ReadonlyArray<BoundOrderTarget> = [],
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
    name: string,
    spec: {
      readonly inSets?: InSets
      readonly after?: After
      readonly before?: Before
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
    run: (context: System.SystemContext<System.SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>) => Fx<
      A,
      E,
      System.SystemDependencies<System.SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, When, Transitions, Root, RelationFailures>>
    >
  ) => {
    const system = System.define<S, Queries, Resources, Events, Services, States, InSets, After, Before, Machines, NextMachines, TransitionEvents, Removed, Despawned, RelationFailures, When, Transitions, Root, A, E>(name, {
      schema,
      ...spec
    }, run)
    return system as Schema.BoundSystem<S, Root, typeof system.spec, A, E>
  }

  const commandSpawn = () => Command.spawn<S, Root>()

  const commandEntry = <
    D extends Extract<Schema.Components<S>[keyof Schema.Components<S>], Descriptor<"component", string, any>>
  >(
    descriptor: D,
    value: Descriptor.Value<D>
  ) => Command.entry(descriptor, value)

  const commandInsert = <
    P extends Entity.ComponentProof,
    D extends Extract<Schema.Components<S>[keyof Schema.Components<S>], Descriptor<"component", string, any>>
  >(
    draft: Entity.EntityDraft<S, P, Root>,
    descriptor: D,
    value: Descriptor.Value<D>
  ) => Command.insert(draft, descriptor, value)

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

  const makeAnonymousSchedule = <
    SystemValue extends BoundAnySystem,
    SetValue extends Schedule.SystemSetConfig<any, any, any> = never,
    StepValue extends BoundScheduleStep | undefined = undefined
  >(options: BoundScheduleOptions<SystemValue, SetValue> & { readonly steps?: ReadonlyArray<Extract<StepValue, BoundScheduleStep>> }) => {
    const schedule = options.sets === undefined
      ? options.steps === undefined
        ? Schedule.define<S, ReadonlyArray<SystemValue>, [], undefined>({
            schema,
            systems: options.systems
          } as never)
        : Schedule.define<S, ReadonlyArray<SystemValue>, [], Extract<StepValue, BoundScheduleStep>>({
            schema,
            systems: options.systems,
            steps: options.steps
          } as never)
      : options.steps === undefined
        ? Schedule.define<S, ReadonlyArray<SystemValue>, ReadonlyArray<SetValue>, undefined>({
            schema,
            systems: options.systems,
            sets: options.sets
          } as never)
        : Schedule.define<S, ReadonlyArray<SystemValue>, ReadonlyArray<SetValue>, Extract<StepValue, BoundScheduleStep>>({
            schema,
            systems: options.systems,
            sets: options.sets,
            steps: options.steps
          } as never)
    return schedule as BoundAnonymousScheduleFor<typeof schedule>
  }

  const makeNamedSchedule = <
    L extends Label.Schedule,
    SystemValue extends BoundAnySystem,
    SetValue extends Schedule.SystemSetConfig<any, any, any> = never,
    StepValue extends BoundScheduleStep | undefined = undefined
  >(label: L, options: BoundScheduleOptions<SystemValue, SetValue> & { readonly steps?: ReadonlyArray<Extract<StepValue, BoundScheduleStep>> }) => {
    const schedule = options.sets === undefined
      ? options.steps === undefined
        ? Schedule.named<S, L, ReadonlyArray<SystemValue>, [], undefined>(label, {
            schema,
            systems: options.systems
          } as never)
        : Schedule.named<S, L, ReadonlyArray<SystemValue>, [], Extract<StepValue, BoundScheduleStep>>(label, {
            schema,
            systems: options.systems,
            steps: options.steps
          } as never)
      : options.steps === undefined
        ? Schedule.named<S, L, ReadonlyArray<SystemValue>, ReadonlyArray<SetValue>, undefined>(label, {
            schema,
            systems: options.systems,
            sets: options.sets
          } as never)
        : Schedule.named<S, L, ReadonlyArray<SystemValue>, ReadonlyArray<SetValue>, Extract<StepValue, BoundScheduleStep>>(label, {
            schema,
            systems: options.systems,
            sets: options.sets,
            steps: options.steps
          } as never)
    return schedule as BoundNamedScheduleFor<typeof schedule>
  }

  const defineSchedule = <
    SystemValue extends BoundAnySystem,
    SetValue extends Schedule.SystemSetConfig<any, any, any> = never,
    StepValue extends BoundScheduleStep | undefined = undefined
  >(options: BoundScheduleOptions<SystemValue, SetValue> & { readonly steps?: ReadonlyArray<Extract<StepValue, BoundScheduleStep>> }) =>
    makeAnonymousSchedule(options)

  const namedSchedule = <
    L extends Label.Schedule,
    SystemValue extends BoundAnySystem,
    SetValue extends Schedule.SystemSetConfig<any, any, any> = never,
    StepValue extends BoundScheduleStep | undefined = undefined
  >(label: L, options: BoundScheduleOptions<SystemValue, SetValue> & { readonly steps?: ReadonlyArray<Extract<StepValue, BoundScheduleStep>> }) =>
    makeNamedSchedule(label, options)

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
    SystemValue extends BoundAnySystem,
    SetValue extends Schedule.SystemSetConfig<any, any, any> = never,
    M extends BoundMachine = BoundMachine
  >(transition: Machine.TransitionScheduleDefinition<S, M, Schedule.SystemRequirementsForSchedule<ReadonlyArray<SystemValue>>, Root>["transition"], options: {
    readonly systems: ReadonlyArray<SystemValue>
    readonly sets?: ReadonlyArray<SetValue>
    readonly steps?: ReadonlyArray<BoundTransitionStep>
  }) => {
    const schedule = options.sets === undefined
      ? options.steps === undefined
        ? Schedule.define<S, ReadonlyArray<SystemValue>, [], undefined>({
            schema,
            systems: options.systems
          } as never)
        : Schedule.define<S, ReadonlyArray<SystemValue>, [], BoundTransitionStep>({
            schema,
            systems: options.systems,
            steps: options.steps
          } as never)
      : options.steps === undefined
        ? Schedule.define<S, ReadonlyArray<SystemValue>, ReadonlyArray<SetValue>, undefined>({
            schema,
            systems: options.systems,
            sets: options.sets
          } as never)
        : Schedule.define<S, ReadonlyArray<SystemValue>, ReadonlyArray<SetValue>, BoundTransitionStep>({
            schema,
            systems: options.systems,
            sets: options.sets,
            steps: options.steps
          } as never)
    const transitionSchedule = {
      ...schedule,
      transition
    } as BoundTransitionScheduleFor<typeof schedule, M>
    return transitionSchedule
  }

  const makeTransitionBundle = <
    Entries extends ReadonlyArray<BoundTransitionBundleInput>
  >(...entries: Entries): BoundTransitionBundleFor<Entries> => {
    const bundle = Schedule.transitions<S, Entries>(...entries)
    return bundle as unknown as BoundTransitionBundleFor<Entries>
  }

  const onEnter = <
    M extends BoundMachine,
    const SystemValue extends BoundAnySystem,
    const SetValue extends Schedule.SystemSetConfig<any, any, any> = never
  >(machine: M, state: Machine.StateMachine.Value<M>, options: {
    readonly systems: ReadonlyArray<SystemValue>
    readonly sets?: ReadonlyArray<SetValue>
    readonly steps?: ReadonlyArray<BoundTransitionStep>
  }) => makeTransitionSchedule<SystemValue, SetValue, M>({
    machine,
    phase: "enter",
    state
  }, options)

  const onExit = <
    M extends BoundMachine,
    const SystemValue extends BoundAnySystem,
    const SetValue extends Schedule.SystemSetConfig<any, any, any> = never
  >(machine: M, state: Machine.StateMachine.Value<M>, options: {
    readonly systems: ReadonlyArray<SystemValue>
    readonly sets?: ReadonlyArray<SetValue>
    readonly steps?: ReadonlyArray<BoundTransitionStep>
  }) => makeTransitionSchedule<SystemValue, SetValue, M>({
    machine,
    phase: "exit",
    state
  }, options)

  const onTransition = <
    M extends BoundMachine,
    const SystemValue extends BoundAnySystem,
    const SetValue extends Schedule.SystemSetConfig<any, any, any> = never
  >(machine: M, states: {
    readonly from: Machine.StateMachine.Value<M>
    readonly to: Machine.StateMachine.Value<M>
  }, options: {
    readonly systems: ReadonlyArray<SystemValue>
    readonly sets?: ReadonlyArray<SetValue>
    readonly steps?: ReadonlyArray<BoundTransitionStep>
  }) => makeTransitionSchedule<SystemValue, SetValue, M>({
    machine,
    phase: "transition",
    from: states.from,
    to: states.to
  }, options)

  const makeRuntime = <
    const Services extends Record<string, unknown>,
    const Resources extends Runtime.RuntimeResources<S> = {},
    const States extends Runtime.RuntimeStates<S> = {},
    const Machines extends Record<string, unknown> = {}
  >(options: {
    readonly services: Runtime.RuntimeServices<Services>
    readonly resources?: Resources
    readonly states?: States
    readonly machines?: Runtime.RuntimeMachines<Machines>
  }) => Runtime.makeRuntime<S, Services, Resources, States, Root, Machines>({
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
      insert: commandInsert,
      insertMany: commandInsertMany,
      spawnWith: commandSpawnWith,
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
      named: namedSchedule,
      transitions: makeTransitionBundle,
      onEnter,
      onExit,
      onTransition,
      configureSet: Schedule.configureSet,
      applyDeferred: Schedule.applyDeferred,
      updateEvents: Schedule.updateEvents,
      updateLifecycle: Schedule.updateLifecycle,
      updateRelationFailures: Schedule.updateRelationFailures,
      applyStateTransitions: <Bundle extends BoundTransitionBundle | undefined = undefined>(bundle?: Bundle) =>
        Schedule.applyStateTransitions(bundle) as Schedule.ApplyStateTransitionsStep<Bundle, Root>
    },
    Runtime: {
      make: makeRuntime,
      service: Runtime.service,
      services: Runtime.services,
      machine: runtimeMachine,
      machines: Runtime.machines
    }
  }
}
