import { Fx } from "../../../index.ts"
import * as Vector2 from "../../../Vector2.ts"
import { GRAVITY, JUMP_VELOCITY, MAX_FALL_SPEED } from "../constants.ts"
import { PlayerMovementQuery, SolidCollisionQuery } from "../queries.ts"
import { DeltaTime, Game, InputState, PlayerContacts } from "../schema.ts"
import { clamp, resolveHorizontalMovement, resolveHorizontalSpeed, resolveVerticalMovement } from "../math.ts"

export const ResolveMoveIntentSystem = Game.System(
  "Platformer/ResolveMoveIntent",
  {
    queries: {
      player: PlayerMovementQuery
    },
    resources: {
      input: Game.System.readResource(InputState),
      deltaTime: Game.System.readResource(DeltaTime),
      contacts: Game.System.readResource(PlayerContacts)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      const nextVelocityX = resolveHorizontalSpeed(
        player.value.data.velocity.get().x,
        resources.input.get(),
        resources.deltaTime.get(),
        resources.contacts.get().grounded
      )

      player.value.data.velocity.updateRaw((velocity) =>
        ({
          x: nextVelocityX,
          y: velocity.y
        })
      )
    })
)

export const ApplyJumpSystem = Game.System(
  "Platformer/ApplyJump",
  {
    queries: {
      player: PlayerMovementQuery
    },
    resources: {
      input: Game.System.readResource(InputState),
      contacts: Game.System.writeResource(PlayerContacts)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      const input = resources.input.get()
      const contacts = resources.contacts.get()
      if (!contacts.grounded || !input.jumpJustPressed) {
        return
      }

      player.value.data.velocity.updateRaw((velocity) =>
        ({
          x: velocity.x,
          y: -JUMP_VELOCITY
        })
      )

      resources.contacts.set({
        grounded: false,
        hitCeiling: false,
        blockedLeft: contacts.blockedLeft,
        blockedRight: contacts.blockedRight
      })
    })
)

export const ApplyGravitySystem = Game.System(
  "Platformer/ApplyGravity",
  {
    queries: {
      player: PlayerMovementQuery
    },
    resources: {
      deltaTime: Game.System.readResource(DeltaTime)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      player.value.data.velocity.updateRaw((velocity) =>
        ({
          x: velocity.x,
          y: clamp(
            velocity.y + GRAVITY * resources.deltaTime.get(),
            -JUMP_VELOCITY,
            MAX_FALL_SPEED
          )
        })
      )
    })
)

export const MovePlayerSystem = Game.System(
  "Platformer/MovePlayer",
  {
    queries: {
      player: PlayerMovementQuery,
      solids: SolidCollisionQuery
    },
    resources: {
      deltaTime: Game.System.readResource(DeltaTime),
      contacts: Game.System.writeResource(PlayerContacts)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      const dt = resources.deltaTime.get()
      const position = player.value.data.position.get()
      const velocity = player.value.data.velocity.get()
      const collider = player.value.data.collider.get()
      const solids = queries.solids.each().map((match) => ({
        position: match.data.position.get(),
        collider: match.data.collider.get()
      }))

      const horizontalResult = resolveHorizontalMovement(position, velocity.x * dt, collider, solids)
      const horizontalPosition = Vector2.result({
        x: horizontalResult.nextX,
        y: position.y
      })
      if (!horizontalPosition.ok) {
        return
      }
      const verticalResult = resolveVerticalMovement(horizontalPosition.value, velocity.y * dt, collider, solids)

      player.value.data.position.setRaw({
        x: horizontalResult.nextX,
        y: verticalResult.nextY
      })

      player.value.data.velocity.setRaw({
        x:
          horizontalResult.blockedLeft || horizontalResult.blockedRight
            ? 0
            : velocity.x,
        y:
          verticalResult.grounded || verticalResult.hitCeiling
            ? 0
            : velocity.y
      })

      resources.contacts.set({
        grounded: verticalResult.grounded,
        hitCeiling: verticalResult.hitCeiling,
        blockedLeft: horizontalResult.blockedLeft,
        blockedRight: horizontalResult.blockedRight
      })
    })
)
