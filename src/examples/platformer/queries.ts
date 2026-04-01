import { Collider, Game, LevelEntity, Player, Position, Renderable, Solid, Velocity } from "./schema.ts"

export const PlayerMovementQuery = Game.Query.define({
  selection: {
    position: Game.Query.write(Position),
    velocity: Game.Query.write(Velocity),
    collider: Game.Query.read(Collider),
    player: Game.Query.read(Player)
  }
})

export const PlayerReadQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    velocity: Game.Query.read(Velocity),
    collider: Game.Query.read(Collider),
    player: Game.Query.read(Player)
  }
})

export const PlayerCameraQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    player: Game.Query.read(Player)
  }
})

export const SolidCollisionQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    collider: Game.Query.read(Collider),
    solid: Game.Query.read(Solid)
  }
})

export const LevelEntityQuery = Game.Query.define({
  selection: {
    levelEntity: Game.Query.read(LevelEntity)
  }
})

export const AddedRenderableQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    renderable: Game.Query.read(Renderable)
  },
  filters: [Game.Query.added(Renderable)]
})

export const ChangedRenderableTransformQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    renderable: Game.Query.read(Renderable)
  },
  filters: [Game.Query.changed(Position)]
})
