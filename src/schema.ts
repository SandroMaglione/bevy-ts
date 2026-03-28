import type { Descriptor } from "./descriptor.ts"

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
}

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
