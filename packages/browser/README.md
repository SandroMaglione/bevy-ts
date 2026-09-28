# `@typeonce/bevy-ts-browser`

Browser integrations for bevy-ts: a fixed-step game loop (`FixedLoop`), keyboard actions with press/release edges (`Keyboard`), pointer position and button edges over an element (`Pointer`), scripted and recorded keyboard and pointer timelines for tests and replays, and a system that copies input into a resource (`InputCapture`).

```sh
pnpm add @typeonce/bevy-ts-browser @typeonce/bevy-ts
```

The package owns browser plumbing only; schemas, resources, and schedules stay in your game.

Released together with [`@typeonce/bevy-ts`](https://www.npmjs.com/package/@typeonce/bevy-ts), always with the same version.

Documentation: https://sandromaglione.github.io/bevy-ts/ ·
Source: https://github.com/SandroMaglione/bevy-ts
