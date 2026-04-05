import { Fx } from "../../../src/index.ts"

import { CollectableQuery, PlayerCameraQuery } from "../queries.ts"
import {
  CollectedCount,
  Collectable,
  FocusedCollectable,
  Game,
  InputState
} from "../schema.ts"
import { makeEmptyFocusedCollectable } from "../runtime.ts"

export const UpdateFocusedCollectableSystem = Game.System(
  "TopDown/UpdateFocusedCollectable",
  {
    queries: {
      player: PlayerCameraQuery,
      collectables: CollectableQuery
    },
    resources: {
      focused: Game.System.writeResource(FocusedCollectable)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      const playerPosition = player.value.data.position.get()
      let current: import("../schema.ts").FocusedCollectableValue["current"] = null
      let label: string | null = null
      let bestDistanceSquared = Number.POSITIVE_INFINITY

      for (const collectable of queries.collectables.each()) {
        const position = collectable.data.position.get()
        const data = collectable.data.collectable.get()
        const dx = position.x - playerPosition.x
        const dy = position.y - playerPosition.y
        const distanceSquared = dx * dx + dy * dy

        if (distanceSquared > data.radius * data.radius || distanceSquared >= bestDistanceSquared) {
          continue
        }

        bestDistanceSquared = distanceSquared
        current = Game.Entity.handleAs(Collectable, collectable.entity.id)
        label = data.label
      }

      resources.focused.set({
        current,
        label,
        distance: current === null ? null : Math.sqrt(bestDistanceSquared)
      })
    })
)

export const CollectFocusedCollectableSystem = Game.System(
  "TopDown/CollectFocusedCollectable",
  {
    resources: {
      input: Game.System.readResource(InputState),
      focused: Game.System.writeResource(FocusedCollectable),
      collectedCount: Game.System.writeResource(CollectedCount)
    }
  },
  ({ resources, lookup, commands }) =>
    Fx.sync(() => {
      if (!resources.input.get().interactJustPressed) {
        return
      }

      const focused = resources.focused.get()
      if (!focused.current) {
        return
      }

      const result = lookup.getHandle(focused.current, CollectableQuery)
      if (!result.ok) {
        resources.focused.set(makeEmptyFocusedCollectable())
        return
      }

      commands.despawn(result.value.entity.id)
      resources.collectedCount.update((value) => value + 1)
      resources.focused.set(makeEmptyFocusedCollectable())
    })
)
