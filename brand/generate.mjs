/**
 * Generates every Ritmo brand file from one geometry: the icon (three cells
 * and the "now" cell), the wordmark (fixed strokes, no font), and the lockups.
 *
 *   node brand/generate.mjs            # SVGs
 *   node brand/generate.mjs --png      # SVGs and PNGs (needs rsvg-convert)
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const palette = {
  ink: "#0E1013",
  paper: "#F3F1EC",
  tick: "#FF5A36",
  graphite: "#262A31",
  steel: "#8A8F98",
  line: "#D9D5CC"
}

export const tagline = "the agent-first typed ECS runtime"

// Wordmark geometry, in wordmark units: stroke 12, x-height 40..100, one gap between letters.
const GAP = 16
const R = 0
const I = R + 38 + GAP + 6
const T = I + 6 + GAP + 18
const M = T + 18 + GAP
const O = M + 50 + GAP
const WIDTH = O + 50

/** Shared accent geometry for static marks and the motion studies. */
export const iconDot = { x: 62, y: 62, size: 24, radius: 4 }
export const wordmarkDot = { x: I - 9, y: 14, size: 18, radius: 2.5 }

/** The wordmark's viewBox, with or without the tick ruler. */
export const wordmarkBox = (ruler) => ({ x: -3, y: 12, width: WIDTH + 6, height: (ruler ? 132 : 100) - 14 + 4 })

/** The five letters, kept separate so motion can react on the r and i. */
export const wordmarkLetterShapes = () => [
    `<path d="M6 100 V40 M6 70 C6 52 16 46 30 46 H38" transform="translate(${R} 0)"/>`,
    `<path d="M${I} 100 V40"/>`,
    `<path d="M${T} 100 V20 M${T - 18} 46 H${T + 18}"/>`,
    `<path transform="translate(${M} 0)" d="M6 100 V40 M6 60 Q6 46 15.5 46 Q25 46 25 60 V100 M25 60 Q25 46 34.5 46 Q44 46 44 60 V100"/>`,
    `<rect x="${O + 6}" y="46" width="38" height="48" rx="19"/>`
  ]

/** The wordmark's shapes, drawn in `color` with the i's dot in `dot`. */
export const wordmarkShapes = ({ color, dot, ruler }) => {
  const strokes = wordmarkLetterShapes().join("")
  let ticks = ""
  if (ruler) {
    for (let k = 0; k <= 20; k++) {
      const x = (k * WIDTH) / 20
      const major = k % 5 === 0
      ticks += `<rect x="${round(x - (major ? 2 : 1.5))}" y="114" width="${major ? 4 : 3}" height="${major ? 18 : 10}" rx="1.5"${major ? "" : ` opacity=".45"`}/>`
    }
  }
  return `<g fill="none" stroke="${color}" stroke-width="12">${strokes}</g>` +
    `<rect x="${wordmarkDot.x}" y="${wordmarkDot.y}" width="${wordmarkDot.size}" height="${wordmarkDot.size}" rx="${wordmarkDot.radius}" fill="${dot}"/>` +
    (ticks === "" ? "" : `<g fill="${color}">${ticks}</g>`)
}

/** The icon's shapes in a 100×100 box: three cells and the "now" cell. */
export const iconShapes = ({ color, dot }) =>
  `<rect x="6" y="6" width="40" height="40" rx="6" fill="${color}"/>` +
  `<rect x="54" y="6" width="40" height="40" rx="6" fill="${color}"/>` +
  `<rect x="6" y="54" width="40" height="40" rx="6" fill="${color}"/>` +
  `<rect x="${iconDot.x}" y="${iconDot.y}" width="${iconDot.size}" height="${iconDot.size}" rx="${iconDot.radius}" fill="${dot}"/>`

