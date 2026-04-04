import { Descriptor, Entity, Schema } from "../../index.ts"
import * as Size2 from "../../Size2.ts"
import * as Vector2 from "../../Vector2.ts"

import type {
  AnimationClockValue,
  CurrentPlayerFrameValue,
  InputStateValue,
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
export const InputState = Descriptor.Resource<InputStateValue>()("TopDown/InputState")
export const FocusedCollectable = Descriptor.Resource<FocusedCollectableValue>()("TopDown/FocusedCollectable")
export const CollectedCount = Descriptor.Resource<number>()("TopDown/CollectedCount")
export const TotalCollectables = Descriptor.Resource<number>()("TopDown/TotalCollectables")
export const AnimationClock = Descriptor.Resource<AnimationClockValue>()("TopDown/AnimationClock")
export const CurrentPlayerFrame = Descriptor.Resource<CurrentPlayerFrameValue>()("TopDown/CurrentPlayerFrame")

export const InputManager = Descriptor.Service<{
  readonly snapshot: () => InputStateValue
}>()("TopDown/InputManager")
export const TopDownHost = Descriptor.Service<TopDownHostValue>()("TopDown/Host")

export const schema = Schema.build(
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
  })
)

export const Game = Schema.bind(schema, Root)

export const Facing = Game.StateMachine(
  "TopDown/Facing",
  ["Down", "Left", "Right", "Up"]
)

export const Locomotion = Game.StateMachine(
  "TopDown/Locomotion",
  ["Idle", "Walking"]
)
