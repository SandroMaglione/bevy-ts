import { clamp, lerp } from "../../../src/internal/scalar.ts"
import { Fx } from "../../../src/index.ts"
import {
  Agent,
  AgentDecisionQuery,
  AgentResolveQuery,
  AgentSnapshotQuery,
  AgentTickQuery,
  Arena,
  BrowserHost,
  DeltaTime,
  DespawnableQuery,
  FoodQuery,
  Game,
  GenerationClock,
  GenerationIndex,
  NextGeneration,
  PopulationStats,
  RngSeed,
  SimulationPhase,
  Summary
} from "../schema.ts"
import {
  collectAgentSnapshots,
  foodMargin,
  formatGene,
  founderMargin,
  founderMargin as initialSpawnMargin,
  geneDistance,
  makeFounderPool,
  makePopulationStats,
  makeRunningSummary,
  normalizeVector,
  offspringMargin,
  randomBetween,
  randomUnit,
  sampleFoundersFromSurvivors,
  spawnAgentDraft,
  spawnFoodDraft,
  wrap
} from "../logic.ts"
import {
  ATTACK_CONTACT_PADDING,
  EXTINCTION_DURATION_SECONDS,
  FOOD_TARGET,
  FOUNDER_COUNT,
  GENERATION_DURATION_SECONDS,
  INITIAL_FOOD_COUNT,
  MATING_CONTACT_RADIUS,
  SUMMARY_DURATION_SECONDS
} from "../constants.ts"
import type { GenesValue, IntentKind } from "../types.ts"

export const SetupWorldSystem = Game.System(
  "GeneticsArena/SetupWorld",
  {
    resources: {
      arena: Game.System.readResource(Arena),
      generationIndex: Game.System.readResource(GenerationIndex),
      nextGeneration: Game.System.readResource(NextGeneration),
      rngSeed: Game.System.writeResource(RngSeed),
      populationStats: Game.System.writeResource(PopulationStats),
      summary: Game.System.writeResource(Summary)
    }
  },
  ({ commands, resources }) =>
    Fx.sync(() => {
      const arena = resources.arena.get()
      const dynamicFoodMargin = foodMargin(arena)
      const dynamicSpawnMargin = initialSpawnMargin(arena)
      let seed = resources.rngSeed.get()

      for (let index = 0; index < INITIAL_FOOD_COUNT; index += 1) {
        const xDraw = randomBetween(seed, dynamicFoodMargin, arena.width - dynamicFoodMargin)
        seed = xDraw.seed
        const yDraw = randomBetween(seed, dynamicFoodMargin, arena.height - dynamicFoodMargin)
        seed = yDraw.seed
        commands.spawn(spawnFoodDraft({ x: xDraw.value, y: yDraw.value }))
      }

      const founders = resources.nextGeneration.get().founders
      for (const founder of founders) {
        const xDraw = randomBetween(seed, dynamicSpawnMargin, arena.width - dynamicSpawnMargin)
        seed = xDraw.seed
        const yDraw = randomBetween(seed, dynamicSpawnMargin, arena.height - dynamicSpawnMargin)
        seed = yDraw.seed
        const angleDraw = randomBetween(seed, 0, Math.PI * 2)
        seed = angleDraw.seed
        commands.spawn(
          spawnAgentDraft(
            founder,
            { x: xDraw.value, y: yDraw.value },
            resources.generationIndex.get(),
            angleDraw.value
          )
        )
      }

      resources.rngSeed.set(seed)
      resources.populationStats.set(makePopulationStats(founders.length))
      resources.summary.set(makeRunningSummary())
    })
)

export const ResetGenerationOnRunningEnterSystem = Game.System(
  "GeneticsArena/ResetGenerationOnRunningEnter",
  {
    queries: {
      despawnable: DespawnableQuery
    },
    resources: {
      generationClock: Game.System.writeResource(GenerationClock),
      summary: Game.System.writeResource(Summary)
    }
  },
  ({ queries, commands, resources }) =>
    Fx.sync(() => {
      resources.generationClock.set({
        elapsed: 0,
        limit: GENERATION_DURATION_SECONDS,
        transitionTimer: 0
      })
      resources.summary.set(makeRunningSummary())

      for (const match of queries.despawnable.each()) {
        commands.despawn(match.entity.id)
      }
    })
)

