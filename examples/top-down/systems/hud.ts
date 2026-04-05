import { Fx } from "../../../src/index.ts"

import {
  CollectedCount,
  Facing,
  FocusedCollectable,
  Game,
  Locomotion,
  TopDownHost,
  TotalCollectables
} from "../schema.ts"

export const SyncHudSystem = Game.System(
  "TopDown/SyncHud",
  {
    resources: {
      focused: Game.System.readResource(FocusedCollectable),
      collectedCount: Game.System.readResource(CollectedCount),
      totalCollectables: Game.System.readResource(TotalCollectables)
    },
    machines: {
      facing: Game.System.machine(Facing),
      locomotion: Game.System.machine(Locomotion)
    },
    services: {
      host: Game.System.service(TopDownHost)
    }
  },
  ({ resources, machines, services }) =>
    Fx.sync(() => {
      const focused = resources.focused.get()
      const collectedCount = resources.collectedCount.get()
      const totalCollectables = resources.totalCollectables.get()
      const remaining = Math.max(totalCollectables - collectedCount, 0)

      services.host.hud.stats.textContent = `Collected ${collectedCount}/${totalCollectables}  |  Facing ${machines.facing.get()}  |  ${machines.locomotion.get()}`
      services.host.hud.prompt.textContent =
        focused.label === null
          ? "Move with WASD or Arrow keys. Reach a relic and press E."
          : `Press E to collect ${focused.label}`
      services.host.hud.hint.textContent =
        remaining === 0
          ? "Every collectable has been picked up. The ECS world is now empty except for the player and walls."
          : "Player facing and locomotion now live in typed state machines. Pixi only renders the selected sprite frame."
    })
)
