/** Export the approved motion as a GIF that plays once, using rsvg-convert and ffmpeg. */
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { palette, tagline, wordmarkBox } from "./generate.mjs"
import { sceneBody, sceneBox, timing } from "./motion-model.mjs"

const assets = fileURLToPath(new URL("./assets/", import.meta.url))
const work = mkdtempSync(join(tmpdir(), "ritmo-gif-"))
const fps = 40
const finish = timing.rest + 800
const frameCount = Math.ceil(finish * fps / 1000) + 1
const ease = n => { n = Math.max(0, Math.min(1, n)); return n * n * (3 - 2 * n) }
const mix = (a, b, n) => a + (b - a) * n
const box = wordmarkBox(false)
const finalScale = 430 / (130 + box.width * 100 / box.height)
const initialScale = 350 / sceneBox.height
const initialX = (720 - sceneBox.width * initialScale) / 2 - sceneBox.x * initialScale
const initialY = 10 - sceneBox.y * initialScale
const banner = t => {
  // Keep room above the jump, then settle into the standard centred banner.
  const settle = ease((t - timing.rest) / 500)
  const zoom = mix(initialScale, finalScale, settle)
  const x = mix(initialX, 145, settle)
  const y = mix(initialY, 110, settle)
  const label = ease((t - timing.rest - 350) / 300)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="380" viewBox="0 0 720 380" color="${palette.paper}"><title>Ritmo: ${tagline}</title><rect width="720" height="380" rx="20" fill="${palette.ink}"/><g transform="translate(${x} ${y}) scale(${zoom})">${sceneBody(t)}</g><text x="360" y="266" opacity="${label}" text-anchor="middle" fill="${palette.steel}" font-family="ui-monospace, SFMono-Regular, Consolas, Liberation Mono, monospace" font-size="22">${tagline}</text></svg>\n`
}

try {
  writeFileSync(join(assets, "ritmo-motion-still.svg"), banner(finish))
  for (let i = 0; i < frameCount; i++) {
    execFileSync("rsvg-convert", ["-o", join(work, `${String(i).padStart(4, "0")}.png`)], { input: banner(i * 1000 / fps) })
  }
  const output = join(assets, "ritmo-banner.gif")
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-framerate", String(fps),
    "-i", join(work, "%04d.png"),
    "-filter_complex", "[0:v]split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=none",
    "-loop", "-1", "-final_delay", "100", output
  ], { stdio: ["ignore", "inherit", "inherit"] })
  console.log(`wrote ${frameCount} frames, ${Math.round(statSync(output).size / 1024)} KiB: brand/assets/ritmo-banner.gif (plays once)`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
