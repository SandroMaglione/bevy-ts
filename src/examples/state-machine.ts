import { Application, Container, Graphics } from "pixi.js"

import { App, Command, Descriptor, Fx, Label, Query, Runtime, Schema, System } from "../index.ts"
import type { BrowserExampleHandle } from "./pixi.ts"

const STAGE_WIDTH = 640
const STAGE_HEIGHT = 420
const PLAYER_SPEED = 220
const PLAYER_RADIUS = 16
const PICKUP_RADIUS = 10
const PICKUP_GOAL = 5
const ROUND_DURATION_SECONDS = 14
const COUNTDOWN_DURATION_SECONDS = 3
const NOTICE_DURATION_SECONDS = 0.95

type Vector = { x: number; y: number }
type NoticeValue = {
  text: string
  ttl: number
}
type ActorKind = "player" | "pickup"
type BrowserHostValue = {
  application: Application
  scene: Container
  nodes: Map<number, Graphics>
  clock: {
    deltaSeconds: number
  }
  ui: {
    scrim: HTMLDivElement
    overlay: HTMLDivElement
    title: HTMLHeadingElement
    subtitle: HTMLParagraphElement
    score: HTMLSpanElement
    timer: HTMLSpanElement
    footer: HTMLParagraphElement
    notice: HTMLParagraphElement
  }
}

const PICKUP_POINTS: ReadonlyArray<Vector> = [
  { x: 104, y: 108 },
  { x: 214, y: 86 },
  { x: 326, y: 134 },
  { x: 470, y: 112 },
  { x: 548, y: 186 },
  { x: 446, y: 286 },
  { x: 314, y: 332 },
  { x: 182, y: 302 },
  { x: 92, y: 252 }
] as const

const Position = Descriptor.defineComponent<Vector>()("StateMachineExample/Position")
const Actor = Descriptor.defineComponent<{ kind: ActorKind }>()("StateMachineExample/Actor")
const Player = Descriptor.defineComponent<{}>()("StateMachineExample/Player")
const Pickup = Descriptor.defineComponent<{}>()("StateMachineExample/Pickup")

const Arena = Descriptor.defineResource<{ width: number; height: number }>()("StateMachineExample/Arena")
const DeltaTime = Descriptor.defineResource<number>()("StateMachineExample/DeltaTime")
const Score = Descriptor.defineResource<number>()("StateMachineExample/Score")
const PickupGoal = Descriptor.defineResource<number>()("StateMachineExample/PickupGoal")
const RoundTimeRemaining = Descriptor.defineResource<number>()("StateMachineExample/RoundTimeRemaining")
const CountdownRemaining = Descriptor.defineResource<number>()("StateMachineExample/CountdownRemaining")
const SpawnCursor = Descriptor.defineResource<number>()("StateMachineExample/SpawnCursor")
const TransitionNotice = Descriptor.defineResource<NoticeValue>()("StateMachineExample/TransitionNotice")

const InputManager = Descriptor.defineService<{
  readonly movement: () => Vector
  readonly consumeStart: () => boolean
  readonly consumePause: () => boolean
}>()("StateMachineExample/InputManager")
const BrowserHost = Descriptor.defineService<BrowserHostValue>()("StateMachineExample/BrowserHost")

const schema = Schema.build(
  Schema.fragment({
    components: {
      Position,
      Actor,
      Player,
      Pickup
    },
    resources: {
      Arena,
      DeltaTime,
      Score,
      PickupGoal,
      RoundTimeRemaining,
      CountdownRemaining,
      SpawnCursor,
      TransitionNotice
    }
  })
)
const Game = Schema.bind(schema)

const AppState = Game.StateMachine.define(
  "AppState",
  ["Title", "Countdown", "Playing", "Paused", "Victory", "Defeat"] as const
)

const GameplaySet = Label.defineSystemSetLabel("StateMachineExample/Gameplay")

const PlayerQuery = Query.define({
  selection: {
    position: Query.write(Position),
    player: Query.read(Player)
  }
})

const PickupQuery = Query.define({
  selection: {
    position: Query.read(Position),
    pickup: Query.read(Pickup)
  }
})

const RenderQuery = Query.define({
  selection: {
    position: Query.read(Position),
    actor: Query.read(Actor)
  }
})

