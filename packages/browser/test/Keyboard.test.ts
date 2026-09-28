import { describe, expect, it } from "vitest"

import { Keyboard } from "@bevy-ts/browser"

const makeHost = () => {
  const listeners = new Map<string, Set<(event?: any) => void>>()
  const prevented: Array<string> = []
  const host: Keyboard.KeyboardHost = {
    addEventListener(type: string, listener: (event?: any) => void) {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener(type: string, listener: (event?: any) => void) {
      listeners.get(type)?.delete(listener)
    }
  }
  const dispatch = (type: "keydown" | "keyup", key: string, repeat = false) => {
    for (const listener of listeners.get(type) ?? []) {
      listener({ key, repeat, preventDefault: () => prevented.push(key) })
    }
  }
  return {
    host,
    prevented,
    down: (key: string, repeat = false) => dispatch("keydown", key, repeat),
    up: (key: string) => dispatch("keyup", key),
    blur: () => {
      for (const listener of listeners.get("blur") ?? []) listener()
    },
    listenerCount: () => [...listeners.values()].reduce((total, set) => total + set.size, 0)
  }
}

describe("Keyboard.actions", () => {
  it("reports held state and press edges per snapshot", () => {
    const fake = makeHost()
    const input = Keyboard.actions(fake.host, { jump: [" ", "w"], left: ["ArrowLeft", "a"] })

    fake.down("W")
    expect(input.snapshot().jump).toEqual({ held: true, pressed: true, released: false })
    expect(input.snapshot().jump).toEqual({ held: true, pressed: false, released: false })
    fake.up("w")
    expect(input.snapshot().jump).toEqual({ held: false, pressed: false, released: true })
    expect(input.snapshot().left).toEqual({ held: false, pressed: false, released: false })
  })

  it("keeps a tap that starts and ends between two snapshots", () => {
    const fake = makeHost()
    const input = Keyboard.actions(fake.host, { jump: [" "] })

    fake.down(" ")
    fake.up(" ")

    expect(input.snapshot().jump).toEqual({ held: false, pressed: true, released: true })
  })

  it("ignores auto-repeat and keeps an action held while any bound key is down", () => {
    const fake = makeHost()
    const input = Keyboard.actions(fake.host, { left: ["ArrowLeft", "a"] })

    fake.down("ArrowLeft")
    input.snapshot()
    fake.down("ArrowLeft", true)
    fake.down("a")
    fake.up("ArrowLeft")

    expect(input.snapshot().left).toEqual({ held: true, pressed: true, released: false })
  })

  it("prevents default only for bound keys unless disabled", () => {
    const fake = makeHost()
    Keyboard.actions(fake.host, { jump: [" "] })
    fake.down(" ")
    fake.down("q")
    expect(fake.prevented).toEqual([" "])

    const quiet = makeHost()
    Keyboard.actions(quiet.host, { jump: [" "] }, { preventDefault: false })
    quiet.down(" ")
    expect(quiet.prevented).toEqual([])
  })

  it("releases held actions on blur and removes listeners on dispose", () => {
    const fake = makeHost()
    const input = Keyboard.actions(fake.host, { jump: [" "] })

    fake.down(" ")
    input.snapshot()
    fake.blur()
    expect(input.snapshot().jump).toEqual({ held: false, pressed: false, released: true })

    input.dispose()
    expect(fake.listenerCount()).toBe(0)
  })
})

describe("Keyboard timelines", () => {
  const bindings = { jump: [" "], left: ["a"] } as const

  it("plays presses and releases per snapshot, including sub-frame taps", () => {
    const input = Keyboard.scripted(bindings, [
      { frame: 0, press: ["left"] },
      { frame: 2, release: ["left"], press: ["jump"] },
      { frame: 2, release: ["jump"] }
    ])
    expect(input.snapshot().left).toEqual({ held: true, pressed: true, released: false })
    expect(input.snapshot().left).toEqual({ held: true, pressed: false, released: false })
    const third = input.snapshot()
    expect(third.left).toEqual({ held: false, pressed: false, released: true })
    expect(third.jump).toEqual({ held: false, pressed: true, released: true })
    expect(input.snapshot()).toEqual(Keyboard.idle(bindings))
    expect(input.frames()).toBe(4)
  })

  it("records a live session that replays to the same snapshots", () => {
    const fake = makeHost()
    const recorder = Keyboard.recording(Keyboard.actions(fake.host, bindings))
    const live: Array<Keyboard.Snapshot<typeof bindings>> = []
    fake.down("a")
    live.push(recorder.snapshot())
    live.push(recorder.snapshot())
    fake.down(" ")
    fake.up(" ")
    fake.up("a")
    live.push(recorder.snapshot())
    fake.down("a")
    live.push(recorder.snapshot())

    const parsed = Keyboard.parseTimeline(bindings, JSON.parse(JSON.stringify(recorder.timeline())))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const replay = Keyboard.scripted(bindings, parsed.value)
    expect(live.map(() => replay.snapshot())).toEqual(live)
  })

  it("rejects malformed timelines with the offending path", () => {
    expect(Keyboard.parseTimeline(bindings, {})).toMatchObject({ ok: false, error: { path: "" } })
    expect(Keyboard.parseTimeline(bindings, [{ frame: -1 }])).toMatchObject({ ok: false, error: { path: "[0].frame" } })
    expect(Keyboard.parseTimeline(bindings, [{ frame: 0, press: ["fly"] }])).toMatchObject({
      ok: false,
      error: { path: "[0].press[0]" }
    })
  })
})
