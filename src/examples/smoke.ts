/**
 * Smoke example for the current prototype runtime.
 *
 * This file is intentionally small, but it exercises the main public surface:
 * descriptors, schemas, systems, queries, commands, schedules, runtime
 * construction, and app-style updates.
 */
import { App, Descriptor, Fx, Schema } from "../index.ts"

// ---------------------------------------------------------------------------
// 1. Descriptors
// ---------------------------------------------------------------------------
// Descriptors give nominal identities to ECS data and services.
const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Position")
const Velocity = Descriptor.defineComponent<{ x: number; y: number }>()("Velocity")
const Time = Descriptor.defineResource<number>()("Time")
const TickEvent = Descriptor.defineEvent<{ readonly dt: number }>()("TickEvent")
const Phase = Descriptor.defineState<"Running" | "Paused">()("Phase")
const Logger = Descriptor.defineService<{ readonly log: (message: string) => void }>()("Logger")

// ---------------------------------------------------------------------------
// 2. Schema
// ---------------------------------------------------------------------------
// Fragments group related descriptors. The final schema closes the world.
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

const schema = Schema.build(motionSchema)
// Bind once so every later definition stays on the same typed root.
const Game = Schema.bind(schema)

// ---------------------------------------------------------------------------
// 3. Systems
// ---------------------------------------------------------------------------
// Systems only get the data they declare here. Nothing else is reachable in the
// callback, so the runtime requirements stay honest.
const MoveSystem = Game.System.define(
  "MoveSystem",
  {
    queries: {
      moving: Game.Query.define({
        selection: {
          position: Game.Query.write(Position),
          velocity: Game.Query.read(Velocity)
        }
      })
    },
    resources: {
      time: Game.System.readResource(Time)
    },
    events: {
      tick: Game.System.writeEvent(TickEvent)
    },
    services: {
      logger: Game.System.service(Logger)
    },
    states: {
      phase: Game.System.writeState(Phase)
    }
  },
  ({ queries, resources, events, services, states, commands }) =>
    Fx.sync(() => {
      // State reads can gate the rest of the system without global lookups.
      const phase = states.phase.get()
      if (phase !== "Running") {
        return
      }

      // Resource reads stay explicit too.
      const dt = resources.time.get()
      for (const match of queries.moving.each()) {
        const position = match.data.position.get()
        const velocity = match.data.velocity.get()

        // Query write views make mutation local and typed.
        match.data.position.set({
          x: position.x + velocity.x * dt,
          y: position.y + velocity.y * dt
        })
      }

      // Commands are deferred. This queues the spawn for the schedule apply phase.
      const spawned = Game.Command.spawnWith(
        [Position, { x: dt, y: dt }],
        [Velocity, { x: 1, y: 1 }]
      )
      commands.spawn(spawned)
      events.tick.emit({ dt })
      services.logger.log(`tick=${dt}`)
    })
)

// ---------------------------------------------------------------------------
// 4. Schedule
// ---------------------------------------------------------------------------
// Schedules group systems into something the runtime can execute.
const schedule = Game.Schedule.define({
  systems: [MoveSystem]
})

// ---------------------------------------------------------------------------
// 5. Runtime
// ---------------------------------------------------------------------------
// The runtime has to provide exactly what the schedule requires.
const runtime = Game.Runtime.make({
  services: Game.Runtime.services(
    Game.Runtime.service(Logger, {
      log(message) {
        console.log(message)
      }
    })
  ),
  resources: {
    Time: 0.5
  },
  states: {
    Phase: "Running"
  }
})

// ---------------------------------------------------------------------------
// 6. App execution
// ---------------------------------------------------------------------------
// `App` is a small facade over the runtime. If this compiles, the runtime
// satisfies the schedule's declared requirements.
const app = App.makeApp(runtime)
app.update(schedule)
