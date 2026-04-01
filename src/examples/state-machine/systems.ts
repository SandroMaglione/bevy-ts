import { Fx } from "../../index.ts"
import * as Result from "../../Result.ts"
import * as Scalar from "../../Scalar.ts"
import * as Vector2 from "../../Vector2.ts"
import { PICKUP_POINTS } from "./content.ts"
import {
  COUNTDOWN_DURATION_SECONDS,
  NOTICE_DURATION_SECONDS,
  PICKUP_RADIUS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  ROUND_DURATION_SECONDS,
  STAGE_HEIGHT,
  STAGE_WIDTH
} from "./constants.ts"
import {
  AddedActorQuery,
  ChangedActorTransformQuery,
  PickupQuery,
  PlayerQuery,
  PlayerReadQuery
} from "./queries.ts"
import { createActorNode } from "./host.ts"
import {
  Actor,
  Arena,
  BrowserHost,
  CountdownRemaining,
  DeltaTime,
  Game,
  GameplaySet,
  InputManager,
  Pickup,
  PickupGoal,
  Position,
  RoundState,
  RoundTimeRemaining,
  Score,
  SessionState,
  SpawnCursor,
  TransitionNotice,
  Player
} from "./schema.ts"
import type { Vector } from "./types.ts"

const clamp = (value: number, min: number, max: number): number => {
  const nextValue = Scalar.Finite.option(value)
  const nextMin = Scalar.Finite.option(min)
  const nextMax = Scalar.Finite.option(max)
  if (!nextValue || !nextMin || !nextMax) {
    return value
  }

  return Scalar.clamp(nextValue, nextMin, nextMax)
}

const distanceSquared = (left: Vector, right: Vector): number => {
  return Vector2.lengthSquared(Vector2.subtract(left, right))
}

const makePickupDraft = (position: { readonly x: number; readonly y: number }) => {
  const entries = Result.all([
    Game.Command.entryResult(Position, Vector2.result(position)),
    Result.success(Game.Command.entry(Actor, { kind: "pickup" })),
    Result.success(Game.Command.entry(Pickup, {}))
  ] as const)
  if (!entries.ok) {
    return entries
  }

  return Result.success(Game.Command.spawnWith(...entries.value))
}

export const SpawnPlayerSystem = Game.System.define(
  "StateMachineExample/SpawnPlayer",
  {},
  ({ commands }) =>
    Fx.sync(() => {
      const entries = Result.all([
        Game.Command.entryResult(Position, Vector2.result({ x: STAGE_WIDTH * 0.5, y: STAGE_HEIGHT * 0.5 })),
        Result.success(Game.Command.entry(Actor, { kind: "player" })),
        Result.success(Game.Command.entry(Player, {}))
      ] as const)
      if (!entries.ok) {
        return
      }
      commands.spawn(Game.Command.spawnWith(...entries.value))
    })
)

export const CaptureFrameInputSystem = Game.System.define(
  "StateMachineExample/CaptureFrameInput",
  {
    resources: {
      deltaTime: Game.System.writeResource(DeltaTime)
    },
    services: {
      host: Game.System.service(BrowserHost)
    }
  },
  ({ resources, services }) =>
    Fx.sync(() => {
      resources.deltaTime.set(services.host.clock.deltaSeconds)
    })
)

export const QueueStartFromTitleSystem = Game.System.define(
  "StateMachineExample/QueueStartFromTitle",
  {
    when: [Game.Condition.inState(SessionState, "Title")],
    nextMachines: {
      session: Game.System.nextState(SessionState)
    },
    services: {
      input: Game.System.service(InputManager)
    }
  },
  ({ nextMachines, services }) =>
    Fx.sync(() => {
      if (services.input.consumeStart()) {
        // Restart is routed back through Countdown so reset work stays on the
        // transition boundary instead of happening immediately in input code.
        nextMachines.session.set("Countdown")
      }
    })
)

export const QueueRestartSystem = Game.System.define(
  "StateMachineExample/QueueRestart",
  {
    when: [Game.Condition.and(
      Game.Condition.inState(SessionState, "Round"),
      Game.Condition.or(
        Game.Condition.inState(RoundState, "Victory"),
        Game.Condition.inState(RoundState, "Defeat")
      )
    )],
    nextMachines: {
      session: Game.System.nextState(SessionState)
    },
    services: {
      input: Game.System.service(InputManager)
    }
  },
  ({ nextMachines, services }) =>
    Fx.sync(() => {
      if (services.input.consumeStart()) {
        nextMachines.session.set("Countdown")
      }
    })
)

