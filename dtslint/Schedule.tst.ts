import { Descriptor, Fx, Label, Query, Schedule, Schema, System } from "../src/index.ts"
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

describe("Schedule", () => {
  it("accepts valid systems and configured sets", () => {
    Schedule.define({
      label: UpdateSchedule,
      schema,
      systems: [MovementSystem, RenderSystem],
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

    // @ts-expect-error!
    Schedule.define({
      label: UpdateSchedule,
      schema,
      systems: [MovementSystem, MissingSetSystem],
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

    // @ts-expect-error!
    Schedule.define({
      label: UpdateSchedule,
      schema,
      systems: [Dependent]
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

    // @ts-expect-error!
    Schedule.define({
      label: UpdateSchedule,
      schema,
      systems: [MovementSystem, NeedsRenderSet],
      sets: [
        Schedule.configureSet({
          label: MoveSet
        })
      ] as const
    })
  })
})
