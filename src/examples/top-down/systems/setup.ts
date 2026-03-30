import { Fx } from "../../../index.ts"

import { pickupLayout, wallLayout } from "../content.ts"
import { makePickupDraft, makePlayerDraft, makeWallDraft } from "../drafts.ts"
import {
  CollectedCount,
  FocusedCollectable,
  Game,
  TotalCollectables
} from "../schema.ts"

export const SetupWorldSystem = Game.System.define(
  "TopDown/SetupWorld",
  {
    resources: {
      totalCollectables: Game.System.writeResource(TotalCollectables),
      collectedCount: Game.System.writeResource(CollectedCount),
      focused: Game.System.writeResource(FocusedCollectable)
    }
  },
  ({ commands, resources }) =>
    Fx.sync(() => {
      commands.spawn(makePlayerDraft())

      for (const wall of wallLayout) {
        commands.spawn(makeWallDraft(wall.x, wall.y, wall.width, wall.height))
      }

      for (const pickup of pickupLayout) {
        commands.spawn(makePickupDraft(pickup.x, pickup.y, pickup.label))
      }

      resources.totalCollectables.set(pickupLayout.length)
      resources.collectedCount.set(0)
      resources.focused.set({
        current: null,
        label: null,
        distance: null
      })
    })
)
