/**
 * Runtime regression check for schema-key-based resource and state seeding.
 *
 * This intentionally uses schema property names that differ from descriptor
 * names to prove initialization is driven by schema keys, not descriptor names.
 */
import { App, Descriptor, Fx, Label, Runtime, Schedule, Schema, System } from "../index.ts"

const Time = Descriptor.defineResource<number>()("Time")
const GamePhase = Descriptor.defineState<"Boot" | "Running">()("GamePhase")
const ResultSink = Descriptor.defineResource<{
  time?: number
  phase?: "Boot" | "Running"
}>()("ResultSink")

const UpdateScheduleLabel = Label.defineScheduleLabel("RuntimeInitRegression/Update")

const schema = Schema.build(Schema.fragment({
  resources: {
    DeltaTime: Time,
    ResultSink
  },
  states: {
    CurrentPhase: GamePhase
  }
}))

const CaptureInitializationSystem = System.define(
  "RuntimeInitRegression/CaptureInitialization",
  {
    schema,
    resources: {
      time: System.readResource(Time),
      sink: System.writeResource(ResultSink)
    },
    states: {
      phase: System.readState(GamePhase)
    }
  },
  ({ resources, states }) =>
    Fx.sync(() => {
      resources.sink.set({
        time: resources.time.get(),
        phase: states.phase.get()
      })
    })
)

let captured: { time?: number; phase?: "Boot" | "Running" } | undefined

const ReadBackSystem = System.define(
  "RuntimeInitRegression/ReadBack",
  {
    schema,
    resources: {
      sink: System.readResource(ResultSink)
    }
  },
  ({ resources }) =>
    Fx.sync(() => {
      captured = resources.sink.get()
    })
)

const schedule = Schedule.define({
  label: UpdateScheduleLabel,
  schema,
  systems: [CaptureInitializationSystem]
})

const readBackSchedule = Schedule.define({
  label: Label.defineScheduleLabel("RuntimeInitRegression/ReadBack"),
  schema,
  systems: [ReadBackSystem]
})

const runtime = Runtime.makeRuntime({
  schema,
  services: {},
  resources: {
    DeltaTime: 0.25,
    ResultSink: {}
  },
  states: {
    CurrentPhase: "Running"
  }
})

const app = App.makeApp(runtime)
app.update(schedule)
app.update(readBackSchedule)

if (captured?.time !== 0.25) {
  throw new Error(`Expected DeltaTime to seed by schema key, received ${String(captured?.time)}`)
}

if (captured?.phase !== "Running") {
  throw new Error(`Expected CurrentPhase to seed by schema key, received ${String(captured?.phase)}`)
}

console.log("runtime-init-regression: ok")
