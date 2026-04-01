import * as Result from "../../Result.ts"
import * as Size2 from "../../Size2.ts"
import * as Vector2 from "../../Vector2.ts"
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

const makeRuntime = (
  host: TopDownHostValue,
  inputManager: TopDownInputManager
) =>
  Game.Runtime.makeResult({
    services: Game.Runtime.services(
      Game.Runtime.service(InputManager, inputManager),
      Game.Runtime.service(TopDownHost, host)
    ),
    resources: {
      DeltaTime: Result.success(host.clock.deltaSeconds),
      Viewport: Size2.result({
        width: host.application.screen.width,
        height: host.application.screen.height
      }),
      Camera: Vector2.result({
        x: WORLD_WIDTH * 0.5,
        y: WORLD_HEIGHT * 0.5
      }),
      InputState: Result.success(makeEmptyInputState()),
      FocusedCollectable: Result.success(makeEmptyFocusedCollectable()),
      CollectedCount: Result.success(0),
      TotalCollectables: Result.success(pickupLayout.length),
      AnimationClock: Result.success(makeInitialAnimationClock()),
      CurrentPlayerFrame: Result.success({
        row: 1,
        column: 1
      })
    },
    machines: Game.Runtime.machines(
      Game.Runtime.machine(Facing, "Down"),
      Game.Runtime.machine(Locomotion, "Idle")
    )
  })

export const createTopDownRuntime = (
  host: TopDownHostValue,
  inputManager: TopDownInputManager
) => {
  const runtime = makeRuntime(host, inputManager)
  if (!runtime.ok) {
    return Result.failure({
      message: runtime.error.resources.Viewport
        ? "Invalid top-down viewport."
        : "Invalid top-down camera."
    })
  }

  return Result.success(runtime.value)
}
