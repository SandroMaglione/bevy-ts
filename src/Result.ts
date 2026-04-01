/**
 * Minimal explicit success/failure values used across the public API.
 *
 * `Result` is intentionally small in this library:
 *
 * - construction failures stay explicit in the return type
 * - no helper ever throws to surface ordinary validation failure
 * - the public surface stops at simple creation, refinement, folding, and
 *   structural aggregation helpers
 *
 * Use this when an operation can fail because of runtime data, but that
 * failure should remain visible and typed instead of being hidden behind
 * exceptions or implicit coercion.
 */
import * as internal from "./internal/result.ts"

/**
 * Successful branch of a {@link Result}.
 */
export type Success<out Value> = internal.Success<Value>
/**
 * Failed branch of a {@link Result}.
 */
export type Failure<out Error> = internal.Failure<Error>
/**
 * Explicit success/failure value used by non-throwing public APIs.
 */
export type Result<Value, Error> = internal.Result<Value, Error>
/**
 * Return type produced by {@link match}.
 */
export type MatchReturn<
  Value,
  Error,
  SuccessReturn,
  FailureReturn
> = internal.MatchReturn<Value, Error, SuccessReturn, FailureReturn>
/**
 * Success shape produced by {@link all}.
 */
export type AllSuccess<Input extends ReadonlyArray<Result<any, any>> | Readonly<Record<string, Result<any, any>>>> =
  internal.AllSuccess<Input>
/**
 * Failure shape produced by {@link all}.
 */
export type AllError<Input extends ReadonlyArray<Result<any, any>> | Readonly<Record<string, Result<any, any>>>> =
  internal.AllError<Input>

/**
 * Creates the successful branch of a {@link Result}.
 */
export const success: <Value>(value: Value) => Success<Value> = internal.success
/**
 * Creates the failed branch of a {@link Result}.
 */
export const failure: <Error>(error: Error) => Failure<Error> = internal.failure
/**
 * Narrows one {@link Result} to its successful branch.
 */
export const isSuccess: <Value, Error>(result: Result<Value, Error>) => result is Success<Value> = internal.isSuccess
/**
 * Narrows one {@link Result} to its failed branch.
 */
export const isFailure: <Value, Error>(result: Result<Value, Error>) => result is Failure<Error> = internal.isFailure
/**
 * Folds one {@link Result} into a plain value.
 *
 * Use this when you are leaving the `Result` shape and want one explicit place
 * to handle both branches.
 *
 * @example
 * ```ts
 * const label = Result.match(Vector2.result({ x: 0, y: 0 }), {
 *   onSuccess: () => "ok",
 *   onFailure: () => "invalid"
 * })
 * ```
 */
export const match: <Value, Error, SuccessReturn, FailureReturn>(
  result: Result<Value, Error>,
  handlers: {
    readonly onSuccess: (value: Value) => SuccessReturn
    readonly onFailure: (error: Error) => FailureReturn
  }
) => MatchReturn<Value, Error, SuccessReturn, FailureReturn> = internal.match
/**
 * Aggregates several independent results into one explicit result.
 *
 * Tuple input preserves tuple ordering in both success and failure shapes.
 * Record input preserves the original keys.
 *
 * The first failure stays explicit in the returned error structure rather than
 * throwing or silently dropping invalid entries.
 *
 * @example
 * ```ts
 * const geometry = Result.all({
 *   position: Vector2.result({ x: 10, y: 20 }),
 *   size: Size2.result({ width: 32, height: 16 })
 * })
 * ```
 */
export const all: <Input extends ReadonlyArray<Result<any, any>> | Readonly<Record<string, Result<any, any>>>>(
  input: Input
) => Result<AllSuccess<Input>, AllError<Input>> = internal.all
