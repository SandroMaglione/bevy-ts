# Headless algorithms example

Run `node --import tsx examples/algorithms/main.ts` from the workspace root.
The script prints seeded spawns, pursuit results, contacts, and the last
spatial snapshots. It creates two pursuers, two stationary targets, and two
fast shots in a fixed 12 by 8 arena. Both pursuers route around one wall to
the same goal. One shot stops at the wall; the other hits its target.

The example consumes all five additions through a schema-bound ECS schedule.
It uses checked Vector2 and Scalar calculations, Direction2 facing, explicit
Random state, SpatialHash2 candidates, exact Geometry2 sweeps, and one shared
GridDistanceField resource. Normal inference requires no casts or explicit
type arguments.

Each simulation builds its own systems and indices. The update order is
`BuildCrowd → Steer → MoveBodies → BuildCollision → MoveShots`. Crowd steering
reads a snapshot taken before movement. Shots read a new snapshot afterward.
Each candidate's exact contact time is compared with the current earliest
hit. Walls win ties; equal-time actor contacts retain the first candidate.
Crowd slowing, actor filtering, and collision response are the example's
policies.

`makeSimulation({ seed })` returns an explicit result. `step(simulation,
{ dt, pursue })` supplies each frame's clock and input. The simulation reads
no wall clock or global random source. Invalid frame clocks are rejected
before a tick. Tests check replay, interleaved independent simulations,
snapshot timing, routing, and fast-shot contacts.

The fixed authored grid and wall are validated once when the module loads.
`authored` only asserts those constants. Runtime calculations and queries
handle their results explicitly. There is no renderer, input device, physics
response engine, or production-game dependency.
