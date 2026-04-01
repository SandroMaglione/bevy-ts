import * as internal from "./internal/brand.ts"

export type Brand<Key> = internal.PublicBrand<Key>
export type Branded<Value, Key> = internal.Branded<Value, Key>

export interface Constructor<Value, Raw, Error> {
  readonly result: (raw: Raw) => import("./Result.ts").Result<Value, Error>
  readonly option: (raw: Raw) => Value | null
  readonly is: (raw: Raw) => raw is Raw & Value
}

export const refine: <Value, Raw, Error>(
  validate: (raw: Raw) => import("./Result.ts").Result<Value, Error>
) => Constructor<Value, Raw, Error> = internal.refine

export const all: <Value, Raw, ErrorA, ErrorB>(
  left: Constructor<Value, Raw, ErrorA>,
  right: Constructor<Value, Raw, ErrorB>
) => Constructor<Value, Raw, readonly [ErrorA, ErrorB]> = internal.all
