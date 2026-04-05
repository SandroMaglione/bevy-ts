import type { BrowserHud } from "../types.ts"

const makeChip = (): HTMLSpanElement => {
  const chip = document.createElement("span")
  chip.className = "genetics-hud__chip"
  return chip
}

export const createHud = (): { root: HTMLDivElement; hud: BrowserHud } => {
  const root = document.createElement("div")
  root.className = "genetics-hud"

  const top = document.createElement("div")
  top.className = "genetics-hud__top"

  const generation = makeChip()
  const alive = makeChip()
  const dominant = makeChip()
  const births = makeChip()
  const deaths = makeChip()
  const status = makeChip()
  top.append(generation, alive, dominant, births, deaths, status)

  const middle = document.createElement("div")
  middle.className = "genetics-hud__middle"

  const scrim = document.createElement("div")
  scrim.className = "genetics-hud__scrim"

  const overlay = document.createElement("div")
  overlay.className = "genetics-hud__overlay"

  const title = document.createElement("h2")
  title.className = "genetics-hud__title"

  const subtitle = document.createElement("p")
  subtitle.className = "genetics-hud__subtitle"

  const champion = document.createElement("p")
  champion.className = "genetics-hud__champion"

  const dominantLineage = document.createElement("p")
  dominantLineage.className = "genetics-hud__dominant"

  overlay.append(title, subtitle, champion, dominantLineage)
  middle.append(scrim, overlay)

  const footer = document.createElement("p")
  footer.className = "genetics-hud__footer"
  footer.textContent =
    "Traits map to phenotype: sharper shapes are more aggressive, larger bodies are tougher, brighter tones live longer."

  root.append(top, middle, footer)

  return {
    root,
    hud: {
      generation,
      alive,
      dominant,
      births,
      deaths,
      status,
      title,
      subtitle,
      champion,
      dominantLineage,
      footer,
      scrim,
      overlay
    }
  }
}
