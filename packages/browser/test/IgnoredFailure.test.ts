import { describe, expect, it } from "vitest"

import { FixedLoop } from "@typeonce/bevy-ts-browser"
import { Debug, HostClock, Result, Schema } from "@typeonce/bevy-ts"

const Game = Schema.bind(Schema.fragment({}))
const Fail = Game.System("LoopIgnored/Fail", {}, () => Result.failure("boom" as const))
const step = Game.Schedule(Fail)

describe("ignored tick failures through FixedLoop", () => {
  it("does not report a failure FixedLoop handled (it reads ok and stops)", () => {
    const runtime = Game.Runtime.make({ services: Game.Runtime.services(), debug: { hostClock: HostClock.test() } })
    const seen: Array<Debug.FailureIgnoredEvent> = []
    runtime.debug.observe((event) => {
      if (event.type === "failure.ignored") seen.push(event)
    })
    let tick: ((value: FixedLoop.Tick) => void) | undefined
    const failures: Array<unknown> = []
    const driver = FixedLoop.start({
      source: FixedLoop.source((onTick) => {
        tick = onTick
        return { stop: () => {} }
      }),
      stepSeconds: 0.01,
      maxFrameSeconds: 0.1,
      maxStepsPerFrame: 3,
      update: () => runtime.tick(step),
      render: () => {},
      onFailure: (failure) => failures.push(failure)
    })
    expect(driver.ok).toBe(true)
    tick?.({ deltaMS: 10 })
    runtime.debug.checkIgnoredFailures()
    expect(failures).toHaveLength(1)
    expect(seen).toEqual([])
  })
})
