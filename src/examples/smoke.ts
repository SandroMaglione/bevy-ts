/**
 * Smoke example for the current prototype runtime.
 *
 * This file is intentionally small, but it exercises the main public surface:
 * descriptors, schemas, systems, queries, commands, schedules, runtime
 * construction, and app-style updates.
 */
import { App, Command, Descriptor, Fx, Label, Query, Runtime, Schedule, Schema, System } from "../index.ts"

// Components used by the movement example.
const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.defineComponent<{ x: number; y: number }>()("Velocity")
// A resource representing the fixed step duration.
const Time = Descriptor.defineResource<number>()("Time")
// An event emitted after each tick.
const TickEvent = Descriptor.defineEvent<{ readonly dt: number }>()("TickEvent")
// A state used to gate the movement system.
const Phase = Descriptor.defineState<"Running" | "Paused">()("Phase")
// A host-provided logging service.
const Logger = Descriptor.defineService<{ readonly log: (message: string) => void }>()("Logger")
const UpdateScheduleLabel = Label.defineScheduleLabel("Update")

// Feature-local schema fragment for the movement example.
const motionSchema = Schema.fragment({
  components: {
    Position,
    Velocity
  },
  resources: {
    Time
  },
  events: {
    TickEvent
  },
  states: {
    Phase
  }
})

// The final closed schema used by systems and the runtime.
const schema = Schema.build(motionSchema)

// A movement system that reads velocity, writes position, emits an event, and
// queues a spawned entity to exercise the command API.
const MoveSystem = System.define(
  "MoveSystem",
  {
    schema,
    queries: {
      moving: Query.define({
        selection: {
          position: Query.write(Position),
          velocity: Query.read(Velocity)
        }
      })
    },
    resources: {
      time: System.readResource(Time)
    },
    events: {
      tick: System.writeEvent(TickEvent)
    },
    services: {
      logger: System.service(Logger)
    },
    states: {
      phase: System.writeState(Phase)
    }
  },
  ({ queries, resources, events, services, states, commands }) =>
    Fx.sync(() => {
      const phase = states.phase.get()
      if (phase !== "Running") {
        return
      }

      const dt = resources.time.get()
      for (const match of queries.moving.each()) {
        const position = match.data.position.get()
        const velocity = match.data.velocity.get()
        match.data.position.set({
          x: position.x + velocity.x * dt,
          y: position.y + velocity.y * dt
        })
      }

      const spawned = Command.spawnWith<typeof schema>(
        [Position, { x: dt, y: dt }],
        [Velocity, { x: 1, y: 1 }]
      )
      commands.spawn(spawned)
      events.tick.emit({ dt })
      services.logger.log(`tick=${dt}`)
    })
)

// The schedule that runs the example system.
const schedule = Schedule.define({
  label: UpdateScheduleLabel,
  schema,
  systems: [MoveSystem]
})

// Runtime wiring for the example, including initial resources and services.
const runtime = Runtime.makeRuntime({
  schema,
  services: Runtime.services(
    [Logger, {
      log(message: string) {
        console.log(message)
      }
    }]
  ),
  resources: {
    Time: 0.5
  },
  states: {
    Phase: "Running"
  }
})

// Optional Bevy-like facade over the runtime.
const app = App.makeApp(runtime)
app.update(schedule)
