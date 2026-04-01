import * as internal from "./internal/result.ts"

export type Success<out Value> = internal.Success<Value>
export type Failure<out Error> = internal.Failure<Error>
export type Result<Value, Error> = internal.Result<Value, Error>
export type MatchReturn<
  Value,
  Error,
  SuccessReturn,
  FailureReturn
> = internal.MatchReturn<Value, Error, SuccessReturn, FailureReturn>
export type AllSuccess<Input extends ReadonlyArray<Result<any, any>> | Readonly<Record<string, Result<any, any>>>> =
  internal.AllSuccess<Input>
export type AllError<Input extends ReadonlyArray<Result<any, any>> | Readonly<Record<string, Result<any, any>>>> =
  internal.AllError<Input>

export const success: <Value>(value: Value) => Success<Value> = internal.success
export const failure: <Error>(error: Error) => Failure<Error> = internal.failure
export const isSuccess: <Value, Error>(result: Result<Value, Error>) => result is Success<Value> = internal.isSuccess
export const isFailure: <Value, Error>(result: Result<Value, Error>) => result is Failure<Error> = internal.isFailure
export const match: <Value, Error, SuccessReturn, FailureReturn>(
  result: Result<Value, Error>,
  handlers: {
    readonly onSuccess: (value: Value) => SuccessReturn
    readonly onFailure: (error: Error) => FailureReturn
  }
) => MatchReturn<Value, Error, SuccessReturn, FailureReturn> = internal.match
export const all: <Input extends ReadonlyArray<Result<any, any>> | Readonly<Record<string, Result<any, any>>>>(
  input: Input
) => Result<AllSuccess<Input>, AllError<Input>> = internal.all
