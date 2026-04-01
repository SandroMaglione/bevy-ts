import { Fx } from "../../../index.ts"

import { levelBounds } from "../content.ts"
import { PlayerReadQuery } from "../queries.ts"
import { Game, LoseMessage, PlatformerHost, PlayerContacts, SessionState } from "../schema.ts"

export const SyncHudSystem = Game.System.define(
  "Platformer/SyncHud",
  {
    queries: {
      player: PlayerReadQuery
    },
    resources: {
      contacts: Game.System.readResource(PlayerContacts),
      loseMessage: Game.System.readResource(LoseMessage)
    },
    machines: {
      session: Game.System.machine(SessionState)
    },
    services: {
      host: Game.System.service(PlatformerHost)
    }
  },
  ({ queries, resources, machines, services }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      const contacts = resources.contacts.get()
      const hud = services.host.hud

      if (player.ok && player.value) {
        const position = player.value.data.position.get()
        const velocity = player.value.data.velocity.get()
        hud.stats.textContent =
          `x ${Math.round(position.x)}  |  y ${Math.round(position.y)}  |  vx ${Math.round(velocity.x)}  |  vy ${Math.round(velocity.y)}`
        hud.prompt.textContent =
          machines.session.get() === "Playing"
            ? "Run with Shift, move with Arrow keys or A/D, jump with Space, W, or ArrowUp."
            : resources.loseMessage.get()
        hud.hint.textContent =
          `Grounded ${contacts.grounded ? "yes" : "no"}  |  Ceiling ${contacts.hitCeiling ? "yes" : "no"}  |  Kill plane ${levelBounds.killPlaneY}`
      }

      if (machines.session.get() === "Lost") {
        hud.overlay.style.opacity = "1"
        hud.overlayTitle.textContent = "You lost"
        hud.overlaySubtitle.textContent = "The hole wins this round."
        hud.overlayHint.textContent = "Click anywhere or press Enter to restart from the spawn point."
        return
      }

      hud.overlay.style.opacity = "0"
      hud.overlayTitle.textContent = ""
      hud.overlaySubtitle.textContent = ""
      hud.overlayHint.textContent = ""
    })
)
