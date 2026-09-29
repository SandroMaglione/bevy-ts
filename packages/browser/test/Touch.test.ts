import { describe, expect, it } from "vitest"

import { Pointer, Touch } from "@typeonce/bevy-ts-browser"

const size = { width: 800, height: 400 }

/** Stick on the left half; attack aims (drag 100px), dash does not. */
const layout = ({ width, height }: Touch.Size) => ({
  stick: { region: { left: 0, top: 0, width: width / 2, height }, radius: 50, deadZone: 0.2 },
  buttons: {
    attack: { center: { x: width - 100, y: height - 100 }, radius: 50, aimRadius: 100 },
    dash: { center: { x: width - 250, y: height - 60 }, radius: 30 }
  }
})

const makeTarget = (rect = { left: 10, top: 20, ...size }) => {
  const listeners = new Map<string, Set<(event?: any) => void>>()
  const add = (type: string, listener: (event?: any) => void) => {
    const set = listeners.get(type) ?? new Set()
    set.add(listener)
    listeners.set(type, set)
  }
  const remove = (type: string, listener: (event?: any) => void) => {
    listeners.get(type)?.delete(listener)
  }
  const style = { touchAction: "auto" }
  const target: Touch.TouchTarget & Pointer.PointerTarget = {
    addEventListener: add,
    removeEventListener: remove,
    getBoundingClientRect: () => rect,
    style
  }
  const blurHost = { addEventListener: add, removeEventListener: remove }
  /** Coordinates are element-relative; the fake adds the element's offset. */
  const dispatch = (type: string, pointerId: number, x: number, y: number, pointerType = "touch") => {
    for (const listener of listeners.get(type) ?? []) {
      listener({ clientX: x + rect.left, clientY: y + rect.top, pointerId, pointerType, button: 0, preventDefault: () => {} })
    }
  }
  return {
    target,
    blurHost,
    style,
    down: (id: number, x: number, y: number, type?: string) => dispatch("pointerdown", id, x, y, type),
    move: (id: number, x: number, y: number, type?: string) => dispatch("pointermove", id, x, y, type),
    up: (id: number, x: number, y: number, type?: string) => dispatch("pointerup", id, x, y, type),
    cancel: (id: number, x: number, y: number) => dispatch("pointercancel", id, x, y),
    blur: () => {
      for (const listener of listeners.get("blur") ?? []) listener()
    },
    listenerCount: () => [...listeners.values()].reduce((total, set) => total + set.size, 0)
  }
}

