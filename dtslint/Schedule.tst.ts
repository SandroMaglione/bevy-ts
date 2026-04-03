import { Descriptor, Fx, Label, Schema } from "../src/index.ts"
import * as Query from "../src/query.ts"
import * as Schedule from "../src/schedule.ts"
import * as System from "../src/system.ts"
import { describe, it } from "tstyche"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Time = Descriptor.defineResource<number>()("Time")

const schema = Schema.build(Schema.fragment({
  components: {
    Position
  },
  resources: {
    Time
  }
}))

const MovementSystem = System.define(
  "MovementSystem",
  {
    schema,
    queries: {
      position: Query.define({
        selection: {
          position: Query.write(Position)
        }
      })
    }
  },
  () => Fx.sync<undefined, {}>(() => undefined)
)

const ExplicitLabelSystem = System.define(
  {
    label: Label.defineSystemLabel("ExplicitLabelSystem"),
    schema,
    resources: {
      time: System.readResource(Time)
    }
  },
  ({ resources }) => Fx.sync(() => resources.time.get())
)

const PlainSystem = System.define(
  "PlainSystem",
  {
    schema
  },
  () => Fx.sync<undefined, {}>(() => undefined)
)

const SuffixSystem = System.define(
  "SuffixSystem",
  {
    schema
  },
  () => Fx.sync<undefined, {}>(() => undefined)
)

describe("Schedule", () => {
  it("builds executable schedules from explicit authored plans", () => {
    const schedule = Schedule.define(
      MovementSystem,
      Schedule.applyDeferred(),
      ExplicitLabelSystem
    )

    schedule.steps
    schedule.systems
    schedule.requirements

    // @ts-expect-error!
    schedule.label

    // @ts-expect-error ScheduleEntry
    Schedule.define([
      MovementSystem,
      Schedule.applyDeferred(),
      ExplicitLabelSystem
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

    const schedule = Schedule.define(
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

    const schedule = Schedule.define(
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
