/** Generates a self-contained motion playground from the production geometry. */
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { palette, iconDot, wordmarkDot, iconShapes, wordmarkShapes, wordmarkBox } from "./generate.mjs"

const box = wordmarkBox(false)
const scale = 100 / box.height
const origin = { x: iconDot.x + iconDot.size / 2, y: iconDot.y + iconDot.size / 2 }
const target = {
  x: 130 + (wordmarkDot.x + wordmarkDot.size / 2 - box.x) * scale,
  y: (wordmarkDot.y + wordmarkDot.size / 2 - box.y) * scale
}
const studies = [
  ["leap", "01", "Leap", "The small square jumps into the i. My pick for the main reveal."],
  ["turn", "02", "Turn", "One full rotation, then the handoff. A longer introduction."],
  ["relay", "03", "Relay", "Two short hops along the grid. More mechanical, less bounce."]
]

const drawing = (id) => `<svg viewBox="-25 -80 465 230" role="img" aria-label="${id} animation of the Ritmo lockup">
  <g class="cells">${iconShapes({ color: "currentColor", dot: "transparent" })}</g>
  <rect class="refill" x="${iconDot.x}" y="${iconDot.y}" width="${iconDot.size}" height="${iconDot.size}" rx="${iconDot.radius}" fill="${palette.tick}"/>
  <g transform="translate(130 0) scale(${scale}) translate(${-box.x} ${-box.y})">${wordmarkShapes({ color: "currentColor", dot: "transparent", ruler: false })}</g>
  <g class="traveller"><rect x="-12" y="-12" width="24" height="24" rx="4" fill="${palette.tick}"/></g>
</svg>`

