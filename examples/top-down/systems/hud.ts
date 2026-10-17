
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
      focused: Game.System.changedResource(FocusedCollectable),
      collectedCount: Game.System.changedResource(CollectedCount),
      totalCollectables: Game.System.changedResource(TotalCollectables)
    },
    machines: {
      facing: Game.System.machine(Facing),
      locomotion: Game.System.machine(Locomotion)
    },
    transitionEvents: {
      facing: Game.System.readTransitionEvent(Facing),
      locomotion: Game.System.readTransitionEvent(Locomotion)
    },
    services: {
      host: Game.System.service(TopDownHost)
    }
  },
  ({ resources, machines, transitionEvents, services }) =>
    {
      // Each label is rewritten only when what it shows changed since this system's previous run.
      const countsChanged = resources.collectedCount.changed() || resources.totalCollectables.changed()
      const collectedCount = resources.collectedCount.get()
      const totalCollectables = resources.totalCollectables.get()
      const remaining = Math.max(totalCollectables - collectedCount, 0)

      if (countsChanged || transitionEvents.facing.all().length > 0 || transitionEvents.locomotion.all().length > 0) {
        services.host.hud.stats.textContent = `Collected ${collectedCount}/${totalCollectables}  |  Facing ${machines.facing.get()}  |  ${machines.locomotion.get()}`
      }
      if (resources.focused.changed()) {
        const focused = resources.focused.get()
        services.host.hud.prompt.textContent =
          focused.label === null
            ? "Move with WASD or Arrow keys. Reach a relic and press E."
            : `Press E to collect ${focused.label}`
      }
      if (!countsChanged) return
      services.host.hud.hint.textContent =
        remaining === 0
          ? "Every collectable has been picked up. The ECS world is now empty except for the player and walls."
          : "Player facing and locomotion now live in typed state machines. Pixi only renders the selected sprite frame."
    }
)
