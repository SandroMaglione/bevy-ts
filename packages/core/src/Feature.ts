/**
 * Pre-bind features: reusable slices that contribute a schema fragment and the
 * schedules that operate on it.
 *
 * A feature builds its schedules only after the final merged schema is bound,
 * and its builder can only reach descriptors from its own fragment and from
 * the features it `requires`.
 *
 * @module Feature
 * @docGroup core
 *
 * @example
 * ```ts
 * const Combat = Schema.Feature.define("Combat", {
 *   schema: CombatSchema,
 *   requires: [Core],
 *   build: (Game) => ({ update: [Game.Schedule(Attack, Game.Schedule.applyDeferred())] })
 * })
 *
 * const project = Schema.Feature.compose({ root: Root, features: [Core, Combat] })
 * const runtime = project.Game.Runtime.make({ services: project.Game.Runtime.services() })
 * runtime.tick(...project.schedules.update)
 * ```
 */
import { buildSchema } from "./internal/fragments.ts"
import { makeGame } from "./internal/game.ts"
import type * as Schedule from "./Schedule.ts"
import type { MergeSchemaDefinitions, Schema, SchemaDefinition, ValidateFragments } from "./Schema.ts"

type EmptySchema = SchemaDefinition<{}, {}, {}, {}>

type AnyFeature = {
  readonly kind: "feature"
  readonly name: string
  readonly schema: Schema.Any
  readonly requires: ReadonlyArray<AnyFeature>
  readonly build: unknown
  readonly output: FeatureBuildOutput
}

type AnySchedule = Schedule.ScheduleDefinition<any, any, any, any, any>

/**
 * What a feature builder returns: bootstrap and update schedules, plus any
 * other values the feature wants to expose on the composed project.
 */
export type FeatureBuildOutput = {
  readonly bootstrap?: ReadonlyArray<AnySchedule>
  readonly update?: ReadonlyArray<AnySchedule>
}

/**
 * The bound authoring surface a feature builder receives. It is the normal
 * `Game` API restricted to the descriptors the feature can see; runtimes are
 * built from the composed project instead.
 */
export type FeatureBuildGame<Accessible extends Schema.Any, Root = unknown> =
  Omit<Schema.Game<Accessible, Root>, "Runtime">

type FeatureBuildFunction<
  Accessible extends Schema.Any,
  Output extends FeatureBuildOutput = FeatureBuildOutput
> = (Game: FeatureBuildGame<Accessible>) => Output

export interface FeatureDefinition<
  Name extends string = string,
  FeatureSchema extends Schema.Any = Schema.Any,
  Requires extends ReadonlyArray<AnyFeature> = ReadonlyArray<AnyFeature>,
  Output extends FeatureBuildOutput = FeatureBuildOutput
> {
  readonly kind: "feature"
  readonly name: Name
  readonly schema: FeatureSchema
  readonly requires: Requires
  readonly build: FeatureBuildFunction<MergeSchemaDefinitions<FeatureSchema, MergeFeatureSchemas<Requires>>, Output>
  readonly output: Output
}

type MergeFeatureSchemas<Features extends ReadonlyArray<AnyFeature>> =
  Features extends readonly [infer Head extends AnyFeature, ...infer Tail extends Array<AnyFeature>]
    ? MergeSchemaDefinitions<FeatureClosureSchema<Head>, MergeFeatureSchemas<Tail>>
    : EmptySchema

type FeatureClosureSchema<F extends AnyFeature> =
  F extends FeatureDefinition<any, infer FeatureSchema extends Schema.Any, infer Requires extends ReadonlyArray<AnyFeature>, any>
    ? MergeSchemaDefinitions<FeatureSchema, MergeFeatureSchemas<Requires>>
    : EmptySchema

type FeatureNames<Features extends ReadonlyArray<AnyFeature>> = Features[number]["name"]

type DuplicateFeatureNames<
  Features extends ReadonlyArray<AnyFeature>,
  Seen extends string = never
> = Features extends readonly [infer Head extends AnyFeature, ...infer Tail extends Array<AnyFeature>]
  ? Head["name"] extends Seen
    ? Head["name"] | DuplicateFeatureNames<Tail, Seen>
    : DuplicateFeatureNames<Tail, Seen | Head["name"]>
  : never

type MissingFeatureDependencies<Features extends ReadonlyArray<AnyFeature>> =
  Exclude<Features[number]["requires"][number]["name"], FeatureNames<Features>>

