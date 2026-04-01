import * as Result from "../../Result.ts"
import * as Size2 from "../../Size2.ts"
import * as Vector2 from "../../Vector2.ts"
import { PLAYER_HEIGHT, PLAYER_WIDTH } from "./constants.ts"
import type { LevelSolidLayout } from "./content.ts"
import { Collider, Game, LevelEntity, Player, Position, Renderable, Solid, Velocity } from "./schema.ts"

const renderableForSolid = (
  layout: LevelSolidLayout
): {
  kind: "ground" | "block" | "pipe"
  width: number
  height: number
  color: number
  accent: number
} => {
  switch (layout.kind) {
    case "ground":
      return {
        kind: "ground",
        width: layout.width,
        height: layout.height,
        color: 0x8b4f28,
        accent: 0xe4bf75
      }
    case "pipe":
      return {
        kind: "pipe",
        width: layout.width,
        height: layout.height,
        color: 0x2d8c5b,
        accent: 0xa9ffd0
      }
    case "block":
      return {
        kind: "block",
        width: layout.width,
        height: layout.height,
        color: 0xc06a2f,
        accent: 0xffd48d
      }
  }
}

export const makePlayerDraft = (spawn: { x: number; y: number }) => {
  const entries = Result.all([
    Game.Command.entryResult(Position, Vector2.result(spawn)),
    Game.Command.entryResult(Velocity, Vector2.result({ x: 0, y: 0 })),
    Game.Command.entryResult(Collider, Size2.result({ width: PLAYER_WIDTH, height: PLAYER_HEIGHT })),
    Result.success(Game.Command.entry(Renderable, {
      kind: "player",
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      color: 0xd94841,
      accent: 0xfff2d5
    })),
    Result.success(Game.Command.entry(Player, {})),
    Result.success(Game.Command.entry(LevelEntity, {}))
  ] as const)
  if (!entries.ok) {
    return entries
  }

  return Result.success(Game.Command.spawnWith(...entries.value))
}

export const makeSolidDraft = (layout: LevelSolidLayout) => {
  const entries = Result.all([
    Game.Command.entryResult(Position, Vector2.result({ x: layout.x, y: layout.y })),
    Game.Command.entryResult(Collider, Size2.result({ width: layout.width, height: layout.height })),
    Result.success(Game.Command.entry(Renderable, renderableForSolid(layout))),
    Result.success(Game.Command.entry(Solid, {})),
    Result.success(Game.Command.entry(LevelEntity, {}))
  ] as const)
  if (!entries.ok) {
    return entries
  }

  return Result.success(Game.Command.spawnWith(...entries.value))
}
