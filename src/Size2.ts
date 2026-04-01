import type * as Brand from "./Brand.ts"
import * as internal from "./internal/size2.ts"
import type * as Result from "./Result.ts"
import type * as Scalar from "./Scalar.ts"

export type Raw = {
  readonly width: number
  readonly height: number
}

export type Size2 = Brand.Branded<{
  readonly width: Scalar.NonNegative
  readonly height: Scalar.NonNegative
}, "Size2">

export type Error = {
  readonly tag: "Size2/Invalid"
  readonly width: Scalar.Error | null
  readonly height: Scalar.Error | null
  readonly input: Raw
}

export const result: (raw: Raw) => Result.Result<Size2, Error> = internal.result
export const option: (raw: Raw) => Size2 | null = internal.option
export const is: (raw: Raw) => raw is Raw & Size2 = internal.is
export const toRaw: (size: Size2) => Raw = internal.toRaw
export const width: (size: Size2) => Scalar.NonNegative = internal.width
export const height: (size: Size2) => Scalar.NonNegative = internal.height
