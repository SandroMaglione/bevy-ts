import { Descriptor, EntityScope, Fx, Result, Schema } from "@bevy-ts/core"
import type * as System from "@bevy-ts/core/System"
import { describe, expect, it } from "tstyche"

const Value = Descriptor.Resource<number>()("StabilityTypes/Value")
const Position = Descriptor.Component<{ x: number }>()("StabilityTypes/Position")
const Game = Schema.bind(Schema.fragment({ components: { Position }, resources: { Value } }))
const OtherGame = Schema.bind(Schema.fragment({ resources: { Value } }), Schema.defineRoot("Other"))

const Failing = Game.System(
  "StabilityTypes/Failing",
  { resources: { value: Game.System.writeResource(Value) } },
  ({ resources }) => Fx.flatMap(
    Fx.sync(() => resources.value.set(1)),
    () => Fx.fail("Rejected" as const)
  )
)

const schedule = Game.Schedule(Failing)
const runtime = Game.Runtime.make({
  services: Game.Runtime.services(),
  resources: { Value: 0 }
})

describe("stability types", () => {
  it("carries exact system failures through schedules and runtimes", () => {
    expect(runtime.tick(schedule)).type.toBe<
      Result.Result<void, System.SystemFailure<"StabilityTypes/Failing", "Rejected">>
    >()
  })

  it("infers the failure union from early Fx.fail returns in an otherwise plain system", () => {
    const Spend = Game.System(
      "StabilityTypes/Spend",
      { resources: { value: Game.System.writeResource(Value) } },
      ({ resources }) => {
        const value = resources.value.get()
        if (value < 0) {
          return Fx.fail("Negative" as const)
        }
        if (value === 0) {
          return Fx.fail("Empty" as const)
        }
        resources.value.set(value - 1)
      }
    )
    expect(runtime.tick(Game.Schedule(Spend))).type.toBe<
      Result.Result<void, System.SystemFailure<"StabilityTypes/Spend", "Negative" | "Empty">>
    >()
  })

  it("treats a system that returns nothing as infallible", () => {
    const Plain = Game.System(
      "StabilityTypes/Plain",
      { resources: { value: Game.System.writeResource(Value) } },
      ({ resources }) => {
        resources.value.set(2)
      }
    )
    expect(runtime.tick(Game.Schedule(Plain))).type.toBe<Result.Result<void, never>>()
  })

  it("brands entity scopes to one bound game root", () => {
    const scope = Game.EntityScope("Level")
    expect(scope).type.toBe<EntityScope.EntityScope<"Level", typeof Game.schema>>()

    const system = OtherGame.System("Other/Spawn", {}, ({ commands }) => {
      // @ts-expect-error!
      commands.despawnScope(scope)
    })
    expect(system).type.toBeAssignableTo<Schema.Schema.BoundSystem<typeof OtherGame.schema, Schema.RootToken<"Other">>>()
  })

  it("keeps inspectors read-only and returns their exact projection", () => {
    const inspector = Game.Inspector(
      "StabilityTypes/ValueInspector",
      {
        queries: {
          positions: Game.Query({
            selection: { position: Game.Query.read(Position) }
          })
        },
        resources: { value: Game.System.readResource(Value) }
      },
      ({ queries, resources }) => {
        const first = queries.positions.each()[0]
        if (first) {
          // @ts-expect-error!
          first.data.position.get().x = 1
        }
        return { value: resources.value.get() }
      }
    )

    expect(runtime.inspect(inspector)).type.toBe<{ value: number }>()

    Game.Inspector(
      "StabilityTypes/InvalidInspector",
      {
        queries: {
          // @ts-expect-error!
          invalid: Game.Query({
            selection: { position: Game.Query.write(Position) }
          })
        }
      },
      () => undefined
    )
  })

  it("carries failures through state-transition bundles", () => {
    const Mode = Game.StateMachine("StabilityTypes/Mode", ["Menu", "Playing"] as const)
    const start = Game.System(
      "StabilityTypes/Start",
      { nextMachines: { mode: Game.System.nextState(Mode) } },
      ({ nextMachines }) => { nextMachines.mode.set("Playing") }
    )
    const load = Game.System(
      "StabilityTypes/LoadLevel",
      {},
      () => Fx.fail("LoadFailed" as const)
    )
    const transitions = Game.Schedule.transitions(
      Game.Schedule.onEnter(Mode, "Playing", [load])
    )
    const transitionSchedule = Game.Schedule(
      start,
      Game.Schedule.applyStateTransitions(transitions)
    )
    const transitionRuntime = Game.Runtime.make({
      services: Game.Runtime.services(),
      resources: { Value: 0 },
      machines: Game.Runtime.machines(Game.Runtime.machine(Mode, "Menu"))
    })

    expect(transitionRuntime.tick(transitionSchedule)).type.toBe<
      Result.Result<void, System.SystemFailure<"StabilityTypes/LoadLevel", "LoadFailed">>
    >()
  })
})
