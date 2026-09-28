import { inspect } from "node:util"
import { describe, expect, it } from "vitest"
import { Descriptor, Fx, Schema } from "@typeonce/bevy-ts"
import { Format, Invariant, Session } from "@typeonce/bevy-ts-devtools"

const Position = Descriptor.Component<{ readonly x: number }>()("Dev/Position")
const Health = Descriptor.Component<number>()("Dev/Health")
const Score = Descriptor.Resource<number>()("Dev/Score")
const Hit = Descriptor.Event<number>()("Dev/Hit")
const Game = Schema.bind(Schema.fragment({
  components: { Position, Health },
  resources: { Score },
  events: { Hit }
}))
const Flow = Game.StateMachine("Dev/Flow", ["Playing", "Paused"])

const Movers = Game.Query({ selection: { position: Game.Query.write(Position) } })
const Healthy = Game.Query({ selection: { health: Game.Query.write(Health) } })

const Spawn = Game.System("Dev/Spawn", {}, ({ commands }) => {
  commands.spawn(Game.Command.spawn([Position, { x: 0 }], [Health, 3]))
})
const Move = Game.System("Dev/Move", { queries: { movers: Movers } }, ({ queries }) => {
  for (const match of queries.movers.each()) match.data.position.update((position) => ({ x: position.x + 1 }))
})
const Idle = Game.System("Dev/Idle", { resources: { score: Game.System.writeResource(Score) } }, ({ resources }) => {
  resources.score.set(resources.score.get())
})
const Damage = Game.System("Dev/Damage", {
  queries: { healthy: Healthy },
  events: { hit: Game.System.writeEvent(Hit) }
}, ({ queries, events }) => {
  for (const match of queries.healthy.each()) {
    match.data.health.update((health) => health - 1)
    events.hit.emit(1)
  }
})
const ReadHitsWhenPaused = Game.System("Dev/ReadHitsWhenPaused", {
  events: { hit: Game.System.readEvent(Hit) },
  when: [Game.Condition.inState(Flow, "Paused")]
}, () => {})

const Play = Game.System("Dev/Play", { nextMachines: { flow: Game.System.nextState(Flow) } }, ({ nextMachines }) => {
  nextMachines.flow.set("Playing")
})

const makeSession = (invariants: ReadonlyArray<Invariant.Invariant> = []) => {
  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(),
    resources: { Score: 0 },
    machines: Game.Runtime.machines(Game.Runtime.machine(Flow, "Paused")),
    debug: true
  })
  // The reader runs once while paused, then is skipped while playing.
  const setup = Game.Schedule(Spawn, ReadHitsWhenPaused, Play, Game.Schedule.applyStateTransitions())
  const update = Game.Schedule(Move, Idle, Damage, ReadHitsWhenPaused)
  const session = Session.make(runtime, { schedules: { setup, update }, invariants })
  return { runtime, session }
}

