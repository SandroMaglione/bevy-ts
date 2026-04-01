import type { HudRefs } from "../types.ts"

export const createHud = (): {
  root: HTMLElement
  refs: HudRefs
} => {
  const root = document.createElement("section")
  root.className = "platformer-hud"

  const panel = document.createElement("section")
  panel.className = "platformer-hud__panel"

  const badge = document.createElement("div")
  badge.className = "platformer-hud__badge"
  badge.textContent = "bevy-ts platformer v1"

  const title = document.createElement("h1")
  title.className = "platformer-hud__title"
  title.textContent = "Platform run"

  const prompt = document.createElement("p")
  prompt.className = "platformer-hud__prompt"

  const stats = document.createElement("p")
  stats.className = "platformer-hud__stats"

  const hint = document.createElement("p")
  hint.className = "platformer-hud__hint"

  panel.appendChild(badge)
  panel.appendChild(title)
  panel.appendChild(prompt)
  panel.appendChild(stats)
  panel.appendChild(hint)

  const overlay = document.createElement("section")
  overlay.className = "platformer-overlay"

  const overlayTitle = document.createElement("h2")
  overlayTitle.className = "platformer-overlay__title"

  const overlaySubtitle = document.createElement("p")
  overlaySubtitle.className = "platformer-overlay__subtitle"

  const overlayHint = document.createElement("p")
  overlayHint.className = "platformer-overlay__hint"

  overlay.appendChild(overlayTitle)
  overlay.appendChild(overlaySubtitle)
  overlay.appendChild(overlayHint)

  root.appendChild(panel)
  root.appendChild(overlay)

  return {
    root,
    refs: {
      prompt,
      stats,
      hint,
      overlay,
      overlayTitle,
      overlaySubtitle,
      overlayHint
    }
  }
}
