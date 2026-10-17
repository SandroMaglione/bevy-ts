/** A whole-icon jump, stamp, and return using the production SVG geometry. */
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { palette, iconDot, wordmarkDot, iconShapes, wordmarkLetterShapes, wordmarkBox } from "./generate.mjs"

const box = wordmarkBox(false)
const scale = 100 / box.height
const target = {
  x: 130 + (wordmarkDot.x + wordmarkDot.size / 2 - box.x) * scale,
  y: (wordmarkDot.y + wordmarkDot.size / 2 - box.y) * scale
}
const dotSize = wordmarkDot.size * scale
// At contact, the icon's orange cell is centred exactly on the painted dot.
const contact = { x: target.x - (iconDot.x + iconDot.size / 2 - 50), y: target.y + (94 - iconDot.y - iconDot.size / 2) }
const letters = wordmarkLetterShapes()
const drawing = `<svg viewBox="-35 -220 490 370" role="img" aria-label="The whole Ritmo icon jumps onto the r and i, stamps the orange dot, and bounces home">
  <ellipse class="shadow" cx="50" cy="106" rx="45" ry="5" fill="currentColor" opacity=".12"/>
  <g transform="translate(130 0) scale(${scale}) translate(${-box.x} ${-box.y})" fill="none" stroke="currentColor" stroke-width="12">
    <g class="ri">${letters.slice(0, 2).join("")}</g>${letters.slice(2).join("")}
  </g>
  <g class="paint" transform="translate(${target.x} ${target.y})"><rect x="${-dotSize / 2}" y="${-dotSize / 2}" width="${dotSize}" height="${dotSize}" rx="${wordmarkDot.radius * scale}" fill="${palette.tick}"/></g>
  <g class="jumper">${iconShapes({ color: "currentColor", dot: palette.tick })}</g>
</svg>`

