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

export const makeWallDraft = (x: number, y: number, width: number, height: number) => {
  const entries = Result.all([
    Game.Command.entryResult(Position, Vector2.result({ x, y })),
    Game.Command.entryResult(Collider, Size2.result({ width, height })),
    Result.success(Game.Command.entry(Renderable, {
      kind: "wall",
      width,
      height,
      color: 0x24303b,
      accent: 0x87d6ff
    })),
    Result.success(Game.Command.entry(Wall, {}))
  ] as const)
  if (!entries.ok) {
    return entries
  }

  return Result.success(Game.Command.spawnWith(...entries.value))
}

export const makePickupDraft = (x: number, y: number, label: string) => {
  const entries = Result.all([
    Game.Command.entryResult(Position, Vector2.result({ x, y })),
    Game.Command.entryResult(Collider, Size2.result({ width: 28, height: 28 })),
    Result.success(Game.Command.entry(Renderable, {
      kind: "pickup",
      width: 28,
      height: 28,
      color: 0xf7c948,
      accent: 0xfff1b8
    })),
    Result.success(Game.Command.entry(Collectable, {
      label,
      radius: PLAYER_INTERACT_RADIUS
    }))
  ] as const)
  if (!entries.ok) {
    return entries
  }

  return Result.success(Game.Command.spawnWith(...entries.value))
}

export const makePlayerDraft = () => {
  const entries = Result.all([
    Game.Command.entryResult(Position, Vector2.result({ x: 180, y: 180 })),
    Game.Command.entryResult(Velocity, Vector2.result({ x: 0, y: 0 })),
    Game.Command.entryResult(Collider, Size2.result({ width: PLAYER_SIZE, height: PLAYER_SIZE })),
    Result.success(Game.Command.entry(Renderable, {
      kind: "player",
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      color: 0x4ecdc4,
      accent: 0xd9fffb
    })),
    Result.success(Game.Command.entry(Player, {}))
  ] as const)
  if (!entries.ok) {
    return entries
  }

  return Result.success(Game.Command.spawnWith(...entries.value))
}
