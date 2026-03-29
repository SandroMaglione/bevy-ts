import type { Descriptor } from "./descriptor.ts"
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
  out States extends Registry = {}
> {
  readonly components: Components
  readonly resources: Resources
  readonly events: Events
  readonly states: States
}

/**
 * Type-level helpers for schema-driven programming.
 */
export namespace Schema {
  /**
   * Any complete schema definition.
   */
  export type Any = SchemaDefinition<Registry, Registry, Registry, Registry>

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
    Spec extends System.SystemSpec<S, any, any, any, any, any, any, any, any> = System.SystemSpec<S, any, any, any, any, any, any, any, any>,
    A = void,
    E = never
  > = System.SystemDefinition<Spec, A, E, Root>

  /**
   * A schema-bound schedule definition branded to one bound schema root.
   */
  export type BoundSchedule<
    S extends Any,
    Root,
    Requirements extends System.RuntimeRequirements = System.RuntimeRequirements
  > = Schedule.ScheduleDefinition<S, Requirements, Root>

  /**
   * A schema-bound runtime branded to one bound schema root.
   */
  export type BoundRuntime<
    S extends Any,
    Root,
    Services extends Record<string, unknown>,
    Resources extends Runtime.RuntimeResources<S> = {},
    States extends Runtime.RuntimeStates<S> = {}
  > = Runtime.Runtime<S, Services, Resources, States, Root>
}

/**
 * Flattens an inferred object type for clearer diagnostics.
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

/**
 * Recomputes the aggregate runtime requirements for a bound schedule.
 *
 * The bound API cannot rely on inference from the lower-level constructor once
 * it wraps the options object, so it reconstructs the same requirement fold
 * from the concrete system tuple directly.
 */
type BoundScheduleRequirements<Systems extends ReadonlyArray<System.SystemDefinition<any, any, any, any>>> = Simplify<System.RuntimeRequirements<
  Simplify<IntersectOrEmpty<
    Systems[number] extends System.SystemDefinition<infer Spec, any, any, any> ? System.SystemRequirements<Spec>["services"] : never
  >>,
  Simplify<IntersectOrEmpty<
    Systems[number] extends System.SystemDefinition<infer Spec, any, any, any> ? System.SystemRequirements<Spec>["resources"] : never
  >>,
  Simplify<IntersectOrEmpty<
    Systems[number] extends System.SystemDefinition<infer Spec, any, any, any> ? System.SystemRequirements<Spec>["states"] : never
  >>
>>

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
  states: {}
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
  const States extends Registry = {}
>(definition: {
  readonly components?: Components
  readonly resources?: Resources
  readonly events?: Events
  readonly states?: States
}): SchemaDefinition<Components, Resources, Events, States> => ({
  components: (definition.components ?? {}) as Components,
  resources: (definition.resources ?? {}) as Resources,
  events: (definition.events ?? {}) as Events,
  states: (definition.states ?? {}) as States
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
): SchemaDefinition<
  Schema.Components<A> & Schema.Components<B>,
  Schema.Resources<A> & Schema.Resources<B>,
  Schema.Events<A> & Schema.Events<B>,
  Schema.States<A> & Schema.States<B>
> => ({
  components: mergeRegistry(left.components, right.components),
  resources: mergeRegistry(left.resources, right.resources),
  events: mergeRegistry(left.events, right.events),
  states: mergeRegistry(left.states, right.states)
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
            Schema.States<Head> & Schema.States<BuildFragments<Tail>>
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
export const bind = <S extends Schema.Any>(schema: S) => {
  type Root = S
  type BoundOrderTarget = Schema.BoundSystem<S, Root> | Label.System | Label.SystemSet
  type BoundScheduleStep = Schema.BoundSystem<S, Root> | Schedule.ApplyDeferredStep | Schedule.EventUpdateStep

  const defineSystem = <
    const Queries extends Record<string, Query.Any> = {},
    const Resources extends Record<string, System.ResourceRead<Descriptor<"resource", string, any>> | System.ResourceWrite<Descriptor<"resource", string, any>>> = {},
    const Events extends Record<string, System.EventRead<Descriptor<"event", string, any>> | System.EventWrite<Descriptor<"event", string, any>>> = {},
    const Services extends Record<string, System.ServiceRead<Descriptor<"service", string, any>>> = {},
    const States extends Record<string, System.StateRead<Descriptor<"state", string, any>> | System.StateWrite<Descriptor<"state", string, any>>> = {},
    const InSets extends ReadonlyArray<Label.SystemSet> = [],
    const After extends ReadonlyArray<BoundOrderTarget> = [],
    const Before extends ReadonlyArray<BoundOrderTarget> = [],
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
    },
    run: (context: System.SystemContext<System.SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before>>) => Fx<
      A,
      E,
      System.SystemDependencies<System.SystemSpec<S, Queries, Resources, Events, Services, States, InSets, After, Before>>
    >
  ) => {
    const system = System.define(name, {
      schema,
      ...spec
    }, run)
    return system as typeof system & Schema.BoundSystem<S, Root, typeof system.spec, A, E>
  }

  const defineSchedule = <
    const Systems extends ReadonlyArray<Schema.BoundSystem<S, Root>>,
    const Sets extends ReadonlyArray<Schedule.SystemSetConfig<any, any, any>> = []
  >(options: {
    readonly systems: Systems
    readonly sets?: Sets
    readonly steps?: ReadonlyArray<BoundScheduleStep>
  }) => {
    const schedule = Schedule.define({
      schema,
      ...options
    } as never)
    return schedule as Schedule.Schedule.Anonymous<S, BoundScheduleRequirements<Systems>, Root>
  }

  const namedSchedule = <
    const L extends Label.Schedule,
    const Systems extends ReadonlyArray<Schema.BoundSystem<S, Root>>,
    const Sets extends ReadonlyArray<Schedule.SystemSetConfig<any, any, any>> = []
  >(label: L, options: {
    readonly systems: Systems
    readonly sets?: Sets
    readonly steps?: ReadonlyArray<BoundScheduleStep>
  }) => {
    const schedule = Schedule.named(label, {
      schema,
      ...options
    } as never)
    return schedule as Schedule.Schedule.Named<S, BoundScheduleRequirements<Systems>, L, Root>
  }

  const makeRuntime = <
    const Services extends Record<string, unknown>,
    const Resources extends Runtime.RuntimeResources<S> = {},
    const States extends Runtime.RuntimeStates<S> = {}
  >(options: {
    readonly services: Runtime.RuntimeServices<Services>
    readonly resources?: Resources
    readonly states?: States
  }) => Runtime.makeRuntime<S, Services, Resources, States, Root>({
    schema,
    ...options
  })

  return {
    schema,
    System: {
      define: defineSystem
    },
    Schedule: {
      define: defineSchedule,
      named: namedSchedule,
      configureSet: Schedule.configureSet,
      applyDeferred: Schedule.applyDeferred,
      updateEvents: Schedule.updateEvents
    },
    Runtime: {
      make: makeRuntime
    }
  }
}
