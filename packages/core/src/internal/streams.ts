/**
 * Keyed append-only message logs read per reader, like change detection.
 *
 * Each batch is stamped with the change tick at which it was published. A
 * reader asks for the batches stamped after its previous completed run, so
 * every reader sees every message once, in publish order, without a schedule
 * marker.
 *
 * Retention: a batch is kept for at least the current and previous frame, and
 * beyond that until every registered reader of its key has read past it. So a
 * system in a schedule ticked less often than others (a fixed update driven
 * at a lower rate than rendering) still receives everything. A reader that
 * stops running would keep batches alive forever, so each key also has a
 * capacity; past it the oldest batches are dropped and the readers that had
 * not seen them report `lagged`.
 */
interface Log<T> {
  readonly ticks: Array<number>
  /** Batches are never mutated after `append`, so single-batch reads return them uncopied. */
  readonly batches: Array<ReadonlyArray<T>>
  size: number
  /** Newest tick of any dropped batch. */
  droppedThrough: number
}

/**
 * A registered reader's position: the tick of its previous completed run.
 */
export interface Cursor {
  readonly streamLastRun: number
}

const noValues: ReadonlyArray<never> = []

export interface Streams<T> {
  /** Makes `cursor` hold `key`'s batches until it has read them. */
  register(key: symbol, cursor: Cursor): void
  /** Publishes `values` as one batch; the array must not be mutated afterwards. */
  append(key: symbol, tick: number, values: ReadonlyArray<T>): void
  /** Values for `key` stamped after `since`, oldest first. */
  since(key: symbol, since: number): ReadonlyArray<T>
  /**
   * Whether values for `key` stamped after `since` (and after `registeredAt`,
   * when the reader started) were dropped before being read.
   */
  lagged(key: symbol, since: number, registeredAt: number): boolean
  /**
   * Drops batches stamped at or before `windowBoundary` that every registered
   * reader has read, then enforces the capacity.
   */
  trim(windowBoundary: number): void
  clear(): void
}

export const make = <T>(capacity: number): Streams<T> => {
  const logs = new Map<symbol, Log<T>>()
  const readers = new Map<symbol, Set<Cursor>>()

  const firstAfter = (ticks: ReadonlyArray<number>, since: number): number => {
    let low = 0
    let high = ticks.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (ticks[middle]! > since) high = middle
      else low = middle + 1
    }
    return low
  }

  const logFor = (key: symbol): Log<T> => {
    let log = logs.get(key)
    if (log === undefined) {
      log = { ticks: [], batches: [], size: 0, droppedThrough: 0 }
      logs.set(key, log)
    }
    return log
  }

  const dropFront = (log: Log<T>, count: number): void => {
    if (count === 0) return
    for (let index = 0; index < count; index++) log.size -= log.batches[index]!.length
    log.droppedThrough = Math.max(log.droppedThrough, log.ticks[count - 1]!)
    log.ticks.splice(0, count)
    log.batches.splice(0, count)
  }

  return {
    register(key, cursor) {
      let set = readers.get(key)
      if (set === undefined) {
        set = new Set()
        readers.set(key, set)
      }
      set.add(cursor)
    },
    append(key, tick, values) {
      if (values.length === 0) return
      const log = logFor(key)
      log.ticks.push(tick)
      log.batches.push(values)
      log.size += values.length
    },
    since(key, since) {
      const log = logs.get(key)
      if (log === undefined) return noValues
      const start = firstAfter(log.ticks, since)
      const count = log.batches.length - start
      if (count === 0) return noValues
      if (count === 1) return log.batches[start]!
      const values: Array<T> = []
      for (let index = start; index < log.batches.length; index++) {
        const batch = log.batches[index]!
        for (let offset = 0; offset < batch.length; offset++) values.push(batch[offset]!)
      }
      return values
    },
    lagged(key, since, registeredAt) {
      const log = logs.get(key)
      return log !== undefined && log.droppedThrough > Math.max(since, registeredAt)
    },
    trim(windowBoundary) {
      for (const [key, log] of logs) {
        let boundary = windowBoundary
        const cursors = readers.get(key)
        if (cursors !== undefined) {
          for (const cursor of cursors) boundary = Math.min(boundary, cursor.streamLastRun)
        }
        dropFront(log, firstAfter(log.ticks, boundary))
        let overflow = 0
        let size = log.size
        while (size > capacity && overflow < log.batches.length) {
          size -= log.batches[overflow]!.length
          overflow++
        }
        dropFront(log, overflow)
      }
    },
    clear() {
      logs.clear()
    }
  }
}