const round = (n) => Math.round(n * 100) / 100
const svg = (width, height, body, viewBox = `0 0 ${width} ${height}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}" height="${round(height)}" viewBox="${viewBox}">${body}</svg>\n`
const nested = (x, y, width, height, box, body) =>
  `<svg x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}">${body}</svg>`

const icon = ({ color, dot, size = 100 }) => svg(size, size, iconShapes({ color, dot }), "0 0 100 100")

const wordmark = ({ color, dot, ruler, height = 100 }) => {
  const box = wordmarkBox(ruler)
  return svg((box.width * height) / box.height, height, wordmarkShapes({ color, dot, ruler }), `${box.x} ${box.y} ${box.width} ${box.height}`)
}

// The lockups: the wordmark is scaled to the icon's height, a gap of 0.3 icon apart.
const lockup = ({ color, dot }) => {
  const box = wordmarkBox(false)
  const w = (box.width * 100) / box.height
  return svg(100 + 30 + w, 100, iconShapes({ color, dot }) + nested(130, 0, w, 100, box, wordmarkShapes({ color, dot, ruler: false })))
}
const paddedLockup = (colors) => {
  const box = wordmarkBox(false)
  const width = 130 + (box.width * 100) / box.height
  return svg(width, 160, nested(0, 30, width, 100, { x: 0, y: 0, width, height: 100 }, iconShapes(colors) + nested(130, 0, width - 130, 100, box, wordmarkShapes({ ...colors, ruler: false }))))
}

// A dark banner matching the approved lockup-and-tagline composition.
const banner = () => {
  const box = wordmarkBox(false)
  const width = 130 + (box.width * 100) / box.height
  const mark = iconShapes({ color: palette.paper, dot: palette.tick }) + nested(130, 0, width - 130, 100, box, wordmarkShapes({ color: palette.paper, dot: palette.tick, ruler: false }))
  return svg(720, 380, `<title>Ritmo: ${tagline}</title><rect width="720" height="380" rx="20" fill="${palette.ink}"/>` + nested(145, 110, 430, 43000 / width, { x: 0, y: 0, width, height: 100 }, mark) + `<text x="360" y="266" text-anchor="middle" fill="${palette.steel}" font-family="ui-monospace, SFMono-Regular, Consolas, Liberation Mono, monospace" font-size="22">${tagline}</text>`)
}
const stacked = ({ color, dot }) => {
  const box = wordmarkBox(false)
  const w = 200
  const h = (box.height * w) / box.width
  return svg(w, 100 + 24 + h, nested(50, 0, 100, 100, { x: 0, y: 0, width: 100, height: 100 }, iconShapes({ color, dot })) + nested(0, 124, w, h, box, wordmarkShapes({ color, dot, ruler: false })))
}

// App icon and avatar: the icon on a filled tile.
const appIcon = (size = 512) =>
  svg(size, size, `<rect width="100" height="100" rx="22" fill="${palette.ink}"/>` + nested(20, 20, 60, 60, { x: 0, y: 0, width: 100, height: 100 }, iconShapes({ color: palette.paper, dot: palette.tick })), "0 0 100 100")
const avatar = (size = 512) =>
  svg(size, size, `<circle cx="50" cy="50" r="50" fill="${palette.tick}"/>` + nested(25, 25, 50, 50, { x: 0, y: 0, width: 100, height: 100 }, iconShapes({ color: palette.ink, dot: palette.ink })), "0 0 100 100")

const onLight = { color: palette.ink, dot: palette.tick }
const onDark = { color: palette.paper, dot: palette.tick }
const mono = { color: palette.ink, dot: palette.ink }

export const files = {
  "ritmo-icon.svg": icon(onLight),
  "ritmo-icon-inverse.svg": icon(onDark),
  "ritmo-icon-mono.svg": icon(mono),
  "ritmo-wordmark.svg": wordmark({ ...onLight, ruler: true }),
  "ritmo-wordmark-inverse.svg": wordmark({ ...onDark, ruler: true }),
  "ritmo-wordmark-compact.svg": wordmark({ ...onLight, ruler: false }),
  "ritmo-wordmark-compact-inverse.svg": wordmark({ ...onDark, ruler: false }),
  "ritmo-lockup.svg": lockup(onLight),
  "ritmo-lockup-inverse.svg": lockup(onDark),
  "ritmo-lockup-padded.svg": paddedLockup(onLight),
  "ritmo-lockup-padded-inverse.svg": paddedLockup(onDark),
  "ritmo-banner.svg": banner(),
  "ritmo-lockup-stacked.svg": stacked(onLight),
  "ritmo-lockup-stacked-inverse.svg": stacked(onDark),
  "ritmo-app-icon.svg": appIcon(),
  "ritmo-avatar.svg": avatar(),
  "favicon.svg": icon({ ...onLight, size: 32 })
}

// One page with every variation, the palette, and the rules (open brand/sheet.html in a browser).
const sheet = () => {
  const tile = (bg, fg, body, caption) =>
    `<figure><div class="tile" style="background:${bg};color:${fg}">${body}</div><figcaption>${caption}</figcaption></figure>`
  const asset = (name, height) => files[name].replace("<svg ", `<svg style="height:${height}px;width:auto" `)
  const swatches = [
    ["Ink", palette.ink, "Backgrounds, text on paper. The default surface."],
    ["Paper", palette.paper, "Light surface, text on ink. Warm, not pure white."],
    ["Tick", palette.tick, "Accent for the changing cell and round avatar."],
    ["Graphite", palette.graphite, "Raised surfaces on ink: cards, code blocks."],
    ["Steel", palette.steel, "Secondary text, ruler minor ticks, borders on ink."],
    ["Line", palette.line, "Borders and dividers on paper."]
  ]
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ritmo brand sheet</title>
<link rel="icon" href="assets/favicon.svg">
<style>
  body { margin: 0; padding: clamp(16px, 4vw, 40px); background: #16181c; color: ${palette.paper}; font: 14px/1.5 system-ui, sans-serif; }
  h1 { margin: 0 0 32px; } h2 { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: ${palette.steel}; margin: 40px 0 12px; }
  .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); }
  figure { margin: 0; } figcaption { color: ${palette.steel}; font-size: 12px; margin-top: 6px; }
  .tile { border-radius: 12px; padding: 32px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: center; min-height: 120px; }
  .tile svg, h1 svg { max-width: 100%; }
  .swatch { border-radius: 12px; overflow: hidden; border: 1px solid #2c3036; } .swatch div:first-child { height: 80px; }
  .swatch div:last-child { padding: 10px 12px; font-size: 12px; } code { font-family: ui-monospace, monospace; }
</style></head><body>
<h1 aria-label="Ritmo">${asset("ritmo-lockup-inverse.svg", 56)}</h1>
<h2>Banner</h2><div style="max-width:720px">${files["ritmo-banner.svg"].replace("<svg ", '<svg style="width:100%;height:auto;display:block" ')}</div>
<h2>Lockups</h2><div class="grid">
${tile(palette.ink, palette.paper, asset("ritmo-lockup-inverse.svg", 64), "ritmo-lockup-inverse.svg")}
${tile(palette.paper, palette.ink, asset("ritmo-lockup.svg", 64), "ritmo-lockup.svg")}
${tile(palette.graphite, palette.paper, asset("ritmo-lockup-stacked-inverse.svg", 140), "ritmo-lockup-stacked-inverse.svg")}
${tile(palette.paper, palette.ink, asset("ritmo-lockup-stacked.svg", 140), "ritmo-lockup-stacked.svg")}
</div>
<h2>Wordmark</h2><div class="grid">
${tile(palette.ink, palette.paper, asset("ritmo-wordmark-inverse.svg", 90), "With the tick ruler: headers and the docs.")}
${tile(palette.paper, palette.ink, asset("ritmo-wordmark.svg", 90), "ritmo-wordmark.svg")}
${tile(palette.ink, palette.paper, asset("ritmo-wordmark-compact-inverse.svg", 64), "Compact, no ruler: under 120px wide.")}
${tile(palette.paper, palette.ink, asset("ritmo-wordmark-compact.svg", 64), "ritmo-wordmark-compact.svg")}
</div>
<h2>Icon</h2><div class="grid">
${tile(palette.ink, palette.paper, asset("ritmo-icon-inverse.svg", 96), "ritmo-icon-inverse.svg")}
${tile(palette.paper, palette.ink, asset("ritmo-icon.svg", 96), "ritmo-icon.svg")}
${tile(palette.paper, palette.ink, asset("ritmo-icon-mono.svg", 96), "One colour: ritmo-icon-mono.svg")}
${tile(palette.paper, palette.ink, asset("ritmo-app-icon.svg", 96) + asset("ritmo-avatar.svg", 96), "App icon and avatar")}
${tile(palette.ink, palette.paper, [64, 32, 24, 16].map((s) => asset("ritmo-icon-inverse.svg", s)).join("&nbsp;&nbsp;"), "64 / 32 / 24 / 16 px")}
</div>
<h2>Palette</h2><div class="grid">
${swatches.map(([name, hex, use]) => `<div class="swatch"><div style="background:${hex}"></div><div><b>${name}</b> <code>${hex}</code><br>${use}</div></div>`).join("\n")}
</div>
<h2>Rules</h2><div class="grid">
<div><b>Accent marks the changing cell.</b> Use Tick for the icon's small square and the wordmark's dot. Lockups repeat that cell in both marks. The round avatar is the only solid accent background.</div>
<div><b>Clear space.</b> Keep one icon cell (a big square) of empty space around the icon and the lockups.</div>
<div><b>Minimum sizes.</b> Icon 16px. Wordmark with the ruler 120px wide; below that, use the compact wordmark.</div>
<div><b>Precision, not music.</b> No notes, waves, headphones, or soft gradients. Grids, ticks, and blocks only.</div>
</div>
</body></html>
`
}

const here = dirname(fileURLToPath(import.meta.url))
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(here, "assets")
  mkdirSync(out, { recursive: true })
  for (const [name, content] of Object.entries(files)) writeFileSync(join(out, name), content)
  writeFileSync(join(here, "sheet.html"), sheet())
  if (process.argv.includes("--png")) {
    const png = (source, target, size) => execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), "-o", join(out, target), join(out, source)])
    png("ritmo-app-icon.svg", "ritmo-app-icon-512.png", 512)
    png("ritmo-avatar.svg", "ritmo-avatar-512.png", 512)
    png("ritmo-icon.svg", "favicon-32.png", 32)
    png("ritmo-icon.svg", "favicon-16.png", 16)
  }
  console.log(`wrote ${Object.keys(files).length} SVGs to ${out}`)
}
