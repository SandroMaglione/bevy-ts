# `@typeonce/ritmo-browser`

Browser integrations for ritmo: a fixed-step game loop (`FixedLoop`), keyboard actions with press/release edges, bound by character or by physical key (`Keyboard`), mouse and pen position and button edges over an element (`Pointer`), on-screen touch controls with a floating stick and drag-to-aim buttons (`Touch`), scripted and recorded keyboard and pointer timelines for tests and replays, and a system that copies input into a resource (`InputCapture`).

```sh
pnpm add @typeonce/ritmo-browser @typeonce/ritmo
```

The package owns browser plumbing only; schemas, resources, and schedules stay in your game.

Released together with [`@typeonce/ritmo`](https://www.npmjs.com/package/@typeonce/ritmo), always with the same version.

Documentation: https://sandromaglione.github.io/bevy-ts/ ·
Source: https://github.com/SandroMaglione/bevy-ts
