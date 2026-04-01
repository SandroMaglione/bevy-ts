import { Aabb, InputAxis, Result, Scalar, Size2, Vector2 } from "../src/index.ts"
import { describe, expect, it } from "tstyche"

describe("helpers", () => {
  it("constructors accept raw structural values", () => {
    const vector = Vector2.result({ x: 1, y: 2 })
    const size = Size2.result({ width: 3, height: 4 })
    const finite = Scalar.Finite.result(1)

    expect(vector).type.toBe<Result.Result<Vector2.Vector2, Vector2.Error>>()
    expect(size).type.toBe<Result.Result<Size2.Size2, Size2.Error>>()
    expect(finite).type.toBe<Result.Result<Scalar.Finite, Scalar.Error>>()
  })

  it("non-constructor helpers require branded values", () => {
    const vector = Vector2.option({ x: 1, y: 2 })
    const size = Size2.option({ width: 3, height: 4 })

    if (!vector || !size) {
      return
    }

    expect(Vector2.length(vector)).type.toBe<Scalar.NonNegative>()
    expect(Aabb.option({ position: vector, size })).type.toBe<Aabb.Aabb | null>()

    // @ts-expect-error!
    Vector2.length({ x: 1, y: 2 })

    // @ts-expect-error!
    Aabb.translate({ position: vector, size }, vector)
  })

  it("axis helpers preserve the narrow axis union", () => {
    const horizontal = InputAxis.axis(true, false)
    expect(horizontal).type.toBe<InputAxis.Axis>()
  })
})
