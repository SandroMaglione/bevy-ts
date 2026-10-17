
import { levelSolids } from "../content.ts"
import { PlayerParts, SolidParts, playerDraft, makeSolidDraft } from "../drafts.ts"
import { Game, LevelScope, LoseMessage, PlayerContacts } from "../schema.ts"
import { makeInitialPlayerContacts } from "../runtime.ts"

export const SetupWorldSystem = Game.System(
  "Platformer/SetupWorld",
  {
    resources: {
      contacts: Game.System.writeResource(PlayerContacts),
      loseMessage: Game.System.writeResource(LoseMessage)
    },
    commands: Game.System.commands(Game.System.spawns(...PlayerParts, ...SolidParts))
  },
  ({ commands, resources }) =>
    {
      resources.contacts.set(makeInitialPlayerContacts())
      resources.loseMessage.set("You fell into a hole.")

      if (playerDraft.ok) {
        commands.spawnIn(LevelScope, playerDraft.value)
      }

      for (const solid of levelSolids) {
        const solidDraft = makeSolidDraft(solid)
        if (solidDraft.ok) {
          commands.spawnIn(LevelScope, solidDraft.value)
        }
      }
    }
)
