import { Descriptor, Schema } from "@typeonce/bevy-ts"
import { Invariant, Lint, Session } from "@typeonce/bevy-ts-devtools"
import { describe, expect, it } from "tstyche"

const Position = Descriptor.Component<{ readonly x: number }>()("DevtoolsTypes/Position")
const Other = Descriptor.Component<{ readonly y: number }>()("DevtoolsTypes/Other")
const Limit = Descriptor.Resource<number>()("DevtoolsTypes/Limit")
const Request = Descriptor.Event<string>()("DevtoolsTypes/Request")
const Foreign = Descriptor.Event<string>()("DevtoolsTypes/ForeignRequest")
const Game = Schema.bind(Schema.fragment({ components: { Position }, resources: { Limit }, events: { Request } }))
const OtherGame = Schema.bind(Schema.fragment({ components: { Other } }))
const update = Game.Schedule(Game.System("DevtoolsTypes/Noop", {}, () => {}))

describe("Session.make", () => {
  it("requires a runtime made with debug: true", () => {
    const plain = Game.Runtime.make({ services: Game.Runtime.services() })
    expect(Session.make).type.not.toBeCallableWith(plain, { schedules: { update } })
    const debugged = Game.Runtime.make({ services: Game.Runtime.services(), debug: true })
    expect(Session.make).type.toBeCallableWith(debugged, { schedules: { update } })
  })

  it("rejects schedules of another schema", () => {
    const debugged = Game.Runtime.make({ services: Game.Runtime.services(), debug: true })
    const foreign = OtherGame.Schedule(OtherGame.System("DevtoolsTypes/Foreign", {}, () => {}))
    expect(Session.make).type.not.toBeCallableWith(debugged, { schedules: { foreign } })
  })

  it("describes but does not run describe-only schedules", () => {
    const render = Game.Schedule(Game.System("DevtoolsTypes/Render", {}, () => {}))
    const session = Session.make(Game.Runtime.make({ services: Game.Runtime.services(), debug: true }), { schedules: { update }, describe: { render } })
    expect(session.run).type.toBeCallableWith("update")
    expect(session.run).type.not.toBeCallableWith("render")
    const foreign = OtherGame.Schedule(OtherGame.System("DevtoolsTypes/ForeignRender", {}, () => {}))
    expect(Session.make).type.not.toBeCallableWith(Game.Runtime.make({ services: Game.Runtime.services(), debug: true }), { schedules: { update }, describe: { foreign } })
  })

  it("runs only named schedules and filters by the runtime's descriptors", () => {
    const session = Session.make(Game.Runtime.make({ services: Game.Runtime.services(), debug: true }), { schedules: { update } })
    expect(session.run).type.toBeCallableWith("update")
    expect(session.run).type.not.toBeCallableWith("updat")
    expect(session.journal).type.toBeCallableWith({ component: Position })
    expect(session.journal).type.not.toBeCallableWith({ component: Other })
    expect(session.why).type.not.toBeCallableWith(1, Other)
  })
})

describe("Invariant.fromInspector", () => {
  const Positions = Game.Query({ selection: { position: Game.Query.read(Position) } })

  it("builds an invariant named after an inspector that returns a message or undefined", () => {
    const inspector = Game.Inspector("DevtoolsTypes/NonNegative", { queries: { positions: Positions } }, ({ queries }) =>
      queries.positions.each().some((match) => match.data.position.get().x < 0) ? "negative x" : undefined)
    const invariant = Invariant.fromInspector(inspector)
    expect(invariant).type.toBe<Invariant.Invariant<typeof inspector>>()
    expect(invariant.name).type.toBe<"DevtoolsTypes/NonNegative">()
  })

  it("rejects inspectors that do not return string | undefined", () => {
    const counts = Game.Inspector("DevtoolsTypes/Count", { queries: { positions: Positions } }, ({ queries }) => queries.positions.each().length)
    expect(Invariant.fromInspector).type.not.toBeCallableWith(counts)
    const message = Game.Inspector("DevtoolsTypes/Message", {}, () => "always" as string | undefined)
    expect(Invariant.fromInspector).type.toBeCallableWith(message)
  })

  it("is checked against the runtime's provisions by Session.make", () => {
    const UnderLimit = Invariant.fromInspector(Game.Inspector("DevtoolsTypes/UnderLimit", {
      queries: { positions: Positions },
      resources: { limit: Game.System.readResource(Limit) }
    }, ({ queries, resources }) =>
      queries.positions.each().some((match) => match.data.position.get().x > resources.limit.get()) ? "over limit" : undefined))

    const provided = Game.Runtime.make({ services: Game.Runtime.services(), resources: { Limit: 10 }, debug: true })
    Session.make(provided, { schedules: { update }, invariants: [UnderLimit] })

    const missing = Game.Runtime.make({ services: Game.Runtime.services(), debug: true })
    // @ts-expect-error __fixInvariantRequirements__: { readonly __runtimeRequirementError__: "Missing resource"; readonly __requirement__: "DevtoolsTypes/Limit"
    Session.make(missing, { schedules: { update }, invariants: [UnderLimit] })
  })

  it("rejects invariants of another game", () => {
    const Foreign = Invariant.fromInspector(OtherGame.Inspector("DevtoolsTypes/Foreign", {}, () => undefined))
    const debugged = Game.Runtime.make({ services: Game.Runtime.services(), debug: true })
    expect(Session.make).type.not.toBeCallableWith(debugged, { schedules: { update }, invariants: [Foreign] })
    expect(Session.make).type.toBeCallableWith(debugged, { schedules: { update }, invariants: [Invariant.fromInspector(Game.Inspector("DevtoolsTypes/Own", {}, () => undefined))] })
  })
})

describe("Lint.run", () => {
  it("returns a report and takes host events of the runtime's schema only", () => {
    const runtime = Game.Runtime.make({ services: Game.Runtime.services(), resources: { Limit: 1 }, debug: true })
    expect(Lint.run({ runtime, schedules: { update }, hostEvents: [Request] }).data).type.toBe<Lint.Report>()
    expect(Lint.run).type.not.toBeCallableWith({ runtime, schedules: { update }, hostEvents: [Foreign] })
    expect(runtime.debug.declareHostEvents).type.not.toBeCallableWith([Foreign])
    expect(runtime.debug.declareHostEvents).type.toBeCallableWith([Request])
  })

  it("requires a runtime made with debug: true", () => {
    const plain = Game.Runtime.make({ services: Game.Runtime.services(), resources: { Limit: 1 } })
    expect(Lint.run).type.not.toBeCallableWith({ runtime: plain, schedules: { update } })
  })
})
