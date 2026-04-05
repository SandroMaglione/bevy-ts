import { PLAYER_HEIGHT, PLAYER_WIDTH } from "./constants.ts"
import { playerCollider, playerSpawn, playerZeroVelocity } from "./definitions.ts"
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

export const makePlayerDraft = () => {
  return Game.Command.spawnWithMixed(
    Game.Command.entryResult(Position, playerSpawn),
    Game.Command.entryResult(Velocity, playerZeroVelocity),
    Game.Command.entryResult(Collider, playerCollider),
    Game.Command.entry(Renderable, {
      kind: "player",
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      color: 0xd94841,
      accent: 0xfff2d5
    }),
    Game.Command.entry(Player, {}),
    Game.Command.entry(LevelEntity, {})
  )
}

export const makeSolidDraft = (layout: LevelSolidLayout) => {
  return Game.Command.spawnWithMixed(
    Game.Command.entryRaw(Position, { x: layout.x, y: layout.y }),
    Game.Command.entryRaw(Collider, { width: layout.width, height: layout.height }),
    Game.Command.entry(Renderable, renderableForSolid(layout)),
    Game.Command.entry(Solid, {}),
    Game.Command.entry(LevelEntity, {})
  )
}
