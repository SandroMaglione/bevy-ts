/**
 * Helpers for validating reusable authored values once and reusing them later.
 *
 * `Definition` is intended for static or rarely changing authored data such as
 * spawn points, collider sizes, arena bounds, or other constants that should
 * cross the validation boundary once and then remain branded afterward.
 */
import * as internal from "./internal/definition.ts"
import type * as Result from "./Result.ts"

/**
 * One reusable validated definition entry.
 */
export type Entry<Value, Error> = internal.Entry<Value, Error>
/**
 * Record of named definition entries accepted by {@link all}.
 */
export type Entries = internal.Entries
/**
 * Minimal constructor contract accepted by {@link entry}.
 */
export type ResultConstructor<Value, Raw, Error> = internal.ResultConstructor<Value, Raw, Error>
/**
 * Success shape produced by {@link all}.
 */
export type SuccessOf<Input extends Entries> = internal.SuccessOf<Input>
/**
 * Error shape produced by {@link all}.
 */
export type ErrorOf<Input extends Entries> = internal.ErrorOf<Input>

/**
 * Validates one reusable authored value through an existing constructor.
 *
 * @example
 * ```ts
 * const playerSpawn = Definition.entry(Vector2, { x: 32, y: 48 })
 * ```
 */
export const entry: <Value, Raw, Error>(
  constructor: ResultConstructor<Value, Raw, Error>,
  raw: Raw
) => Entry<Value, Error> = internal.entry

/**
 * Validates a named record of reusable authored values at once.
 *
 * Successful entries are returned under the same keys. Failed entries remain
 * keyed so authored-data setup can report exactly which constant was invalid.
 *
 * @example
 * ```ts
 * const definitions = Definition.all({
 *   spawn: Definition.entry(Vector2, { x: 32, y: 48 }),
 *   collider: Definition.entry(Size2, { width: 16, height: 16 })
 * })
 * ```
 */
export const all: <Input extends Entries>(
  input: Input
) => Result.Result<SuccessOf<Input>, ErrorOf<Input>> = internal.all
