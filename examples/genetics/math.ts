export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

export const lerp = (start: number, end: number, amount: number): number =>
  start + (end - start) * amount

export const normalizeXYOrZero = (x: number, y: number): {
  readonly x: number
  readonly y: number
  readonly length: number
} => {
  const magnitude = Math.hypot(x, y)
  if (magnitude <= 0.0001) {
    return {
      x: 0,
      y: 0,
      length: 0
    }
  }

  return {
    x: x / magnitude,
    y: y / magnitude,
    length: magnitude
  }
}