export const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ritmo motion studies</title><style>
  * { box-sizing: border-box; }
  body { margin: 0; color: var(--foreground, ${palette.ink}); font: 14px/1.5 var(--font-sans, system-ui), sans-serif; }
  main { width: 100%; max-width: 1100px; margin: auto; }
  .intro { margin: 0 0 18px; color: var(--muted-foreground, #60656e); }
  .controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
  button, select { border: 1px solid var(--border, ${palette.line}); color: inherit; background: var(--card, ${palette.paper}); border-radius: 6px; padding: 8px 12px; font: inherit; cursor: pointer; }
  button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid ${palette.tick}; outline-offset: 3px; }
  label { display: inline-flex; align-items: center; gap: 6px; }
  .timeline { display: flex; align-items: center; gap: 12px; margin: 12px 0 22px; }
  input[type=range] { flex: 1; min-width: 0; accent-color: ${palette.tick}; }
  output { min-width: 64px; text-align: right; font: 12px var(--font-mono, monospace); color: var(--muted-foreground, #60656e); }
  .studies { display: grid; gap: 16px; }
  article { min-width: 0; }
  .stage { height: 220px; padding: 16px; border: 1px solid #30343b; border-radius: 12px; background: ${palette.ink}; color: ${palette.paper}; }
  .stage svg { display: block; width: 100%; height: 100%; overflow: visible; }
  body.light .stage { background: ${palette.paper}; color: ${palette.ink}; border-color: ${palette.line}; }
  .caption { display: flex; align-items: baseline; gap: 10px; margin-top: 9px; }
  .number { color: var(--muted-foreground, #60656e); font: 11px var(--font-mono, monospace); }
  h2 { font-size: 14px; margin: 0; font-weight: 600; }
  article p { margin: 3px 0 0 28px; color: var(--muted-foreground, #60656e); font-size: 12px; }
  footer { margin: 18px 0 0; color: var(--muted-foreground, #60656e); font-size: 12px; }
  @media (min-width: 960px) { .studies { grid-template-columns: repeat(3, minmax(0, 1fr)); } .stage { height: 210px; } }
  @media (max-width: 430px) { .stage { height: 180px; } button, select { padding: 8px 10px; } }
</style></head><body><main>
<p class="intro">Same geometry, three ways to set it in motion. Pause or scrub to inspect any frame.</p>
<div class="controls">
  <button id="play" type="button">Pause</button><button id="replay" type="button">Replay</button>
  <label>Speed <select id="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option></select></label>
  <label><input id="loop" type="checkbox" checked>Loop</label>
  <button id="theme" type="button" aria-pressed="false">Light background</button>
</div>
<div class="timeline"><input id="time" aria-label="Animation time" type="range" min="0" max="3600" step="1" value="0"><output id="readout" for="time">0.00 s</output></div>
<section class="studies" aria-label="Animation concepts">${studies.map(([id, n, title, caption]) => `<article data-study="${id}"><div class="stage">${drawing(id)}</div><div class="caption"><span class="number">${n}</span><h2>${title}</h2></div><p>${caption}</p></article>`).join("")}</section>
<footer>Each sequence settles into the approved lockup. Reduced-motion preferences start paused on that final frame. Works offline with system fonts and no libraries.</footer>
</main><script>
(() => {
  const origin = ${JSON.stringify(origin)};
  const target = ${JSON.stringify(target)};
  const endScale = ${wordmarkDot.size * scale / iconDot.size};
  const duration = 3600;
  const clamp = n => Math.max(0, Math.min(1, n));
  const ease = n => { n = clamp(n); return n * n * (3 - 2 * n); };
  const mix = (a, b, n) => a + (b - a) * n;
  const arc = (a, b, n, height) => ({ x: mix(a.x, b.x, n), y: mix(a.y, b.y, n) - height * 4 * n * (1 - n) });
  const cards = [...document.querySelectorAll('[data-study]')].map(el => ({
    id: el.dataset.study, cells: el.querySelector('.cells'), dot: el.querySelector('.traveller'), refill: el.querySelector('.refill')
  }));
  const time = document.getElementById('time');
  const readout = document.getElementById('readout');
  const playButton = document.getElementById('play');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let elapsed = reducedMotion.matches ? 2400 : 0;
  let playing = !reducedMotion.matches;
  let speed = 1;
  let last = null;
  let raf = null;

  function pose(id, t) {
    let point = origin, rotation = 0, cellRotation = 0, sx = 1, sy = 1, size = 1, refill = 0;
    let land = 1500;
    if (id === 'turn') {
      cellRotation = 360 * ease((t - 200) / 850);
      if (t < 1100) {
        const rad = cellRotation * Math.PI / 180;
        point = { x: 50 + 24 * Math.cos(rad) - 24 * Math.sin(rad), y: 50 + 24 * Math.sin(rad) + 24 * Math.cos(rad) };
        rotation = cellRotation;
      } else {
        const n = ease((t - 1100) / 800);
        point = arc(origin, target, n, 68); rotation = 360 + n * 90; size = mix(1, endScale, n);
      }
      land = 1900;
    } else if (id === 'relay') {
      const corner = { x: 106, y: target.y };
      if (t < 900) { const n = ease((t - 300) / 600); point = arc(origin, corner, n, 22); rotation = n * 90; }
      else { const n = ease((t - 1050) / 600); point = arc(corner, target, n, 26); rotation = 90 + n * 90; size = mix(1, endScale, n); }
      land = 1650;
    } else {
      const n = ease((t - 500) / 1000);
      point = arc(origin, target, n, 80); rotation = n * 90; size = mix(1, endScale, n);
      const crouch = Math.sin(clamp((t - 220) / 280) * Math.PI);
      sx = 1 + crouch * .22; sy = 1 - crouch * .22;
      point = { x: point.x, y: point.y + (1 - sy) * 12 };
    }
    const landing = Math.sin(clamp((t - land) / 220) * Math.PI);
    sx *= 1 + landing * .16; sy *= 1 - landing * .16;
    refill = ease((t - land - 180) / 250);
    const radius = mix(${iconDot.radius}, ${wordmarkDot.radius * iconDot.size / wordmarkDot.size}, clamp((1 - size) / (1 - endScale)));
    return { point, rotation, cellRotation, sx: sx * size, sy: sy * size, refill, radius };
  }

  function draw(t) {
    for (const card of cards) {
      const p = pose(card.id, t);
      card.cells.setAttribute('transform', 'rotate(' + p.cellRotation + ' 50 50)');
      card.dot.setAttribute('transform', 'translate(' + p.point.x + ' ' + p.point.y + ') rotate(' + p.rotation + ') scale(' + p.sx + ' ' + p.sy + ')');
      card.dot.firstElementChild.setAttribute('rx', String(p.radius));
      card.refill.setAttribute('opacity', String(p.refill));
    }
    time.value = String(Math.round(t));
    readout.value = (t / 1000).toFixed(2) + ' s';
    playButton.textContent = playing ? 'Pause' : 'Play';
  }

  function frame(now) {
    raf = null;
    if (!playing || document.hidden) return;
    if (last !== null) elapsed += (now - last) * speed;
    last = now;
    if (elapsed >= duration) {
      if (document.getElementById('loop').checked) elapsed %= duration;
      else { elapsed = duration; playing = false; }
    }
    draw(elapsed);
    if (playing) raf = requestAnimationFrame(frame);
  }
  function schedule() { if (raf === null && playing && !document.hidden) raf = requestAnimationFrame(frame); }
  function pause() { playing = false; last = null; if (raf !== null) cancelAnimationFrame(raf); raf = null; draw(elapsed); }
  function play() { if (elapsed >= duration) elapsed = 0; playing = true; last = null; draw(elapsed); schedule(); }
  function seek(t) { pause(); elapsed = Math.max(0, Math.min(duration, t)); draw(elapsed); }
  playButton.onclick = () => playing ? pause() : play();
  document.getElementById('replay').onclick = () => { elapsed = 0; play(); };
  document.getElementById('speed').onchange = event => { speed = Number(event.target.value); };
  time.oninput = event => seek(Number(event.target.value));
  document.getElementById('theme').onclick = event => {
    const light = document.body.classList.toggle('light');
    event.currentTarget.setAttribute('aria-pressed', String(light));
    event.currentTarget.textContent = light ? 'Dark background' : 'Light background';
  };
  document.addEventListener('visibilitychange', () => { last = null; schedule(); });
  reducedMotion.addEventListener('change', event => { if (event.matches) seek(2400); });
  window.ritmoMotion = { seek, play, pause, pose, get state() { return { elapsed, playing, speed }; } };
  draw(elapsed); schedule();
})();
</script></body></html>`

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL("./motion.html", import.meta.url), html)
  console.log("wrote brand/motion.html")
}
