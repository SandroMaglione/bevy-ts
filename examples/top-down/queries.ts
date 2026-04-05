import {
  Collider,
  Collectable,
  Game,
  Player,
  Position,
  Renderable,
  Velocity,
  Wall
} from "./schema.ts"

export const PlayerMovementQuery = Game.Query({
  selection: {
    position: Game.Query.write(Position),
    velocity: Game.Query.write(Velocity),
    collider: Game.Query.read(Collider),
    player: Game.Query.read(Player)
  }
})

export const PlayerVelocityQuery = Game.Query({
  selection: {
    velocity: Game.Query.read(Velocity),
    player: Game.Query.read(Player)
  }
})

export const PlayerCameraQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    player: Game.Query.read(Player)
  }
})

export const WallCollisionQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    collider: Game.Query.read(Collider),
    wall: Game.Query.read(Wall)
  }
})

export const CollectableQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    collider: Game.Query.read(Collider),
    collectable: Game.Query.read(Collectable)
  }
})

export const AddedRenderableQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    renderable: Game.Query.read(Renderable)
  },
  filters: [Game.Query.added(Renderable)]
})

export const ChangedRenderableTransformQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    renderable: Game.Query.read(Renderable)
  },
  filters: [Game.Query.changed(Position)]
})

export const PlayerRenderQuery = Game.Query({
  selection: {
    renderable: Game.Query.read(Renderable),
    player: Game.Query.read(Player)
  }
})

export const PickupRenderQuery = Game.Query({
  selection: {
    collectable: Game.Query.read(Collectable),
    pickup: Game.Query.read(Renderable)
  }
})
