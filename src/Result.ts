import * as internal from "./internal/result.ts"

export type Success<out Value> = internal.Success<Value>
export type Failure<out Error> = internal.Failure<Error>
export type Result<Value, Error> = internal.Result<Value, Error>

export const success: <Value>(value: Value) => Success<Value> = internal.success
export const failure: <Error>(error: Error) => Failure<Error> = internal.failure
export const isSuccess: <Value, Error>(result: Result<Value, Error>) => result is Success<Value> = internal.isSuccess
export const isFailure: <Value, Error>(result: Result<Value, Error>) => result is Failure<Error> = internal.isFailure
