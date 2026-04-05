import { Descriptor, Fx, Schema } from "../src/index.ts"
import * as Query from "../src/query.ts"
import * as Schedule from "../src/schedule.ts"
import * as System from "../src/system.ts"
import { describe, it } from "tstyche"

const Position = Descriptor.Component<{ x: number; y: number }>()("Position")
const Time = Descriptor.Resource<number>()("Time")

const Game = Schema.bind(Schema.fragment({
  components: {
    Position
  },
  resources: {
    Time
  }
}))
const schema = Game.schema

const MovementSystem = System.System(
  "MovementSystem",
  {
    schema,
    queries: {
      position: Query.Query({
        selection: {
          position: Query.write(Position)
        }
      })
    }
  },
  () => Fx.sync<undefined, {}>(() => undefined)
)

const ExplicitNameSystem = System.System(
  "ExplicitNameSystem",
  {
    schema,
    resources: {
      time: System.readResource(Time)
    }
  },
  ({ resources }) => Fx.sync(() => resources.time.get())
)

const PlainSystem = System.System(
  "PlainSystem",
  {
    schema
  },
  () => Fx.sync<undefined, {}>(() => undefined)
)

const SuffixSystem = System.System(
  "SuffixSystem",
  {
    schema
  },
  () => Fx.sync<undefined, {}>(() => undefined)
)

describe("Schedule", () => {
  it("builds executable schedules from explicit authored plans", () => {
    const schedule = Schedule.Schedule(
      MovementSystem,
      Schedule.applyDeferred(),
      ExplicitNameSystem
    )

    schedule.steps
    schedule.systems
    schedule.requirements

    // @ts-expect-error!
    schedule.label

    // @ts-expect-error ScheduleEntry
    Schedule.Schedule([
      MovementSystem,
      Schedule.applyDeferred(),
      ExplicitNameSystem
    ])
  })

  it("creates reusable explicit fragments", () => {
    const hostMirror = Schedule.fragment({
      schema,
      entries: [
        Schedule.updateLifecycle(),
        SuffixSystem
      ]
    })

    const schedule = Schedule.Schedule(
      PlainSystem,
      Schedule.applyDeferred(),
      hostMirror
    )

    schedule.steps
    schedule.systems
  })

  it("creates reusable explicit phases", () => {
    const hostMirrorPhase = Schedule.phase({
      schema,
      steps: [
        Schedule.updateLifecycle(),
        SuffixSystem
      ]
    })

    const schedule = Schedule.Schedule(
      PlainSystem,
      hostMirrorPhase
    )

    schedule.steps
    schedule.systems
  })

  it("composes systems, markers, and fragments into one schedule", () => {
    const hostMirror = Schedule.fragment({
      schema,
      entries: [
        Schedule.updateLifecycle(),
        SuffixSystem
      ]
    })

    const plan = Schedule.compose({
      entries: [
        PlainSystem,
        Schedule.applyDeferred(),
        hostMirror
      ]
    })

    plan.steps
    plan.systems

    const schedule = Schedule.build(
      PlainSystem,
      Schedule.applyDeferred(),
      hostMirror
    )

    schedule.steps
    schedule.systems
  })
})
