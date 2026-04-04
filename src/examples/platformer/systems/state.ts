import { Fx } from "../../../index.ts"

import { levelBounds, levelSolids } from "../content.ts"
import { makePlayerDraft, makeSolidDraft } from "../drafts.ts"
import { LevelEntityQuery, PlayerReadQuery } from "../queries.ts"
import { Game, InputState, LoseMessage, PlayerContacts, SessionState } from "../schema.ts"
import { makeInitialPlayerContacts } from "../runtime.ts"

export const QueueLossSystem = Game.System.define(
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

export const QueueRestartSystem = Game.System.define(
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

export const ResetWorldResourcesOnPlayingEnterSystem = Game.System.define(
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

export const DespawnLevelEntitiesOnPlayingEnterSystem = Game.System.define(
  "Platformer/DespawnLevelEntitiesOnPlayingEnter",
  {
    queries: {
      levelEntities: LevelEntityQuery
    }
  },
  ({ queries, commands }) =>
    Fx.sync(() => {
      for (const match of queries.levelEntities.each()) {
        commands.despawn(match.entity.id)
      }
    })
)

export const SpawnWorldOnPlayingEnterSystem = Game.System.define(
  "Platformer/SpawnWorldOnPlayingEnter",
  {},
  ({ commands }) =>
    Fx.sync(() => {
      const playerDraft = makePlayerDraft()
      if (playerDraft.ok) {
        commands.spawn(playerDraft.value)
      }

      for (const solid of levelSolids) {
        const solidDraft = makeSolidDraft(solid)
        if (solidDraft.ok) {
          commands.spawn(solidDraft.value)
        }
      }
    })
)
