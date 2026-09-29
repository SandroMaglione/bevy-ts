import { Keyboard } from "@typeonce/bevy-ts-browser"
import { describe, expect, it } from "tstyche"

declare const host: Keyboard.KeyboardHost

describe("Keyboard", () => {
  it("types snapshots by the bound action names", () => {
    const input = Keyboard.actions(host, { jump: [" "], left: ["ArrowLeft", "a"] })
    expect(input.snapshot()).type.toBe<Keyboard.Snapshot<{ readonly jump: readonly [" "]; readonly left: readonly ["ArrowLeft", "a"] }>>()
    expect(input.snapshot().jump.pressed).type.toBe<boolean>()
    // @ts-expect-error Property 'crouch' does not exist on type 'Snapshot<{ readonly jump: readonly [" "]; readonly left: readonly
    input.snapshot().crouch
  })

  it("accepts physical-key bindings alongside characters", () => {
    const input = Keyboard.actions(host, { up: [Keyboard.code("KeyW"), "ArrowUp"] })
    expect(input.snapshot().up.held).type.toBe<boolean>()
    // @ts-expect-error Object literal may only specify known properties, and 'key' does not exist in type 'PhysicalKey'.
    Keyboard.actions(host, { up: [{ key: "w" }] })
  })

  it("accepts real KeyboardEvent hosts, which carry `code`", () => {
    expect<Window>().type.toBeAssignableTo<Keyboard.KeyboardHost>()
  })

  it("requires at least one key per action", () => {
    // @ts-expect-error Type '[]' is not assignable to type 'readonly [KeyBinding, ...KeyBinding[]]'.
    Keyboard.actions(host, { jump: [] })
  })
})