// The browser host owns viewport size and ticker timing. This system copies that
// state into ECS resources so later systems can stay pure and typed.
export const CaptureFrameContextSystem = Game.System(
  "GeneticsArena/CaptureFrameContext",
  {
    resources: {
      deltaTime: Game.System.writeResource(DeltaTime),
      arena: Game.System.writeResource(Arena)
    },
    services: {
      browser: Game.System.service(BrowserHost)
    }
  },
  ({ resources, services }) =>
    Fx.sync(() => {
      resources.deltaTime.set(services.browser.clock.deltaSeconds)
      resources.arena.set({
        width: services.browser.application.screen.width,
        height: services.browser.application.screen.height
      })
    })
)

export const TickGenerationClockSystem = Game.System(
  "GeneticsArena/TickGenerationClock",
  {
    when: [Game.Condition.inState(SimulationPhase, "Running")],
    resources: {
      deltaTime: Game.System.readResource(DeltaTime),
      generationClock: Game.System.writeResource(GenerationClock)
    }
  },
  ({ resources }) =>
    Fx.sync(() => {
      const dt = resources.deltaTime.get()
      resources.generationClock.update((clock) => ({
        ...clock,
        elapsed: clock.elapsed + dt
      }))
    })
)

export const TickAgentVitalsSystem = Game.System(
  "GeneticsArena/TickAgentVitals",
  {
    when: [Game.Condition.inState(SimulationPhase, "Running")],
    queries: {
      agents: AgentTickQuery
    },
    resources: {
      deltaTime: Game.System.readResource(DeltaTime)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const dt = resources.deltaTime.get()
      for (const match of queries.agents.each()) {
        const agent = match.data.agent.get()
        match.data.vitals.update((vitals) => {
          const age = vitals.age + dt
          const mateCooldown = Math.max(0, vitals.mateCooldown - dt)
          const attackCooldown = Math.max(0, vitals.attackCooldown - dt)
          const bondProgress = Math.max(0, vitals.bondProgress - dt * 0.9)
          const pulse = Math.max(0.78, vitals.pulse - dt * 1.2)
          const starvation = vitals.energy <= 0 ? dt * 15 : vitals.energy < agent.maxEnergy * 0.2 ? dt * 4.4 : 0
          const extraOldAge = age > agent.longevityLimit ? (age - agent.longevityLimit) * 2.5 * dt : 0

          return {
            ...vitals,
            age,
            mateCooldown,
            matePartner: bondProgress <= 0.02 ? null : vitals.matePartner,
            attackCooldown,
            bondProgress,
            pulse,
            fullness: Math.max(0, vitals.fullness - dt * lerp(0.15, 0.26, agent.moveCost / 11.6)),
            health: Math.max(0, vitals.health - starvation - extraOldAge),
            energy: clamp(vitals.energy - dt * lerp(2.4, 4.5, agent.moveCost / 11.6), 0, agent.maxEnergy)
          }
        })
      }
    })
)

