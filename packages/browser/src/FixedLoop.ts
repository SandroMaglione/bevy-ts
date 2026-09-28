/**
 * Deterministic fixed-step timing for browser and renderer hosts.
 *
 * The loop owns the timing policy that is easy to get subtly wrong in every
 * game: frame clamping, catch-up limits, interpolation, cancellation, and
 * typed update failures. It does not know about an ECS runtime or renderer.
 *
 * @module FixedLoop
 * @docGroup browser
 */
import * as Result from "@bevy-ts/core/Result"

/** One renderer or browser tick measured in milliseconds. */
export interface Tick {
  readonly deltaMS: number
}

/** A stoppable host subscription. Calling `stop` more than once is safe. */
export interface Subscription {
  stop(): void
}

/** Minimal adapter implemented by Pixi tickers, RAF, and deterministic tests. */
export interface TickSource<TTick extends Tick = Tick> {
  subscribe(onTick: (tick: TTick) => void): Subscription
}

/** Validated fixed-step timing policy. */
export interface Options {
  /** Simulation duration advanced by every fixed update. */
  readonly stepSeconds: number
  /** Maximum host-frame duration admitted into the accumulator. */
  readonly maxFrameSeconds: number
  /** Maximum number of simulation updates performed for one host frame. */
  readonly maxStepsPerFrame: number
}

/** Configuration error returned before a loop subscribes to its host. */
export interface InvalidOptions {
  readonly kind: "InvalidFixedLoopOptions"
  readonly field: keyof Options
  readonly reason: "mustBeFiniteAndPositive" | "mustBePositiveInteger"
  readonly value: number
}

/** Data passed to the renderer after all fixed updates for one host frame. */
export interface Frame {
  /** Clamped time admitted for this host frame. */
  readonly elapsedSeconds: number
  /** Number of fixed updates completed for this host frame. */
  readonly fixedSteps: number
  /** Remaining accumulator fraction in the range `[0, 1)`. */
  readonly alpha: number
  /** Time discarded by frame clamping or the catch-up limit. */
  readonly droppedSeconds: number
}

/** Failure delivered by an active loop before it stops itself. */
export type Failure<UpdateError> =
  | {
      readonly kind: "InvalidTickDelta"
      readonly deltaMS: number
    }
  | {
      readonly kind: "UpdateFailure"
      readonly error: UpdateError
    }

/** A running fixed-step driver. */
export interface Driver extends Subscription {
  /** Clears accumulated partial time without removing the host subscription. */
  reset(): void
}

/** Input for a fixed-step driver. */
export interface StartOptions<TTick extends Tick, UpdateError> extends Options {
  readonly source: TickSource<TTick>
  readonly update: (stepSeconds: number) => Result.Result<void, UpdateError>
  readonly render: (frame: Frame) => void
  readonly onFailure: (failure: Failure<UpdateError>) => void
}

/** Wraps a host-specific subscription function in the canonical source type. */
export const source = <TTick extends Tick>(
  subscribe: TickSource<TTick>["subscribe"]
): TickSource<TTick> => ({ subscribe })

const validate = (options: Options): Result.Result<void, InvalidOptions> => {
  for (const field of ["stepSeconds", "maxFrameSeconds"] as const) {
    const value = options[field]
    if (!Number.isFinite(value) || value <= 0) {
      return Result.failure({
        kind: "InvalidFixedLoopOptions",
        field,
        reason: "mustBeFiniteAndPositive",
        value
      })
    }
  }
  if (!Number.isInteger(options.maxStepsPerFrame) || options.maxStepsPerFrame <= 0) {
    return Result.failure({
      kind: "InvalidFixedLoopOptions",
      field: "maxStepsPerFrame",
      reason: "mustBePositiveInteger",
      value: options.maxStepsPerFrame
    })
  }
  return Result.success(undefined)
}

/**
 * Starts a fixed-step loop after validating its timing policy.
 *
 * Update failures and malformed host ticks are delivered to `onFailure`, then
 * the driver stops. Render defects are deliberately not caught: they are
 * programmer defects, not expected game outcomes.
 */
export const start = <TTick extends Tick, UpdateError>(
  options: StartOptions<TTick, UpdateError>
): Result.Result<Driver, InvalidOptions> => {
  const validity = validate(options)
  if (!validity.ok) {
    return validity
  }

  let accumulator = 0
  let stopped = false
  let hostSubscription: Subscription | undefined

  const stop = (): void => {
    if (stopped) {
      return
    }
    stopped = true
    hostSubscription?.stop()
  }

  const fail = (failure: Failure<UpdateError>): void => {
    stop()
    options.onFailure(failure)
  }

  const onTick = (tick: TTick): void => {
    if (stopped) {
      return
    }
    if (!Number.isFinite(tick.deltaMS) || tick.deltaMS < 0) {
      fail({ kind: "InvalidTickDelta", deltaMS: tick.deltaMS })
      return
    }

    const rawSeconds = tick.deltaMS / 1000
    const elapsedSeconds = Math.min(rawSeconds, options.maxFrameSeconds)
    let droppedSeconds = rawSeconds - elapsedSeconds
    accumulator += elapsedSeconds

    let fixedSteps = 0
    while (accumulator >= options.stepSeconds && fixedSteps < options.maxStepsPerFrame) {
      const update = options.update(options.stepSeconds)
      if (!update.ok) {
        fail({ kind: "UpdateFailure", error: update.error })
        return
      }
      accumulator -= options.stepSeconds
      fixedSteps += 1
    }

    if (accumulator >= options.stepSeconds) {
      const droppedWholeSteps = Math.floor(accumulator / options.stepSeconds) * options.stepSeconds
      accumulator -= droppedWholeSteps
      droppedSeconds += droppedWholeSteps
    }

    options.render({
      elapsedSeconds,
      fixedSteps,
      alpha: accumulator / options.stepSeconds,
      droppedSeconds
    })
  }

  hostSubscription = options.source.subscribe(onTick)
  if (stopped) {
    hostSubscription.stop()
  }

  return Result.success({
    stop,
    reset() {
      accumulator = 0
    }
  })
}

/** Host surface needed by the built-in requestAnimationFrame adapter. */
export interface AnimationFrameHost {
  requestAnimationFrame(callback: (timestamp: number) => void): number
  cancelAnimationFrame(handle: number): void
}

/**
 * Adapts requestAnimationFrame to a `TickSource` without reading global state.
 * The first frame reports zero elapsed time because it establishes the clock.
 */
export const animationFrames = (host: AnimationFrameHost): TickSource => source((onTick) => {
  let stopped = false
  let handle = 0
  let previous: number | undefined

  const frame = (timestamp: number): void => {
    if (stopped) {
      return
    }
    const deltaMS = previous === undefined ? 0 : timestamp - previous
    previous = timestamp
    onTick({ deltaMS })
    if (!stopped) {
      handle = host.requestAnimationFrame(frame)
    }
  }

  handle = host.requestAnimationFrame(frame)
  return {
    stop() {
      if (stopped) {
        return
      }
      stopped = true
      host.cancelAnimationFrame(handle)
    }
  }
})
