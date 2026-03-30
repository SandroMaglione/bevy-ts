import type { HudRefs } from "../types.ts"

export const createHud = (): {
  root: HTMLElement
  refs: HudRefs
} => {
  const root = document.createElement("section")
  root.className = "top-down-hud"

  const badge = document.createElement("div")
  badge.className = "top-down-hud__badge"
  badge.textContent = "bevy-ts proof of concept"

  const title = document.createElement("h1")
  title.className = "top-down-hud__title"
  title.textContent = "Top-down collection run"

  const prompt = document.createElement("p")
  prompt.className = "top-down-hud__prompt"

  const stats = document.createElement("p")
  stats.className = "top-down-hud__stats"

  const hint = document.createElement("p")
  hint.className = "top-down-hud__hint"

  root.appendChild(badge)
  root.appendChild(title)
  root.appendChild(prompt)
  root.appendChild(stats)
  root.appendChild(hint)

  return {
    root,
    refs: {
      prompt,
      stats,
      hint
    }
  }
}