// Intent selection is the densest part of the example. The comments explain the
// role of each pressure instead of restating what the API calls do.
export const ChooseIntentSystem = Game.System(
  "GeneticsArena/ChooseIntent",
  {
    when: [Game.Condition.inState(SimulationPhase, "Running")],
    queries: {
      agents: AgentDecisionQuery,
      foods: FoodQuery
    },
    resources: {
      deltaTime: Game.System.readResource(DeltaTime)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const dt = resources.deltaTime.get()
      const foods = queries.foods.each().map((match) => ({
        position: match.data.position.get()
      }))
      const agents = collectAgentSnapshots(queries.agents.each())

      for (const match of queries.agents.each()) {
        const position = match.data.position.get()
        const genes = match.data.genes.get()
        const agent = match.data.agent.get()
        const vitals = match.data.vitals.get()

        let targetKind: IntentKind = "wander"
        let vectorX = 0
        let vectorY = 0
        let nearestThreatDistance = Number.POSITIVE_INFINITY
        let threatVector = { x: 0, y: 0 }
        let attackVector = { x: 0, y: 0 }
        let attackDistance = Number.POSITIVE_INFINITY
        let mateVector = { x: 0, y: 0 }
        let mateDistance = Number.POSITIVE_INFINITY
        let foodVector = { x: 0, y: 0 }
        let foodDistance = Number.POSITIVE_INFINITY
        let crowdRepulsion = { x: 0, y: 0 }

        for (const other of agents) {
          if (other.entityId === match.entity.id.value) {
            continue
          }

          const deltaX = other.position.x - position.x
          const deltaY = other.position.y - position.y
          const distance = Math.hypot(deltaX, deltaY)
          if (distance > agent.sightRange || distance < 0.001) {
            continue
          }

          const geneticGap = geneDistance(genes, other.genes)
          const compatible = geneticGap <= Math.min(agent.mateCompatibility, other.agent.mateCompatibility)
          const hostile =
            geneticGap >= Math.max(agent.hostilityThreshold, other.agent.hostilityThreshold) &&
            (genes.aggression >= 0.3 || other.genes.aggression >= 0.3)
          const normalized = normalizeVector(deltaX, deltaY)
          if (distance < agent.size * 4.4) {
            const pressure = (agent.size * 4.4 - distance) / (agent.size * 4.4)
            crowdRepulsion = {
              x: crowdRepulsion.x - normalized.x * pressure * 1.2,
              y: crowdRepulsion.y - normalized.y * pressure * 1.2
            }
          }

          if (hostile) {
            const otherStrength = other.agent.attackPower + other.vitals.health * 0.18
            const selfStrength = agent.attackPower + vitals.health * 0.18
            const threatened =
              otherStrength >= selfStrength * 0.72 ||
              vitals.energy < agent.maxEnergy * 0.52 ||
              vitals.health < agent.maxHealth * 0.58
            if (threatened && distance < nearestThreatDistance) {
              nearestThreatDistance = distance
              threatVector = {
                x: -normalized.x * (1 + other.genes.aggression),
                y: -normalized.y * (1 + other.genes.aggression)
              }
            }
            if (genes.aggression >= 0.28 && vitals.energy > agent.maxEnergy * 0.18 && distance < attackDistance) {
              attackDistance = distance
              attackVector = {
                x: normalized.x,
                y: normalized.y
              }
            }
            continue
          }

          if (
            compatible &&
            vitals.mateCooldown <= 0 &&
            (vitals.matePartner === null || vitals.matePartner.value === other.entityId) &&
            (other.vitals.matePartner === null || other.vitals.matePartner.value === match.entity.id.value) &&
            other.vitals.mateCooldown <= 0 &&
            vitals.energy > agent.maxEnergy * 0.74 &&
            vitals.health > agent.maxHealth * 0.68 &&
            other.vitals.energy > other.agent.maxEnergy * 0.74 &&
            distance < mateDistance
          ) {
            mateDistance = distance
            mateVector = {
              x: normalized.x,
              y: normalized.y
            }
          }
        }

        for (const food of foods) {
          const deltaX = food.position.x - position.x
          const deltaY = food.position.y - position.y
          const distance = Math.hypot(deltaX, deltaY)
          if (distance > agent.sightRange || distance >= foodDistance) {
            continue
          }

          const normalized = normalizeVector(deltaX, deltaY)
          foodDistance = distance
          foodVector = {
            x: normalized.x,
            y: normalized.y
          }
        }

        match.data.behavior.update((behavior) => {
          let nextBehavior = behavior
          if (behavior.wanderTimer <= 0) {
            nextBehavior = {
              wanderAngle: behavior.wanderAngle + lerp(-0.42, 0.42, genes.sight) + dt * lerp(-0.28, 0.28, genes.speed),
              wanderTimer: lerp(1.8, 3.8, 1 - genes.speed),
              intentMemoryX: behavior.intentMemoryX,
              intentMemoryY: behavior.intentMemoryY
            }
          } else {
            nextBehavior = {
              ...behavior,
              wanderTimer: behavior.wanderTimer - dt
            }
          }

          let direction = {
            x: Math.cos(nextBehavior.wanderAngle),
            y: Math.sin(nextBehavior.wanderAngle)
          }

          const full = vitals.fullness >= 0.62 || vitals.energy >= agent.maxEnergy * 0.76
          const hungerCritical = vitals.energy < agent.maxEnergy * 0.24 && vitals.fullness < 0.22
          const hungerPanic = vitals.energy < agent.maxEnergy * 0.12 && vitals.fullness < 0.12
          const matingReady =
            mateDistance < agent.sightRange * 0.64 &&
            vitals.energy > agent.maxEnergy * 0.44 &&
            vitals.health > agent.maxHealth * 0.56 &&
            vitals.fullness > 0.28 &&
            (vitals.matePartner === null || vitals.bondProgress > 0.08)
          const predatorBias = genes.aggression >= 0.8 || genes.attack >= 0.84
          const fightReady =
            attackDistance < agent.attackRange + (predatorBias ? 104 : 76) &&
            vitals.attackCooldown <= 0 &&
            vitals.energy > (predatorBias ? 5 : 8) &&
            (predatorBias || full || genes.aggression >= 0.42 || genes.attack >= 0.68 || vitals.fullness > 0.38)
          if (
            nearestThreatDistance < agent.sightRange * 0.62 ||
            (nearestThreatDistance < agent.sightRange * 0.85 && (vitals.health < agent.maxHealth * 0.54 || hungerPanic))
          ) {
            targetKind = "flee"
            direction = threatVector
          } else if (fightReady) {
            targetKind = "attack"
            direction = attackVector
          } else if (matingReady) {
            targetKind = "seekMate"
            direction = {
              x: mateVector.x * 1.18 + crowdRepulsion.x * 0.24,
              y: mateVector.y * 1.18 + crowdRepulsion.y * 0.24
            }
          } else if (!predatorBias && !full && (hungerCritical || foodDistance < agent.sightRange * 0.52)) {
            targetKind = "seekFood"
            direction = {
              x: foodVector.x * 1.36 + crowdRepulsion.x * 0.12,
              y: foodVector.y * 1.36 + crowdRepulsion.y * 0.12
            }
          } else if (predatorBias && attackDistance < agent.attackRange + 128 && vitals.attackCooldown <= 0) {
            targetKind = "attack"
            direction = {
              x: attackVector.x * 1.18,
              y: attackVector.y * 1.18
            }
          } else {
            direction = {
              x: direction.x * 0.96 + crowdRepulsion.x * 0.32,
              y: direction.y * 0.96 + crowdRepulsion.y * 0.32
            }
          }

          const desired = normalizeVector(direction.x, direction.y)
          const smoothed = normalizeVector(
            desired.x * 0.38 + behavior.intentMemoryX * 0.62,
            desired.y * 0.38 + behavior.intentMemoryY * 0.62
          )
          vectorX = smoothed.x
          vectorY = smoothed.y
          return {
            ...nextBehavior,
            intentMemoryX: smoothed.x,
            intentMemoryY: smoothed.y
          }
        })

        match.data.intent.set({
          kind: targetKind,
          x: vectorX,
          y: vectorY
        })
      }
    })
)

