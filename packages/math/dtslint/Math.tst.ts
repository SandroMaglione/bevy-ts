import { Definition, Result } from "@typeonce/bevy-ts"
import { Aabb, Angle, Direction2, InputAxis, Scalar, Size2, Vector2 } from "@typeonce/bevy-ts-math"
import { describe, expect, it } from "tstyche"

describe("helpers", () => {
  it("result helpers preserve tuple and record shapes", () => {
    const tuple = Result.all([
      Result.success(1),
      Result.failure("invalid" as const),
      Result.success(true)
    ] as const)

    expect(tuple).type.toBe<Result.Result<readonly [number, never, boolean], "invalid">>()

    const record = Result.all({
      position: Vector2.result({ x: 1, y: 2 }),
      size: Size2.result({ width: 3, height: 4 })
    })

    expect(record).type.toBe<Result.Result<{
      readonly position: Vector2.Vector2
      readonly size: Size2.Size2
    }, Vector2.Error | Size2.Error>>()
  })

  it("result match infers handler inputs", () => {
    const matched = Result.match(Vector2.result({ x: 1, y: 2 }), {
      onSuccess: (value) => Vector2.length(value),
      onFailure: (error) => error.tag
    })

    expect(matched).type.toBe<Result.Result<Scalar.NonNegative, Scalar.ArithmeticError> | Vector2.Error["tag"]>()
  })

  it("constructors accept raw structural values", () => {
    const vector = Vector2.result({ x: 1, y: 2 })
    const size = Size2.result({ width: 3, height: 4 })
    const finite = Scalar.Finite.result(1)

    expect(vector).type.toBe<Result.Result<Vector2.Vector2, Vector2.Error>>()
    expect(size).type.toBe<Result.Result<Size2.Size2, Size2.Error>>()
    expect(finite).type.toBe<Result.Result<Scalar.Finite, Scalar.Error>>()
  })

  it("scalar interpolation helpers preserve branded results", () => {
    const start = Scalar.Finite.result(0)
    const end = Scalar.Finite.result(10)
    const value = Scalar.Finite.result(5)

    if (!start.ok || !end.ok || !value.ok) {
      return
    }

    expect(Scalar.lerp(start.value, end.value, value.value)).type.toBe<Result.Result<Scalar.Finite, Scalar.ArithmeticError>>()
    expect(Scalar.inverseLerp(start.value, end.value, value.value)).type.toBe<
      Result.Result<Scalar.Finite, Scalar.InterpolationError | Scalar.ArithmeticError>
    >()
    expect(Scalar.remap(value.value, start.value, end.value, start.value, end.value)).type.toBe<
      Result.Result<Scalar.Finite, Scalar.InterpolationError | Scalar.ArithmeticError>
    >()
  })

  it("definition helpers preserve keyed success and failure shapes", () => {
    const definitions = Definition.all({
      position: Definition.entry(Vector2, { x: 1, y: 2 }),
      size: Definition.entry(Size2, { width: 3, height: 4 })
    })

    expect(definitions).type.toBe<Result.Result<{
      readonly position: Vector2.Vector2
      readonly size: Size2.Size2
    }, {
      readonly position: Vector2.Error | null
      readonly size: Size2.Error | null
    }>>()
  })

  it("non-constructor helpers require branded values", () => {
    const vector = Vector2.option({ x: 1, y: 2 })
    const size = Size2.option({ width: 3, height: 4 })

    if (!vector || !size) {
      return
    }

    expect(Vector2.length(vector)).type.toBe<Result.Result<Scalar.NonNegative, Scalar.ArithmeticError>>()
    expect(Aabb.option({ position: vector, size })).type.toBe<Aabb.Aabb | null>()

    // @ts-expect-error Type 'number' is not assignable to type 'PublicBrand<"Scalar/Finite">'.
    Vector2.length({ x: 1, y: vector.y })

    // @ts-expect-error Property '[internal.token]' is missing
    Aabb.translate({ position: vector, size }, vector)
  })

  it("axis helpers preserve the narrow axis union", () => {
    const horizontal = InputAxis.axis(true, false)
    expect(horizontal).type.toBe<InputAxis.Axis>()
  })

  it("carries scalar refinements and the uncertainty of range arithmetic", () => {
    const finite = Scalar.Finite.result(1)
    const positive = Scalar.Positive.result(1)
    const nonNegative = Scalar.NonNegative.result(0)
    const fraction = Scalar.Fraction.result(0.5)
    expect(positive).type.toBe<Result.Result<Scalar.Positive, Scalar.Error>>()
    expect(nonNegative).type.toBe<Result.Result<Scalar.NonNegative, Scalar.Error>>()
    expect(fraction).type.toBe<Result.Result<Scalar.Fraction, Scalar.Error>>()
    if (!finite.ok || !positive.ok || !nonNegative.ok || !fraction.ok) return
    expect(positive.value).type.toBeAssignableTo<Scalar.NonNegative>()
    expect(positive.value).type.toBeAssignableTo<Scalar.Finite>()
    expect(nonNegative.value).type.toBeAssignableTo<Scalar.Finite>()
    expect(fraction.value).type.toBeAssignableTo<Scalar.NonNegative>()
    expect(Scalar.clamp(fraction.value, nonNegative.value, positive.value)).type.toBe<Result.Result<Scalar.Finite, Scalar.RangeError>>()
    expect(Scalar.approach(finite.value, fraction.value, positive.value)).type.toBe<Scalar.Finite>()
    expect(Scalar.clamp).type.not.toBeCallableWith(0, finite.value, finite.value)
    expect(Scalar.lerp).type.not.toBeCallableWith(finite.value, finite.value, 0.5)
    expect(Scalar.inverseLerp).type.not.toBeCallableWith(finite.value, 1, finite.value)
    expect(Scalar.remap).type.not.toBeCallableWith(finite.value, finite.value, finite.value, 0, finite.value)
    expect(Scalar.approach).type.not.toBeCallableWith(finite.value, finite.value, finite.value)
  })

  it("infers every vector arithmetic result and requires the right numeric constraints", () => {
    const vector = Vector2.zero()
    const finite = Scalar.Finite.result(1)
    const limit = Scalar.NonNegative.result(1)
    if (!finite.ok || !limit.ok) return
    const vectorResult = Vector2.add(vector, vector)
    expect(vectorResult).type.toBe<Result.Result<Vector2.Vector2, Scalar.ArithmeticError>>()
    expect(Vector2.subtract(vector, vector)).type.toBe<Result.Result<Vector2.Vector2, Scalar.ArithmeticError>>()
    expect(Vector2.scale(vector, finite.value)).type.toBe<Result.Result<Vector2.Vector2, Scalar.ArithmeticError>>()
    expect(Vector2.lengthSquared(vector)).type.toBe<Result.Result<Scalar.NonNegative, Scalar.ArithmeticError>>()
    expect(Vector2.distance(vector, vector)).type.toBe<Result.Result<Scalar.NonNegative, Scalar.ArithmeticError>>()
    expect(Vector2.distanceSquared(vector, vector)).type.toBe<Result.Result<Scalar.NonNegative, Scalar.ArithmeticError>>()
    expect(Vector2.dot(vector, vector)).type.toBe<Result.Result<Scalar.Finite, Scalar.ArithmeticError>>()
    expect(Vector2.rotate(vector, finite.value)).type.toBe<Result.Result<Vector2.Vector2, Scalar.ArithmeticError>>()
    expect(Vector2.lerp(vector, vector, finite.value)).type.toBe<Result.Result<Vector2.Vector2, Scalar.ArithmeticError>>()
    expect(Vector2.moveToward(vector, vector, limit.value)).type.toBe<Result.Result<Vector2.Vector2, Scalar.ArithmeticError>>()
    expect(Vector2.clampLength(vector, limit.value)).type.toBe<Result.Result<Vector2.Vector2, Scalar.ArithmeticError>>()
    expect(Vector2.normalizeOr(vector, vector)).type.toBe<Vector2.Vector2>()
    const raw = { x: 0, y: 0 }
    expect(Vector2.add).type.not.toBeCallableWith(raw, vector)
    expect(Vector2.subtract).type.not.toBeCallableWith(vector, raw)
    expect(Vector2.scale).type.not.toBeCallableWith(vector, 1)
    expect(Vector2.lengthSquared).type.not.toBeCallableWith(raw)
    expect(Vector2.distance).type.not.toBeCallableWith(raw, vector)
    expect(Vector2.distanceSquared).type.not.toBeCallableWith(vector, raw)
    expect(Vector2.dot).type.not.toBeCallableWith(raw, vector)
    expect(Vector2.rotate).type.not.toBeCallableWith(vector, 1)
    expect(Vector2.lerp).type.not.toBeCallableWith(vector, vector, 0.5)
    expect(Vector2.moveToward).type.not.toBeCallableWith(vector, vector, finite.value)
    expect(Vector2.clampLength).type.not.toBeCallableWith(vector, finite.value)
    expect(Vector2.normalizeOr).type.not.toBeCallableWith(vector, raw)
  })

  it("separates directions, vectors, and raw radians", () => {
    const direction = Direction2.result({ x: 3, y: 4 })
    expect(direction).type.toBe<Result.Result<Direction2.Direction2, Direction2.Error>>()
    expect(Direction2.decode(null)).type.toBe<Result.Result<Direction2.Direction2, Direction2.Error | Direction2.DecodeError>>()
    expect(Direction2.result).type.not.toBeCallableWith({ x: 1 })
    const angle = Angle.result(1)
    expect(angle).type.toBe<Result.Result<Angle.Radians, Angle.Error>>()
    expect(Angle.decode(null)).type.toBe<Result.Result<Angle.Radians, Angle.Error | Angle.DecodeError>>()
    expect(Angle.result).type.not.toBeCallableWith("1")
    if (!direction.ok || !angle.ok) return
    expect(Direction2.toVector(direction.value)).type.toBe<Vector2.Vector2>()
    expect(Direction2.normalizeOr(Vector2.zero(), direction.value)).type.toBe<Direction2.Direction2>()
    expect(Direction2.toVector).type.not.toBeCallableWith(Vector2.zero())
    expect(Direction2.normalizeOr).type.not.toBeCallableWith(Vector2.zero(), Vector2.zero())
    expect(Angle.wrap(angle.value)).type.toBe<Angle.Radians>()
    expect(Angle.difference(angle.value, angle.value)).type.toBe<Angle.Radians>()
    expect(Angle.wrap).type.not.toBeCallableWith(1)
    expect(Angle.difference).type.not.toBeCallableWith(angle.value, 1)
  })

  it("keeps AABB translation fallible for both coordinate and edge overflow", () => {
    const box = Aabb.result({ position: { x: 0, y: 0 }, size: { width: 2, height: 2 } })
    if (!box.ok) return
    expect(Aabb.translate(box.value, Vector2.zero())).type.toBe<Result.Result<Aabb.Aabb, Aabb.Error | Scalar.ArithmeticError>>()
    expect(Aabb.translate).type.not.toBeCallableWith(box.value, { x: 0, y: 0 })
  })
})
