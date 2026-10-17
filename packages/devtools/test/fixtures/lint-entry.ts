// A lint target for the CLI test: `Noise` is emitted and never read (a warning) unless LINT_QUIET is set.
import { Descriptor, Schema } from "@typeonce/bevy-ts"

const Noise = Descriptor.Event<number>()("LintFixture/Noise")
const Game = Schema.bind(Schema.fragment({ events: { Noise } }))

const Emit = Game.System("LintFixture/Emit", { events: { noise: Game.System.writeEvent(Noise) } }, ({ events }) => {
  events.noise.emit(1)
})
const Hear = Game.System("LintFixture/Hear", { events: { noise: Game.System.readEvent(Noise) } }, () => {})

export const lintTarget = () => ({
  runtime: Game.Runtime.make({ services: Game.Runtime.services(), debug: true }),
  schedules: { update: process.env["LINT_QUIET"] === "1" ? Game.Schedule(Emit, Hear) : Game.Schedule(Emit) }
})