export const ApplyMovementSystem = Game.System(
  "GeneticsArena/ApplyMovement",
  {
    when: [Game.Condition.inState(SimulationPhase, "Running")],
    queries: {
      agents: AgentTickQuery
    },
    resources: {
      deltaTime: Game.System.readResource(DeltaTime),
      arena: Game.System.readResource(Arena)
    }
  },
  ({ queries, resources }) =>
    Fx.sync(() => {
      const dt = resources.deltaTime.get()
      const arena = resources.arena.get()

      for (const match of queries.agents.each()) {
        const intent = match.data.intent.get()
        const agent = match.data.agent.get()
        const currentVelocity = match.data.velocity.get()
        const normalized = normalizeVector(intent.x, intent.y)
        const speed = lerp(22, 92, agent.moveCost / 11.6)
        const position = match.data.position.get()
        const velocity = {
          x: currentVelocity.x * 0.58 + normalized.x * speed * 0.42,
          y: currentVelocity.y * 0.58 + normalized.y * speed * 0.42
        }

        match.data.velocity.set(velocity)
        match.data.position.set({
          x: wrap(position.x + velocity.x * dt, arena.width),
          y: wrap(position.y + velocity.y * dt, arena.height)
        })

        match.data.vitals.update((vitals) => ({
          ...vitals,
          fullness: Math.max(0, vitals.fullness - dt * (normalized.length > 0 ? 0.13 : 0.04)),
          energy: clamp(vitals.energy - dt * agent.moveCost * (normalized.length > 0 ? 0.38 : 0.12), 0, agent.maxEnergy)
        }))
      }
    })
)