const createBoard = (width: number, height: number): Graphics => {
  const board = new Graphics()
  board.roundRect(0, 0, width, height, 22)
  board.fill(0x0f151c)

  for (let x = 0; x <= width; x += 32) {
    board.moveTo(x, 0)
    board.lineTo(x, height)
  }
  for (let y = 0; y <= height; y += 32) {
    board.moveTo(0, y)
    board.lineTo(width, y)
  }

  board.stroke({
    color: 0x24303b,
    width: 1
  })
  board.roundRect(0, 0, width, height, 22)
  board.stroke({
    color: 0x5bc0be,
    width: 2,
    alpha: 0.55
  })
  return board
}

const createActorNode = (kind: ActorKind): Graphics => {
  const node = new Graphics()

  if (kind === "player") {
    node.circle(0, 0, PLAYER_RADIUS)
    node.fill(0xf7c948)
    node.stroke({
      color: 0xffefb8,
      width: 3
    })
    return node
  }

  node.moveTo(0, -PICKUP_RADIUS)
  node.lineTo(PICKUP_RADIUS, 0)
  node.lineTo(0, PICKUP_RADIUS)
  node.lineTo(-PICKUP_RADIUS, 0)
  node.closePath()
  node.fill(0x5bc0be)
  node.stroke({
    color: 0xbff7f2,
    width: 2
  })
  return node
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const distanceSquared = (left: Vector, right: Vector): number => {
  const dx = left.x - right.x
  const dy = left.y - right.y
  return dx * dx + dy * dy
}

const makePickupDraft = (position: Vector) =>
  Command.spawnWith<typeof schema>(
    [Position, position],
    [Actor, { kind: "pickup" }],
    [Pickup, {}]
  )

const makeHud = () => {
  const root = document.createElement("div")
  root.style.position = "absolute"
  root.style.inset = "0"
  root.style.display = "grid"
  root.style.gridTemplateRows = "auto 1fr auto"
  root.style.pointerEvents = "none"

  const topBar = document.createElement("div")
  topBar.style.display = "flex"
  topBar.style.justifyContent = "space-between"
  topBar.style.gap = "12px"
  topBar.style.padding = "16px 18px 0"

  const score = document.createElement("span")
  score.style.padding = "8px 12px"
  score.style.borderRadius = "999px"
  score.style.background = "rgba(7, 12, 16, 0.72)"
  score.style.border = "1px solid rgba(255,255,255,0.08)"
  score.style.fontFamily = "\"IBM Plex Mono\", monospace"
  score.style.fontSize = "12px"
  score.style.letterSpacing = "0.08em"
  score.style.textTransform = "uppercase"

  const timer = score.cloneNode() as HTMLSpanElement

  topBar.append(score, timer)

  const center = document.createElement("div")
  center.style.position = "relative"
  center.style.display = "grid"
  center.style.placeItems = "center"
  center.style.padding = "22px"

  const scrim = document.createElement("div")
  scrim.style.position = "absolute"
  scrim.style.inset = "0"
  scrim.style.background = "linear-gradient(180deg, rgba(6, 9, 12, 0.2), rgba(6, 9, 12, 0.62))"
  scrim.style.opacity = "0"
  scrim.style.transition = "opacity 140ms ease"

  const copy = document.createElement("div")
  copy.style.position = "relative"
  copy.style.display = "grid"
  copy.style.gap = "10px"
  copy.style.justifyItems = "center"
  copy.style.textAlign = "center"
  copy.style.maxWidth = "420px"
  copy.style.padding = "20px 24px"
  copy.style.borderRadius = "22px"
  copy.style.background = "rgba(8, 12, 16, 0.52)"
  copy.style.border = "1px solid rgba(255,255,255,0.08)"
  copy.style.backdropFilter = "blur(8px)"
  copy.style.opacity = "1"
  copy.style.transition = "opacity 140ms ease"

  const title = document.createElement("h2")
  title.style.margin = "0"
  title.style.fontSize = "42px"
  title.style.lineHeight = "0.96"
  title.style.letterSpacing = "-0.04em"

  const subtitle = document.createElement("p")
  subtitle.style.margin = "0"
  subtitle.style.color = "#bfd0dc"
  subtitle.style.fontSize = "15px"
  subtitle.style.lineHeight = "1.55"

  copy.append(title, subtitle)
  center.append(scrim, copy)

  const footer = document.createElement("p")
  footer.style.margin = "0"
  footer.style.padding = "0 18px 18px"
  footer.style.color = "#9ab0bf"
  footer.style.fontSize = "13px"
  footer.style.letterSpacing = "0.02em"

  const notice = document.createElement("p")
  notice.style.margin = "0"
  notice.style.padding = "0 18px 18px"
  notice.style.color = "#f7c948"
  notice.style.fontFamily = "\"IBM Plex Mono\", monospace"
  notice.style.fontSize = "13px"
  notice.style.letterSpacing = "0.06em"
  notice.style.textTransform = "uppercase"

  const bottom = document.createElement("div")
  bottom.style.display = "grid"
  bottom.style.gap = "8px"
  bottom.append(notice, footer)

  root.append(topBar, center, bottom)

  return {
    root,
    ui: {
      scrim,
      overlay: copy,
      title,
      subtitle,
      score,
      timer,
      footer,
      notice
    }
  }
}

const normalizeMovement = (keys: Set<string>): Vector => {
  const horizontal = (keys.has("ArrowRight") || keys.has("d") || keys.has("D") ? 1 : 0)
    - (keys.has("ArrowLeft") || keys.has("a") || keys.has("A") ? 1 : 0)
  const vertical = (keys.has("ArrowDown") || keys.has("s") || keys.has("S") ? 1 : 0)
    - (keys.has("ArrowUp") || keys.has("w") || keys.has("W") ? 1 : 0)

  if (horizontal === 0 && vertical === 0) {
    return { x: 0, y: 0 }
  }

  const magnitude = Math.hypot(horizontal, vertical)
  return {
    x: horizontal / magnitude,
    y: vertical / magnitude
  }
}

const SpawnPlayerSystem = Game.System.define(
  "StateMachineExample/SpawnPlayer",
  {},
  ({ commands }) =>
    Fx.sync(() => {
      commands.spawn(
        Command.spawnWith<typeof schema>(
          [Position, { x: STAGE_WIDTH * 0.5, y: STAGE_HEIGHT * 0.5 }],
          [Actor, { kind: "player" }],
          [Player, {}]
        )
      )
    })
)

const CaptureFrameInputSystem = Game.System.define(
  "StateMachineExample/CaptureFrameInput",
  {
    resources: {
      deltaTime: System.writeResource(DeltaTime)
    },
    services: {
      host: System.service(BrowserHost)
    }
  },
  ({ resources, services }) =>
    Fx.sync(() => {
      resources.deltaTime.set(services.host.clock.deltaSeconds)
    })
)

const QueueStartFromTitleSystem = Game.System.define(
  "StateMachineExample/QueueStartFromTitle",
  {
    when: [Game.Condition.inState(AppState, "Title")],
    nextMachines: {
      app: System.nextState(AppState)
    },
    services: {
      input: System.service(InputManager)
    }
  },
  ({ nextMachines, services }) =>
    Fx.sync(() => {
      if (services.input.consumeStart()) {
        nextMachines.app.set("Countdown")
      }
    })
)

const QueueRestartSystem = Game.System.define(
  "StateMachineExample/QueueRestart",
  {
    when: [Game.Condition.or(
      Game.Condition.inState(AppState, "Victory"),
      Game.Condition.inState(AppState, "Defeat")
    )],
    nextMachines: {
      app: System.nextState(AppState)
    },
    services: {
      input: System.service(InputManager)
    }
  },
  ({ nextMachines, services }) =>
    Fx.sync(() => {
      if (services.input.consumeStart()) {
        nextMachines.app.set("Countdown")
      }
    })
)

const QueuePauseSystem = Game.System.define(
  "StateMachineExample/QueuePause",
  {
    when: [Game.Condition.inState(AppState, "Playing")],
    nextMachines: {
      app: System.nextState(AppState)
    },
    services: {
      input: System.service(InputManager)
    }
  },
  ({ nextMachines, services }) =>
    Fx.sync(() => {
      if (services.input.consumePause()) {
        nextMachines.app.set("Paused")
      }
    })
)

const QueueResumeSystem = Game.System.define(
  "StateMachineExample/QueueResume",
  {
    when: [Game.Condition.inState(AppState, "Paused")],
    nextMachines: {
      app: System.nextState(AppState)
    },
    services: {
      input: System.service(InputManager)
    }
  },
  ({ nextMachines, services }) =>
    Fx.sync(() => {
      if (services.input.consumePause()) {
        nextMachines.app.set("Playing")
      }
    })
)

const TickCountdownSystem = Game.System.define(
  "StateMachineExample/TickCountdown",
  {
    when: [Game.Condition.inState(AppState, "Countdown")],
    resources: {
      deltaTime: System.readResource(DeltaTime),
      countdown: System.writeResource(CountdownRemaining)
    },
    nextMachines: {
      app: System.nextState(AppState)
    }
  },
  ({ resources, nextMachines }) =>
    Fx.sync(() => {
      const remaining = clamp(resources.countdown.get() - resources.deltaTime.get(), 0, COUNTDOWN_DURATION_SECONDS)
      resources.countdown.set(remaining)
      if (remaining <= 0) {
        nextMachines.app.setIfChanged("Playing")
      }
    })
)

const MovePlayerSystem = Game.System.define(
  "StateMachineExample/MovePlayer",
  {
    inSets: [GameplaySet],
    queries: {
      player: PlayerQuery
    },
    resources: {
      arena: System.readResource(Arena),
      deltaTime: System.readResource(DeltaTime)
    },
    services: {
      input: System.service(InputManager)
    }
  },
  ({ queries, resources, services }) =>
    Fx.sync(() => {
      const player = queries.player.single()
      if (!player.ok) {
        return
      }

      const movement = services.input.movement()
      const dt = resources.deltaTime.get()
      const arena = resources.arena.get()
      const position = player.value.data.position.get()

      player.value.data.position.set({
        x: clamp(position.x + movement.x * PLAYER_SPEED * dt, PLAYER_RADIUS, arena.width - PLAYER_RADIUS),
        y: clamp(position.y + movement.y * PLAYER_SPEED * dt, PLAYER_RADIUS, arena.height - PLAYER_RADIUS)
      })
    })
)

const CollectPickupsSystem = Game.System.define(
  "StateMachineExample/CollectPickups",
  {
    inSets: [GameplaySet],
    queries: {
      player: Query.define({
        selection: {
          position: Query.read(Position),
          player: Query.read(Player)
        }
      }),
      pickups: PickupQuery
    },
    resources: {
      score: System.writeResource(Score)
    }
  },
  ({ queries, resources, commands }) =>
    Fx.sync(() => {
      const player = queries.player.single()
      if (!player.ok) {
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

const TickRoundClockSystem = Game.System.define(
  "StateMachineExample/TickRoundClock",
  {
    inSets: [GameplaySet],
    resources: {
      deltaTime: System.readResource(DeltaTime),
      roundTime: System.writeResource(RoundTimeRemaining)
    }
  },
  ({ resources }) =>
    Fx.sync(() => {
      resources.roundTime.update((value) => clamp(value - resources.deltaTime.get(), 0, ROUND_DURATION_SECONDS))
    })
)

const QueueOutcomeSystem = Game.System.define(
  "StateMachineExample/QueueOutcome",
  {
    inSets: [GameplaySet],
    resources: {
      score: System.readResource(Score),
      goal: System.readResource(PickupGoal),
      roundTime: System.readResource(RoundTimeRemaining)
    },
    nextMachines: {
      app: System.nextState(AppState)
    }
  },
  ({ resources, nextMachines }) =>
    Fx.sync(() => {
      if (resources.score.get() >= resources.goal.get()) {
        nextMachines.app.setIfChanged("Victory")
        return
      }

      if (resources.roundTime.get() <= 0) {
        nextMachines.app.setIfChanged("Defeat")
      }
    })
)

const ResetRoundOnCountdownEnterSystem = Game.System.define(
  "StateMachineExample/ResetRoundOnCountdownEnter",
  {
    queries: {
      player: PlayerQuery,
      pickups: PickupQuery
    },
    resources: {
      score: System.writeResource(Score),
      roundTime: System.writeResource(RoundTimeRemaining),
      countdown: System.writeResource(CountdownRemaining),
      goal: System.readResource(PickupGoal),
      cursor: System.writeResource(SpawnCursor)
    }
  },
  ({ queries, resources, commands }) =>
    Fx.sync(() => {
      const player = queries.player.single()
      if (player.ok) {
        player.value.data.position.set({
          x: STAGE_WIDTH * 0.5,
          y: STAGE_HEIGHT * 0.5
        })
      }

      for (const pickup of queries.pickups.each()) {
        commands.despawn(pickup.entity.id)
      }

      const cursor = resources.cursor.get()
      const goal = resources.goal.get()
      for (let index = 0; index < goal; index += 1) {
        const point = PICKUP_POINTS[(cursor + index) % PICKUP_POINTS.length] ?? PICKUP_POINTS[0]!
        commands.spawn(makePickupDraft(point))
      }

      resources.cursor.set((cursor + 1) % PICKUP_POINTS.length)
      resources.score.set(0)
      resources.roundTime.set(ROUND_DURATION_SECONDS)
      resources.countdown.set(COUNTDOWN_DURATION_SECONDS)
    })
)

const WriteTransitionNoticeSystem = Game.System.define(
  "StateMachineExample/WriteTransitionNotice",
  {
    transitions: {
      app: System.transition(AppState)
    },
    resources: {
      notice: System.writeResource(TransitionNotice)
    }
  },
  ({ transitions, resources }) =>
    Fx.sync(() => {
      const { from, to } = transitions.app.get()
      resources.notice.set({
        text: `${from} -> ${to}`,
        ttl: NOTICE_DURATION_SECONDS
      })
    })
)

const FadeTransitionNoticeSystem = Game.System.define(
  "StateMachineExample/FadeTransitionNotice",
  {
    resources: {
      deltaTime: System.readResource(DeltaTime),
      notice: System.writeResource(TransitionNotice)
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

const SyncSceneSystem = Game.System.define(
  "StateMachineExample/SyncScene",
  {
    queries: {
      renderables: RenderQuery
    },
    services: {
      host: System.service(BrowserHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      const alive = new Set<number>()

      for (const match of queries.renderables.each()) {
        const entityId = match.entity.id.value
        const position = match.data.position.get()
        const actor = match.data.actor.get()
        alive.add(entityId)

        let node = services.host.nodes.get(entityId)
        if (!node) {
          node = createActorNode(actor.kind)
          services.host.scene.addChild(node)
          services.host.nodes.set(entityId, node)
        }

        node.position.set(position.x, position.y)
      }

      for (const [entityId, node] of services.host.nodes) {
        if (alive.has(entityId)) {
          continue
        }
        services.host.scene.removeChild(node)
        node.destroy()
        services.host.nodes.delete(entityId)
      }
    })
)

const SyncHudSystem = Game.System.define(
  "StateMachineExample/SyncHud",
  {
    resources: {
      score: System.readResource(Score),
      goal: System.readResource(PickupGoal),
      roundTime: System.readResource(RoundTimeRemaining),
      countdown: System.readResource(CountdownRemaining),
      notice: System.readResource(TransitionNotice)
    },
    machines: {
      app: System.machine(AppState)
    },
    services: {
      host: System.service(BrowserHost)
    }
  },
  ({ resources, machines, services }) =>
    Fx.sync(() => {
      const state = machines.app.get()
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

      switch (state) {
        case "Title":
          hud.scrim.style.opacity = "0.48"
          hud.overlay.style.opacity = "1"
          hud.title.textContent = "State Machine Sprint"
          hud.subtitle.textContent = "Press Enter to start. Arrows or WASD move. P pauses during play."
          hud.footer.textContent = "This demo exists to show typed machine states, queued transitions, and enter/exit hooks."
          break
        case "Countdown":
          hud.scrim.style.opacity = "0.22"
          hud.overlay.style.opacity = "1"
          hud.title.textContent = String(Math.max(1, Math.ceil(countdown)))
          hud.subtitle.textContent = "Queued transitions stay invisible until applyStateTransitions() runs."
          hud.footer.textContent = "Countdown is a real machine state, not a flag hidden inside a system."
          break
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
          hud.subtitle.textContent = "Press P to queue the Playing state again."
          hud.footer.textContent = "Gameplay systems are gated by a typed set condition while paused."
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

const bootstrapSchedule = Game.Schedule.define({
  systems: [SpawnPlayerSystem]
})

Game.Schedule.onEnter(AppState, "Countdown", {
  systems: [ResetRoundOnCountdownEnterSystem, WriteTransitionNoticeSystem]
})

Game.Schedule.onEnter(AppState, "Paused", {
  systems: [WriteTransitionNoticeSystem]
})

Game.Schedule.onExit(AppState, "Paused", {
  systems: [WriteTransitionNoticeSystem]
})

Game.Schedule.onTransition(AppState, { from: "Playing", to: "Victory" }, {
  systems: [WriteTransitionNoticeSystem]
})

Game.Schedule.onTransition(AppState, { from: "Playing", to: "Defeat" }, {
  systems: [WriteTransitionNoticeSystem]
})

const updateSchedule = Game.Schedule.define({
  systems: [
    CaptureFrameInputSystem,
    QueueStartFromTitleSystem,
    QueueRestartSystem,
    QueuePauseSystem,
    QueueResumeSystem,
    TickCountdownSystem,
    MovePlayerSystem,
    CollectPickupsSystem,
    TickRoundClockSystem,
    QueueOutcomeSystem,
    FadeTransitionNoticeSystem,
    SyncSceneSystem,
    SyncHudSystem
  ],
  sets: [
    Game.Schedule.configureSet({
      label: GameplaySet,
      when: [Game.Condition.inState(AppState, "Playing")]
    })
  ] as const,
  steps: [
    CaptureFrameInputSystem,
    QueueStartFromTitleSystem,
    QueueRestartSystem,
    QueuePauseSystem,
    QueueResumeSystem,
    TickCountdownSystem,
    MovePlayerSystem,
    CollectPickupsSystem,
    TickRoundClockSystem,
    QueueOutcomeSystem,
    Game.Schedule.applyStateTransitions(),
    FadeTransitionNoticeSystem,
    SyncSceneSystem,
    SyncHudSystem
  ]
})

export const startStateMachineExample = async (mount: HTMLElement): Promise<BrowserExampleHandle> => {
  const application = new Application()
  await application.init({
    antialias: true,
    background: "#0b1117",
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT
  })

  const wrapper = document.createElement("section")
  wrapper.className = "pixi-example-shell"
  wrapper.style.position = "relative"
  wrapper.style.overflow = "hidden"
  wrapper.style.borderRadius = "24px"
  wrapper.style.minHeight = `${STAGE_HEIGHT}px`
  wrapper.appendChild(application.canvas)

  const { root, ui } = makeHud()
  wrapper.appendChild(root)
  mount.replaceChildren(wrapper)

  application.canvas.style.display = "block"

  const scene = new Container()
  application.stage.addChild(createBoard(STAGE_WIDTH, STAGE_HEIGHT))
  application.stage.addChild(scene)

  const pressedKeys = new Set<string>()
  let startQueued = false
  let pauseQueued = false

  const onKeyDown = (event: KeyboardEvent) => {
    pressedKeys.add(event.key)

    if (event.key === "Enter") {
      startQueued = true
      event.preventDefault()
      return
    }

    if (event.key === "p" || event.key === "P") {
      pauseQueued = true
      event.preventDefault()
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    pressedKeys.delete(event.key)
  }

  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)

  const host: BrowserHostValue = {
    application,
    scene,
    nodes: new Map<number, Graphics>(),
    clock: {
      deltaSeconds: 1 / 60
    },
    ui
  }

  const runtime = Game.Runtime.make({
    services: Runtime.services(
      Runtime.service(InputManager, {
        movement() {
          return normalizeMovement(pressedKeys)
        },
        consumeStart() {
          const next = startQueued
          startQueued = false
          return next
        },
        consumePause() {
          const next = pauseQueued
          pauseQueued = false
          return next
        }
      }),
      Runtime.service(BrowserHost, host)
    ),
    resources: {
      Arena: {
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT
      },
      DeltaTime: host.clock.deltaSeconds,
      Score: 0,
      PickupGoal: PICKUP_GOAL,
      RoundTimeRemaining: ROUND_DURATION_SECONDS,
      CountdownRemaining: COUNTDOWN_DURATION_SECONDS,
      SpawnCursor: 0,
      TransitionNotice: {
        text: "",
        ttl: 0
      }
    },
    machines: Runtime.machines(
      Runtime.machine(AppState, "Title")
    )
  })

  const app = App.makeApp(runtime)
  app.bootstrap(bootstrapSchedule)
  app.update(updateSchedule)

  const tick = (ticker: { readonly deltaMS: number }) => {
    host.clock.deltaSeconds = Math.min(ticker.deltaMS / 1000, 0.05)
    app.update(updateSchedule)
  }

  application.ticker.add(tick)

  return {
    async destroy() {
      application.ticker.remove(tick)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      for (const node of host.nodes.values()) {
        node.destroy()
      }
      host.nodes.clear()
      application.destroy(true)
      mount.replaceChildren()
    }
  }
}
