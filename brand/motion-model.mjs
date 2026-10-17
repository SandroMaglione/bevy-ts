/** Shared motion and SVG scene for the interactive preview and README GIF. */
import { iconDot, wordmarkDot, iconShapes, wordmarkLetterShapes, wordmarkBox, palette } from "./generate.mjs"

export const timing = { launch: 500, stamp: 1200, rebound: 1360, land: 2080, rest: 2400, duration: 4400, reduced: 3000 }
export const sceneBox = { x: -35, y: -220, width: 490, height: 370 }
const box = wordmarkBox(false)
const scale = 100 / box.height
const target = { x: 130 + (wordmarkDot.x + wordmarkDot.size / 2 - box.x) * scale, y: (wordmarkDot.y + wordmarkDot.size / 2 - box.y) * scale }
const contact = { x: target.x - (iconDot.x + iconDot.size / 2 - 50), y: target.y + (94 - iconDot.y - iconDot.size / 2) }
const home = { x: 50, y: 94 }
const clamp = n => Math.max(0, Math.min(1, n))
const ease = n => { n = clamp(n); return n * n * (3 - 2 * n) }
const mix = (a, b, n) => a + (b - a) * n
const flight = (a, b, elapsedMs, durationMs, height) => {
  const seconds = elapsedMs / 1000, durationSeconds = durationMs / 1000
  const gravity = 8 * height / (durationSeconds * durationSeconds)
  const velocityY = (b.y - a.y) / durationSeconds - gravity * durationSeconds / 2
  return { x: mix(a.x, b.x, elapsedMs / durationMs), y: a.y + velocityY * seconds + gravity * seconds * seconds / 2 }
}

export function pose(t) {
  let point = home, angle = 0, sx = 1, sy = 1, dip = 0, name = "Ready"
  if (t >= 220 && t < timing.launch) {
    const compression = Math.sin((t - 220) / (timing.launch - 220) * Math.PI)
    sx = 1 + .45 * compression; sy = 1 - .38 * compression; angle = -10 * compression; name = "Windup"
  } else if (t >= timing.launch && t < timing.stamp) {
    const n = (t - timing.launch) / (timing.stamp - timing.launch)
    point = flight(home, contact, t - timing.launch, timing.stamp - timing.launch, 135)
    angle = 360 * ease(n); name = "Jump"
  } else if (t >= timing.stamp && t < timing.rebound) {
    const compression = Math.sin((t - timing.stamp) / (timing.rebound - timing.stamp) * Math.PI)
    sx = 1 + .5 * compression; sy = 1 - .42 * compression; dip = 7 * compression
    point = { x: contact.x, y: contact.y + dip }; angle = 360; name = "Stamp"
  } else if (t >= timing.rebound && t < timing.land) {
    const n = (t - timing.rebound) / (timing.land - timing.rebound)
    point = flight(contact, home, t - timing.rebound, timing.land - timing.rebound, 120)
    angle = 360 * (1 - ease(n)); name = "Return"
  } else if (t >= timing.land && t < timing.rest) {
    const n = (t - timing.land) / (timing.rest - timing.land)
    const compression = Math.abs(Math.sin(n * Math.PI * 3)) * Math.pow(1 - n, 2)
    sx = 1 + .55 * compression; sy = 1 - .42 * compression; angle = -5 * compression; name = "Land"
  } else if (t >= timing.rest) name = "Rest"
  return { x: point.x, y: point.y, angle, sx, sy, dip, paint: ease((t - timing.stamp) / 65), phase: name }
}

function attributes(p) {
  return {
    jumper: `translate(${p.x} ${p.y}) scale(${p.sx} ${p.sy}) translate(0 -44) rotate(${p.angle}) translate(-50 -50)`,
    ri: `translate(0 ${p.dip / scale})`,
    paint: `translate(${target.x} ${target.y}) scale(${mix(.72, 1, p.paint)})`,
    opacity: String(p.paint)
  }
}

export const sceneBody = t => {
  const p = pose(t), a = attributes(p), letters = wordmarkLetterShapes(), size = wordmarkDot.size * scale
  return `<g transform="translate(130 0) scale(${scale}) translate(${-box.x} ${-box.y})" fill="none" stroke="currentColor" stroke-width="12"><g class="ri" transform="${a.ri}">${letters.slice(0, 2).join("")}</g>${letters.slice(2).join("")}</g>
<g class="paint" opacity="${a.opacity}" transform="${a.paint}"><rect x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" rx="${wordmarkDot.radius * scale}" fill="${palette.tick}"/></g>
<g class="jumper" transform="${a.jumper}">${iconShapes({ color: "currentColor", dot: palette.tick })}</g>`
}

export const scene = t => `<svg viewBox="${sceneBox.x} ${sceneBox.y} ${sceneBox.width} ${sceneBox.height}" role="img" aria-label="The Ritmo icon jumps, stamps the i dot, and returns">${sceneBody(t)}</svg>`

/** Inline the same functions so the HTML preview remains a standalone file. */
export const browserModel = `
const timing = ${JSON.stringify(timing)}, home = ${JSON.stringify(home)}, contact = ${JSON.stringify(contact)}, target = ${JSON.stringify(target)}, scale = ${scale};
const clamp = ${clamp.toString()}, ease = ${ease.toString()}, mix = ${mix.toString()}, flight = ${flight.toString()};
${pose.toString()}
${attributes.toString()}
`
