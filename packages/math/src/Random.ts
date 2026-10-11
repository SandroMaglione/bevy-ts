/**
 * Deterministic random numbers (mulberry32) whose whole state is one 32-bit
 * integer.
 *
 * Keep the state in a resource, so a run replays exactly and saves with the
 * world: a system makes a generator from the stored state, draws from it,
 * then writes `random.state` back. Two generators made from the same state
 * draw the same sequence on every platform.
 *
 * @example
 * ```ts
 * const random = Random.make(resources.rng.get().state)
 * const angle = random.range(0, Math.PI * 2)
 * const kind = random.pick(kinds) ?? "grunt"
 * resources.rng.set({ state: random.state })
 * ```
 *
 * @module Random
 * @docGroup helpers
 *
 * @categoryDescription Random Types
 * The generator interface.
 *
 * @categoryDescription Construction
 * Making a generator from a stored state.
 */

/**
 * A generator. Every draw advances `state`.
 *
 * @category Random Types
 */
export interface Random {
  /** The current state: an unsigned 32-bit integer. Store it to continue the sequence later. */
  readonly state: number
  /** Uniform in [0, 1). */
  next(): number
  /** Uniform in [min, max). */
  range(min: number, max: number): number
  /** A uniform integer in [min, maxExclusive); both bounds are integers with min < maxExclusive. */
  integer(min: number, maxExclusive: number): number
  /** A uniform element of `items`, or `undefined` when it is empty (no draw is made then). */
  pick<A>(items: ReadonlyArray<A>): A | undefined
  /** A shuffled copy of `items` (Fisher–Yates). */
  shuffle<A>(items: ReadonlyArray<A>): Array<A>
  /**
   * An element of `items` chosen with probability proportional to `weight`,
   * or `undefined` when no element has a positive finite weight (no draw is
   * made then). Elements with zero, negative, or non-finite weight are never
   * chosen.
   */
  weighted<A>(items: ReadonlyArray<A>, weight: (item: A) => number): A | undefined
}

const usable = (weight: number): boolean => weight > 0 && weight < Infinity

class Mulberry32 implements Random {
  state: number

  constructor(state: number) {
    this.state = state >>> 0
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  integer(min: number, maxExclusive: number): number {
    return min + Math.floor(this.next() * (maxExclusive - min))
  }

  pick<A>(items: ReadonlyArray<A>): A | undefined {
    return items.length === 0 ? undefined : items[Math.floor(this.next() * items.length)]
  }

  shuffle<A>(items: ReadonlyArray<A>): Array<A> {
    const shuffled = items.slice()
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = Math.floor(this.next() * (index + 1))
      const swap = shuffled[index]!
      shuffled[index] = shuffled[other]!
      shuffled[other] = swap
    }
    return shuffled
  }

  weighted<A>(items: ReadonlyArray<A>, weight: (item: A) => number): A | undefined {
    let total = 0
    for (const item of items) {
      const value = weight(item)
      if (usable(value)) total += value
    }
    if (!usable(total)) return undefined
    let roll = this.next() * total
    let last: A | undefined
    for (const item of items) {
      const value = weight(item)
      if (!usable(value)) continue
      last = item
      roll -= value
      if (roll < 0) return item
    }
    // Rounding can leave a sliver of the roll past the last bucket.
    return last
  }
}

/**
 * A generator continuing from `state`. Any number is accepted and reduced to
 * an unsigned 32-bit integer (`state >>> 0`), so a stored state round-trips
 * exactly.
 *
 * @category Construction
 */
export const make = (state: number): Random => new Mulberry32(state)