export const QueuePauseSystem = Game.System.define(
  "StateMachineExample/QueuePause",
  {
    when: [Game.Condition.and(
      Game.Condition.inState(SessionState, "Round"),
      Game.Condition.inState(RoundState, "Playing")
    )],
    nextMachines: {
      round: Game.System.nextState(RoundState)
    },
    services: {
      input: Game.System.service(InputManager)
    }
  },
  ({ nextMachines, services }) =>
    Fx.sync(() => {
      if (services.input.consumePause()) {
        nextMachines.round.set("Paused")
      }
    })
)

export const QueueResumeSystem = Game.System.define(
  "StateMachineExample/QueueResume",
  {
    when: [Game.Condition.and(
      Game.Condition.inState(SessionState, "Round"),
      Game.Condition.inState(RoundState, "Paused")
    )],
    nextMachines: {
      round: Game.System.nextState(RoundState)
    },
    services: {
      input: Game.System.service(InputManager)
    }
  },
  ({ nextMachines, services }) =>
    Fx.sync(() => {
      if (services.input.consumePause()) {
        nextMachines.round.set("Playing")
      }
    })
)

export const TickCountdownSystem = Game.System.define(
  "StateMachineExample/TickCountdown",
  {
    when: [Game.Condition.inState(SessionState, "Countdown")],
    resources: {
      deltaTime: Game.System.readResource(DeltaTime),
      countdown: Game.System.writeResource(CountdownRemaining)
    },
    nextMachines: {
      session: Game.System.nextState(SessionState),
      round: Game.System.nextState(RoundState)
    }
  },
  ({ resources, nextMachines }) =>
    Fx.sync(() => {
      const remaining = clamp(resources.countdown.get() - resources.deltaTime.get(), 0, COUNTDOWN_DURATION_SECONDS)
      resources.countdown.set(remaining)
      if (remaining <= 0) {
        nextMachines.session.set("Round")
        nextMachines.round.set("Playing")
      }
    })
)

export const MovePlayerSystem = Game.System.define(
  "StateMachineExample/MovePlayer",
  {
    inSets: [GameplaySet],
    queries: {
      player: PlayerQuery
    },
    resources: {
      arena: Game.System.readResource(Arena),
      deltaTime: Game.System.readResource(DeltaTime)
    },
    services: {
      input: Game.System.service(InputManager)
    }
  },
  ({ queries, resources, services }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      const movement = services.input.movement()
      const dt = resources.deltaTime.get()
      const arena = resources.arena.get()
      const position = player.value.data.position.get()

      player.value.data.position.setResult(Vector2.result({
        x: clamp(position.x + movement.x * PLAYER_SPEED * dt, PLAYER_RADIUS, arena.width - PLAYER_RADIUS),
        y: clamp(position.y + movement.y * PLAYER_SPEED * dt, PLAYER_RADIUS, arena.height - PLAYER_RADIUS)
      }))
    })
)

export const CollectPickupsSystem = Game.System.define(
  "StateMachineExample/CollectPickups",
  {
    inSets: [GameplaySet],
    queries: {
      player: PlayerReadQuery,
      pickups: PickupQuery
    },
    resources: {
      score: Game.System.writeResource(Score)
    }
  },
  ({ queries, resources, commands }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      if (!player.ok || !player.value) {
        return
      }

      const playerPosition = player.value.data.position.get()
      for (const pickup of queries.pickups.each()) {
        if (distanceSquared(playerPosition, pickup.data.position.get()) <= (PLAYER_RADIUS + PICKUP_RADIUS) ** 2) {
          commands.despawn(pickup.entity.id)
          resources.score.update((value) => value + 1)
        }
      }
    })
)

export const TickRoundClockSystem = Game.System.define(
  "StateMachineExample/TickRoundClock",
  {
    inSets: [GameplaySet],
    resources: {
      deltaTime: Game.System.readResource(DeltaTime),
      roundTime: Game.System.writeResource(RoundTimeRemaining)
    }
  },
  ({ resources }) =>
    Fx.sync(() => {
      resources.roundTime.update((value) => clamp(value - resources.deltaTime.get(), 0, ROUND_DURATION_SECONDS))
    })
)

