import { Game, Pickup, Player, Position } from "./schema.ts"

export const PlayerQuery = Game.Query({
  selection: {
    position: Game.Query.write(Position),
    player: Game.Query.read(Player)
  }
})

export const PlayerReadQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    player: Game.Query.read(Player)
  }
})

export const PickupQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    pickup: Game.Query.read(Pickup)
  }
})
