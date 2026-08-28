import { Fx } from "@bevy-ts/core"

import { levelBounds, levelSolids } from "../content.ts"
import { makePlayerDraft, makeSolidDraft } from "../drafts.ts"
import { PlayerReadQuery } from "../queries.ts"
import { Game, InputState, LevelScope, LoseMessage, PlayerContacts, SessionState } from "../schema.ts"
import { makeInitialPlayerContacts } from "../runtime.ts"

export const QueueLossSystem = Game.System(
  "Platformer/QueueLoss",
  {
    when: [Game.Condition.inState(SessionState, "Playing")],
    queries: {
      player: PlayerReadQuery
    },
    resources: {
      loseMessage: Game.System.writeResource(LoseMessage)
    },
    nextMachines: {
      session: Game.System.nextState(SessionState)
    }
  },
  ({ queries, resources, nextMachines }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      const position = player.value.data.position.get()
      if (position.y <= levelBounds.killPlaneY) {
        return
      }

      resources.loseMessage.set("You fell into a hole. Click anywhere or press Enter to restart.")
      nextMachines.session.set("Lost")
    })
)

export const QueueRestartSystem = Game.System(
  "Platformer/QueueRestart",
  {
    when: [Game.Condition.inState(SessionState, "Lost")],
    resources: {
      input: Game.System.readResource(InputState)
    },
    nextMachines: {
      session: Game.System.nextState(SessionState)
    }
  },
  ({ resources, nextMachines }) =>
    Fx.sync(() => {
      if (resources.input.get().restartJustPressed) {
        nextMachines.session.set("Playing")
      }
    })
)

export const ResetWorldResourcesOnPlayingEnterSystem = Game.System(
  "Platformer/ResetWorldResourcesOnPlayingEnter",
  {
    resources: {
      contacts: Game.System.writeResource(PlayerContacts),
      loseMessage: Game.System.writeResource(LoseMessage)
    }
  },
  ({ resources }) =>
    Fx.sync(() => {
      resources.contacts.set(makeInitialPlayerContacts())
      resources.loseMessage.set("You fell into a hole.")
    })
)

export const DespawnLevelEntitiesOnPlayingEnterSystem = Game.System(
  "Platformer/DespawnLevelEntitiesOnPlayingEnter",
  {},
  ({ commands }) =>
    Fx.sync(() => {
      commands.despawnScope(LevelScope)
    })
)

export const SpawnWorldOnPlayingEnterSystem = Game.System(
  "Platformer/SpawnWorldOnPlayingEnter",
  {},
  ({ commands }) =>
    Fx.sync(() => {
      const playerDraft = makePlayerDraft()
      if (playerDraft.ok) {
        commands.spawnIn(LevelScope, playerDraft.value)
      }

      for (const solid of levelSolids) {
        const solidDraft = makeSolidDraft(solid)
        if (solidDraft.ok) {
          commands.spawnIn(LevelScope, solidDraft.value)
        }
      }
    })
)