export const ResolveFoodAndHazardSystem = Game.System(
  "GeneticsArena/ResolveFoodAndHazard",
  {
    when: [Game.Condition.inState(SimulationPhase, "Running")],
    queries: {
      agents: AgentTickQuery,
      foods: FoodQuery
    }
  },
  ({ queries, commands }) =>
    Fx.sync(() => {
      const foods = queries.foods.each().map((match) => ({
        entityId: match.entity.id,
        position: match.data.position.get(),
        nutrition: match.data.food.get().nutrition
      }))
      for (const match of queries.agents.each()) {
        const position = match.data.position.get()
        const agent = match.data.agent.get()

        for (const food of foods) {
          const distance = Math.hypot(food.position.x - position.x, food.position.y - position.y)
          if (distance > agent.size + 8) {
            continue
          }

          commands.despawn(food.entityId)
          match.data.vitals.update((vitals) => ({
            ...vitals,
            health: clamp(vitals.health + food.nutrition * 0.2, 0, agent.maxHealth),
            energy: clamp(vitals.energy + food.nutrition, 0, agent.maxEnergy),
            fullness: clamp(vitals.fullness + 0.4, 0, 1),
            pulse: 1.28
          }))
        }
      }
    })
)

export const ResolveAgentInteractionsSystem = Game.System(
  "GeneticsArena/ResolveAgentInteractions",
  {
    when: [Game.Condition.inState(SimulationPhase, "Running")],
    queries: {
      agents: AgentSnapshotQuery
    },
    resources: {
      arena: Game.System.readResource(Arena),
      deltaTime: Game.System.readResource(DeltaTime),
      generationIndex: Game.System.readResource(GenerationIndex),
      rngSeed: Game.System.writeResource(RngSeed),
      populationStats: Game.System.writeResource(PopulationStats)
    }
  },
  ({ queries, resources, commands, lookup }) =>
    Fx.sync(() => {
      const dt = resources.deltaTime.get()
      const arena = resources.arena.get()
      const childMargin = offspringMargin(arena)
      let seed = resources.rngSeed.get()
      const snapshots = collectAgentSnapshots(queries.agents.each())
      const engagedPairs = new Set<number>()

      for (let index = 0; index < snapshots.length; index += 1) {
        const left = snapshots[index]
        if (!left) {
          continue
        }

        for (let otherIndex = index + 1; otherIndex < snapshots.length; otherIndex += 1) {
          const right = snapshots[otherIndex]
          if (!right) {
            continue
          }

          const deltaX = right.position.x - left.position.x
          const deltaY = right.position.y - left.position.y
          const distance = Math.hypot(deltaX, deltaY)
          const gap = geneDistance(left.genes, right.genes)
          const compatible = gap <= Math.min(left.agent.mateCompatibility, right.agent.mateCompatibility)
          const hostile =
            gap >= Math.max(left.agent.hostilityThreshold, right.agent.hostilityThreshold) &&
            (left.genes.aggression >= 0.3 || right.genes.aggression >= 0.3)

          if (!compatible && !hostile) {
            continue
          }

          const leftLive = lookup.getHandle(left.handle as never, AgentResolveQuery)
          const rightLive = lookup.getHandle(right.handle as never, AgentResolveQuery)
          if (!leftLive.ok || !rightLive.ok) {
            continue
          }

          const leftVitals = leftLive.value.data.vitals.get()
          const rightVitals = rightLive.value.data.vitals.get()
          const leftLockedToRight = leftVitals.matePartner?.value === right.entityId
          const rightLockedToLeft = rightVitals.matePartner?.value === left.entityId
          const leftAvailableForMate = leftVitals.matePartner === null || leftLockedToRight
          const rightAvailableForMate = rightVitals.matePartner === null || rightLockedToLeft

          if (
            compatible &&
            distance <= left.agent.size + right.agent.size + MATING_CONTACT_RADIUS &&
            leftVitals.mateCooldown <= 0 &&
            rightVitals.mateCooldown <= 0 &&
            leftAvailableForMate &&
            rightAvailableForMate &&
            !engagedPairs.has(left.entityId) &&
            !engagedPairs.has(right.entityId) &&
            leftVitals.energy > left.agent.maxEnergy * 0.58 &&
            rightVitals.energy > right.agent.maxEnergy * 0.58 &&
            leftVitals.health > left.agent.maxHealth * 0.58 &&
            rightVitals.health > right.agent.maxHealth * 0.58
          ) {
            const bondGain = dt * lerp(0.42, 0.96, (left.genes.fertility + right.genes.fertility) * 0.5)
            leftLive.value.data.vitals.update((vitals) => ({
              ...vitals,
              matePartner: Game.Entity.handleAs(Agent, rightLive.value.entity.id),
              bondProgress: Math.min(2.4, vitals.bondProgress + bondGain),
              pulse: 1.08
            }))
            rightLive.value.data.vitals.update((vitals) => ({
              ...vitals,
              matePartner: Game.Entity.handleAs(Agent, leftLive.value.entity.id),
              bondProgress: Math.min(2.4, vitals.bondProgress + bondGain),
              pulse: 1.08
            }))
            engagedPairs.add(left.entityId)
            engagedPairs.add(right.entityId)

            const bondedLeft = leftLive.value.data.vitals.get()
            const bondedRight = rightLive.value.data.vitals.get()
            if (bondedLeft.bondProgress >= 1.7 && bondedRight.bondProgress >= 1.7) {
              const mix = (leftValue: number, rightValue: number) => {
                const blend = randomBetween(seed, 0.35, 0.65)
                seed = blend.seed
                const mutation = randomBetween(seed, -0.06, 0.06)
                seed = mutation.seed
                return clamp(lerp(leftValue, rightValue, blend.value) + mutation.value, 0.04, 0.98)
              }

              const childGenes: GenesValue = {
                speed: mix(left.genes.speed, right.genes.speed),
                resilience: mix(left.genes.resilience, right.genes.resilience),
                attack: mix(left.genes.attack, right.genes.attack),
                longevity: mix(left.genes.longevity, right.genes.longevity),
                sight: mix(left.genes.sight, right.genes.sight),
                fertility: mix(left.genes.fertility, right.genes.fertility),
                aggression: mix(left.genes.aggression, right.genes.aggression)
              }
              const lineage = randomUnit(seed)
              seed = lineage.seed
              const hueMutation = randomBetween(seed, -12, 12)
              seed = hueMutation.seed
              const founder = {
                lineageId: lineage.value >= 0.5 ? left.agent.lineageId : right.agent.lineageId,
                speciesHue: clamp(lerp(left.agent.speciesHue, right.agent.speciesHue, 0.5) + hueMutation.value, 0, 359),
                genes: childGenes
              }
              const offsetX = randomBetween(seed, -18, 18)
              seed = offsetX.seed
              const offsetY = randomBetween(seed, -18, 18)
              seed = offsetY.seed
              const wanderAngle = randomBetween(seed, 0, Math.PI * 2)
              seed = wanderAngle.seed
              commands.spawn(
                spawnAgentDraft(
                  founder,
                  {
                    x: clamp((left.position.x + right.position.x) * 0.5 + offsetX.value, childMargin, arena.width - childMargin),
                    y: clamp((left.position.y + right.position.y) * 0.5 + offsetY.value, childMargin, arena.height - childMargin)
                  },
                  resources.generationIndex.get(),
                  wanderAngle.value
                )
              )
              leftLive.value.data.vitals.update((vitals) => ({
                ...vitals,
                bondProgress: 0,
                mateCooldown: left.agent.fertilityCooldown,
                matePartner: null,
                energy: clamp(vitals.energy - left.agent.maxEnergy * 0.36, 0, left.agent.maxEnergy),
                fullness: Math.max(0, vitals.fullness - 0.22),
                children: vitals.children + 1,
                pulse: 1.34
              }))
              rightLive.value.data.vitals.update((vitals) => ({
                ...vitals,
                bondProgress: 0,
                mateCooldown: right.agent.fertilityCooldown,
                matePartner: null,
                energy: clamp(vitals.energy - right.agent.maxEnergy * 0.36, 0, right.agent.maxEnergy),
                fullness: Math.max(0, vitals.fullness - 0.22),
                children: vitals.children + 1,
                pulse: 1.34
              }))
              resources.populationStats.update((stats) => ({
                births: stats.births + 1,
                deaths: stats.deaths,
                peak: Math.max(stats.peak, stats.births - stats.deaths + 1)
              }))
            }
            continue
          }

          if (hostile && distance <= Math.max(left.agent.attackRange, right.agent.attackRange) + ATTACK_CONTACT_PADDING) {
            if (leftVitals.attackCooldown <= 0 && leftVitals.energy > 6) {
              const damage = Math.max(3.5, left.agent.attackPower - right.genes.resilience * 7.4)
              rightLive.value.data.vitals.update((vitals) => ({
                ...vitals,
                health: Math.max(0, vitals.health - damage),
                matePartner: null,
                bondProgress: 0,
                pulse: 1.24
              }))
              leftLive.value.data.vitals.update((vitals) => ({
                ...vitals,
                attackCooldown: lerp(0.78, 0.18, left.genes.attack),
                energy: clamp(vitals.energy - 2.6, 0, left.agent.maxEnergy),
                fullness: Math.max(0, vitals.fullness - 0.06),
                pulse: 1.12
              }))
            }

            const refreshedRight = rightLive.value.data.vitals.get()
            if (refreshedRight.attackCooldown <= 0 && refreshedRight.energy > 6) {
              const damage = Math.max(3.5, right.agent.attackPower - left.genes.resilience * 7.4)
              leftLive.value.data.vitals.update((vitals) => ({
                ...vitals,
                health: Math.max(0, vitals.health - damage),
                matePartner: null,
                bondProgress: 0,
                pulse: 1.24
              }))
              rightLive.value.data.vitals.update((vitals) => ({
                ...vitals,
                attackCooldown: lerp(0.78, 0.18, right.genes.attack),
                energy: clamp(vitals.energy - 2.6, 0, right.agent.maxEnergy),
                fullness: Math.max(0, vitals.fullness - 0.06),
                pulse: 1.12
              }))
            }
          }
        }
      }

      resources.rngSeed.set(seed)
    })
)

