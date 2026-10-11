/**
 * Continuous collision for moving circles against static boxes and circles.
 *
 * Movement is swept, not sampled: `sweepCircleBox` finds the first time of
 * contact along the whole displacement, so fast movers (dashes, projectiles)
 * cannot skip over a wall between two steps. `moveCircle` stops at walls and
 * slides along them.
 *
 * Every query returns `undefined` for "no contact", never throws, and
 * allocates only its result. Inputs are expected to be finite.
 *
 * @example
 * ```ts
 * // Move a body by its velocity this step, sliding along the walls.
 * const moved = Collide2.moveCircle(position, Vec2.scale(velocity, dt), radius, walls)
 * if (moved.blocked) bumpedWall()
 * ```
 *
 * @module Collide2
 * @docGroup helpers
 *
 * @categoryDescription Collision Types
 * Contacts and movement results.
 *
 * @categoryDescription Queries
 * First-contact sweeps and overlap resolution.
 *
 * @categoryDescription Movement
 * Moving a circle through walls with sliding.
 */
import type { Box2 } from "./Box2.ts"
import type { Vec2 } from "./Vec2.ts"

/**
 * A contact along a sweep.
 *
 * @category Collision Types
 */
export interface Hit {
  /** Fraction of the displacement travelled before contact, in [0, 1]. */
  readonly time: number
  /** Unit contact normal, pointing away from the box. */
  readonly nx: number
  readonly ny: number
}

/**
 * Where a moved circle ended up.
 *
 * @category Collision Types
 */
export interface MoveResult {
  readonly position: Vec2
  /** Whether any wall was touched. */
  readonly blocked: boolean
}

/**
 * The distance `pushOut` and `moveCircle` keep from walls after a contact
 * (in world units), so the next sweep starts outside the wall.
 *
 * @category Movement
 */
export const defaultSkin = 0.01

/**
 * Entry time in [0, 1] of the ray from (`ox`, `oy`) along (`dx`, `dy`) into
 * the circle at (`cx`, `cy`) of radius `r`, or `undefined` on a miss (or when
 * the ray starts inside or does not move).
 *
 * @category Queries
 */
export const rayCircle = (ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, r: number): number | undefined => {
  const fx = ox - cx
  const fy = oy - cy
  const a = dx * dx + dy * dy
  const b = fx * dx + fy * dy
  const c = fx * fx + fy * fy - r * r
  if (a < 1e-12) return undefined
  const discriminant = b * b - a * c
  if (discriminant < 0) return undefined
  const t = (-b - Math.sqrt(discriminant)) / a
  return t >= 0 && t <= 1 ? t : undefined
}

/**
 * First contact of a circle of `radius` at `origin` moving by `delta` with
 * `box`, or `undefined`. Contact is computed against the box expanded by the
 * radius with rounded corners (the exact Minkowski sum), so sliding around
 * corners is smooth. A circle that starts overlapping the box is not
 * reported; resolve it with `pushOut` first.
 *
 * @category Queries
 */
export const sweepCircleBox = (origin: Vec2, delta: Vec2, radius: number, box: Box2): Hit | undefined => {
  const minX = box.minX - radius
  const minY = box.minY - radius
  const maxX = box.maxX + radius
  const maxY = box.maxY + radius
  // Slab test against the expanded box.
  let enter = 0
  let exit = 1
  let nx = 0
  let ny = 0
  if (Math.abs(delta.x) < 1e-12) {
    if (origin.x <= minX || origin.x >= maxX) return undefined
  } else {
    const inv = 1 / delta.x
    let t1 = (minX - origin.x) * inv
    let t2 = (maxX - origin.x) * inv
    let normal = -1
    if (t1 > t2) {
      const swap = t1
      t1 = t2
      t2 = swap
      normal = 1
    }
    if (t1 > enter) {
      enter = t1
      nx = normal
      ny = 0
    }
    exit = Math.min(exit, t2)
    if (enter > exit) return undefined
  }
  if (Math.abs(delta.y) < 1e-12) {
    if (origin.y <= minY || origin.y >= maxY) return undefined
  } else {
    const inv = 1 / delta.y
    let t1 = (minY - origin.y) * inv
    let t2 = (maxY - origin.y) * inv
    let normal = -1
    if (t1 > t2) {
      const swap = t1
      t1 = t2
      t2 = swap
      normal = 1
    }
    if (t1 > enter) {
      enter = t1
      nx = 0
      ny = normal
    }
    exit = Math.min(exit, t2)
    if (enter > exit) return undefined
  }
  // Contact point on the expanded box (the start, when it begins inside the
  // square expansion). In a corner region the real surface is the rounded
  // corner, so test the corner circle instead: a circle starting in a corner
  // region is still outside the box, and can only reach it through that
  // corner.
  const hx = origin.x + delta.x * enter
  const hy = origin.y + delta.y * enter
  const cornerX = hx < box.minX ? box.minX : hx > box.maxX ? box.maxX : undefined
  const cornerY = hy < box.minY ? box.minY : hy > box.maxY ? box.maxY : undefined
  if (cornerX !== undefined && cornerY !== undefined) {
    const t = rayCircle(origin.x, origin.y, delta.x, delta.y, cornerX, cornerY, radius)
    if (t === undefined) return undefined
    const cx = origin.x + delta.x * t - cornerX
    const cy = origin.y + delta.y * t - cornerY
    const len = Math.hypot(cx, cy) || 1
    return { time: t, nx: cx / len, ny: cy / len }
  }
  if (nx === 0 && ny === 0) return undefined // Started overlapping the box.
  return { time: enter, nx, ny }
}

