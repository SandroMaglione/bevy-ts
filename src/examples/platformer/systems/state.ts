import { Fx } from "../../../index.ts"

import { levelBounds, levelSolids, playerSpawn } from "../content.ts"
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

export const ResetWorldOnPlayingEnterSystem = Game.System.define(
  "Platformer/ResetWorldOnPlayingEnter",
  {
    queries: {
      levelEntities: LevelEntityQuery
    },
    resources: {
      contacts: Game.System.writeResource(PlayerContacts),
      loseMessage: Game.System.writeResource(LoseMessage)
    }
  },
  ({ queries, resources, commands }) =>
    Fx.sync(() => {
      resources.contacts.set(makeInitialPlayerContacts())
      resources.loseMessage.set("You fell into a hole.")

      for (const match of queries.levelEntities.each()) {
        commands.despawn(match.entity.id)
      }

      const playerDraft = makePlayerDraft(playerSpawn)
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
