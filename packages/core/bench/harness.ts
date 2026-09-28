/**
 * Minimal benchmark harness shared by the runtime benchmark suite.
 *
 * Each case builds its world once, then times one `run()` call per sample.
 * `prepare()` runs before every sample and is not timed, so cases that consume
 * world state (spawn, despawn) can rebuild it without polluting the result.
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
}

export interface MeasureOptions {
  readonly warmupMs: number
  readonly budgetMs: number
  readonly minSamples: number
  readonly maxSamples: number
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
  const timeOne = (): number => {
    instance.prepare?.()
    const start = performance.now()
    instance.run()
    return performance.now() - start
  }

  const warmupEnd = performance.now() + options.warmupMs
  while (performance.now() < warmupEnd) {
    timeOne()
  }

  collectGarbage()
  const samples: Array<number> = []
  const budgetEnd = performance.now() + options.budgetMs
  while (
    samples.length < options.minSamples
    || (samples.length < options.maxSamples && performance.now() < budgetEnd)
  ) {
    samples.push(timeOne())
  }

  return {
    name: bench.name,
    description: bench.description,
    medianMs: median(samples),
    minMs: Math.min(...samples),
    samples: samples.length
  }
}
