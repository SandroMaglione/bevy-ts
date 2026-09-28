import { describe, expect, it } from "vitest"
import { Descriptor, Fx, Schema } from "@bevy-ts/core"

const Ping = Descriptor.Event<{ value: number }>()("Ping")
const Game = Schema.bind(Schema.fragment({ events: { Ping } }))

const makeRuntime = () => Game.Runtime.make({ services: Game.Runtime.services() })

const emitter = (name: string, values: ReadonlyArray<number>) =>
  Game.System(name, { events: { ping: Game.System.writeEvent(Ping) } }, ({ events }) => {
    for (const value of values) events.ping.emit({ value })
  })

const reader = (name: string, log: Array<ReadonlyArray<number>>) =>
  Game.System(name, { events: { ping: Game.System.readEvent(Ping) } }, ({ events }) => {
    log.push(events.ping.all().map((event) => event.value))
  })

describe("Runtime events", () => {
  it("delivers events to later systems in the same schedule without a marker", () => {
    const log: Array<ReadonlyArray<number>> = []
    const runtime = makeRuntime()
    runtime.tick(Game.Schedule(emitter("Events/Emit", [1, 2]), reader("Events/Read", log)))
    expect(log).toEqual([[1, 2]])
  })

  it("delivers events emitted after a reader ran on its next run", () => {
    const log: Array<ReadonlyArray<number>> = []
    const read = reader("Events/ReadFirst", log)
    const schedule = Game.Schedule(read, emitter("Events/EmitAfter", [7]))
    const runtime = makeRuntime()
    runtime.tick(schedule)
    runtime.tick(schedule)
    expect(log).toEqual([[], [7]])
  })

  it("delivers every event exactly once to each reader, independently", () => {
    const first: Array<ReadonlyArray<number>> = []
    const second: Array<ReadonlyArray<number>> = []
    const emit = emitter("Events/EmitOnce", [1])
    const readFirst = reader("Events/ReaderA", first)
    const readSecond = reader("Events/ReaderB", second)
    const runtime = makeRuntime()
    runtime.tick(Game.Schedule(emit, readFirst))
    runtime.tick(Game.Schedule(readFirst, readSecond))
    runtime.tick(Game.Schedule(readFirst, readSecond))
    expect(first).toEqual([[1], [], []])
    expect(second).toEqual([[1], []])
  })

  it("keeps emission order across systems and runs", () => {
    const log: Array<ReadonlyArray<number>> = []
    const read = reader("Events/ReadOrdered", log)
    const runtime = makeRuntime()
    runtime.tick(Game.Schedule(emitter("Events/EmitA", [1, 2]), emitter("Events/EmitB", [3])))
    runtime.tick(Game.Schedule(emitter("Events/EmitC", [4]), read))
    expect(log).toEqual([[1, 2, 3, 4]])
  })

  it("publishes nothing from a failed system and redelivers to a failed reader", () => {
    const log: Array<ReadonlyArray<number>> = []
    const failingEmit = Game.System("Events/FailingEmit", { events: { ping: Game.System.writeEvent(Ping) } }, ({ events }) => {
      events.ping.emit({ value: 9 })
      return Fx.fail("Boom" as const)
    })
    let fail = true
    const flakyRead = Game.System("Events/FlakyRead", { events: { ping: Game.System.readEvent(Ping) } }, ({ events }) => {
      log.push(events.ping.all().map((event) => event.value))
      if (fail) {
        fail = false
        return Fx.fail("NotYet" as const)
      }
      return Fx.succeed(undefined)
    })
    const runtime = makeRuntime()
    expect(runtime.tick(Game.Schedule(failingEmit)).ok).toBe(false)
    expect(runtime.tick(Game.Schedule(emitter("Events/EmitValid", [1]), flakyRead)).ok).toBe(false)
    expect(runtime.tick(Game.Schedule(flakyRead)).ok).toBe(true)
    expect(log).toEqual([[1], [1]])
  })

  it("lets a system read the events it emitted on its next run", () => {
    const log: Array<ReadonlyArray<number>> = []
    let next = 0
    const echo = Game.System("Events/Echo", {
      events: { read: Game.System.readEvent(Ping), write: Game.System.writeEvent(Ping) }
    }, ({ events }) => {
      log.push(events.read.all().map((event) => event.value))
      events.write.emit({ value: next++ })
    })
    const runtime = makeRuntime()
    runtime.tick(Game.Schedule(echo))
    runtime.tick(Game.Schedule(echo))
    runtime.tick(Game.Schedule(echo))
    expect(log).toEqual([[], [0], [1]])
  })

  it("keeps events for the current and previous tick only", () => {
    const log: Array<ReadonlyArray<number>> = []
    const read = reader("Events/ReadLate", log)
    const idle = Game.Schedule()
    const runtime = makeRuntime()

    runtime.tick(Game.Schedule(emitter("Events/EmitKept", [1])))
    runtime.tick(Game.Schedule(read))
    expect(log).toEqual([[1]])

    runtime.tick(Game.Schedule(emitter("Events/EmitDropped", [2])))
    runtime.tick(idle)
    runtime.tick(Game.Schedule(read))
    expect(log).toEqual([[1], []])
  })
})
