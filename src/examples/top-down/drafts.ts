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

export const makeWallDraft = (x: number, y: number, width: number, height: number) =>
  Game.Command.spawnWith(
    [Position, { x, y }],
    [Collider, { width, height }],
    [Renderable, {
      kind: "wall",
      width,
      height,
      color: 0x24303b,
      accent: 0x87d6ff
    }],
    [Wall, {}]
  )

export const makePickupDraft = (x: number, y: number, label: string) =>
  Game.Command.spawnWith(
    [Position, { x, y }],
    [Collider, { width: 28, height: 28 }],
    [Renderable, {
      kind: "pickup",
      width: 28,
      height: 28,
      color: 0xf7c948,
      accent: 0xfff1b8
    }],
    [Collectable, {
      label,
      radius: PLAYER_INTERACT_RADIUS
    }]
  )

export const makePlayerDraft = () =>
  Game.Command.spawnWith(
    [Position, { x: 180, y: 180 }],
    [Velocity, { x: 0, y: 0 }],
    [Collider, { width: PLAYER_SIZE, height: PLAYER_SIZE }],
    [Renderable, {
      kind: "player",
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      color: 0x4ecdc4,
      accent: 0xd9fffb
    }],
    [Player, {}]
  )
