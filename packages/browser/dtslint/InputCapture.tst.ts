import { InputCapture, Keyboard } from "@typeonce/bevy-ts-browser"
import { Descriptor, Schema } from "@typeonce/bevy-ts"
import { describe, expect, it } from "tstyche"

const bindings = { jump: [" "] } as const
type Snapshot = Keyboard.Snapshot<typeof bindings>

const KeyboardInput = Descriptor.Service<Keyboard.Actions<typeof bindings>>()("CaptureTypes/Keyboard")
const Input = Descriptor.TransientResource<Snapshot>()("CaptureTypes/Input")
const Wrong = Descriptor.Resource<{ readonly jump: boolean }>()("CaptureTypes/Wrong")
const Clock = Descriptor.Service<{ readonly now: () => number }>()("CaptureTypes/Clock")
const Game = Schema.bind(Schema.fragment({ resources: { Input, Wrong } }))

describe("InputCapture", () => {
  it("requires the service and resource at tick time", () => {
    const Capture = InputCapture.system(Game, { name: "CaptureTypes/Capture", source: KeyboardInput, resource: Input })
    const withoutKeyboard = Game.Runtime.make({
      services: Game.Runtime.services(),
      resources: { Input: Keyboard.idle(bindings), Wrong: { jump: false } }
    })
    // @ts-expect-error!
    withoutKeyboard.tick(Game.Schedule(Capture))

    const ready = Game.Runtime.make({
      services: Game.Runtime.services(Game.Runtime.service(KeyboardInput, Keyboard.actions(window, bindings))),
      resources: { Input: Keyboard.idle(bindings), Wrong: { jump: false } }
    })
    expect(ready.tick(Game.Schedule(Capture)).ok).type.toBe<boolean>()
  })

  it("rejects resources whose value is not the snapshot type", () => {
    // @ts-expect-error!
    InputCapture.system(Game, { name: "CaptureTypes/Wrong", source: KeyboardInput, resource: Wrong })
  })

  it("rejects sources without snapshot()", () => {
    // @ts-expect-error!
    InputCapture.system(Game, { name: "CaptureTypes/NoSnapshot", source: Clock, resource: Input })
  })
})
