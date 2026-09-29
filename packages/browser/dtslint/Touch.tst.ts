import { Touch } from "@typeonce/bevy-ts-browser"
import { describe, expect, it } from "tstyche"

declare const target: Touch.TouchTarget
declare const blurHost: Touch.BlurHost

const touch = Touch.track(target, blurHost, ({ width, height }) => ({
  stick: { region: { left: 0, top: 0, width: width / 2, height }, radius: 60 },
  buttons: {
    attack: { center: { x: width - 90, y: height - 90 }, radius: 55, aimRadius: 80 },
    dash: { center: { x: width - 200, y: height - 60 }, radius: 36 }
  }
}))

describe("Touch", () => {
  it("infers the button names from the layout", () => {
    expect(touch).type.toBe<Touch.Touch<"attack" | "dash">>()
    expect(touch.snapshot().buttons.attack).type.toBe<Touch.ButtonState>()
    expect(touch.snapshot().stick.vector).type.toBe<Touch.Vector>()
    // @ts-expect-error Property 'jump' does not exist on type
    touch.snapshot().buttons.jump
  })

  it("types scripted timelines by the button names", () => {
    expect(Touch.scripted(["attack", "dash"], [{ frame: 0, press: ["attack"], aim: { attack: { x: 1, y: 0 } } }])).type.toBe<Touch.Scripted<"attack" | "dash">>()
    // @ts-expect-error Type '"jump"' is not assignable to type '"attack" | "dash"'
    Touch.scripted(["attack", "dash"], [{ frame: 0, press: ["jump"] }])
    expect(Touch.idle(["attack"])).type.toBe<Touch.Snapshot<"attack">>()
  })
})
