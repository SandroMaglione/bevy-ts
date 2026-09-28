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
