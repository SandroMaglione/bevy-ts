import { Keyboard } from "@bevy-ts/browser"
import * as Result from "@bevy-ts/core/Result"
import {
  Facing,
  FrameContext,
  Game,
  KeyboardInput,
  Locomotion,
  TopDownHost,
  RenderNodes
} from "./schema.ts"
import { pickupLayout } from "./content.ts"
import { inputBindings } from "./types.ts"
import type { FrameContextValue, KeyboardInput as KeyboardInputValue, TopDownHostValue } from "./types.ts"

export const makeEmptyFocusedCollectable = () => ({
  current: null,
  label: null,
  distance: null
} as const)

export const makeInitialAnimationClock = () => ({
  frameIndex: 0,
  elapsed: 0
} as const)

/**
 * Initial resources shared by the browser runtime and the headless
 * simulation.
 */
export const initialResources = (frame: FrameContextValue) => ({
  DeltaTime: frame.deltaSeconds,
  Viewport: frame.viewport,
  Camera: {
    x: frame.viewport.width * 0.5,
    y: frame.viewport.height * 0.5
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
} as const)

export const initialMachines = () =>
  Game.Runtime.machines(
    Game.Runtime.machine(Facing, "Down"),
    Game.Runtime.machine(Locomotion, "Idle")
  )

/**
 * Reads the frame context live from the Pixi host.
 */
const hostFrameContext = (host: TopDownHostValue): FrameContextValue => ({
  get deltaSeconds() {
    return host.clock.deltaSeconds
  },
  get viewport() {
    return {
      width: host.application.screen.width,
      height: host.application.screen.height
    }
  }
})

export const describeRuntimeError = (error: { readonly resources: { readonly Viewport?: unknown; readonly Camera?: unknown } }) =>
  error.resources.Viewport
    ? "Invalid top-down viewport."
    : error.resources.Camera
      ? "Invalid top-down camera."
      : "Invalid top-down runtime resources."

export const createTopDownRuntime = (
  host: TopDownHostValue,
  keyboard: KeyboardInputValue
) => {
  const frame = hostFrameContext(host)
  const made = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(KeyboardInput, keyboard),
      Game.Runtime.service(FrameContext, frame),
      Game.Runtime.service(TopDownHost, host),
      Game.Runtime.service(RenderNodes, host.nodes)
    ),
    resources: initialResources(frame),
    machines: initialMachines()
  })
  return Result.match(made, {
    onSuccess: Result.success,
    onFailure: (error) => Result.failure({ message: describeRuntimeError(error) })
  })
}
