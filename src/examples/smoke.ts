/**
 * Compact smoke example for the current public ECS surface.
 *
 * It keeps the scenario intentionally small while exercising the modern API:
 * schema binding, machine-gated systems, deferred commands, explicit event
 * visibility, runtime provisioning, and app bootstrap/update execution.
 */
import { App, Descriptor, Fx, Schema } from "../index.ts"

const Position = Descriptor.defineComponent<{ x: number; y: number }>()("Smoke/Position")
const Velocity = Descriptor.defineComponent<{ x: number; y: number }>()("Smoke/Velocity")

const Time = Descriptor.defineResource<number>()("Smoke/Time")
const TickCount = Descriptor.defineResource<number>()("Smoke/TickCount")

const TickEvent = Descriptor.defineEvent<{
  readonly tick: number
  readonly dt: number
}>()("Smoke/TickEvent")

const Logger = Descriptor.defineService<{
  readonly log: (message: string) => void
}>()("Smoke/Logger")

const schema = Schema.build(Schema.fragment({
  components: {
    Position,
    Velocity
  },
  resources: {
    Time,
    TickCount
  },
  events: {
    TickEvent
  }
}))

const Game = Schema.bind(schema)
// `Phase` is a machine because the queued transition boundary matters for
// gameplay flow. A plain state descriptor would not model that boundary.
const Phase = Game.StateMachine.define("Phase", ["Running", "Paused"])

const MovingQuery = Game.Query.define({
  selection: {
    position: Game.Query.write(Position),
    velocity: Game.Query.read(Velocity)
  }
})

const SetupSystem = Game.System.define(
  "Smoke/Setup",
  {},
  ({ commands }) =>
    Fx.sync(() => {
      commands.spawn(
        Game.Command.spawnWith(
          [Position, { x: 0, y: 0 }],
          [Velocity, { x: 1, y: 0.5 }]
        )
      )
    })
)

const MoveSystem = Game.System.define(
  "Smoke/Move",
  {
    when: [Game.Condition.inState(Phase, "Running")],
    queries: {
      moving: MovingQuery
    },
    resources: {
      time: Game.System.readResource(Time),
      tickCount: Game.System.writeResource(TickCount)
    },
    events: {
      tick: Game.System.writeEvent(TickEvent)
    },
    services: {
      logger: Game.System.service(Logger)
    }
  },
  ({ queries, resources, events, services, commands }) =>
    Fx.sync(() => {
      const dt = resources.time.get()
      resources.tickCount.update((value) => value + 1)
      const tick = resources.tickCount.get()

      for (const { data } of queries.moving.each()) {
        const velocity = data.velocity.get()
        data.position.update((position) => ({
          x: position.x + velocity.x * dt,
          y: position.y + velocity.y * dt
        }))
      }

      commands.spawn(
        Game.Command.spawnWith(
          [Position, { x: tick * dt, y: tick * dt }],
          [Velocity, { x: 1, y: 1 }]
        )
      )

      events.tick.emit({ tick, dt })
      services.logger.log(`queued tick=${tick}`)
    })
)

const ObserveTickSystem = Game.System.define(
  "Smoke/ObserveTick",
  {
    events: {
      tick: Game.System.readEvent(TickEvent)
    },
    services: {
      logger: Game.System.service(Logger)
    }
  },
  ({ events, services }) =>
    Fx.sync(() => {
      for (const event of events.tick.all()) {
        services.logger.log(`observed tick=${event.tick} dt=${event.dt}`)
      }
    })
)

const bootstrap = Game.Schedule.define({
  entries: [SetupSystem]
})

const update = Game.Schedule.define({
  entries: [
    MoveSystem,
    Game.Schedule.applyDeferred(),
    Game.Schedule.updateEvents(),
    ObserveTickSystem
  ]
})

const runtime = Game.Runtime.make({
  services: Game.Runtime.services(
    Game.Runtime.service(Logger, {
      log(message) {
        console.log(message)
      }
    })
  ),
  resources: {
    Time: 0.5,
    TickCount: 0
  },
  machines: Game.Runtime.machines(
    Game.Runtime.machine(Phase, "Running")
  )
})

export const createSmokeExample = () => {
  const app = App.makeApp(runtime)
  app.bootstrap(bootstrap)

  return {
    runtime,
    app,
    updateSchedule: update
  }
}
