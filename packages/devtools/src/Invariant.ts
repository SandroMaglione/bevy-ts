/**
 * Named world checks evaluated after every frame of a session run.
 *
 * A check returns a message describing the violation, or `undefined` when the
 * invariant holds. Read the world through `runtime.inspect(...)` with a
 * `Game.Inspector`, so the check stays typed and read-only.
 *
 * @module Invariant
 * @docGroup devtools
 *
 * @example
 * ```ts
 * const PlayerInsideWorld = Invariant.make("player inside world", () => {
 *   for (const position of runtime.inspect(PlayerPositions)) {
 *     if (position.x < 0 || position.x > WORLD_WIDTH) return `player at x=${position.x}`
 *   }
 *   return undefined
 * })
 * ```
 */

export interface Invariant {
  readonly name: string
  /** A violation message, or `undefined` when the invariant holds. */
  readonly check: () => string | undefined
}

export const make = (name: string, check: () => string | undefined): Invariant => ({ name, check })
