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

export const makePlayerDraft = (spawn: { x: number; y: number }) =>
  Game.Command.spawnWith(
    [Position, spawn],
    [Velocity, { x: 0, y: 0 }],
    [Collider, { width: PLAYER_WIDTH, height: PLAYER_HEIGHT }],
    [Renderable, {
      kind: "player",
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      color: 0xd94841,
      accent: 0xfff2d5
    }],
    [Player, {}],
    [LevelEntity, {}]
  )

export const makeSolidDraft = (layout: LevelSolidLayout) =>
  Game.Command.spawnWith(
    [Position, { x: layout.x, y: layout.y }],
    [Collider, { width: layout.width, height: layout.height }],
    [Renderable, renderableForSolid(layout)],
    [Solid, {}],
    [LevelEntity, {}]
  )