export const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ritmo: stamp and return</title><style>
  * { box-sizing: border-box; }
  body { margin: 0; color: var(--foreground, ${palette.ink}); font: 14px/1.5 var(--font-sans, system-ui), sans-serif; }
  main { width: 100%; max-width: 900px; margin: auto; }
  .intro { margin: 0 0 18px; color: var(--muted-foreground, #60656e); }
  .controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  button, select { border: 1px solid var(--border, ${palette.line}); color: inherit; background: var(--card, ${palette.paper}); border-radius: 6px; padding: 8px 12px; font: inherit; cursor: pointer; }
  button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid ${palette.tick}; outline-offset: 3px; }
  label { display: inline-flex; align-items: center; gap: 6px; }
  .timeline { display: flex; align-items: center; gap: 12px; margin: 12px 0 16px; }
  input[type=range] { flex: 1; min-width: 0; accent-color: ${palette.tick}; }
  output { min-width: 64px; text-align: right; font: 12px var(--font-mono, monospace); color: var(--muted-foreground, #60656e); }
  .stage { height: 380px; padding: 16px; border: 1px solid #30343b; border-radius: 12px; background: ${palette.ink}; color: ${palette.paper}; }
  .stage svg { display: block; width: 100%; height: 100%; }
  body.light .stage { background: ${palette.paper}; color: ${palette.ink}; border-color: ${palette.line}; }
  .caption { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; }
  #phase { font: 12px var(--font-mono, monospace); color: var(--muted-foreground, #60656e); }
  .caption button { padding: 5px 10px; font-size: 12px; }
  footer { margin: 16px 0 0; color: var(--muted-foreground, #60656e); font-size: 12px; }
  @media (max-width: 430px) { .stage { height: 310px; } button, select { padding: 8px 10px; } }
</style></head><body><main>
<p class="intro">The whole icon squashes, jumps onto the ri, stamps the dot, and bounces home.</p>
<div class="controls">
  <button id="play" type="button">Pause</button><button id="replay" type="button">Replay</button>
  <label>Speed <select id="speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option></select></label>
  <label><input id="loop" type="checkbox" checked>Loop</label>
  <button id="theme" type="button" aria-pressed="false">Light background</button>
</div>
<div class="timeline"><input id="time" aria-label="Animation time" type="range" min="0" max="5000" step="1" value="0"><output id="readout" for="time">0.00 s</output></div>
<div class="stage">${drawing}</div>
<div class="caption"><span id="phase">Ready</span><div><button id="impact" type="button">Stamp frame</button> <button id="return" type="button">Return frame</button></div></div>
<footer>The four cells stay together throughout the jump. The dot stays painted after contact. Reduced-motion preferences start paused at the finished lockup. Works offline.</footer>
</main><script>
(() => {
  const contact = ${JSON.stringify(contact)};
  const target = ${JSON.stringify(target)};
  const duration = 5000;
  const clamp = n => Math.max(0, Math.min(1, n));
  const ease = n => { n = clamp(n); return n * n * (3 - 2 * n); };
  const mix = (a, b, n) => a + (b - a) * n;
  const arc = (a, b, n, height) => ({ x: mix(a.x, b.x, n), y: mix(a.y, b.y, n) - height * 4 * n * (1 - n) });
  const home = { x: 50, y: 94 };
  const jumper = document.querySelector('.jumper');
  const paint = document.querySelector('.paint');
  const ri = document.querySelector('.ri');
  const shadow = document.querySelector('.shadow');
  const time = document.getElementById('time');
  const readout = document.getElementById('readout');
  const phase = document.getElementById('phase');
  const playButton = document.getElementById('play');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let elapsed = reducedMotion.matches ? 3500 : 0;
  let playing = !reducedMotion.matches;
  let speed = 1;
  let last = null;
  let raf = null;

  function pose(t) {
    let point = home, angle = 0, sx = 1, sy = 1, dip = 0, name = 'Ready';
    if (t >= 220 && t < 500) {
      const n = ease((t - 220) / 280);
      sx = mix(1, 1.45, n); sy = mix(1, .62, n); angle = -10 * n; name = 'Windup';
    } else if (t >= 500 && t < 1350) {
      const n = (t - 500) / 850;
      point = arc(home, contact, n, 135);
      const release = ease(n / .15);
      sx = mix(1.45, 1 - .25 * Math.sin(Math.PI * n), release);
      sy = mix(.62, 1 + .35 * Math.sin(Math.PI * n), release);
      angle = -10 + 370 * ease(n); name = 'Jump';
    } else if (t >= 1350 && t < 1570) {
      const compression = Math.sin((t - 1350) / 220 * Math.PI);
      sx = 1 + .5 * compression; sy = 1 - .42 * compression;
      dip = 7 * compression;
      point = { x: contact.x, y: contact.y + dip };
      angle = 360; name = 'Stamp';
    } else if (t >= 1570 && t < 2570) {
      const n = (t - 1570) / 1000;
      point = arc(contact, home, n, 120);
      sx = 1 - .24 * Math.sin(Math.PI * n); sy = 1 + .32 * Math.sin(Math.PI * n);
      angle = 360 * (1 - ease(n)); name = 'Return';
    } else if (t >= 2570 && t < 2970) {
      const n = (t - 2570) / 400;
      const compression = Math.sin(n * Math.PI * 3) * Math.pow(1 - n, 2);
      sx = 1 + .55 * compression; sy = 1 - .42 * compression;
      angle = -5 * compression; name = 'Land';
    } else if (t >= 2970) name = 'Rest';
    return { x: point.x, y: point.y, angle, sx, sy, dip, paint: ease((t - 1350) / 85), phase: name };
  }

  function draw(t) {
    const p = pose(t);
    jumper.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ') scale(' + p.sx + ' ' + p.sy + ') translate(0 -44) rotate(' + p.angle + ') translate(-50 -50)');
    ri.setAttribute('transform', 'translate(0 ' + p.dip / ${scale} + ')');
    paint.setAttribute('opacity', String(p.paint));
    paint.setAttribute('transform', 'translate(' + target.x + ' ' + target.y + ') scale(' + mix(.72, 1, p.paint) + ')');
    const grounded = 1 - clamp(Math.abs(p.x - home.x) / 90 + Math.max(0, home.y - p.y) / 120);
    shadow.setAttribute('opacity', String(.12 * grounded));
    shadow.setAttribute('rx', String(45 * Math.max(.4, grounded)));
    time.value = String(Math.round(t));
    readout.value = (t / 1000).toFixed(2) + ' s';
    phase.textContent = p.phase;
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
  document.getElementById('impact').onclick = () => seek(1460);
  document.getElementById('return').onclick = () => seek(2050);
  document.getElementById('theme').onclick = event => {
    const light = document.body.classList.toggle('light');
    event.currentTarget.setAttribute('aria-pressed', String(light));
    event.currentTarget.textContent = light ? 'Dark background' : 'Light background';
  };
  document.addEventListener('visibilitychange', () => { last = null; schedule(); });
  reducedMotion.addEventListener('change', event => { if (event.matches) seek(3500); });
  window.ritmoMotion = { seek, play, pause, pose, get state() { return { elapsed, playing, speed }; } };
  draw(elapsed); schedule();
})();
</script></body></html>`

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL("./motion.html", import.meta.url), html)
  console.log("wrote brand/motion.html")
}