describe("Session", () => {
  it("runs named schedules and reports completed runs", () => {
    const { session } = makeSession()
    expect(session.run("setup").data).toMatchObject({ ok: true, frames: 1, range: [1, 1], stop: { reason: "completed" } })
    const run = session.run("update", { frames: 2 })
    expect(run.data).toMatchObject({ ok: true, frames: 2, range: [2, 3] })
    expect(String(run)).toMatch(/^run update: 2 frames \(f2-f3\) in .*ms, completed$/)
    expect(inspect(run)).toBe(run.text)
    expect(JSON.parse(JSON.stringify(run))).toMatchObject({ schedule: "update", ok: true })
  })

  it("stops at an until condition", () => {
    const { session } = makeSession()
    session.run("setup")
    expect(session.run("update", { frames: 10, until: (frame) => frame === 3 }).data.stop).toEqual({ reason: "until", frame: 3 })
  })

  it("stops at the first violated invariant with its message", () => {
    let world: ReturnType<typeof makeSession> | undefined
    const Positions = Game.Inspector("Dev/Positions", { queries: { movers: Game.Query({ selection: { position: Game.Query.read(Position) } }) } }, ({ queries }) =>
      queries.movers.each().map((match) => match.data.position.get().x))
    const NearOrigin = Invariant.make("near origin", () => {
      const far = world!.runtime.inspect(Positions).find((x) => x > 2)
      return far === undefined ? undefined : `x=${far}`
    })
    world = makeSession([NearOrigin])
    world.session.run("setup")
    const run = world.session.run("update", { frames: 10 })
    expect(run.data).toMatchObject({ ok: false, frames: 3, stop: { reason: "invariant", frame: 4, invariant: "near origin", message: "x=3" } })
    expect(run.text).toContain(`INVARIANT "near origin" violated at f4: x=3`)
  })

  it("reports expected failures and thrown defects as stops", () => {
    const runtime = Game.Runtime.make({ services: Game.Runtime.services(), resources: { Score: 0 }, debug: true })
    const Fail = Game.System("Dev/Fail", {}, () => Fx.fail("Broken" as const))
    const Throw = Game.System("Dev/Throw", {}, () => {
      throw new Error("kaboom")
    })
    const session = Session.make(runtime, { schedules: { fail: Game.Schedule(Fail), boom: Game.Schedule(Throw) } })
    expect(session.run("fail").data.stop).toEqual({ reason: "failure", frame: 1, system: "Dev/Fail", error: "Broken" })
    const defect = session.run("boom").data.stop
    expect(defect).toMatchObject({ reason: "defect", frame: 2 })
    expect(session.report().data.warnings.map((warning) => warning.code)).toEqual(["system-failed", "system-failed"])
  })

  it("journals writes with filters and hides no-change lines unless verbose", () => {
    const { session } = makeSession()
    session.run("setup")
    session.run("update", { frames: 3 })

    const journal = session.journal({ frames: 2 })
    expect(journal.data.map((line) => line.text)).toEqual([
      "write e1 Dev/Position {x:0} -> {x:1}",
      "write e1 Dev/Health 3 -> 2",
      "emit Dev/Hit [1]",
      "skipped: inState(Dev/Flow=Paused) is false; discarded 1 Dev/Hit"
    ])
    expect(journal.text.split("\n")[0]).toBe("journal: 4 lines (history f1-f4, 1 no-change lines hidden (verbose: true shows them))")
    expect(session.journal({ frames: 2, verbose: true }).data.map((line) => line.text)).toContain("resource Dev/Score 0 -> 0")
    expect(session.journal({ component: Health }).data.map((line) => [line.frame, line.text])).toEqual([
      [2, "write e1 Dev/Health 3 -> 2"],
      [3, "write e1 Dev/Health 2 -> 1"],
      [4, "write e1 Dev/Health 1 -> 0"]
    ])
    expect(session.journal({ system: "Dev/Move", limit: 1 }).data.map((line) => line.frame)).toEqual([4])
    expect(session.journal({ kinds: ["effect"] }).data.map((line) => line.text)).toEqual([
      "applyStateTransitions: spawn e1 Dev/Position={x:0} Dev/Health=3"
    ])
  })

  it("explains the latest changes to one component, including its spawn", () => {
    const { session } = makeSession()
    session.run("setup")
    session.run("update", { frames: 2 })
    const why = session.why(1, Position, { limit: 3 })
    expect(why.text).toBe([
      "e1 Dev/Position is now {x:2}; last 3 changes (oldest first):",
      "f1 setup  Dev/Spawn  applyStateTransitions: spawn e1 Dev/Position={x:0} Dev/Health=3",
      "f2 update  Dev/Move  write e1 Dev/Position {x:0} -> {x:1}",
      "f3 update  Dev/Move  write e1 Dev/Position {x:1} -> {x:2}"
    ].join("\n"))
  })

  it("summarizes systems and warnings in the report", () => {
    const { session } = makeSession()
    const Queue = Game.System("Dev/QueueLate", {}, ({ commands }) => {
      commands.spawn(Game.Command.spawn([Health, 1]))
    })
    const runtime2 = Game.Runtime.make({ services: Game.Runtime.services(), resources: { Score: 0 }, debug: true })
    const late = Session.make(runtime2, { schedules: { late: Game.Schedule(Queue) } })
    late.run("late", { frames: 2 })
    expect(late.report().data.warnings).toMatchObject([
      { code: "pending-commands", count: 2, firstFrame: 1, lastFrame: 2 }
    ])

    session.run("setup")
    session.run("update", { frames: 2 })
    const report = session.report()
    expect(report.data.systems.find((entry) => entry.system === "Dev/ReadHitsWhenPaused")).toMatchObject({ runs: 1, skips: 2 })
    expect(report.data.warnings).toMatchObject([
      { code: "discarded-messages", count: 2 }
    ])
  })

  it("renders the dump, description, system activity, and streams as text", () => {
    const { session } = makeSession()
    session.run("setup")
    session.run("update")
    expect(session.dump().text.split("\n").slice(0, 2)).toEqual([
      "frame 2 (tick 9), 1 of 1 entities",
      "e1  Dev/Position={x:1}  Dev/Health=2"
    ])
    expect(session.describe().text).toContain("update:\n   0 Dev/Move\n   1 Dev/Idle")
    expect(session.system("Dev/Move").text).toContain("query movers: write Dev/Position")
    expect(session.streams().text).toContain("event Dev/Hit: 1/65536 retained")
  })
})