export const CleanupDeadAgentsSystem = Game.System(
  "GeneticsArena/CleanupDeadAgents",
  {
    when: [Game.Condition.inState(SimulationPhase, "Running")],
    queries: {
      agents: AgentSnapshotQuery
    },
    resources: {
      populationStats: Game.System.writeResource(PopulationStats)
    }
  },
  ({ queries, commands, resources }) =>
    Fx.sync(() => {
      let deaths = 0
      for (const match of queries.agents.each()) {
        const vitals = match.data.vitals.get()
        if (vitals.health > 0) {
          continue
        }

        deaths += 1
        commands.despawn(match.entity.id)
      }

      if (deaths > 0) {
        resources.populationStats.update((stats) => ({
          births: stats.births,
          deaths: stats.deaths + deaths,
          peak: stats.peak
        }))
      }
    })
)

export const MaintainFoodSystem = Game.System(
  "GeneticsArena/MaintainFood",
  {
    when: [Game.Condition.inState(SimulationPhase, "Running")],
    queries: {
      foods: FoodQuery
    },
    resources: {
      arena: Game.System.readResource(Arena),
      rngSeed: Game.System.writeResource(RngSeed)
    }
  },
  ({ queries, commands, resources }) =>
    Fx.sync(() => {
      const foods = queries.foods.each()
      if (foods.length >= FOOD_TARGET) {
        return
      }

      let seed = resources.rngSeed.get()
      const arena = resources.arena.get()
      const dynamicFoodMargin = foodMargin(arena)
      const spawnRoll = randomUnit(seed)
      seed = spawnRoll.seed
      if (spawnRoll.value < 0.48) {
        resources.rngSeed.set(seed)
        return
      }

      const deficit = FOOD_TARGET - foods.length
      const refillCount = Math.min(deficit, 3)
      for (let index = 0; index < refillCount; index += 1) {
        const xDraw = randomBetween(seed, dynamicFoodMargin, arena.width - dynamicFoodMargin)
        seed = xDraw.seed
        const yDraw = randomBetween(seed, dynamicFoodMargin, arena.height - dynamicFoodMargin)
        seed = yDraw.seed
        commands.spawn(spawnFoodDraft({ x: xDraw.value, y: yDraw.value }))
      }
      resources.rngSeed.set(seed)
    })
)

