/**
 * A headless debug run of the top-down example, and a template for
 * debugging scripts.
 *
 *   node --import tsx examples/top-down/debug.ts
 *
 * It scripts keyboard input, runs the simulation with a devtools session,
 * checks an invariant after every frame, and prints what an agent or a
 * developer usually needs first: the run result, the report, the latest
 * changes to the player's position, and the world dump. Copy it and change
 * the timeline, the invariants, and the questions.
 */
import { Keyboard } from "@typeonce/bevy-ts-browser"
import { Invariant, Session } from "@typeonce/bevy-ts-devtools"

import { WORLD_HEIGHT, WORLD_WIDTH } from "./constants.ts"
import { PlayerCameraQuery } from "./queries.ts"
import { Game, Player, Position } from "./schema.ts"
import { createTopDownSimulation } from "./simulation.ts"
import { inputBindings } from "./types.ts"

// Frame 0 is the first update. Press and release are applied before that
// frame's input capture; a press and release in one frame is a tap.
const keyboard = Keyboard.scripted(inputBindings, [
  { frame: 0, press: ["up", "left"] },
  { frame: 40, release: ["up"] },
  { frame: 50, press: ["interact"], release: ["interact"] }
])

const simulation = createTopDownSimulation({ keyboard })
if (!simulation.ok) throw new Error(simulation.error.message)
const { runtime, setup, update } = simulation.value

const PlayerPositions = Game.Inspector("Debug/PlayerPositions", { queries: { player: PlayerCameraQuery } }, ({ queries }) =>
  queries.player.each().map((match) => match.data.position.get()))

const PlayerInsideWorld = Invariant.make("player inside world", () => {
  for (const position of runtime.inspect(PlayerPositions)) {
    if (position.x < 0 || position.x > WORLD_WIDTH || position.y < 0 || position.y > WORLD_HEIGHT) {
      return `player at (${position.x}, ${position.y})`
    }
  }
  return undefined
})

const session = Session.make(runtime, { schedules: { setup, update }, invariants: [PlayerInsideWorld] })

console.log(session.run("setup"))
console.log(session.run("update", { frames: 120 }))
console.log()
console.log(session.report())
console.log()
console.log(session.why(1, Position))
console.log()
console.log(session.dump({ with: [Player] }))
