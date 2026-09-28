import { Keyboard } from "@bevy-ts/browser"
import * as Result from "@bevy-ts/core/Result"
import {
  AnimationClock,
  Camera,
  CollectedCount,
  CurrentPlayerFrame,
  DeltaTime,
  Facing,
  FocusedCollectable,
  Game,
  InputState,
  KeyboardInput,
  Locomotion,
  TopDownHost,
  TotalCollectables,
  Viewport,
  RenderNodes
} from "./schema.ts"
import { pickupLayout } from "./content.ts"
import { inputBindings } from "./types.ts"
import type { KeyboardInput as KeyboardInputValue, TopDownHostValue } from "./types.ts"

export const makeEmptyFocusedCollectable = () => ({
  current: null,
  label: null,
  distance: null
} as const)

export const makeInitialAnimationClock = () => ({
  frameIndex: 0,
  elapsed: 0
} as const)

const makeRuntime = (
  host: TopDownHostValue,
  keyboard: KeyboardInputValue
) => {
  const machines = Game.Runtime.machines(
    Game.Runtime.machine(Facing, "Down"),
    Game.Runtime.machine(Locomotion, "Idle")
  )

  return Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(KeyboardInput, keyboard),
      Game.Runtime.service(TopDownHost, host),
      Game.Runtime.service(RenderNodes, host.nodes)
    ),
    resources: {
      DeltaTime: host.clock.deltaSeconds,
      Viewport: {
        width: host.application.screen.width,
        height: host.application.screen.height
      },
      Camera: {
        x: host.application.screen.width * 0.5,
        y: host.application.screen.height * 0.5
      },
      InputState: Keyboard.idle(inputBindings),
      FocusedCollectable: makeEmptyFocusedCollectable(),
      CollectedCount: 0,
      TotalCollectables: pickupLayout.length,
      AnimationClock: makeInitialAnimationClock(),
      CurrentPlayerFrame: {
        row: 1,
        column: 1
      }
    },
    machines
  })
}

export const createTopDownRuntime = (
  host: TopDownHostValue,
  keyboard: KeyboardInputValue
) =>
  Result.match(makeRuntime(host, keyboard), {
    onSuccess: Result.success,
    onFailure: (error) =>
      Result.failure({
        message: error.resources.Viewport
          ? "Invalid top-down viewport."
          : error.resources.Camera
            ? "Invalid top-down camera."
            : "Invalid top-down runtime resources."
      })
  })
