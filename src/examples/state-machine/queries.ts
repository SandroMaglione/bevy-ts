import { Actor, Game, Pickup, Player, Position } from "./schema.ts"

export const PlayerQuery = Game.Query.define({
  selection: {
    position: Game.Query.write(Position),
    player: Game.Query.read(Player)
  }
})

export const PlayerReadQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    player: Game.Query.read(Player)
  }
})

export const PickupQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    pickup: Game.Query.read(Pickup)
  }
})

export const AddedActorQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    actor: Game.Query.read(Actor)
  },
  filters: [Game.Query.added(Actor)]
})

export const ChangedActorTransformQuery = Game.Query.define({
  selection: {
    position: Game.Query.read(Position),
    actor: Game.Query.read(Actor)
  },
  filters: [Game.Query.changed(Position)]
})