describe("Format.value", () => {
  it("prints compact values", () => {
    expect(Format.value({ x: 1.23456, list: [1, 2, 3], nested: { deep: { deeper: { deepest: 1 } } } })).toBe(
      "{x:1.235,list:[1,2,3],nested:{deep:{deeper:{…}}}}"
    )
    expect(Format.value({ kind: "EntityId", value: 4 })).toBe("e4")
    expect(Format.value(Array.from({ length: 10 }, (_, index) => index))).toBe("[0,1,2,3,4,5,6,7,…+2]")
    class Sprite {
      readonly frame = 1
    }
    expect(Format.value(new Sprite())).toBe("Sprite{frame:1}")
  })
})

describe("Session report streams", () => {
  it("lists streams held past the frame window by a reader", () => {
    const runtime = Game.Runtime.make({ services: Game.Runtime.services(), resources: { Score: 0 }, debug: true })
    const Emit = Game.System("Dev/EmitHit", { events: { hit: Game.System.writeEvent(Hit) } }, ({ events }) => {
      events.hit.emit(1)
    })
    const Read = Game.System("Dev/RareReader", { events: { hit: Game.System.readEvent(Hit) } }, () => {})
    const session = Session.make(runtime, { schedules: { read: Game.Schedule(Read), emit: Game.Schedule(Emit) } })
    session.run("read")
    session.run("emit", { frames: 4 })
    const report = session.report()
    expect(report.data.streams).toMatchObject([{ stream: "Dev/Hit", size: 4, heldBy: "Dev/RareReader" }])
    expect(report.text).toContain("# Streams held by readers\nevent Dev/Hit: 4/65536 retained, held by Dev/RareReader\n  Dev/RareReader: 4 unread")
  })
})

describe("Session next states and resources", () => {
  it("warns about next states never applied, at run time and through lints", () => {
    const runtime = Game.Runtime.make({
      services: Game.Runtime.services(),
      resources: { Score: 0 },
      machines: Game.Runtime.machines(Game.Runtime.machine(Flow, "Paused")),
      debug: true
    })
    const session = Session.make(runtime, { schedules: { update: Game.Schedule(Play, Game.Schedule.applyDeferred()) } })
    const run = session.run("update", { frames: 3 })
    expect(run.data.lintWarnings).toBe(1)
    expect(run.text.split("\n")[1]).toBe("1 lint warnings (see describe() or report()): next-state-never-applied Dev/Flow")
    const report = session.report()
    expect(report.data.warnings).toMatchObject([{ code: "pending-next-state", count: 3 }])
    expect(report.text.split("\n").slice(2, 4)).toEqual([
      "# Lints",
      "warning next-state-never-applied: next states of Dev/Flow are queued by Dev/Play @ update#0, but no described schedule has an applyStateTransitions() marker, so they never take effect"
    ])
  })

  it("explains the latest changes to a resource", () => {
    const runtime = Game.Runtime.make({ services: Game.Runtime.services(), resources: { Score: 0 }, debug: true })
    const Add = Game.System("Dev/Add", { resources: { score: Game.System.writeResource(Score) } }, ({ resources }) => {
      resources.score.update((score) => score + 5)
    })
    const session = Session.make(runtime, { schedules: { add: Game.Schedule(Add) } })
    session.run("add", { frames: 2 })
    expect(session.whyResource(Score).text).toBe([
      "Dev/Score is now 10; last 2 changes (oldest first):",
      "f1 add  Dev/Add  resource Dev/Score 0 -> 5",
      "f2 add  Dev/Add  resource Dev/Score 5 -> 10"
    ].join("\n"))
  })
})