export const QueuePhaseOutcomeSystem = Game.System(
  "GeneticsArena/QueuePhaseOutcome",
  {
    when: [Game.Condition.inState(SimulationPhase, "Running")],
    queries: {
      agents: AgentSnapshotQuery
    },
    resources: {
      generationClock: Game.System.writeResource(GenerationClock),
      rngSeed: Game.System.writeResource(RngSeed),
      nextGeneration: Game.System.writeResource(NextGeneration),
      summary: Game.System.writeResource(Summary)
    },
    nextMachines: {
      phase: Game.System.nextState(SimulationPhase)
    }
  },
  ({ queries, resources, nextMachines }) =>
    Fx.sync(() => {
      const survivors = collectAgentSnapshots(queries.agents.each())
      if (survivors.length === 0) {
        const pool = makeFounderPool(resources.rngSeed.get(), FOUNDER_COUNT)
        resources.rngSeed.set(pool.seed)
        resources.nextGeneration.set({
          founders: pool.founders,
          cause: "extinction"
        })
        resources.generationClock.set({
          elapsed: resources.generationClock.get().elapsed,
          limit: resources.generationClock.get().limit,
          transitionTimer: EXTINCTION_DURATION_SECONDS
        })
        resources.summary.set({
          mode: "extinction",
          title: "Extinction event.",
          subtitle: "No lineage survived the arena. The environment will reseed from scratch.",
          champion: "No champion: every phenotype collapsed.",
          dominantLineage: "Dominant lineage: none"
        })
        nextMachines.phase.set("Extinction")
        return
      }

      const clock = resources.generationClock.get()
      if (clock.elapsed < clock.limit) {
        return
      }

      const lineageCounts = new Map<number, number>()
      const initialChampion = survivors[0]
      if (!initialChampion) {
        return
      }
      let champion = initialChampion
      for (const survivor of survivors) {
        lineageCounts.set(survivor.agent.lineageId, (lineageCounts.get(survivor.agent.lineageId) ?? 0) + 1)
        const championScore =
          champion.vitals.health + champion.vitals.energy + champion.vitals.children * 18 + champion.genes.longevity * 20
        const nextScore =
          survivor.vitals.health + survivor.vitals.energy + survivor.vitals.children * 18 + survivor.genes.longevity * 20
        if (nextScore > championScore) {
          champion = survivor
        }
      }

      let dominantLineageId = champion.agent.lineageId
      let dominantCount = 0
      for (const [lineageId, count] of lineageCounts) {
        if (count > dominantCount) {
          dominantLineageId = lineageId
          dominantCount = count
        }
      }

      const founders = sampleFoundersFromSurvivors(resources.rngSeed.get(), survivors, FOUNDER_COUNT)
      resources.rngSeed.set(founders.seed)
      resources.nextGeneration.set({
        founders: founders.founders,
        cause: "survivors"
      })
      resources.generationClock.set({
        elapsed: clock.elapsed,
        limit: clock.limit,
        transitionTimer: SUMMARY_DURATION_SECONDS
      })
      resources.summary.set({
        mode: "summary",
        title: `Generation resolved: lineage ${dominantLineageId} leads.`,
        subtitle: `${survivors.length} survivors remain after ${clock.elapsed.toFixed(1)} seconds of pressure.`,
        champion:
          `Champion genes  spd ${formatGene(champion.genes.speed)}  atk ${formatGene(champion.genes.attack)}  ` +
          `res ${formatGene(champion.genes.resilience)}  long ${formatGene(champion.genes.longevity)}`,
        dominantLineage: `Dominant lineage ${dominantLineageId} holds ${dominantCount} survivors.`
      })
      nextMachines.phase.set("GenerationSummary")
    })
)

