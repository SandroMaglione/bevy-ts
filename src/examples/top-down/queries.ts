import {
  Camera,
  Collider,
  Collectable,
  Game,
  Player,
  Position,
  Renderable,
  Velocity,
  Wall
} from "./schema.ts"

export const PlayerMovementQuery = Game.Query.define({
  selection: {
    position: Game.Query.write(Position),
    velocity: Game.Query.write(Velocity),
    collider: Game.Query.read(Collider),
    player: Game.Query.read(Player)
  }
})

export const PlayerVelocityQuery = Game.Query.define({
  selection: {
    velocity: Game.Query.read(Velocity),
    player: Game.Query.read(Player)
  }
})

export const PlayerCameraQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    player: Game.Query.read(Player)
  }
})

export const WallCollisionQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    collider: Game.Query.read(Collider),
    wall: Game.Query.read(Wall)
  }
})

export const CollectableQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    collider: Game.Query.read(Collider),
    collectable: Game.Query.read(Collectable),
    renderable: Game.Query.read(Renderable)
  }
})

export const RenderQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    renderable: Game.Query.read(Renderable),
    velocity: Game.Query.optional(Velocity),
    player: Game.Query.optional(Player),
    wall: Game.Query.optional(Wall),
    collectable: Game.Query.optional(Collectable)
  }
})

export const AddedRenderableQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    renderable: Game.Query.read(Renderable)
  },
  filters: [Game.Query.added(Renderable)] as const
})
