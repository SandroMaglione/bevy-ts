# `@typeonce/bevy-ts-devtools`

Debug sessions for `bevy-ts` runtimes: run schedules headless, keep a trace
history, and ask what happened as text. Built for coding agents first; the
same data will back human-facing tools.

```sh
pnpm add -D @typeonce/bevy-ts-devtools
```

The package reads the core `Debug` handle, which exists only on runtimes made
with `debug: true`. Production runtimes carry no handle and pay nothing.

## The debugging loop

1. **Get a headless runtime.** Build the game's simulation schedules on a
   runtime that needs no renderer, with `debug: true` and scripted input. The
   top-down example's [`simulation.ts`](../../examples/top-down/simulation.ts)
   is the reference; its [`debug.ts`](../../examples/top-down/debug.ts) is a
   script to copy.
2. **Read the lints, then orient.** `session.describe()` starts with lints
   (events nobody reads, next states no marker applies, ...); a warning there
   is often the whole answer. Then it lists every schedule step, each
   system's declared reads and writes, and who reads and writes each
   component, resource, and event. `run()` also prints the lint warning count.
   Info-level `read-before-write` lints list systems that run before the
   schedule's first writer of what they read, so they see the previous run's
   value. That is often intended (input before movement), but it is a
   one-frame lag worth checking when a reaction looks late.
3. **Reproduce.** Script the input with `Keyboard.scripted(bindings, timeline)`
   (or replay a recorded browser session), add an `Invariant` that encodes the
   bug, and `session.run("update", { frames: 600 })`. The run stops at the
   first frame the invariant fails, a system fails, or a system throws.
4. **Explain.** `session.why(entity, Component)` and
   `session.whyResource(Resource)` show the latest changes and which system
   made them. `session.journal({ frames: [from, to], entity })`
   shows everything that touched an entity around the failure.
   `session.report()` lists warnings the trace collected and the current
   entity counts per component. `run()` prints the warnings it raised.
5. **Fix and keep it.** Rerun the same script, then turn it into a test next
   to the game so the bug stays fixed.

```sh
node --import tsx examples/top-down/debug.ts
```

## Cheat sheet

```ts
import { Keyboard } from "@typeonce/bevy-ts-browser"
import { Invariant, Session } from "@typeonce/bevy-ts-devtools"

const keyboard = Keyboard.scripted(bindings, [
  { frame: 0, press: ["left"] },          // frame = index of the input snapshot
  { frame: 30, release: ["left"] },
  { frame: 32, press: ["jump"], release: ["jump"] } // a tap within one frame
])
const runtime = Game.Runtime.make({ services, resources, machines, debug: true })
// Invariants read the world through a typed, read-only Inspector.
const PlayerHealth = Game.Inspector("Debug/PlayerHealth", {
  queries: { player: Game.Query({ selection: { health: Game.Query.read(Health) }, with: [Player] }) },
  resources: { score: Game.System.readResource(Score) }
}, ({ queries, resources }) => ({
  health: queries.player.each().map((match) => match.data.health.get()),
  score: resources.score.get()
}))
const HealthNeverNegative = Invariant.make("health >= 0", () => {
  const { health } = runtime.inspect(PlayerHealth)
  return health.some((value) => value < 0) ? `health ${health.join(", ")}` : undefined // message, or undefined when it holds
})

const session = Session.make(runtime, {
  schedules: { setup, update },           // names used by run() and in traces
  describe: { render },                   // described and linted, never run (needs a renderer)
  invariants: [HealthNeverNegative],      // checked after every frame of every run
  history: 600                            // frames kept for journal/why
})

session.run("setup")
const run = session.run("update", { frames: 300, until: (frame) => frame === 120 })
run.data.ok                               // true when completed or `until` returned true
run.data.stop                             // { reason: "completed" | "until" | "failure" | "defect"
                                          //   | "invariant" | "missingRequirements", frame, ... }

session.describe()                        // schema, schedules, access, lints
session.dump({ with: [Player], limit: 5 })// entities, resources, machines, pending commands
session.why(12, Position)                 // latest changes to e12 Position
session.whyResource(Score)                // latest changes to a resource
session.journal({ frames: [180, 185], entity: 12, kinds: ["write", "effect"] })
session.journal({ system: "Game/Move", last: 10, verbose: true })
session.system("Game/Move")               // declared access, stats, recent lines
session.streams()                         // event/transition/relation-failure retention
session.report()                          // per-system timing and warnings
```

