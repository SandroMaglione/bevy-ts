export type Success<out Value> = {
  readonly ok: true
  readonly value: Value
}

export type Failure<out Error> = {
  readonly ok: false
  readonly error: Error
}

export type Result<Value, Error> = Success<Value> | Failure<Error>

export const success = <Value>(value: Value): Success<Value> => ({
  ok: true,
  value
})

export const failure = <Error>(error: Error): Failure<Error> => ({
  ok: false,
  error
})

export const isSuccess = <Value, Error>(result: Result<Value, Error>): result is Success<Value> => result.ok

export const isFailure = <Value, Error>(result: Result<Value, Error>): result is Failure<Error> => !result.ok
