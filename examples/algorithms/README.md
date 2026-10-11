# Headless algorithms example

Run `pnpm example:algorithms` from the workspace root. It prints where eight
chasers ended up, the shots' hits, and the random state.

A 600 × 400 room with a wall down the middle, open at the bottom. Eight
chasers spawn on the left at random (from `Random`, its state kept in the
`Rng` resource), and every step they:

- follow one shared `FlowField` around the wall toward the player (the search
  runs again only when the player changes cell or the walls change),
- keep apart from nearby chasers, found through a `SpatialGrid` rebuilt each
  step (it allocates nothing once warm),
- move with `Collide2.moveCircle`, sliding along walls instead of stopping.

Shots move 67 units a step, much more than a wall is thick; each sweeps
against the walls and the chasers and stops at the earliest contact, so none
tunnels through.

The simulation reads no wall clock or global random source: the frame time
comes in through the `Frame` service, so the same seed replays exactly
(`test/simulation.test.ts`).
