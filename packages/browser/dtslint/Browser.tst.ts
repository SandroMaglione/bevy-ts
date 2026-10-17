import { FixedLoop, packageTag } from "@typeonce/ritmo-browser"
import { Result } from "@typeonce/ritmo"
import { describe, expect, it } from "tstyche"

describe("@typeonce/ritmo-browser", () => {
  it("exposes the package entrypoint type through the workspace", () => {
    expect(packageTag).type.toBe<"browser">()
  })

  it("preserves the update failure type in the loop failure channel", () => {
    FixedLoop.start({
      source: FixedLoop.source(() => ({ stop() {} })),
      stepSeconds: 1 / 60,
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
})
