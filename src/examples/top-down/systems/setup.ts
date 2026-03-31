import { Fx } from "../../../index.ts"

import { pickupLayout, wallLayout } from "../content.ts"
import { makePickupDraft, makePlayerDraft, makeWallDraft } from "../drafts.ts"
import { Game } from "../schema.ts"

export const SetupWorldSystem = Game.System.define(
  "TopDown/SetupWorld",
  {},
  ({ commands }) =>
    Fx.sync(() => {
      commands.spawn(makePlayerDraft())

      for (const wall of wallLayout) {
        commands.spawn(makeWallDraft(wall.x, wall.y, wall.width, wall.height))
      }

      for (const pickup of pickupLayout) {
        commands.spawn(makePickupDraft(pickup.x, pickup.y, pickup.label))
      }
    })
)
