import { Descriptor, Fx, Label, Schema } from "../src/index.ts"
import * as Query from "../src/query.ts"
import * as Schedule from "../src/schedule.ts"
import * as System from "../src/system.ts"
import { describe, it } from "tstyche"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Time = Descriptor.defineResource<number>()("Time")

const MoveSet = Label.defineSystemSetLabel("Movement")
const RenderSet = Label.defineSystemSetLabel("Render")
const UpdateSchedule = Label.defineScheduleLabel("Update")

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
    inSets: [MoveSet],
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

const RenderSystem = System.define(
  "RenderSystem",
  {
    schema,
    after: [MovementSystem, MoveSet]
  },
  () => Fx.sync<undefined, {}>(() => undefined)
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
  it("accepts valid systems and configured sets", () => {
    Schedule.define({
      schema,
      entries: [MovementSystem, RenderSystem],
      sets: [
        Schedule.configureSet({
          label: MoveSet,
          chain: true
        })
      ] as const
    })
  })

  it("rejects systems assigned to missing sets", () => {
    const MissingSetSystem = System.define(
      "MissingSetSystem",
      {
        schema,
        inSets: [RenderSet]
      },
      () => Fx.sync<undefined, {}>(() => undefined)
    )

    Schedule.define({
      schema,
      entries: [MovementSystem, MissingSetSystem],
      sets: [
        Schedule.configureSet({
          label: MoveSet
        })
      ] as const
    })
  })

  it("rejects direct system ordering references to systems outside the schedule", () => {
    const MissingDependency = System.define(
      "MissingDependency",
      {
        schema
      },
      () => Fx.sync<undefined, {}>(() => undefined)
    )

    const Dependent = System.define(
      "Dependent",
      {
        schema,
        after: [MissingDependency]
      },
      () => Fx.sync<undefined, {}>(() => undefined)
    )

    Schedule.define({
      schema,
      entries: [Dependent]
    })
  })

  it("rejects system ordering references to unconfigured sets", () => {
    const NeedsRenderSet = System.define(
      "NeedsRenderSet",
      {
        schema,
        after: [RenderSet]
      },
      () => Fx.sync<undefined, {}>(() => undefined)
    )

    Schedule.define({
      schema,
      entries: [MovementSystem, NeedsRenderSet],
      sets: [
        Schedule.configureSet({
          label: MoveSet
        })
      ] as const
    })
  })

  it("does not expose a label on anonymous schedules", () => {
    const schedule = Schedule.define({
      schema,
      entries: [PlainSystem]
    })

    // @ts-expect-error!
    schedule.label
  })

  it("exposes a label on named schedules", () => {
    const schedule = Schedule.define({
      schema,
      label: UpdateSchedule,
      entries: [PlainSystem]
    })

    schedule.label
  })

  it("extends one base schedule with prefix and suffix steps", () => {
    const base = Schedule.define({
      schema,
      entries: [PlainSystem]
    })

    const extended = Schedule.extend(base, {
      before: [MovementSystem],
      after: [Schedule.updateLifecycle(), SuffixSystem]
    })

    extended.steps
    extended.systems

    // @ts-expect-error!
    extended.label
  })

  it("creates reusable explicit phases", () => {
    const hostMirror = Schedule.define({
      schema,
      entries: [
        Schedule.updateLifecycle(),
        RenderSystem
      ]
    })

    hostMirror.steps
    hostMirror.systems
  })

  it("composes systems, markers, and phases into one schedule fragment", () => {
    const hostMirror = Schedule.define({
      schema,
      entries: [
        Schedule.updateLifecycle(),
        SuffixSystem
      ]
    })

    Schedule.define({
      schema,
      entries: [
        PlainSystem,
        Schedule.applyDeferred(),
        hostMirror
      ]
    })
  })
})
