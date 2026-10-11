import { Descriptor, Schema } from "@typeonce/bevy-ts"
import { Direction2, Random, Scalar, Vector2 } from "@typeonce/bevy-ts-math"
import type { Grid2, GridDistanceField } from "@typeonce/bevy-ts-navigation"

export const Position = Descriptor.ConstructedComponent(Vector2)("Algorithms/Position")
export const Velocity = Descriptor.ConstructedComponent(Vector2)("Algorithms/Velocity")
export const Facing = Descriptor.ConstructedComponent(Direction2)("Algorithms/Facing")
export const Actor = Descriptor.Component<{ readonly label: string; readonly role: "pursuer" | "target" }>()("Algorithms/Actor")
export const Pursuit = Descriptor.Component<{ readonly waypoint: Grid2.Cell | null; readonly arrived: boolean }>()("Algorithms/Pursuit")
export const Shot = Descriptor.Component<{ readonly label: string }>()("Algorithms/Shot")
export const Rng = Descriptor.Resource<Random.State>()("Algorithms/Rng")
// Derived navigation is rebuilt from authored cells, rather than saved with private storage tokens.
export const Navigation = Descriptor.TransientResource<GridDistanceField.GridDistanceField>()("Algorithms/Navigation")
export const Counters = Descriptor.Resource<{
  readonly ticks: number
  readonly crowdNeighbors: number
  readonly contacts: ReadonlyArray<{ readonly shot: string; readonly kind: "wall" | "actor"; readonly actor: string | null; readonly time: number }>
}>()("Algorithms/Counters")
export const Frame = Descriptor.Service<{ dt: Scalar.NonNegative; pursue: boolean }>()("Algorithms/Frame")

export const Game = Schema.bind(Schema.fragment({
  components: { Position, Velocity, Facing, Actor, Pursuit, Shot },
  resources: { Rng, Navigation, Counters }
}))

export const Actors = Game.Query({ selection: { actor: Game.Query.read(Actor), position: Game.Query.read(Position) } })

export const ReadSummary = Game.Inspector("Algorithms/Summary", {
  queries: {
    actors: Game.Query({ selection: { actor: Game.Query.read(Actor), position: Game.Query.read(Position), pursuit: Game.Query.optional(Pursuit) } }),
    shots: Game.Query({ selection: { shot: Game.Query.read(Shot) } })
  },
  resources: { counters: Game.System.readResource(Counters), rng: Game.System.readResource(Rng) }
}, ({ queries, resources }) => ({
  ...resources.counters.get(),
  seed: resources.rng.get().seed,
  actors: queries.actors.each().map(({ data }) => ({
    label: data.actor.get().label,
    role: data.actor.get().role,
    position: Vector2.toRaw(data.position.get()),
    arrived: data.pursuit.present && data.pursuit.get().arrived
  })),
  shotsRemaining: queries.shots.each().length
}))
