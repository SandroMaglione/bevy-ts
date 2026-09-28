import * as Result from "@typeonce/bevy-ts/Result"
import * as Scalar from "../Scalar.ts"
import type * as Size2 from "../Size2.ts"

const make = (width: Scalar.NonNegative, height: Scalar.NonNegative): Size2.Size2 =>
  ({ width, height }) as Size2.Size2

export const result = (raw: Size2.Raw): Result.Result<Size2.Size2, Size2.Error> => {
  const width = Scalar.NonNegative.result(raw.width)
  const height = Scalar.NonNegative.result(raw.height)
  if (!width.ok || !height.ok) {
    return Result.failure({
      tag: "Size2/Invalid",
      width: width.ok ? null : width.error,
      height: height.ok ? null : height.error,
      input: {
        width: raw.width,
        height: raw.height
      }
    })
  }

  return Result.success(make(width.value, height.value))
}

export const option = (raw: Size2.Raw): Size2.Size2 | null => {
  const next = result(raw)
  return next.ok ? next.value : null
}

export const is = (raw: Size2.Raw): raw is Size2.Raw & Size2.Size2 => result(raw).ok

export const toRaw = (size: Size2.Size2): Size2.Raw => ({
  width: size.width,
  height: size.height
})

export const width = (size: Size2.Size2): Scalar.NonNegative => size.width
export const height = (size: Size2.Size2): Scalar.NonNegative => size.height

/**
 * Shape check for untrusted input; values are validated by `result`.
 */
export const isRawShape = (raw: unknown): raw is Size2.Raw =>
  typeof raw === "object" && raw !== null && typeof (raw as Record<string, unknown>)["width"] === "number" && typeof (raw as Record<string, unknown>)["height"] === "number"

export const decode = (raw: unknown): Result.Result<Size2.Size2, Size2.Error | Size2.DecodeError> =>
  isRawShape(raw) ? result(raw) : Result.failure({ tag: "Size2/Malformed", input: raw })
