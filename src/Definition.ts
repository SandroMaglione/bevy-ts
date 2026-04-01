import * as internal from "./internal/definition.ts"
import type * as Result from "./Result.ts"

export type Entry<Value, Error> = internal.Entry<Value, Error>
export type Entries = internal.Entries
export type ResultConstructor<Value, Raw, Error> = internal.ResultConstructor<Value, Raw, Error>
export type SuccessOf<Input extends Entries> = internal.SuccessOf<Input>
export type ErrorOf<Input extends Entries> = internal.ErrorOf<Input>

export const entry: <Value, Raw, Error>(
  constructor: ResultConstructor<Value, Raw, Error>,
  raw: Raw
) => Entry<Value, Error> = internal.entry

export const all: <Input extends Entries>(
  input: Input
) => Result.Result<SuccessOf<Input>, ErrorOf<Input>> = internal.all