Every call returns a `Rendered` value: `console.log` prints its text,
`.data` holds the structured result, `JSON.stringify` serializes the data.

## Reading the output

```
f185 update  Game/ApplyVelocity  write e12 Game/Position {x:130,y:418} -> {x:130,y:421.2}
f185 update  Game/LandPlayer     queued insert
f185 update  Game/LandPlayer     applyDeferred: insert e12 Game/Grounded={}
f186 update  -                   transition Game/Flow Playing -> Paused applied
```

- `f185`: frame number, counting every `tick`/`tryTick` call from 1, setup
  included. Keyboard timeline frames count input snapshots from 0 instead, so
  with one setup frame, timeline frame `n` is read in session frame `n + 2`.
  `e12`: entity 12. `&e12`: a stored handle to entity 12.
- The schedule path shows nesting, for example `update > onEnter(Game/Flow=Paused)`.
- `write`: a component written through a system's write query. `resource`,
  `emit`, `next state`: resource writes, event emits, and queued machine
  values. Failed systems show `(rolled back)`.
- `queued ...` then `applyDeferred: ...`: a command queued by a system, then
  its structural effect when a marker applied it. The system named on the
  effect line is the one that queued it.
- `skipped: <condition> is false`: a run condition held the system back;
  `discarded N Event` means messages published meanwhile are lost to it.
- `missed ...`: the system could not see entries dropped before it ran.
- Lines that change nothing are hidden by default; pass `verbose: true` to
  see them, marked `(unchanged)`.
- Large objects print only their changed paths:
  `~ up.held: false -> true, left.held: false -> true`.

## Report warnings

| Code | Meaning |
|---|---|
| `pending-commands` | A system queued commands and the frame ended before a marker applied them. Usually a missing `applyDeferred()`. |
| `pending-next-state` | A system queued a next state and the frame ended before an `applyStateTransitions()` marker applied it. |
| `missed-read` | A system lost stream, removed, or despawned entries at capacity. |
| `discarded-messages` | A skipped system discarded messages published while it was skipped. |
| `transition-failed` | An exit or transition schedule failed (queued again), or an enter schedule failed. |
| `system-failed` | A system returned an expected failure or threw. |
| `non-finite-value` | A system wrote NaN or an infinity into a component, resource, event, or spawned entity. The message names the entity and path; `why()` shows the history. |
| `population-growing` | A component's count rose through every quarter of a run of 60+ frames: its lowest count in each quarter was higher than in the quarter before. Bursts that are cleaned up do not trigger it; entities that are never despawned do. `run()` returns the counts in `growing`. |

The report also starts with the static lints from `describe()`.

The trace shows what systems wrote, not what they read. When a system writes
a wrong value from correct inputs, the journal narrows the bug to that
system (it runs, in order, and writes this value) and the rest is its code.

## Recording a browser session

```ts
const recorder = Keyboard.recording(Keyboard.actions(window, bindings))
// ...provide `recorder` as the keyboard service, play, reproduce the bug...
copy(JSON.stringify(recorder.timeline()))

// In Node:
const timeline = Keyboard.parseTimeline(bindings, JSON.parse(saved))
if (timeline.ok) {
  const keyboard = Keyboard.scripted(bindings, timeline.value)
}
```

A recorded timeline replays to the same input snapshots. A browser session
reproduces headless when everything else nondeterministic, such as time
steps, random numbers, and viewport size, also comes in through services
or resources that the simulation sets to the same values.
