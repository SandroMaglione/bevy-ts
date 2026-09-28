import { Descriptor, Entity, Schema } from "@bevy-ts/core"
import * as Size2 from "@bevy-ts/math/Size2"
import * as Vector2 from "@bevy-ts/math/Vector2"

import type {
  AnimationClockValue,
  CurrentPlayerFrameValue,
  FrameContextValue,
  InputStateValue,
  KeyboardInput as KeyboardInputValue,
  TopDownHostValue
} from "./types.ts"

export const Root = Schema.defineRoot("TopDown")

export const Position = Descriptor.ConstructedComponent(Vector2)("TopDown/Position")
export const Velocity = Descriptor.ConstructedComponent(Vector2)("TopDown/Velocity")
export const Collider = Descriptor.ConstructedComponent(Size2)("TopDown/Collider")
export const Renderable = Descriptor.Component<{
  kind: "player" | "wall" | "pickup"
  width: number
  height: number
  color: number
  accent: number
}>()("TopDown/Renderable")
export const Player = Descriptor.Component<{}>()("TopDown/Player")
export const Wall = Descriptor.Component<{}>()("TopDown/Wall")
export const Collectable = Descriptor.Component<{
  label: string
  radius: number
}>()("TopDown/Collectable")

export type FocusedCollectableValue = {
  current: Entity.Handle<typeof Root, typeof Collectable> | null
  label: string | null
  distance: number | null
}

export const DeltaTime = Descriptor.Resource<number>()("TopDown/DeltaTime")
export const Viewport = Descriptor.ConstructedResource(Size2)("TopDown/Viewport")
export const Camera = Descriptor.ConstructedResource(Vector2)("TopDown/Camera")
// Captured from the keyboard at the start of each update; never saved.
export const InputState = Descriptor.TransientResource<InputStateValue>()("TopDown/InputState")
export const FocusedCollectable = Descriptor.Resource<FocusedCollectableValue>()("TopDown/FocusedCollectable")
export const CollectedCount = Descriptor.Resource<number>()("TopDown/CollectedCount")
export const TotalCollectables = Descriptor.Resource<number>()("TopDown/TotalCollectables")
export const AnimationClock = Descriptor.Resource<AnimationClockValue>()("TopDown/AnimationClock")
export const CurrentPlayerFrame = Descriptor.Resource<CurrentPlayerFrameValue>()("TopDown/CurrentPlayerFrame")

export const KeyboardInput = Descriptor.Service<KeyboardInputValue>()("TopDown/KeyboardInput")
export const FrameContext = Descriptor.Service<FrameContextValue>()("TopDown/FrameContext")
export const TopDownHost = Descriptor.Service<TopDownHostValue>()("TopDown/Host")
export const RenderNodes = Descriptor.Service<TopDownHostValue["nodes"]>()("TopDown/RenderNodes")

export const Game = Schema.bind(
  Schema.fragment({
    components: {
      Position,
      Velocity,
      Collider,
      Renderable,
      Player,
      Wall,
      Collectable
    },
    resources: {
      DeltaTime,
      Viewport,
      Camera,
      InputState,
      FocusedCollectable,
      CollectedCount,
      TotalCollectables,
      AnimationClock,
      CurrentPlayerFrame
    }
  }),
  Root
)

export const schema = Game.schema

export const Facing = Game.StateMachine(
  "TopDown/Facing",
  ["Down", "Left", "Right", "Up"]
)

export const Locomotion = Game.StateMachine(
  "TopDown/Locomotion",
  ["Idle", "Walking"]
)