type FeatureSchemas<Features extends ReadonlyArray<AnyFeature>> = {
  readonly [K in keyof Features]: Features[K]["schema"]
}

/**
 * Rejects duplicate feature names, missing required features, and schema
 * fragments whose keys or descriptor names collide.
 */
type ValidateFeatureSelection<Features extends ReadonlyArray<AnyFeature>> =
  [DuplicateFeatureNames<Features>] extends [never]
    ? [MissingFeatureDependencies<Features>] extends [never]
      ? ValidateFragments<FeatureSchemas<Features>>
      : { readonly __fixFeatureDependencies__: MissingFeatureDependencies<Features> }
    : { readonly __fixFeatureSelection__: DuplicateFeatureNames<Features> }

type RebindFeatureSchedule<ScheduleValue, S extends Schema.Any, Root> =
  ScheduleValue extends Schedule.ScheduleDefinition<any, infer Requirements, any, infer Carried, infer Failure>
    ? Schedule.ScheduleDefinition<S, Requirements, Root, Carried, Failure>
    : never

type FeatureScheduleArray<Output, Key extends "bootstrap" | "update"> =
  Key extends keyof Output
    ? Extract<Output[Key], ReadonlyArray<AnySchedule>>
    : readonly []

type NormalizeFeatureOutput<Output extends object, S extends Schema.Any, Root> = {
  readonly [K in Exclude<keyof Output, "bootstrap" | "update">]: Output[K]
} & {
  readonly bootstrap: ReadonlyArray<RebindFeatureSchedule<FeatureScheduleArray<Output, "bootstrap">[number], S, Root>>
  readonly update: ReadonlyArray<RebindFeatureSchedule<FeatureScheduleArray<Output, "update">[number], S, Root>>
}

type FeatureOutputRecord<Features extends ReadonlyArray<AnyFeature>, S extends Schema.Any, Root> = {
  readonly [K in FeatureNames<Features>]:
    NormalizeFeatureOutput<Extract<Features[number], { readonly name: K }>["output"], S, Root>
}

/**
 * The result of composing features: the merged schema, the bound `Game`,
 * each feature's normalized output, and the aggregated schedules in feature
 * order.
 */
export interface ComposedFeatureProject<
  Features extends ReadonlyArray<AnyFeature>,
  Root = unknown,
  S extends Schema.Any = MergeFeatureSchemas<Features>
> {
  readonly schema: S
  readonly Game: Schema.Game<S, Root>
  readonly features: FeatureOutputRecord<Features, S, Root>
  readonly schedules: {
    readonly bootstrap: ReadonlyArray<FeatureOutputRecord<Features, S, Root>[FeatureNames<Features>]["bootstrap"][number]>
    readonly update: ReadonlyArray<FeatureOutputRecord<Features, S, Root>[FeatureNames<Features>]["update"][number]>
  }
}

/**
 * Defines one pre-bind feature.
 */
export const define = <
  const Name extends string,
  FeatureSchema extends Schema.Any,
  const Requires extends ReadonlyArray<AnyFeature> = [],
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

/**
 * Composes features into one merged schema and one bound `Game`, then builds
 * every feature against it.
 *
 * Aggregated schedule order is the selected feature order, not dependency
 * order. Run them with `runtime.tick(...project.schedules.update)`.
 */
export const compose = <
  Root,
  const Features extends readonly [AnyFeature, ...Array<AnyFeature>]
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

  const schema = buildSchema(options.features.map((feature) => feature.schema))
  const Game = makeGame(schema, options.root)
  const features: Record<string, object> = Object.create(null)
  const bootstrap: Array<AnySchedule> = []
  const update: Array<AnySchedule> = []

  for (const feature of options.features) {
    const built = (feature.build as (Game: unknown) => FeatureBuildOutput & Record<string, unknown>)(Game)
    const normalized = {
      ...built,
      bootstrap: [...(built.bootstrap ?? [])],
      update: [...(built.update ?? [])]
    }
    bootstrap.push(...normalized.bootstrap)
    update.push(...normalized.update)
    features[feature.name] = normalized
  }

  return {
    schema,
    Game,
    features,
    schedules: { bootstrap, update }
  } as unknown as ComposedFeatureProject<Features, Root>
}

export const Feature = {
  define,
  compose
}
