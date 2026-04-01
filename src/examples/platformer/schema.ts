import { Descriptor, Schema } from "../../index.ts"
import * as Size2 from "../../Size2.ts"
import * as Vector2 from "../../Vector2.ts"
import type { InputStateValue, PlatformerHostValue, PlayerContactsValue } from "./types.ts"

export const Position = Descriptor.defineConstructedComponent(Vector2)("Platformer/Position")
export const Velocity = Descriptor.defineConstructedComponent(Vector2)("Platformer/Velocity")
export const Collider = Descriptor.defineConstructedComponent(Size2)("Platformer/Collider")
export const Renderable = Descriptor.defineComponent<{
  kind: "player" | "ground" | "block" | "pipe"
  width: number
  height: number
  color: number
  accent: number
}>()("Platformer/Renderable")
export const Player = Descriptor.defineComponent<{}>()("Platformer/Player")
export const Solid = Descriptor.defineComponent<{}>()("Platformer/Solid")
export const LevelEntity = Descriptor.defineComponent<{}>()("Platformer/LevelEntity")

export const DeltaTime = Descriptor.defineResource<number>()("Platformer/DeltaTime")
export const Viewport = Descriptor.defineConstructedResource(Size2)("Platformer/Viewport")
export const Camera = Descriptor.defineConstructedResource(Vector2)("Platformer/Camera")
export const InputState = Descriptor.defineResource<InputStateValue>()("Platformer/InputState")
export const PlayerContacts = Descriptor.defineResource<PlayerContactsValue>()("Platformer/PlayerContacts")
export const LoseMessage = Descriptor.defineResource<string>()("Platformer/LoseMessage")

export const InputManager = Descriptor.defineService<{
  readonly snapshot: () => InputStateValue
}>()("Platformer/InputManager")
export const PlatformerHost = Descriptor.defineService<PlatformerHostValue>()("Platformer/Host")

export const schema = Schema.build(
  Schema.fragment({
    components: {
      Position,
      Velocity,
      Collider,
      Renderable,
      Player,
      Solid,
      LevelEntity
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

export const Game = Schema.bind(schema)

export const SessionState = Game.StateMachine.define(
  "Platformer/SessionState",
  ["Playing", "Lost"] as const
)
