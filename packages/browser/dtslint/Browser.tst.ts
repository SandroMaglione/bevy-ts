import { FixedLoop, packageTag } from "@typeonce/bevy-ts-browser"
import { Clock, Result } from "@typeonce/bevy-ts"
import { describe, expect, it } from "tstyche"

describe("@typeonce/bevy-ts-browser", () => {
  it("exposes the package entrypoint type through the workspace", () => {
    expect(packageTag).type.toBe<"browser">()
  })

  it("preserves the update failure type in the loop failure channel", () => {
    FixedLoop.start({
      source: FixedLoop.source(() => ({ stop() {} })),
      step: Clock.hz(60),
      maxFrameSeconds: 0.25,
      maxStepsPerFrame: 5,
      update: () => Result.failure("GameOver" as const),
      render: (frame) => {
        expect(frame.alpha).type.toBe<number>()
      },
      onFailure: (failure) => {
        expect(failure).type.toBe<FixedLoop.Failure<"GameOver">>()
      }
    })
  })

  it("takes the clock's step, never a number of seconds", () => {
    expect<FixedLoop.Options["step"]>().type.toBe<Clock.Step>()
    FixedLoop.start({
      source: FixedLoop.source(() => ({ stop() {} })),
      // @ts-expect-error Type 'number' is not assignable to type 'Step<number>'
      step: 1 / 60,
      maxFrameSeconds: 0.25,
      maxStepsPerFrame: 5,
      update: () => Result.success(undefined),
      render: () => {},
      onFailure: () => {}
    })
  })
})
