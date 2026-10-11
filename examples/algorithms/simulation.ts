/** A headless example of math, RNG, spatial queries, geometry, and navigation in an ECS. */
import * as Result from "@typeonce/bevy-ts/Result"
import { Aabb, Direction2, Geometry2, Random, Scalar, Vector2 } from "@typeonce/bevy-ts-math"
import { Grid2, GridDistanceField } from "@typeonce/bevy-ts-navigation"
import { SpatialHash2 } from "@typeonce/bevy-ts-spatial"
import { Actor, Actors, Counters, Facing, Frame, Game, Navigation, Position, Pursuit, ReadSummary, Rng, Shot, Velocity } from "./schema.ts"

// These checks assert fixed authored data, never player input or calculated state.
const authored = <A, E>(result: Result.Result<A, E>): A => {
  if (!result.ok) throw new Error(`Invalid example data: ${JSON.stringify(result.error)}`)
  return result.value
}

const arena = authored(Result.all({
  cellSize: Scalar.Positive.result(1),
  radius: Scalar.NonNegative.result(0.25),
  speed: Scalar.Positive.result(2),
  zero: Scalar.NonNegative.result(0),
  wall: Aabb.result({ position: { x: 5.5, y: 3.5 }, size: { width: 1, height: 5 } }),
  grid: Grid2.result({
    columns: 12, rows: 8, connectivity: "four", maxCells: 96,
    walkable: ({ column, row }) => column !== 5 || row === 0 || row >= 6,
    cost: () => 1
  })
}))

const field = authored(GridDistanceField.build(arena.grid, { goals: [{ column: 10, row: 3 }], maxVisited: 96 }))
const toWorld = (cell: Grid2.Cell) => Vector2.result({ x: cell.column + 0.5, y: cell.row + 0.5 })

interface Sample {
  readonly id: number
  readonly label: string
  readonly role: "pursuer" | "target"
  readonly position: Vector2.Vector2
  readonly circle: Geometry2.Circle
  readonly bounds: Aabb.Aabb
}

interface PhaseSample { readonly label: string; readonly position: Vector2.Raw }
export type Summary = ReturnType<typeof ReadSummary.read> & {
  readonly crowdSnapshot: ReadonlyArray<PhaseSample>
  readonly collisionSnapshot: ReadonlyArray<PhaseSample>
}
export type Error = { readonly tag: "Algorithms/Failure"; readonly message: string }
export interface Input { readonly dt: number; readonly pursue?: boolean }
export interface Simulation {
  advance(input: Input): Result.Result<Summary, Error>
  snapshot(): Summary
}

