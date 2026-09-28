import { describe, expect, it } from "vitest"

import { FixedLoop, packageTag } from "@bevy-ts/browser"
import { Result } from "@bevy-ts/core"

describe("@bevy-ts/browser", () => {
  it("resolves through the workspace package entrypoint", () => {
    expect(packageTag).toBe("browser")
  })

  it("advances deterministic fixed updates and exposes interpolation", () => {
    let tick: ((value: FixedLoop.Tick) => void) | undefined
    let stopped = false
    const frames: Array<FixedLoop.Frame> = []
    const steps: Array<number> = []

    const driver = FixedLoop.start({
      source: FixedLoop.source((onTick) => {
        tick = onTick
        return { stop: () => { stopped = true } }
      }),
      stepSeconds: 0.01,
      maxFrameSeconds: 0.1,
      maxStepsPerFrame: 3,
      update: (step) => {
        steps.push(step)
        return Result.success(undefined)
      },
      render: (frame) => frames.push(frame),
      onFailure: () => {
        throw new Error("unexpected loop failure")
      }
    })

    expect(driver.ok).toBe(true)
    tick?.({ deltaMS: 25 })
    tick?.({ deltaMS: 10 })

    expect(steps).toEqual([0.01, 0.01, 0.01])
    expect(frames).toHaveLength(2)
    expect(frames[0]).toMatchObject({ fixedSteps: 2, droppedSeconds: 0 })
    expect(frames[0]?.alpha).toBeCloseTo(0.5)
    expect(frames[1]).toMatchObject({ fixedSteps: 1, droppedSeconds: 0 })
    expect(frames[1]?.alpha).toBeCloseTo(0.5)
    expect(stopped).toBe(false)
  })

  it("bounds catch-up work and reports expected update failures", () => {
    let tick: ((value: FixedLoop.Tick) => void) | undefined
    let stopCount = 0
    const frames: Array<FixedLoop.Frame> = []
    const failures: Array<FixedLoop.Failure<"Paused">> = []
    let updates = 0

    const driver = FixedLoop.start({
      source: FixedLoop.source((onTick) => {
        tick = onTick
        return { stop: () => { stopCount += 1 } }
      }),
      stepSeconds: 0.01,
      maxFrameSeconds: 0.1,
      maxStepsPerFrame: 3,
      update: () => {
        updates += 1
        return updates === 4 ? Result.failure("Paused" as const) : Result.success(undefined)
      },
      render: (frame) => frames.push(frame),
      onFailure: (failure) => failures.push(failure)
    })

    expect(driver.ok).toBe(true)
    tick?.({ deltaMS: 100 })
    expect(updates).toBe(3)
    expect(frames[0]?.fixedSteps).toBe(3)
    expect(frames[0]?.droppedSeconds).toBeCloseTo(0.07)

    tick?.({ deltaMS: 10 })
    expect(failures).toEqual([{ kind: "UpdateFailure", error: "Paused" }])
    expect(stopCount).toBe(1)
    expect(frames).toHaveLength(1)
  })

  it("rejects invalid timing before subscribing", () => {
    let subscribed = false
    const result = FixedLoop.start({
      source: FixedLoop.source(() => {
        subscribed = true
        return { stop() {} }
      }),
      stepSeconds: 0,
      maxFrameSeconds: 0.1,
      maxStepsPerFrame: 3,
      update: () => Result.success(undefined),
      render: () => {},
      onFailure: () => {}
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "InvalidFixedLoopOptions",
        field: "stepSeconds",
        reason: "mustBeFiniteAndPositive",
        value: 0
      }
    })
    expect(subscribed).toBe(false)
  })
})
