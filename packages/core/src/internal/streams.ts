/**
 * Keyed append-only message logs read per reader, like change detection.
 *
 * Each entry is stamped with the change tick at which it became visible. A
 * reader asks for the entries stamped after its previous completed run, so
 * every reader sees every message once, in emission order, without a
 * schedule marker. Entries older than the previous frame are dropped (see
 * `trim`), the same retention as removed and despawned logs.
 */
/**
 * One batch per publish (a committed system's emits, a transition, a relation
 * failure). Batches are never mutated after `append`, so a read covering a
 * single batch returns it without copying.
 */
interface Log<T> {
  readonly ticks: Array<number>
  readonly batches: Array<ReadonlyArray<T>>
}

const noValues: ReadonlyArray<never> = []

export interface Streams<T> {
  /** Publishes `values` as one batch; the array must not be mutated afterwards. */
  append(key: symbol, tick: number, values: ReadonlyArray<T>): void
  /** Entries for `key` stamped after `since`, oldest first. */
  since(key: symbol, since: number): ReadonlyArray<T>
  /** Drops entries stamped at or before `boundary`. */
  trim(boundary: number): void
  clear(): void
}

export const make = <T>(): Streams<T> => {
  const logs = new Map<symbol, Log<T>>()

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

  return {
    append(key, tick, values) {
      if (values.length === 0) return
      let log = logs.get(key)
      if (log === undefined) {
        log = { ticks: [], batches: [] }
        logs.set(key, log)
      }
      log.ticks.push(tick)
      log.batches.push(values)
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
    trim(boundary) {
      for (const [key, log] of logs) {
        const count = firstAfter(log.ticks, boundary)
        if (count === log.ticks.length) {
          logs.delete(key)
        } else if (count > 0) {
          log.ticks.splice(0, count)
          log.batches.splice(0, count)
        }
      }
    },
    clear() {
      logs.clear()
    }
  }
}