export const QueueOutcomeSystem = Game.System.define(
  "StateMachineExample/QueueOutcome",
  {
    inSets: [GameplaySet],
    resources: {
      score: Game.System.readResource(Score),
      goal: Game.System.readResource(PickupGoal),
      roundTime: Game.System.readResource(RoundTimeRemaining)
    },
    nextMachines: {
      round: Game.System.nextState(RoundState)
    }
  },
  ({ resources, nextMachines }) =>
    Fx.sync(() => {
      if (resources.score.get() >= resources.goal.get()) {
        nextMachines.round.setIfChanged("Victory")
        return
      }

      if (resources.roundTime.get() <= 0) {
        nextMachines.round.setIfChanged("Defeat")
      }
    })
)

export const ResetRoundOnCountdownEnterSystem = Game.System.define(
  "StateMachineExample/ResetRoundOnCountdownEnter",
  {
    queries: {
      player: PlayerQuery,
      pickups: PickupQuery
    },
    resources: {
      score: Game.System.writeResource(Score),
      roundTime: Game.System.writeResource(RoundTimeRemaining),
      countdown: Game.System.writeResource(CountdownRemaining),
      goal: Game.System.readResource(PickupGoal),
      cursor: Game.System.writeResource(SpawnCursor)
    }
  },
  ({ queries, resources, commands }) =>
    Fx.sync(() => {
      const player = queries.player.singleOptional()
      if (player.ok && player.value) {
        player.value.data.position.setResult(Vector2.result({
          x: STAGE_WIDTH * 0.5,
          y: STAGE_HEIGHT * 0.5
        }))
      }

      for (const pickup of queries.pickups.each()) {
        commands.despawn(pickup.entity.id)
      }

      const cursor = resources.cursor.get()
      const goal = resources.goal.get()
      for (let index = 0; index < goal; index += 1) {
        const point = PICKUP_POINTS[(cursor + index) % PICKUP_POINTS.length] ?? PICKUP_POINTS[0]!
        const pickupDraft = makePickupDraft(point)
        if (pickupDraft.ok) {
          commands.spawn(pickupDraft.value)
        }
      }

      resources.cursor.set((cursor + 1) % PICKUP_POINTS.length)
      resources.score.set(0)
      resources.roundTime.set(ROUND_DURATION_SECONDS)
      resources.countdown.set(COUNTDOWN_DURATION_SECONDS)
    })
)

export const WriteTransitionNoticeSystem = Game.System.define(
  "StateMachineExample/WriteTransitionNotice",
  {
    transitionEvents: {
      session: Game.System.readTransitionEvent(SessionState),
      round: Game.System.readTransitionEvent(RoundState)
    },
    resources: {
      notice: Game.System.writeResource(TransitionNotice)
    }
  },
  ({ transitionEvents, resources }) =>
    Fx.sync(() => {
      const messages = [
        ...transitionEvents.session.all().map((event) => `Session ${event.from} -> ${event.to}`),
        ...transitionEvents.round.all().map((event) => `Round ${event.from} -> ${event.to}`)
      ]

      if (messages.length === 0) {
        return
      }

      resources.notice.set({
        text: messages.join(" | "),
        ttl: NOTICE_DURATION_SECONDS
      })
    })
)

export const FadeTransitionNoticeSystem = Game.System.define(
  "StateMachineExample/FadeTransitionNotice",
  {
    resources: {
      deltaTime: Game.System.readResource(DeltaTime),
      notice: Game.System.writeResource(TransitionNotice)
    }
  },
  ({ resources }) =>
    Fx.sync(() => {
      const notice = resources.notice.get()
      if (notice.ttl <= 0) {
        return
      }

      const ttl = clamp(notice.ttl - resources.deltaTime.get(), 0, NOTICE_DURATION_SECONDS)
      resources.notice.set({
        text: ttl > 0 ? notice.text : "",
        ttl
      })
    })
)

export const DestroyRenderNodesSystem = Game.System.define(
  "StateMachineExample/DestroyRenderNodes",
  {
    despawned: {
      entities: Game.System.readDespawned()
    },
    services: {
      host: Game.System.service(BrowserHost)
    }
  },
  ({ despawned, services }) =>
    Fx.sync(() => {
      for (const entityId of despawned.entities.all()) {
        const node = services.host.nodes.get(entityId.value)
        if (!node) {
          continue
        }

        services.host.scene.removeChild(node)
        node.destroy()
        services.host.nodes.delete(entityId.value)
      }
    })
)