/**
 * First contact of a moving circle with any of `boxes`, or `undefined`.
 *
 * @category Queries
 */
export const sweepCircleBoxes = (origin: Vec2, delta: Vec2, radius: number, boxes: ReadonlyArray<Box2>): Hit | undefined => {
  let first: Hit | undefined
  for (const box of boxes) {
    const hit = sweepCircleBox(origin, delta, radius, box)
    if (hit !== undefined && (first === undefined || hit.time < first.time)) first = hit
  }
  return first
}

/**
 * First time in [0, 1] at which a circle of `radius` moving from `origin` by
 * `delta` touches a circle of `targetRadius` at `target`, or `undefined`. A
 * circle that starts overlapping touches at time 0.
 *
 * @category Queries
 */
export const sweepCircleCircle = (
  origin: Vec2,
  delta: Vec2,
  radius: number,
  target: Vec2,
  targetRadius: number
): number | undefined => {
  const r = radius + targetRadius
  const dx = origin.x - target.x
  const dy = origin.y - target.y
  if (dx * dx + dy * dy <= r * r) return 0
  return rayCircle(origin.x, origin.y, delta.x, delta.y, target.x, target.y, r)
}

/**
 * Pushes a circle out of every box it overlaps, in order, leaving `skin`
 * between it and each wall. Returns the corrected center.
 *
 * @category Movement
 */
export const pushOut = (center: Vec2, radius: number, boxes: ReadonlyArray<Box2>, skin: number = defaultSkin): Vec2 => {
  let x = center.x
  let y = center.y
  for (const box of boxes) {
    const closestX = Math.max(box.minX, Math.min(x, box.maxX))
    const closestY = Math.max(box.minY, Math.min(y, box.maxY))
    const dx = x - closestX
    const dy = y - closestY
    const distanceSquared = dx * dx + dy * dy
    if (distanceSquared >= radius * radius) continue
    if (distanceSquared > 1e-12) {
      const distance = Math.sqrt(distanceSquared)
      x = closestX + (dx / distance) * (radius + skin)
      y = closestY + (dy / distance) * (radius + skin)
    } else {
      // Center inside the box: leave through the nearest side.
      const left = x - box.minX
      const right = box.maxX - x
      const top = y - box.minY
      const bottom = box.maxY - y
      const nearest = Math.min(left, right, top, bottom)
      if (nearest === left) x = box.minX - radius - skin
      else if (nearest === right) x = box.maxX + radius + skin
      else if (nearest === top) y = box.minY - radius - skin
      else y = box.maxY + radius + skin
    }
  }
  return { x, y }
}

/**
 * Moves a circle by `delta`, stopping at walls and sliding along them (up to
 * four contacts per call). The whole path is swept, so no displacement can
 * tunnel through a wall. A circle that starts inside a wall is pushed out
 * first. A circle meeting a box's corner dead-on goes around it rather than
 * stopping against it.
 *
 * @category Movement
 */
export const moveCircle = (start: Vec2, delta: Vec2, radius: number, boxes: ReadonlyArray<Box2>, skin: number = defaultSkin): MoveResult => {
  let position = pushOut(start, radius, boxes, skin)
  let rx = delta.x
  let ry = delta.y
  let blocked = false
  for (let iteration = 0; iteration < 4; iteration++) {
    if (rx * rx + ry * ry < 1e-12) break
    const hit = sweepCircleBoxes(position, { x: rx, y: ry }, radius, boxes)
    if (hit === undefined) {
      position = { x: position.x + rx, y: position.y + ry }
      break
    }
    blocked = true
    position = {
      x: position.x + rx * hit.time + hit.nx * skin,
      y: position.y + ry * hit.time + hit.ny * skin
    }
    // Slide: keep the remaining movement tangent to the contact.
    const remaining = 1 - hit.time
    rx *= remaining
    ry *= remaining
    const into = rx * hit.nx + ry * hit.ny
    if (into < 0) {
      rx -= into * hit.nx
      ry -= into * hit.ny
      // Dead-on into a rounded corner (as an exact diagonal meets an
      // axis-aligned box) nothing is left to slide along: go around the
      // corner instead of stopping against it.
      if (hit.nx !== 0 && hit.ny !== 0 && rx * rx + ry * ry < 1e-12 * into * into) {
        const side = rx * -hit.ny + ry * hit.nx < 0 ? -1 : 1
        rx = -hit.ny * -into * side
        ry = hit.nx * -into * side
      }
    }
  }
  return { position, blocked }
}
