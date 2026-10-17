import { describe, expect, it } from "vitest"
import { Descriptor, Schema } from "@typeonce/bevy-ts"
import type { ExecutableScheduleDefinition } from "@typeonce/bevy-ts/Schedule"

const Damage = Descriptor.Event<number>()("ThisTickRuntime/Damage")
const Game = Schema.bind(Schema.fragment({ events: { Damage } }))

const Deal = Game.System("ThisTickRuntime/Deal", { events: { damage: Game.System.writeEvent(Damage) } }, ({ events }) => {
  events.damage.emit(1)
})
const seen: Array<ReadonlyArray<number>> = []
const Apply = Game.System("ThisTickRuntime/Apply", {
  events: { damage: Game.System.thisTick(Game.System.readEvent(Damage)) }
}, ({ events }) => {
  seen.push(events.damage.all())
})

/** Erases a schedule's type, as plugin boundaries and devtools do. */
const erased = (schedule: ExecutableScheduleDefinition<any, any, any, any, any, any>): ExecutableScheduleDefinition<typeof Game.schema, never, typeof Game.schema> =>
  schedule as ExecutableScheduleDefinition<typeof Game.schema, never, typeof Game.schema>

describe("thisTick at runtime", () => {
  it("lets tryTick run a schedule whose writers come first", () => {
    const runtime = Game.Runtime.make({ services: Game.Runtime.services() })
    seen.length = 0
    expect(runtime.tryTick(erased(Game.Schedule(Deal, Apply))).ok).toBe(true)
    expect(seen).toEqual([[1]])
  })

  it("makes tryTick return a TickOrderViolation, running nothing, when a writer runs after the reader", () => {
    const runtime = Game.Runtime.make({ services: Game.Runtime.services() })
    seen.length = 0
    const result = runtime.tryTick(erased(Game.Schedule(Apply, Deal)))
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "TickOrderViolation",
        issues: [{
          kind: "lateWriter",
          reader: "ThisTickRuntime/Apply",
          data: "ThisTickRuntime/Damage",
          writer: "ThisTickRuntime/Deal",
          message: "ThisTickRuntime/Apply needs ThisTickRuntime/Damage from this tick, but its writer ThisTickRuntime/Deal runs after it: move ThisTickRuntime/Deal before ThisTickRuntime/Apply, or read ThisTickRuntime/Damage without thisTick"
        }]
      }
    })
    expect(seen).toEqual([])
  })

  it("counts events sent with runtime.send before the tick as written", () => {
    const runtime = Game.Runtime.make({ services: Game.Runtime.services() })
    const alone = erased(Game.Schedule(Apply))
    const missing = runtime.tryTick(alone)
    expect(!missing.ok && missing.error.kind === "TickOrderViolation" && missing.error.issues.map((issue) => issue.kind)).toEqual(["missingWriter"])
    runtime.send(Damage, 5)
    expect(runtime.tryTick(alone).ok).toBe(true)
    // The send counted for that tick only.
    expect(runtime.tryTick(alone).ok).toBe(false)
  })

  it("reports a this-tick-order lint for named schedules", () => {
    const runtime = Game.Runtime.make({ services: Game.Runtime.services(), debug: true })
    runtime.debug.nameSchedules({ update: erased(Game.Schedule(Apply, Deal)) })
    expect(runtime.debug.describe().lints.filter((lint) => lint.code === "this-tick-order").map((lint) => lint.message)).toEqual([
      "in update, ThisTickRuntime/Apply needs ThisTickRuntime/Damage from this tick, but its writer ThisTickRuntime/Deal runs after it: move ThisTickRuntime/Deal before ThisTickRuntime/Apply, or read ThisTickRuntime/Damage without thisTick"
    ])
    expect(runtime.debug.describe().systems.find((system) => system.name === "ThisTickRuntime/Apply")?.thisTick).toEqual(["ThisTickRuntime/Damage"])
  })
})
