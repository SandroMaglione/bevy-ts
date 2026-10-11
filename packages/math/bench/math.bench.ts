/**
 * Runtime benchmark cases for validated math values.
 *
 * These run inside per-entity systems every frame, so each case does the work
 * of one frame over many entities. Cases use only the public API and fold
 * their results into a checked sum so the work cannot be optimized away.
 */
import type { BenchCase } from "../../core/bench/harness.ts"
import { Aabb, InputAxis, Scalar, Vector2 } from "@typeonce/bevy-ts-math"

const N = 10_000

const check = (total: number): void => {
  if (Number.isNaN(total)) throw new Error("benchmark produced NaN")
}

const vectors = (count: number): Array<Vector2.Vector2> =>
  Array.from({ length: count }, (_, index) => Vector2.option({ x: (index % 97) - 48, y: (index % 89) - 44 })!)

const vectorOps: BenchCase = {
  name: "math/vector2-move-10k",
  description: "Steer, normalize, scale, and integrate 10k positions, as in a movement system",
  setup: () => {
    const positions = vectors(N)
    const targets = vectors(N).reverse()
    const speed = Scalar.Finite.option(2.5)!
    return {
      run: () => {
        let total = 0
        for (let index = 0; index < N; index++) {
          const position = positions[index]!
          const direction = Vector2.normalizeOrZero(Vector2.subtract(targets[index]!, position))
          const next = Vector2.add(position, Vector2.scale(direction, speed))
          total += Vector2.length(next)
        }
        check(total)
      }
    }
  }
}

const vectorValidate: BenchCase = {
  name: "math/vector2-validate-10k",
  description: "Validate 10k raw vectors (1 in 100 invalid) through the result constructor",
  setup: () => {
    const raws = Array.from({ length: N }, (_, index) => ({
      x: index % 100 === 0 ? Number.NaN : index,
      y: index * 0.5
    }))
    return {
      run: () => {
        let total = 0
        for (let index = 0; index < N; index++) {
          const vector = Vector2.result(raws[index]!)
          total += vector.ok ? vector.value.y : -1
        }
        check(total)
      }
    }
  }
}

const scalarOps: BenchCase = {
  name: "math/scalar-approach-clamp-10k",
  description: "Approach a target speed and clamp it for 10k values, as in acceleration code",
  setup: () => {
    const speeds = Array.from({ length: N }, (_, index) => Scalar.Finite.option(index % 13)!)
    const target = Scalar.Finite.option(6)!
    const step = Scalar.NonNegative.option(0.75)!
    const min = Scalar.Finite.option(0)!
    const max = Scalar.Finite.option(10)!
    return {
      run: () => {
        let total = 0
        for (let index = 0; index < N; index++) {
          total += Scalar.clamp(Scalar.approach(speeds[index]!, target, step), min, max)
        }
        check(total)
      }
    }
  }
}

const aabbOverlap: BenchCase = {
  name: "math/aabb-intersects-200x200",
  description: "All-pairs intersection tests between 200 movers and 200 obstacles, plus translation",
  setup: () => {
    const boxes = (count: number, offset: number) => Array.from({ length: count }, (_, index) => Aabb.option({
      position: { x: (index % 20) * 16 + offset, y: Math.floor(index / 20) * 16 + offset },
      size: { width: 12, height: 12 }
    })!)
    const movers = boxes(200, 0)
    const obstacles = boxes(200, 6)
    const delta = Vector2.option({ x: 0.5, y: -0.5 })!
    return {
      run: () => {
        let hits = 0
        for (let index = 0; index < movers.length; index++) {
          const moved = Aabb.translate(movers[index]!, delta)
          for (let other = 0; other < obstacles.length; other++) {
            if (Aabb.intersects(moved, obstacles[other]!)) hits++
          }
        }
        check(hits)
      }
    }
  }
}

const inputAxis: BenchCase = {
  name: "math/input-axis-10k",
  description: "Turn 10k directional key states into normalized movement vectors",
  setup: () => {
    const inputs = Array.from({ length: N }, (_, index) => ({
      left: (index & 1) !== 0,
      right: (index & 2) !== 0,
      up: (index & 4) !== 0,
      down: (index & 8) !== 0
    }))
    return {
      run: () => {
        let total = 0
        for (let index = 0; index < N; index++) {
          const direction = InputAxis.vectorFromAxes(inputs[index]!)
          total += direction.x + direction.y
        }
        check(total)
      }
    }
  }
}

export const cases: ReadonlyArray<BenchCase> = [
  vectorOps,
  vectorValidate,
  scalarOps,
  aabbOverlap,
  inputAxis
]