describe("Touch.track", () => {
  it("floats the stick where the thumb lands and reports tilt with the dead zone removed", () => {
    const fake = makeTarget()
    const touch = Touch.track(fake.target, fake.blurHost, layout)
    expect(touch.snapshot()).toEqual(Touch.idle(["attack", "dash"]))

    fake.down(1, 100, 200)
    expect(touch.snapshot().stick).toEqual({ active: true, vector: { x: 0, y: 0 } })
    // 5px is inside the dead zone (0.2 * 50).
    fake.move(1, 105, 200)
    expect(touch.snapshot().stick.vector).toEqual({ x: 0, y: 0 })
    // Half-way out of the live range: (30/50 - 0.2) / 0.8 = 0.5.
    fake.move(1, 130, 200)
    expect(touch.snapshot().stick.vector.x).toBeCloseTo(0.5, 9)
    // Past the radius is full tilt, and the drawn knob stays on the rim.
    fake.move(1, 100, 400)
    expect(touch.snapshot().stick.vector).toEqual({ x: 0, y: 1 })
    expect(touch.view().stick).toEqual({ origin: { x: 100, y: 200 }, knob: { x: 100, y: 250 } })
    fake.up(1, 100, 400)
    expect(touch.snapshot().stick).toEqual({ active: false, vector: { x: 0, y: 0 } })
    expect(touch.snapshot().touched).toBe(true)
  })

  it("gives each finger to one control: move and attack at the same time", () => {
    const fake = makeTarget()
    const touch = Touch.track(fake.target, fake.blurHost, layout)
    fake.down(1, 100, 200)
    fake.move(1, 150, 200)
    fake.down(2, 700, 300)
    const both = touch.snapshot()
    expect(both.stick.vector.x).toBeCloseTo(1, 9)
    expect(both.buttons.attack).toEqual({ held: true, pressed: true, released: false, aim: null, cancelled: false })
    // The stick's finger crossing into a button does not press it.
    fake.move(1, 700, 300)
    fake.up(2, 700, 300)
    const after = touch.snapshot()
    expect(after.stick.active).toBe(true)
    expect(after.buttons.attack).toMatchObject({ held: false, released: true })
    // A second finger in the stick region while the stick is held is ignored.
    fake.down(3, 50, 50)
    expect(touch.view().stick?.origin).toEqual({ x: 100, y: 200 })
  })

  it("aims by dragging from the button and reports the aim on the release, even for a tap shorter than a frame", () => {
    const fake = makeTarget()
    const touch = Touch.track(fake.target, fake.blurHost, layout)
    fake.down(2, 700, 300)
    fake.move(2, 700, 250)
    expect(touch.snapshot().buttons.attack.aim).toEqual({ x: 0, y: -0.5 })
    fake.move(2, 900, 300)
    fake.up(2, 900, 300)
    expect(touch.snapshot().buttons.attack).toEqual({ held: false, pressed: false, released: true, aim: { x: 1, y: 0 }, cancelled: false })
    expect(touch.snapshot().buttons.attack.aim).toBeNull()

    // Pressed, dragged, and lifted between two snapshots.
    fake.down(4, 700, 300)
    fake.up(4, 640, 300)
    expect(touch.snapshot().buttons.attack).toEqual({ held: false, pressed: true, released: true, aim: { x: -0.6, y: 0 }, cancelled: false })

    // A button without aimRadius never aims.
    fake.down(5, 550, 340)
    fake.up(5, 570, 340)
    expect(touch.snapshot().buttons.dash).toMatchObject({ pressed: true, released: true, aim: null })
  })

  it("cancels on pointercancel and blur, so games can skip firing", () => {
    const fake = makeTarget()
    const touch = Touch.track(fake.target, fake.blurHost, layout)
    fake.down(2, 700, 300)
    touch.snapshot()
    fake.cancel(2, 700, 300)
    expect(touch.snapshot().buttons.attack).toMatchObject({ released: true, cancelled: true })
    fake.down(1, 100, 200)
    fake.down(2, 700, 300)
    touch.snapshot()
    fake.blur()
    const snapshot = touch.snapshot()
    expect(snapshot.stick.active).toBe(false)
    expect(snapshot.buttons.attack).toMatchObject({ held: false, released: true, cancelled: true })
  })

  it("ignores other pointer types unless asked, and cleans up", () => {
    const fake = makeTarget()
    const touch = Touch.track(fake.target, fake.blurHost, layout)
    expect(fake.style.touchAction).toBe("none")
    fake.down(1, 700, 300, "mouse")
    expect(touch.snapshot().buttons.attack.held).toBe(false)
    touch.dispose()
    expect(fake.listenerCount()).toBe(0)
    expect(fake.style.touchAction).toBe("auto")

    const withMouse = Touch.track(fake.target, fake.blurHost, layout, { pointerTypes: ["touch", "mouse"] })
    fake.down(1, 700, 300, "mouse")
    expect(withMouse.snapshot().buttons.attack.held).toBe(true)
  })

  it("leaves touches out of Pointer by default", () => {
    const fake = makeTarget()
    const pointer = Pointer.track(fake.target, fake.blurHost)
    fake.down(1, 700, 300, "touch")
    expect(pointer.snapshot().primary.held).toBe(false)
    fake.down(1, 700, 300, "mouse")
    expect(pointer.snapshot().primary.held).toBe(true)
  })
})

describe("Touch.scripted", () => {
  it("plays stick vectors, presses, aims, releases, and cancels by frame", () => {
    const touch = Touch.scripted(["attack", "skill"], [
      { frame: 0, stick: { x: 3, y: 4 } },
      { frame: 1, press: ["attack"], aim: { attack: { x: 0, y: -1 } } },
      { frame: 2, release: ["attack"] },
      { frame: 2, press: ["skill"], cancel: ["skill"] },
      { frame: 3, stick: null }
    ])
    expect(touch.snapshot().stick).toEqual({ active: true, vector: { x: 0.6, y: 0.8 } })
    expect(touch.snapshot().buttons.attack).toEqual({ held: true, pressed: true, released: false, aim: { x: 0, y: -1 }, cancelled: false })
    const lifted = touch.snapshot()
    expect(lifted.buttons.attack).toEqual({ held: false, pressed: false, released: true, aim: { x: 0, y: -1 }, cancelled: false })
    expect(lifted.buttons.skill).toMatchObject({ pressed: true, released: true, cancelled: true })
    expect(touch.snapshot().stick.active).toBe(false)
    expect(touch.frames()).toBe(4)
  })
})
