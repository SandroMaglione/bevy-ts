import * as Result from "../Result.ts"

export type Entry<Value, Error> = Result.Result<Value, Error>

export type ResultConstructor<Value, Raw, Error> = {
  readonly result: (raw: Raw) => Result.Result<Value, Error>
}

type AnyEntry = Result.Result<any, any>

export type Entries = Readonly<Record<string, AnyEntry>>

export type SuccessOf<Input extends Entries> = {
  readonly [Key in keyof Input]:
    Input[Key] extends Result.Result<infer Value, any> ? Value : never
}

export type ErrorOf<Input extends Entries> = {
  readonly [Key in keyof Input]:
    Input[Key] extends Result.Result<any, infer Error> ? Error | null : never
}

export const entry = <Value, Raw, Error>(
  constructor: ResultConstructor<Value, Raw, Error>,
  raw: Raw
): Entry<Value, Error> => constructor.result(raw)

export const all = <Input extends Entries>(
  input: Input
): Result.Result<SuccessOf<Input>, ErrorOf<Input>> => {
  const values: Record<string, unknown> = {}
  const errors: Record<string, unknown> = {}
  let hasFailure = false

  for (const key of Object.keys(input)) {
    const entry = input[key]
    if (entry === undefined) {
      continue
    }

    if (entry.ok) {
      values[key] = entry.value
      errors[key] = null
      continue
    }

    hasFailure = true
    errors[key] = entry.error
  }

  if (hasFailure) {
    return Result.failure(errors as ErrorOf<Input>)
  }

  return Result.success(values as SuccessOf<Input>)
}
