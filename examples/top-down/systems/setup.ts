
import { pickupLayout, wallLayout } from "../content.ts"
import { makePickupDraft, playerDraft, makeWallDraft } from "../drafts.ts"
import { Collectable, Game, Player, Wall } from "../schema.ts"

export const SetupWorldSystem = Game.System(
  "TopDown/SetupWorld",
  {
    commands: Game.System.commands(Game.System.spawns(Player, Wall, Collectable))
  },
  ({ commands }) =>
    {
      if (playerDraft.ok) {
        commands.spawn(playerDraft.value)
      }

      for (const wall of wallLayout) {
        const wallDraft = makeWallDraft(wall.x, wall.y, wall.width, wall.height)
        if (wallDraft.ok) {
          commands.spawn(wallDraft.value)
        }
      }

      for (const pickup of pickupLayout) {
        const pickupDraft = makePickupDraft(pickup.x, pickup.y, pickup.label)
        if (pickupDraft.ok) {
          commands.spawn(pickupDraft.value)
        }
      }
    }
)
