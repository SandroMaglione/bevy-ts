import { Fx } from "../../../index.ts"

import { pickupLayout, wallLayout } from "../content.ts"
import { makePickupDraft, makePlayerDraft, makeWallDraft } from "../drafts.ts"
import { Game } from "../schema.ts"

export const SetupWorldSystem = Game.System.define(
  "TopDown/SetupWorld",
  {},
  ({ commands }) =>
    Fx.sync(() => {
      const playerDraft = makePlayerDraft()
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
    })
)
