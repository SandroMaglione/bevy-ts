<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/ritmo-lockup-inverse.svg">
    <img alt="ritmo" src="./assets/ritmo-lockup.svg" height="72">
  </picture>
</p>

# Brand

Ritmo is the agent-first typed ECS runtime.

The assets share one geometry and motion model. Edit the generators, never their output:

```sh
node brand/generate.mjs --png   # SVGs, PNGs (needs rsvg-convert), and sheet.html
node brand/gif.mjs              # GIF and still fallback (needs rsvg-convert and ffmpeg)
```

Open [`sheet.html`](./sheet.html) in a browser for every variation on one page.

Open [`motion.html`](./motion.html) for the whole-icon jump, stamp, and return, with
play, pause, scrubbing, speed, and background controls. Regenerate it with `node brand/motion.mjs`.
It uses the same geometry as the SVGs and works offline.
The GIF uses the same poses and SVG scene, plays once, and stops on the final lockup.
The README serves the still SVG when a reader requests reduced motion.

## The idea

**Ritmo** is rhythm as discipline, not mood: a beat that never drifts. Every tick lands on
the grid, every system plays its part in a checked order, and changes land only on explicit
beats.

- **The icon** is the world as cells: three blocks an entity is built from, and one smaller
  cell, the one that changes this tick. It reads as ECS and as pixel art, and survives one
  colour at 16px.
- **The wordmark** is drawn from fixed strokes (no font), so it is identical everywhere. The
  dot of the `i` is the icon's small cell. The ruler underneath says *measured*.

## Files

| File | Use |
|---|---|
| `ritmo-lockup.svg` / `-inverse` | Icon and name: READMEs, the docs header, slides |
| `ritmo-lockup-padded.svg` / `-inverse` | The lockup with extra vertical space for the README header |
| `ritmo-banner.svg` | Dark banner with the lockup and the full tagline |
| `ritmo-banner.gif`, `ritmo-motion-still.svg` | README animation and matching reduced-motion fallback |
| `ritmo-lockup-stacked.svg` / `-inverse` | Square spaces: social cards, title slides |
| `ritmo-wordmark.svg` / `-inverse` | The name with the tick ruler, 120px wide and up |
| `ritmo-wordmark-compact.svg` / `-inverse` | The name without the ruler, for small sizes |
| `ritmo-icon.svg` / `-inverse` / `-mono` | The icon alone; `-mono` for one-colour printing |
| `ritmo-app-icon.svg`, `ritmo-app-icon-512.png` | App icon, organisation avatar |
| `ritmo-avatar.svg`, `ritmo-avatar-512.png` | Round avatars (GitHub, npm) |
| `favicon.svg`, `favicon-32.png`, `favicon-16.png` | Browser tabs |

`-inverse` files are for dark backgrounds.

## Palette

| Name | Hex | Use |
|---|---|---|
| Ink | `#0E1013` | Backgrounds, text on paper. The default surface. |
| Paper | `#F3F1EC` | Light surface, text on ink. Warm, not pure white. |
| Tick | `#FF5A36` | Changing cell and round avatar background. |
| Graphite | `#262A31` | Raised surfaces on ink: cards, code blocks. |
| Steel | `#8A8F98` | Secondary text, ruler minor ticks, borders on ink. |
| Line | `#D9D5CC` | Borders and dividers on paper. |

Type: a monospace face for headings and code (JetBrains Mono or IBM Plex Mono), a sans for
body text (Inter or IBM Plex Sans).

## Rules

- **Accent marks the changing cell.** Use Tick for the icon's small square and the
  wordmark's dot. Lockups repeat that cell in both marks. The round avatar is the only
  solid accent background.
- **Clear space.** Keep one icon cell (a big square) of empty space around the icon and the lockups.
- **Minimum sizes.** Icon 16px. Wordmark with the ruler 120px wide; below that, use the compact wordmark.
- **Precision, not music.** No notes, waves, headphones, or soft gradients. Grids, ticks, and blocks only.
- **Words.** Say step, tick, order, exact, checked, declared, deterministic, replay. Avoid
  flow, groove, vibe, harmony, and musical puns in the API and docs.
