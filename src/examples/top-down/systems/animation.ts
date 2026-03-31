import { Fx } from "../../../index.ts"

import { PLAYER_FRAME_SECONDS, facingRows } from "../constants.ts"
import { advanceFrameIndex, lengthSquared } from "../math.ts"
import { PlayerVelocityQuery } from "../queries.ts"
import {
  AnimationClock,
  CurrentPlayerFrame,
  DeltaTime,
  Facing,
  Game,
  Locomotion
} from "../schema.ts"

export const ResolveFacingSystem = Game.System.define(
  "TopDown/ResolveFacing",
  {
    queries: {
      player: PlayerVelocityQuery
    },
    machines: {
      facing: Game.System.machine(Facing)
    },
    nextMachines: {
      facing: Game.System.nextState(Facing)
    }
  },
  ({ queries, machines, nextMachines }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      const velocity = player.value.data.velocity.get()
      const ax = Math.abs(velocity.x)
      const ay = Math.abs(velocity.y)
      if (ax === 0 && ay === 0) {
        return
      }

      const current = machines.facing.get()
      const nextFacing =
        ax > ay ? (velocity.x < 0 ? "Left" : "Right")
        : ay > ax ? (velocity.y < 0 ? "Up" : "Down")
        : current

      nextMachines.facing.setIfChanged(nextFacing)
    })
)

export const ResolveLocomotionSystem = Game.System.define(
  "TopDown/ResolveLocomotion",
  {
    queries: {
      player: PlayerVelocityQuery
    },
    nextMachines: {
      locomotion: Game.System.nextState(Locomotion)
    }
  },
  ({ queries, nextMachines }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      const velocity = player.value.data.velocity.get()
      nextMachines.locomotion.setIfChanged(
        lengthSquared(velocity) > 0 ? "Walking" : "Idle"
      )
    })
)

export const ResetAnimationClockSystem = Game.System.define(
  "TopDown/ResetAnimationClock",
  {
    when: [
      Game.Condition.or(
        Game.Condition.stateChanged(Facing),
        Game.Condition.stateChanged(Locomotion)
      )
    ],
    resources: {
      clock: Game.System.writeResource(AnimationClock)
    }
  },
  ({ resources }) =>
    Fx.sync(() => {
      resources.clock.set({
        frameIndex: 0,
        elapsed: 0
      })
    })
)

export const AdvanceAnimationClockSystem = Game.System.define(
  "TopDown/AdvanceAnimationClock",
  {
    resources: {
      deltaTime: Game.System.readResource(DeltaTime),
      clock: Game.System.writeResource(AnimationClock)
    },
    machines: {
      locomotion: Game.System.machine(Locomotion)
    }
  },
  ({ resources, machines }) =>
    Fx.sync(() => {
      const locomotion = machines.locomotion.get()
      const clock = resources.clock.get()

      if (locomotion === "Idle") {
        resources.clock.set({
          frameIndex: 0,
          elapsed: 0
        })
        return
      }

      let frameIndex = clock.frameIndex
      let elapsed = clock.elapsed + resources.deltaTime.get()

      while (elapsed >= PLAYER_FRAME_SECONDS) {
        elapsed -= PLAYER_FRAME_SECONDS
        frameIndex = advanceFrameIndex(frameIndex)
      }

      resources.clock.set({
        frameIndex,
        elapsed
      })
    })
)

export const ResolveCurrentPlayerFrameSystem = Game.System.define(
  "TopDown/ResolveCurrentPlayerFrame",
  {
    resources: {
      clock: Game.System.readResource(AnimationClock),
      frame: Game.System.writeResource(CurrentPlayerFrame)
    },
    machines: {
      facing: Game.System.machine(Facing),
      locomotion: Game.System.machine(Locomotion)
    }
  },
  ({ resources, machines }) =>
    Fx.sync(() => {
      const facing = machines.facing.get()
      const locomotion = machines.locomotion.get()
      const clock = resources.clock.get()

      resources.frame.set({
        row: facingRows[facing],
        column: locomotion === "Idle" ? 1 : (clock.frameIndex + 1) as import("../types.ts").CurrentPlayerFrameValue["column"]
      })
    })
)
