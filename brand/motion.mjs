/** A whole-icon jump, stamp, and return using the production SVG geometry. */
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { palette, tagline } from "./generate.mjs"
import { timing, scene, browserModel } from "./motion-model.mjs"

const drawing = scene(0)

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
<p class="intro">Ritmo: ${tagline}.</p>
<div class="controls">
  <button id="play" type="button">Pause</button><button id="replay" type="button">Replay</button>
  <label>Speed <select id="speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option></select></label>
  <label><input id="loop" type="checkbox" checked>Loop</label>
  <button id="theme" type="button" aria-pressed="false">Light background</button>
</div>
<div class="timeline"><input id="time" aria-label="Animation time" type="range" min="0" max="${timing.duration}" step="1" value="0"><output id="readout" for="time">0.00 s</output></div>
<div class="stage">${drawing}</div>
<div class="caption"><span id="phase">Ready</span><div><button id="impact" type="button">Stamp frame</button> <button id="return" type="button">Return frame</button></div></div>
<footer>The icon stays square in flight and squashes only at takeoff and contact. The dot stays painted after the bounce. Reduced-motion preferences start paused at the finished lockup.</footer>
</main><script>
(() => {
${browserModel}
  const duration = timing.duration;
  const jumper = document.querySelector('.jumper');
  const paint = document.querySelector('.paint');
  const ri = document.querySelector('.ri');
  const time = document.getElementById('time');
  const readout = document.getElementById('readout');
  const phase = document.getElementById('phase');
  const playButton = document.getElementById('play');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let elapsed = reducedMotion.matches ? timing.reduced : 0;
  let playing = !reducedMotion.matches;
  let speed = 1;
  let last = null;
  let raf = null;

  function draw(t) {
    const p = pose(t);
    const a = attributes(p);
    jumper.setAttribute('transform', a.jumper);
    ri.setAttribute('transform', a.ri);
    paint.setAttribute('opacity', a.opacity);
    paint.setAttribute('transform', a.paint);
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
  document.getElementById('impact').onclick = () => seek((timing.stamp + timing.rebound) / 2);
  document.getElementById('return').onclick = () => seek((timing.rebound + timing.land) / 2);
  document.getElementById('theme').onclick = event => {
    const light = document.body.classList.toggle('light');
    event.currentTarget.setAttribute('aria-pressed', String(light));
    event.currentTarget.textContent = light ? 'Dark background' : 'Light background';
  };
  document.addEventListener('visibilitychange', () => { last = null; schedule(); });
  reducedMotion.addEventListener('change', event => { if (event.matches) seek(timing.reduced); });
  window.ritmoMotion = { seek, play, pause, pose, timing, get state() { return { elapsed, playing, speed }; } };
  draw(elapsed); schedule();
})();
</script></body></html>`

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL("./motion.html", import.meta.url), html)
  console.log("wrote brand/motion.html")
}
