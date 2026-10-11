/**
 * Minimal benchmark harness shared by the runtime benchmark suite.
 *
 * Each case builds its world once, then times `run()` repeatedly.
 * `prepare()` runs before every `run()` and is not timed, so cases that consume
 * world state (spawn, despawn) can rebuild it without polluting the result.
 *
 * Timings of very short runs are dominated by timer resolution and scheduler
 * jitter, so cases without `prepare()` repeat `run()` inside one sample until
 * the sample lasts at least `minSampleMs`; the sample is the mean per run.
 */
export interface BenchCase {
  readonly name: string
  readonly description: string
  readonly setup: () => BenchInstance
}

export interface BenchInstance {
  readonly prepare?: () => void
  readonly run: () => void
}

export interface BenchSample {
  readonly name: string
  readonly description: string
  readonly medianMs: number
  readonly minMs: number
  readonly samples: number
  readonly runsPerSample: number
}

export interface MeasureOptions {
  readonly warmupMs: number
  readonly budgetMs: number
  readonly minSamples: number
  readonly maxSamples: number
  readonly minSampleMs: number
  /** Minimum samples for cases with `prepare()`, which time one run per sample. */
  readonly minPreparedSamples: number
}

const collectGarbage = (): void => {
  const gc = (globalThis as { gc?: () => void }).gc
  if (gc) gc()
}

const median = (values: ReadonlyArray<number>): number => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

export const measure = (bench: BenchCase, options: MeasureOptions): BenchSample => {
  const instance = bench.setup()
  const prepare = instance.prepare
  const run = instance.run
  const timeBatch = (runs: number): number => {
    const start = performance.now()
    for (let index = 0; index < runs; index++) run()
    return (performance.now() - start) / runs
  }
  // Allocation-heavy prepared cases otherwise pay for whatever garbage the
  // previous run left, at a random point inside the timed region.
  const timePrepared = (): number => {
    prepare!()
    collectGarbage()
    const start = performance.now()
    run()
    return performance.now() - start
  }

  let runsPerSample = 1
  const warmupEnd = performance.now() + options.warmupMs
  if (prepare) {
    while (performance.now() < warmupEnd) timePrepared()
  } else {
    while (performance.now() < warmupEnd) {
      const perRun = timeBatch(runsPerSample)
      if (perRun * runsPerSample < options.minSampleMs) {
        runsPerSample = Math.max(runsPerSample, Math.ceil(options.minSampleMs / Math.max(perRun, 0.001)))
      }
    }
  }
  // A run long enough to fill a sample alone allocates enough that a collection
  // landing inside it decides the timing; collect before each one instead.
  const timeOne = prepare
    ? timePrepared
    : runsPerSample === 1
      ? () => {
        collectGarbage()
        return timeBatch(1)
      }
      : () => timeBatch(runsPerSample)

  collectGarbage()
  const samples: Array<number> = []
  const budgetEnd = performance.now() + options.budgetMs
  const minSamples = prepare ? options.minPreparedSamples : options.minSamples
  while (
    samples.length < minSamples
    || (samples.length < options.maxSamples && performance.now() < budgetEnd)
  ) {
    samples.push(timeOne())
  }

  return {
    name: bench.name,
    description: bench.description,
    medianMs: median(samples),
    minMs: Math.min(...samples),
    samples: samples.length,
    runsPerSample
  }
}

/**
 * Plain JavaScript work every score is divided by, so scores compare across
 * machines and across runs on a busy machine.
 */
export const calibration: BenchCase = {
  name: "calibration",
  description: "Plain JS map/object/array work used to normalize scores across machines",
  setup: () => ({
    run: () => {
      const map = new Map<number, { value: number }>()
      for (let index = 0; index < 50_000; index++) {
        map.set(index, { value: index })
      }
      let total = 0
      for (let index = 0; index < 50_000; index++) {
        total += map.get(index)!.value
      }
      const values: Array<number> = []
      for (const entry of map.values()) {
        values.push(entry.value * 2)
      }
      if (total + values.length < 0) throw new Error("unreachable")
    }
  })
}