export const CreateRenderNodesSystem = Game.System.define(
  "StateMachineExample/CreateRenderNodes",
  {
    queries: {
      added: AddedActorQuery
    },
    services: {
      host: Game.System.service(BrowserHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      for (const match of queries.added.each()) {
        const entityId = match.entity.id.value
        let node = services.host.nodes.get(entityId)
        if (!node) {
          node = createActorNode(match.data.actor.get().kind)
          services.host.scene.addChild(node)
          services.host.nodes.set(entityId, node)
        }

        const position = match.data.position.get()
        node.position.set(position.x, position.y)
      }
    })
)

export const SyncRenderableTransformsSystem = Game.System.define(
  "StateMachineExample/SyncRenderableTransforms",
  {
    queries: {
      moved: ChangedActorTransformQuery
    },
    services: {
      host: Game.System.service(BrowserHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      for (const match of queries.moved.each()) {
        const node = services.host.nodes.get(match.entity.id.value)
        if (!node) {
          continue
        }

        const position = match.data.position.get()
        node.position.set(position.x, position.y)
      }
    })
)

export const SyncHudSystem = Game.System.define(
  "StateMachineExample/SyncHud",
  {
    resources: {
      score: Game.System.readResource(Score),
      goal: Game.System.readResource(PickupGoal),
      roundTime: Game.System.readResource(RoundTimeRemaining),
      countdown: Game.System.readResource(CountdownRemaining),
      notice: Game.System.readResource(TransitionNotice)
    },
    machines: {
      session: Game.System.machine(SessionState),
      round: Game.System.machine(RoundState)
    },
    services: {
      host: Game.System.service(BrowserHost)
    }
  },
  ({ resources, machines, services }) =>
    Fx.sync(() => {
      const session = machines.session.get()
      const round = machines.round.get()
      const score = resources.score.get()
      const goal = resources.goal.get()
      const roundTime = resources.roundTime.get()
      const countdown = resources.countdown.get()
      const notice = resources.notice.get()
      const hud = services.host.ui

      hud.score.textContent = `Score ${score}/${goal}`
      hud.timer.textContent = `Time ${Math.max(0, roundTime).toFixed(1)}s`
      hud.notice.textContent = notice.ttl > 0 ? notice.text : ""
      hud.notice.style.opacity = notice.ttl > 0 ? String(clamp(notice.ttl / NOTICE_DURATION_SECONDS, 0, 1)) : "0"

      if (session === "Title") {
        hud.scrim.style.opacity = "0.48"
        hud.overlay.style.opacity = "1"
        hud.title.textContent = "State Machine Sprint"
        hud.subtitle.textContent = "Press Enter to start. Arrows or WASD move. P pauses during play."
        hud.footer.textContent = "The game uses separate session and round machines so countdown, play, pause, win, and lose stay explicit."
        return
      }

      if (session === "Countdown") {
        hud.scrim.style.opacity = "0.22"
        hud.overlay.style.opacity = "1"
        hud.title.textContent = String(Math.max(1, Math.ceil(countdown)))
        hud.subtitle.textContent = "Queued machine changes stay invisible until applyStateTransitions() commits them."
        hud.footer.textContent = "Restart resets the round through a typed onEnter(Countdown) transition bundle."
        return
      }

      switch (round) {
        case "Playing":
          hud.scrim.style.opacity = "0"
          hud.overlay.style.opacity = "0"
          hud.title.textContent = ""
          hud.subtitle.textContent = ""
          hud.footer.textContent = "P queues Paused. Victory and defeat are queued by gameplay systems."
          break
        case "Paused":
          hud.scrim.style.opacity = "0.54"
          hud.overlay.style.opacity = "1"
          hud.title.textContent = "Paused"
          hud.subtitle.textContent = "Press P to queue Playing again."
          hud.footer.textContent = "Only the round machine changes here. Session state stays committed to Round."
          break
        case "Victory":
          hud.scrim.style.opacity = "0.46"
          hud.overlay.style.opacity = "1"
          hud.title.textContent = "Victory"
          hud.subtitle.textContent = "You collected every pickup in time."
          hud.footer.textContent = "Press Enter to restart through Countdown."
          break
        case "Defeat":
          hud.scrim.style.opacity = "0.5"
          hud.overlay.style.opacity = "1"
          hud.title.textContent = "Defeat"
          hud.subtitle.textContent = "The timer expired before you reached the goal."
          hud.footer.textContent = "Press Enter to restart through Countdown."
          break
      }
    })
)
