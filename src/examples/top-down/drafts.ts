import * as Result from "../../Result.ts"
import * as Size2 from "../../Size2.ts"
import * as Vector2 from "../../Vector2.ts"
import { PLAYER_INTERACT_RADIUS, PLAYER_SIZE } from "./constants.ts"
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

const success = <Value>(value: Value): Result.Result<Value, never> => Result.success(value)

export const makeWallDraft = (x: number, y: number, width: number, height: number) => {
  return Game.Command.spawnWithResult(
    Game.Command.entryResult(Position, Vector2.result({ x, y })),
    Game.Command.entryResult(Collider, Size2.result({ width, height })),
    success(Game.Command.entry(Renderable, {
      kind: "wall",
      width,
      height,
      color: 0x24303b,
      accent: 0x87d6ff
    })),
    success(Game.Command.entry(Wall, {}))
  )
}

export const makePickupDraft = (x: number, y: number, label: string) => {
  return Game.Command.spawnWithResult(
    Game.Command.entryResult(Position, Vector2.result({ x, y })),
    Game.Command.entryResult(Collider, Size2.result({ width: 28, height: 28 })),
    success(Game.Command.entry(Renderable, {
      kind: "pickup",
      width: 28,
      height: 28,
      color: 0xf7c948,
      accent: 0xfff1b8
    })),
    success(Game.Command.entry(Collectable, {
      label,
      radius: PLAYER_INTERACT_RADIUS
    }))
  )
}

export const makePlayerDraft = () => {
  return Game.Command.spawnWithResult(
    Game.Command.entryResult(Position, Vector2.result({ x: 180, y: 180 })),
    Game.Command.entryResult(Velocity, Vector2.result({ x: 0, y: 0 })),
    Game.Command.entryResult(Collider, Size2.result({ width: PLAYER_SIZE, height: PLAYER_SIZE })),
    success(Game.Command.entry(Renderable, {
      kind: "player",
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      color: 0x4ecdc4,
      accent: 0xd9fffb
    })),
    success(Game.Command.entry(Player, {}))
  )
}
