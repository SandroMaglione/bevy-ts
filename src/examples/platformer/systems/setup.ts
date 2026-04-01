import { Fx } from "../../../index.ts"

import { levelSolids, playerSpawn } from "../content.ts"
import { makePlayerDraft, makeSolidDraft } from "../drafts.ts"
import { Game, LoseMessage, PlayerContacts } from "../schema.ts"
import { makeInitialPlayerContacts } from "../runtime.ts"

export const SetupWorldSystem = Game.System.define(
  "Platformer/SetupWorld",
  {
    resources: {
      contacts: Game.System.writeResource(PlayerContacts),
      loseMessage: Game.System.writeResource(LoseMessage)
    }
  },
  ({ commands, resources }) =>
    Fx.sync(() => {
      resources.contacts.set(makeInitialPlayerContacts())
      resources.loseMessage.set("You fell into a hole.")

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
