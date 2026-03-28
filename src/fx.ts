/**
 * String-literal type id used to mirror Effect's current `~effect/...` style.
 */
export type FxTypeId = "~bevy-ts/Fx"

/**
 * Runtime value for the `Fx` type id.
 */
const fxTypeId: FxTypeId = "~bevy-ts/Fx"

/**
 * A minimal Effect-style computation used by the runtime.
 *
 * `Fx<A, E, R>` models a computation that succeeds with `A`, may fail with `E`,
 * and requires an environment `R`. The implementation is intentionally small,
 * but the public shape gives systems typed dependency tracking.
 */
export interface Fx<A, E = never, R = never> {
  readonly [fxTypeId]: {
    readonly _A: (_: never) => A
    readonly _E: (_: never) => E
    readonly _R: (_: R) => void
  }
  readonly run: (environment: R) => A
}

/**
 * Type-level helpers for `Fx`.
 */
export namespace Fx {
  /**
   * Extracts the success type from an effect.
   */
  export type Success<T extends Fx<any, any, any>> = T extends Fx<infer A, infer _E, infer _R> ? A : never
  /**
   * Extracts the error type from an effect.
   */
  export type Error<T extends Fx<any, any, any>> = T extends Fx<infer _A, infer E, infer _R> ? E : never
  /**
   * Extracts the required environment from an effect.
   */
  export type Context<T extends Fx<any, any, any>> = T extends Fx<infer _A, infer _E, infer R> ? R : never
}

/**
 * Low-level constructor for `Fx`.
 *
 * All public constructors eventually delegate here so the runtime shape stays
 * consistent.
 */
const make = <A, E, R>(run: (environment: R) => A): Fx<A, E, R> =>
  ({
    [fxTypeId]: {
      _A: (_: never) => undefined as A,
      _E: (_: never) => undefined as E,
      _R: (_: R) => undefined
    },
    run
  }) as Fx<A, E, R>

/**
 * Creates an effect that immediately succeeds with a value.
 *
 * Use this for pure values that should still participate in the typed effect
 * composition model.
 */
export const succeed = <A, R = never>(value: A): Fx<A, never, R> => make(() => value)

/**
 * Wraps a synchronous computation in an `Fx`.
 *
 * This is the most common constructor for system implementations in the current
 * runtime because systems are executed synchronously.
 */
export const sync = <A, R = never>(evaluate: () => A): Fx<A, never, R> => make(() => evaluate())

/**
 * Creates an effect that fails by throwing the provided error when run.
 */
export const fail = <E, R = never>(error: E): Fx<never, E, R> =>
  make(() => {
    throw error
  })

/**
 * Transforms the success value of an effect.
 */
export const map = <A, B, E, R>(
  self: Fx<A, E, R>,
  f: (value: A) => B
): Fx<B, E, R> => make((environment) => f(self.run(environment)))

/**
 * Sequences two effects, allowing the second one to depend on the first result.
 */
export const flatMap = <A, B, E1, E2, R1, R2>(
  self: Fx<A, E1, R1>,
  f: (value: A) => Fx<B, E2, R2>
): Fx<B, E1 | E2, R1 & R2> => make((environment) => f(self.run(environment as R1)).run(environment as R2))

/**
 * Reads the whole effect environment.
 *
 * Use this when a system helper wants access to all declared services at once.
 */
export const access = <R>(): Fx<R, never, R> => make((environment) => environment)

/**
 * Reads a single service from the environment by key.
 *
 * This is useful for small helpers that need one dependency without threading
 * the entire environment type manually.
 */
export const accessService = <R, K extends keyof R>(key: K): Fx<R[K], never, R> =>
  make((environment) => environment[key])

/**
 * Supplies the environment needed by an effect.
 */
export const provide = <A, E, R>(
  self: Fx<A, E, R>,
  environment: R
): Fx<A, E> => make(() => self.run(environment))

/**
 * Runs an effect that no longer requires any environment.
 *
 * The runtime uses this at the edge after it has provided the services declared
 * by a system spec.
 */
export const runSync = <A, E>(self: Fx<A, E, never>): A => self.run(undefined as never)