export const TickTransitionStateSystem = Game.System(
  "GeneticsArena/TickTransitionState",
  {
    when: [
      Game.Condition.or(
        Game.Condition.inState(SimulationPhase, "GenerationSummary"),
        Game.Condition.inState(SimulationPhase, "Extinction")
      )
    ],
    resources: {
      deltaTime: Game.System.readResource(DeltaTime),
      generationClock: Game.System.writeResource(GenerationClock)
    }
  },
  ({ resources }) =>
    Fx.sync(() => {
      const dt = resources.deltaTime.get()
      resources.generationClock.update((clock) => ({
        ...clock,
        transitionTimer: Math.max(0, clock.transitionTimer - dt)
      }))
    })
)

export const QueueResumeSystem = Game.System(
  "GeneticsArena/QueueResume",
  {
    when: [
      Game.Condition.or(
        Game.Condition.inState(SimulationPhase, "GenerationSummary"),
        Game.Condition.inState(SimulationPhase, "Extinction")
      )
    ],
    resources: {
      generationClock: Game.System.readResource(GenerationClock),
      generationIndex: Game.System.writeResource(GenerationIndex)
    },
    nextMachines: {
      phase: Game.System.nextState(SimulationPhase)
    }
  },
  ({ resources, nextMachines }) =>
    Fx.sync(() => {
      if (resources.generationClock.get().transitionTimer > 0) {
        return
      }

      resources.generationIndex.update((value) => value + 1)
      nextMachines.phase.set("Running")
    })
)
