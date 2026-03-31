import {
  AnimationClock,
  Camera,
  CollectedCount,
  CurrentPlayerFrame,
  DeltaTime,
  Facing,
  FocusedCollectable,
  Game,
  InputManager,
  InputState,
  Locomotion,
  TopDownHost,
  TotalCollectables,
  Viewport
} from "./schema.ts"
import { pickupLayout } from "./content.ts"
import { WORLD_HEIGHT, WORLD_WIDTH } from "./constants.ts"
import type { InputStateValue, TopDownHostValue } from "./types.ts"

export type TopDownInputManager = {
  readonly snapshot: () => InputStateValue
}

export const makeEmptyInputState = (): InputStateValue => ({
  up: false,
  down: false,
  left: false,
  right: false,
  interactPressed: false,
  interactJustPressed: false
})

export const makeEmptyFocusedCollectable = () => ({
  current: null,
  label: null,
  distance: null
} as const)

export const makeInitialAnimationClock = () => ({
  frameIndex: 0,
  elapsed: 0
} as const)

export const createTopDownRuntime = (
  host: TopDownHostValue,
  inputManager: TopDownInputManager
) =>
  Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(InputManager, inputManager),
      Game.Runtime.service(TopDownHost, host)
    ),
    resources: {
      DeltaTime: host.clock.deltaSeconds,
      Viewport: {
        width: host.application.screen.width,
        height: host.application.screen.height
      },
      Camera: {
        x: WORLD_WIDTH * 0.5,
        y: WORLD_HEIGHT * 0.5
      },
      InputState: makeEmptyInputState(),
      FocusedCollectable: makeEmptyFocusedCollectable(),
      CollectedCount: 0,
      TotalCollectables: pickupLayout.length,
      AnimationClock: makeInitialAnimationClock(),
      CurrentPlayerFrame: {
        row: 1,
        column: 1
      }
    },
    machines: Game.Runtime.machines(
      Game.Runtime.machine(Facing, "Down"),
      Game.Runtime.machine(Locomotion, "Idle")
    )
  })