/** Each simulation owns its frame, snapshots, indices, RNG, and runtime. */
export const makeSimulation = (options: { readonly seed?: number } = {}): Result.Result<Simulation, Error> => {
  const seeded = Random.result(options.seed ?? 1337)
  if (!seeded.ok) return Result.failure({ tag: "Algorithms/Failure", message: seeded.error.tag })
  const initial: Sample[] = []
  const crowd = SpatialHash2.from(initial, { cellSize: arena.cellSize, key: (item) => item.id, bounds: (item) => item.bounds })
  const collision = SpatialHash2.from(initial, { cellSize: arena.cellSize, key: (item) => item.id, bounds: (item) => item.bounds })
  if (!crowd.ok || !collision.ok) return Result.failure({ tag: "Algorithms/Failure", message: "Invalid spatial index" })
  const crowdIndex = crowd.value
  const collisionIndex = collision.value
  const host = { dt: arena.zero, pursue: true }
  let failure: Error | null = null
  let crowdSamples: Map<number, Sample> = new Map()
  let collisionSamples: Map<number, Sample> = new Map()
  const fail = (error: { readonly tag: string }) => { failure = { tag: "Algorithms/Failure", message: error.tag } }

  const Setup = Game.System("Algorithms/Setup", { resources: { rng: Game.System.writeResource(Rng) } }, ({ commands, resources }) => {
    let random = resources.rng.get()
    for (let index = 0; index < 2; index++) {
      const row = Random.integer(random, { min: 2, maxExclusive: 5 })
      if (!row.ok) { fail(row.error); return }
      random = row.value.state
      const draft = Game.Command.spawn(
        Game.Command.entryRaw(Position, { x: 1.5 + index, y: row.value.value + 0.5 }),
        Game.Command.entryRaw(Velocity, { x: 0, y: 0 }), Game.Command.entryRaw(Facing, { x: 1, y: 0 }),
        [Actor, { label: `pursuer-${index}`, role: "pursuer" }],
        [Pursuit, { waypoint: null, arrived: false }]
      )
      if (!draft.ok) { fail({ tag: "Setup/InvalidPursuer" }); return }
      commands.spawn(draft.value)
    }
    resources.rng.set(random)
    for (const target of [{ label: "behind-wall", x: 9.5, y: 3.5 }, { label: "open-lane", x: 4.5, y: 7.5 }]) {
      const draft = Game.Command.spawn(Game.Command.entryRaw(Position, { x: target.x, y: target.y }), [Actor, { label: target.label, role: "target" }])
      if (!draft.ok) { fail({ tag: "Setup/InvalidTarget" }); return }
      commands.spawn(draft.value)
    }
    for (const shot of [{ label: "blocked-shot", y: 3.5 }, { label: "open-shot", y: 7.5 }]) {
      const draft = Game.Command.spawn(Game.Command.entryRaw(Position, { x: 1.5, y: shot.y }), Game.Command.entryRaw(Velocity, { x: 120, y: 0 }), [Shot, { label: shot.label }])
      if (!draft.ok) { fail({ tag: "Setup/InvalidShot" }); return }
      commands.spawn(draft.value)
    }
  })

  const samplesOf = (entries: ReadonlyArray<{
    readonly entity: { readonly id: number }
    readonly data: { readonly actor: { get(): { readonly label: string; readonly role: "pursuer" | "target" } }; readonly position: { get(): Vector2.Vector2 } }
  }>): Sample[] => {
    const samples: Sample[] = []
    for (const { entity, data } of entries) {
      const position = data.position.get()
      const circle = Geometry2.Circle.result({ center: position, radius: arena.radius })
      if (!circle.ok) { fail(circle.error); continue }
      const bounds = Geometry2.circleBounds(circle.value)
      if (!bounds.ok) { fail(bounds.error); continue }
      samples.push({ id: entity.id, ...data.actor.get(), position, circle: circle.value, bounds: bounds.value })
    }
    return samples
  }

  const BuildCrowd = Game.System("Algorithms/BuildCrowd", { queries: { actors: Actors } }, ({ queries }) => {
    const samples = samplesOf(queries.actors.each())
    crowdSamples = new Map(samples.map((sample) => [sample.id, sample]))
    const rebuilt = crowdIndex.rebuild(samples)
    if (!rebuilt.ok) fail(rebuilt.error)
  })

  const Steer = Game.System("Algorithms/Steer", {
    queries: { bodies: Game.Query({ selection: { position: Game.Query.read(Position), velocity: Game.Query.write(Velocity), facing: Game.Query.write(Facing), pursuit: Game.Query.write(Pursuit) } }) },
    resources: { navigation: Game.System.readResource(Navigation), counters: Game.System.writeResource(Counters) },
    services: { frame: Game.System.service(Frame) }
  }, ({ queries, resources, services }) => {
    let neighbors = 0
    for (const { entity, data } of queries.bodies.each()) {
      data.velocity.set(Vector2.zero())
      if (!services.frame.pursue || data.pursuit.get().arrived) continue
      const position = data.position.get()
      let waypoint = data.pursuit.get().waypoint
      if (waypoint === null) {
        const next = GridDistanceField.nextCell(resources.navigation.get(), { column: Math.floor(position.x), row: Math.floor(position.y) })
        if (next.kind === "arrived") { data.pursuit.set({ waypoint: null, arrived: true }); continue }
        if (next.kind !== "next") { fail({ tag: `Navigation/${next.kind}` }); continue }
        waypoint = next.cell
        data.pursuit.set({ waypoint, arrived: false })
      }
      const target = toWorld(waypoint)
      if (!target.ok) { fail(target.error); continue }
      const direction = Vector2.subtract(target.value, position)
      if (!direction.ok) { fail(direction.error); continue }
      const facing = Direction2.normalizeOr(direction.value, data.facing.get())
      data.facing.set(facing)
      const nearby = Aabb.result({ position, size: { width: 1.6, height: 1.6 } })
      if (!nearby.ok) { fail(nearby.error); continue }
      let close = 0
      const found = crowdIndex.forEachCandidate(nearby.value, (id) => {
        const other = crowdSamples.get(id)
        if (id === entity.id || other === undefined || other.role !== "pursuer") return
        const distance = Vector2.distance(position, other.position)
        if (!distance.ok) { fail(distance.error); return }
        if (distance.value < 0.8) close++
      })
      if (!found.ok) { fail(found.error); continue }
      neighbors += close
      // This example's crowd response is game policy. The index only supplies candidates.
      const speed = Scalar.Positive.result(arena.speed / (1 + close * 0.2))
      if (!speed.ok) { fail(speed.error); continue }
      const velocity = Vector2.scale(Direction2.toVector(facing), speed.value)
      if (!velocity.ok) { fail(velocity.error); continue }
      data.velocity.set(velocity.value)
    }
    resources.counters.update((before) => ({ ...before, crowdNeighbors: before.crowdNeighbors + neighbors }))
  })

  const MoveBodies = Game.System("Algorithms/MoveBodies", {
    queries: { bodies: Game.Query({ selection: { position: Game.Query.write(Position), velocity: Game.Query.read(Velocity), pursuit: Game.Query.write(Pursuit) } }) },
    services: { frame: Game.System.service(Frame) }
  }, ({ queries, services }) => {
    for (const { data } of queries.bodies.each()) {
      const waypoint = data.pursuit.get().waypoint
      if (waypoint === null || !services.frame.pursue) continue
      const travel = Vector2.scale(data.velocity.get(), services.frame.dt)
      if (!travel.ok) { fail(travel.error); continue }
      const length = Vector2.length(travel.value)
      const target = toWorld(waypoint)
      if (!length.ok || !target.ok) { fail(!length.ok ? length.error : { tag: "InvalidWaypoint" }); continue }
      const moved = Vector2.moveToward(data.position.get(), target.value, length.value)
      if (!moved.ok) { fail(moved.error); continue }
      data.position.set(moved.value)
      if (moved.value.x === target.value.x && moved.value.y === target.value.y) data.pursuit.set({ waypoint: null, arrived: false })
    }
  })

  const BuildCollision = Game.System("Algorithms/BuildCollision", { queries: { actors: Actors } }, ({ queries }) => {
    const samples = samplesOf(queries.actors.each())
    collisionSamples = new Map(samples.map((sample) => [sample.id, sample]))
    const rebuilt = collisionIndex.rebuild(samples)
    if (!rebuilt.ok) fail(rebuilt.error)
  })

  const MoveShots = Game.System("Algorithms/MoveShots", {
    queries: { shots: Game.Query({ selection: { position: Game.Query.write(Position), velocity: Game.Query.read(Velocity), shot: Game.Query.read(Shot) } }) },
    resources: { counters: Game.System.writeResource(Counters) }, services: { frame: Game.System.service(Frame) }
  }, ({ queries, resources, services, commands }) => {
    for (const { entity, data } of queries.shots.each()) {
      const circle = Geometry2.Circle.result({ center: data.position.get(), radius: arena.radius })
      const delta = Vector2.scale(data.velocity.get(), services.frame.dt)
      if (!circle.ok || !delta.ok) { fail(!circle.ok ? circle.error : { tag: "InvalidShotDisplacement" }); continue }
      const bounds = Geometry2.sweptCircleBounds(circle.value, delta.value)
      const wall = Geometry2.sweepCircleAabb(circle.value, delta.value, arena.wall)
      if (!bounds.ok || !wall.ok) { fail(!bounds.ok ? bounds.error : { tag: "InvalidWallSweep" }); continue }
      let first: { time: number; kind: "wall" | "actor"; actor: string | null } | null = wall.value.tag === "Geometry2/Contact"
        ? { time: wall.value.time, kind: "wall", actor: null }
        : wall.value.tag === "Geometry2/InitialOverlap" ? { time: 0, kind: "wall", actor: null } : null
      const candidates = collisionIndex.forEachCandidate(bounds.value, (id) => {
        const target = collisionSamples.get(id)
        if (target === undefined || target.role !== "target") return
        const hit = Geometry2.sweepCircleCircle(circle.value, delta.value, target.circle)
        if (!hit.ok) { fail(hit.error); return }
        const time = hit.value.tag === "Geometry2/InitialOverlap" ? 0 : hit.value.tag === "Geometry2/Contact" ? hit.value.time : null
        // Exact contact time decides. Walls win ties; index order never implies the earliest hit.
        if (time !== null && (first === null || time < first.time)) first = { time, kind: "actor", actor: target.label }
      })
      if (!candidates.ok) { fail(candidates.error); continue }
      if (first !== null) {
        const contact = first
        resources.counters.update((before) => ({ ...before, contacts: [...before.contacts, { shot: data.shot.get().label, ...contact }] }))
        commands.despawn(entity.id)
      } else {
        const position = Vector2.add(data.position.get(), delta.value)
        if (!position.ok) { fail(position.error); continue }
        data.position.set(position.value)
      }
    }
  })

  const Tick = Game.System("Algorithms/Tick", { resources: { counters: Game.System.writeResource(Counters) } }, ({ resources }) => {
    resources.counters.update((before) => ({ ...before, ticks: before.ticks + 1 }))
  })
  const setup = Game.Schedule(Setup, Game.Schedule.applyDeferred())
  const update = Game.Schedule(BuildCrowd, Steer, MoveBodies, BuildCollision, MoveShots, Tick, Game.Schedule.applyDeferred())
  const runtime = Game.Runtime.make({
    resources: { Rng: seeded.value, Navigation: field, Counters: { ticks: 0, crowdNeighbors: 0, contacts: [] } },
    services: Game.Runtime.services(Game.Runtime.service(Frame, host))
  })
  const started = runtime.tick(setup)
  if (!started.ok || failure !== null) return Result.failure(failure ?? { tag: "Algorithms/Failure", message: "Setup failed" })
  const phaseSamples = (samples: Map<number, Sample>): PhaseSample[] => [...samples.values()]
    .filter((sample) => sample.role === "pursuer")
    .map((sample) => ({ label: sample.label, position: Vector2.toRaw(sample.position) }))
  const snapshot = (): Summary => ({
    ...runtime.inspect(ReadSummary),
    crowdSnapshot: phaseSamples(crowdSamples),
    collisionSnapshot: phaseSamples(collisionSamples)
  })
  return Result.success({
    snapshot,
    advance(input) {
      const dt = Scalar.NonNegative.result(input.dt)
      if (!dt.ok) return Result.failure({ tag: "Algorithms/Failure", message: dt.error.tag })
      host.dt = dt.value
      host.pursue = input.pursue ?? true
      failure = null
      const ticked = runtime.tick(update)
      if (!ticked.ok || failure !== null) return Result.failure(failure ?? { tag: "Algorithms/Failure", message: "Update failed" })
      return Result.success(snapshot())
    }
  })
}

/** Supplies one frame's clock and input explicitly. */
export const step = (simulation: Simulation, input: Input): Result.Result<Summary, Error> => simulation.advance(input)
