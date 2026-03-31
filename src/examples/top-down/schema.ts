import { Descriptor, Entity, Schema } from "../../index.ts"

import type {
  AnimationClockValue,
  CurrentPlayerFrameValue,
  InputStateValue,
  TopDownHostValue,
  Vector2
} from "./types.ts"

export const Root = Schema.defineRoot("TopDown")

export const Position = Descriptor.defineComponent<Vector2>()("TopDown/Position")
export const Velocity = Descriptor.defineComponent<Vector2>()("TopDown/Velocity")
export const Collider = Descriptor.defineComponent<{ width: number; height: number }>()("TopDown/Collider")
export const Renderable = Descriptor.defineComponent<{
  kind: "player" | "wall" | "pickup"
  width: number
  height: number
  color: number
  accent: number
}>()("TopDown/Renderable")
export const Player = Descriptor.defineComponent<{}>()("TopDown/Player")
export const Wall = Descriptor.defineComponent<{}>()("TopDown/Wall")
export const Collectable = Descriptor.defineComponent<{
  label: string
  radius: number
}>()("TopDown/Collectable")

export type FocusedCollectableValue = {
  current: Entity.Handle<typeof Root, typeof Collectable> | null
  label: string | null
  distance: number | null
}

export const DeltaTime = Descriptor.defineResource<number>()("TopDown/DeltaTime")
export const Viewport = Descriptor.defineResource<{ width: number; height: number }>()("TopDown/Viewport")
export const Camera = Descriptor.defineResource<Vector2>()("TopDown/Camera")
export const InputState = Descriptor.defineResource<InputStateValue>()("TopDown/InputState")
export const FocusedCollectable = Descriptor.defineResource<FocusedCollectableValue>()("TopDown/FocusedCollectable")
export const CollectedCount = Descriptor.defineResource<number>()("TopDown/CollectedCount")
export const TotalCollectables = Descriptor.defineResource<number>()("TopDown/TotalCollectables")
export const AnimationClock = Descriptor.defineResource<AnimationClockValue>()("TopDown/AnimationClock")
export const CurrentPlayerFrame = Descriptor.defineResource<CurrentPlayerFrameValue>()("TopDown/CurrentPlayerFrame")

export const InputManager = Descriptor.defineService<{
  readonly snapshot: () => InputStateValue
}>()("TopDown/InputManager")
export const TopDownHost = Descriptor.defineService<TopDownHostValue>()("TopDown/Host")

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

export const Facing = Game.StateMachine.define(
  "TopDown/Facing",
  ["Down", "Left", "Right", "Up"]
)

export const Locomotion = Game.StateMachine.define(
  "TopDown/Locomotion",
  ["Idle", "Walking"]
)
