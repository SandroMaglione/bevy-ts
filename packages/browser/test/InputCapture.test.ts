import { describe, expect, it } from "vitest"

import { InputCapture, Keyboard } from "@bevy-ts/browser"
import { Descriptor, Schema } from "@bevy-ts/core"

const bindings = { jump: [" "], left: ["ArrowLeft"] } as const

describe("InputCapture", () => {
  it("copies one snapshot per run into the resource", () => {
    const Source = Descriptor.Service<InputCapture.Source<Keyboard.Snapshot<typeof bindings>>>()("CaptureTest/Source")
    const Input = Descriptor.TransientResource<Keyboard.Snapshot<typeof bindings>>()("CaptureTest/Input")
    const Game = Schema.bind(Schema.fragment({ resources: { Input } }))

    const queued: Array<Keyboard.Snapshot<typeof bindings>> = [
      { jump: { held: true, pressed: true, released: false }, left: { held: false, pressed: false, released: false } },
      { jump: { held: false, pressed: false, released: true }, left: { held: true, pressed: true, released: false } }
    ]
    const seen: Array<string> = []
    const Capture = InputCapture.system(Game, { name: "CaptureTest/Capture", source: Source, resource: Input })
    const Read = Game.System("CaptureTest/Read", { resources: { input: Game.System.readResource(Input) } }, ({ resources }) => {
      const input = resources.input.get()
      seen.push(`${input.jump.pressed}/${input.left.held}`)
    })

    const runtime = Game.Runtime.make({
      services: Game.Runtime.services(Game.Runtime.service(Source, { snapshot: () => queued.shift()! })),
      resources: { Input: Keyboard.idle(bindings) }
    })
    runtime.tick(Game.Schedule(Read))
    runtime.tick(Game.Schedule(Capture, Read))
    runtime.tick(Game.Schedule(Capture, Read))
    expect(seen).toEqual(["false/false", "true/false", "false/true"])
  })

  it("builds idle snapshots for every action", () => {
    expect(Keyboard.idle(bindings)).toEqual({
      jump: { held: false, pressed: false, released: false },
      left: { held: false, pressed: false, released: false }
    })
  })
})
