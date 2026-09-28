import { Descriptor, Schema } from "@typeonce/bevy-ts"
import * as Size2 from "@typeonce/bevy-ts-math/Size2"
import * as Vector2 from "@typeonce/bevy-ts-math/Vector2"
import type { InputStateValue, PlatformerHostValue, PlayerContactsValue } from "./types.ts"

export const Position = Descriptor.ConstructedComponent(Vector2)("Platformer/Position")
export const Velocity = Descriptor.ConstructedComponent(Vector2)("Platformer/Velocity")
export const Collider = Descriptor.ConstructedComponent(Size2)("Platformer/Collider")
export const Renderable = Descriptor.Component<{
  kind: "player" | "ground" | "block" | "pipe"
  width: number
  height: number
  color: number
  accent: number
}>()("Platformer/Renderable")
export const Player = Descriptor.Component<{}>()("Platformer/Player")
export const Solid = Descriptor.Component<{}>()("Platformer/Solid")

export const DeltaTime = Descriptor.Resource<number>()("Platformer/DeltaTime")
export const Viewport = Descriptor.ConstructedResource(Size2)("Platformer/Viewport")
export const Camera = Descriptor.ConstructedResource(Vector2)("Platformer/Camera")
export const InputState = Descriptor.Resource<InputStateValue>()("Platformer/InputState")
export const PlayerContacts = Descriptor.Resource<PlayerContactsValue>()("Platformer/PlayerContacts")
export const LoseMessage = Descriptor.Resource<string>()("Platformer/LoseMessage")

export const InputManager = Descriptor.Service<{
  readonly snapshot: () => InputStateValue
}>()("Platformer/InputManager")
export const PlatformerHost = Descriptor.Service<PlatformerHostValue>()("Platformer/Host")
export const RenderNodes = Descriptor.Service<PlatformerHostValue["nodes"]>()("Platformer/RenderNodes")

export const Game = Schema.bind(
  Schema.fragment({
    components: {
      Position,
      Velocity,
      Collider,
      Renderable,
      Player,
      Solid
    },
    resources: {
      DeltaTime,
      Viewport,
      Camera,
      InputState,
      PlayerContacts,
      LoseMessage
    }
  })
)

export const schema = Game.schema

export const LevelScope = Game.EntityScope("Platformer/Level")

export const SessionState = Game.StateMachine(
  "Platformer/SessionState",
  ["Playing", "Lost"] as const
)
