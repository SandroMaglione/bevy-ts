import { PLAYER_INTERACT_RADIUS, PLAYER_SIZE } from "./constants.ts"
import { pickupCollider, playerCollider, playerSpawn, playerZeroVelocity } from "./definitions.ts"
import {
  Collider,
  Collectable,
  Game,
  Position,
  Player,
  Renderable,
  Velocity,
  Wall
} from "./schema.ts"

export const makeWallDraft = (x: number, y: number, width: number, height: number) => {
  return Game.Command.spawnWithMixed(
    Game.Command.entryRaw(Position, { x, y }),
    Game.Command.entryRaw(Collider, { width, height }),
    Game.Command.entry(Renderable, {
      kind: "wall",
      width,
      height,
      color: 0x24303b,
      accent: 0x87d6ff
    }),
    Game.Command.entry(Wall, {})
  )
}

export const makePickupDraft = (x: number, y: number, label: string) => {
  return Game.Command.spawnWithMixed(
    Game.Command.entryRaw(Position, { x, y }),
    Game.Command.entryResult(Collider, pickupCollider),
    Game.Command.entry(Renderable, {
      kind: "pickup",
      width: 28,
      height: 28,
      color: 0xf7c948,
      accent: 0xfff1b8
    }),
    Game.Command.entry(Collectable, {
      label,
      radius: PLAYER_INTERACT_RADIUS
    })
  )
}

export const makePlayerDraft = () => {
  return Game.Command.spawnWithMixed(
    Game.Command.entryResult(Position, playerSpawn),
    Game.Command.entryResult(Velocity, playerZeroVelocity),
    Game.Command.entryResult(Collider, playerCollider),
    Game.Command.entry(Renderable, {
      kind: "player",
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      color: 0x4ecdc4,
      accent: 0xd9fffb
    }),
    Game.Command.entry(Player, {})
  )
}
