import { clamp, lerp } from "../../src/internal/scalar.ts"
import { normalizeXYOrZero } from "../../src/internal/vector2.ts"
import { Entity } from "../../src/index.ts"
import { FOOD_ENERGY } from "./constants.ts"
import { Agent, Game, Genes, Position, Renderable, Root, Velocity, Vitals, Behavior, Intent, Food, schema } from "./schema.ts"
import type { AgentSnapshot, ArenaValue, FounderSeed, GenesValue, PopulationStatsValue, RenderKind, ShapeKind, SummaryValue } from "./types.ts"

export const wrap = (value: number, size: number): number => {
  if (value < 0) {
    return value + size
  }
  if (value >= size) {
    return value - size
  }
  return value
}

export const formatGene = (value: number): string => value.toFixed(2)

export const foodMargin = (arena: ArenaValue): number =>
  clamp(Math.min(arena.width, arena.height) * 0.08, 48, 84)

export const founderMargin = (arena: ArenaValue): number =>
  clamp(Math.min(arena.width, arena.height) * 0.05, 28, 42)

export const offspringMargin = (arena: ArenaValue): number =>
  clamp(Math.min(arena.width, arena.height) * 0.03, 20, 32)

export const hueToHex = (hue: number, saturation: number, lightness: number): number => {
  const h = ((hue % 360) + 360) % 360 / 360
  const s = clamp(saturation, 0, 1)
  const l = clamp(lightness, 0, 1)

  if (s === 0) {
    const channel = Math.round(l * 255)
    return (channel << 16) + (channel << 8) + channel
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hueToChannel = (t: number) => {
    let value = t
    if (value < 0) {
      value += 1
    }
    if (value > 1) {
      value -= 1
    }
    if (value < 1 / 6) {
      return p + (q - p) * 6 * value
    }
    if (value < 1 / 2) {
      return q
    }
    if (value < 2 / 3) {
      return p + (q - p) * (2 / 3 - value) * 6
    }
    return p
  }

  const red = Math.round(hueToChannel(h + 1 / 3) * 255)
  const green = Math.round(hueToChannel(h) * 255)
  const blue = Math.round(hueToChannel(h - 1 / 3) * 255)
  return (red << 16) + (green << 8) + blue
}

export const makePopulationStats = (births: number): PopulationStatsValue => ({
  births,
  deaths: 0,
  peak: births
})

export const makeRunningSummary = (): SummaryValue => ({
  mode: "running",
  title: "Selection pressure is live.",
  subtitle: "Food is scarce, hostile phenotypes chase weakness, and lingering in crowds raises risk.",
  champion: "Champions are decided at the end of the season.",
  dominantLineage: "Dominant lineage: evaluating"
})

export const mulberry32 = (seed: number): number => {
  let next = seed + 0x6d2b79f5
  next = Math.imul(next ^ (next >>> 15), next | 1)
  next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
  return (next ^ (next >>> 14)) >>> 0
}

export const randomUnit = (seed: number): { seed: number; value: number } => {
  const nextSeed = mulberry32(seed)
  return {
    seed: nextSeed,
    value: nextSeed / 0xffffffff
  }
}

export const randomBetween = (seed: number, min: number, max: number): { seed: number; value: number } => {
  const next = randomUnit(seed)
  return {
    seed: next.seed,
    value: lerp(min, max, next.value)
  }
}

export const normalizeVector = normalizeXYOrZero

export const geneDistance = (left: GenesValue, right: GenesValue): number =>
  (
    Math.abs(left.speed - right.speed) +
    Math.abs(left.resilience - right.resilience) +
    Math.abs(left.attack - right.attack) +
    Math.abs(left.longevity - right.longevity) +
    Math.abs(left.sight - right.sight) +
    Math.abs(left.fertility - right.fertility) +
    Math.abs(left.aggression - right.aggression)
  ) / 7

export const deriveShape = (genes: GenesValue): ShapeKind => {
  if (genes.aggression >= 0.84 || (genes.attack >= 0.82 && genes.aggression >= 0.68)) {
    return "spike"
  }
  if (genes.aggression >= 0.58 || (genes.attack >= 0.7 && genes.aggression >= 0.44)) {
    return "triangle"
  }
  if (genes.resilience >= 0.72) {
    return "square"
  }
  if (genes.fertility >= 0.74 && genes.aggression < 0.4) {
    return "diamond"
  }
  return "circle"
}

export const deriveAgentStats = (
  lineageId: number,
  speciesHue: number,
  genes: GenesValue,
  generationBorn: number
) => ({
  lineageId,
  speciesHue,
  shape: deriveShape(genes),
  size: lerp(7, 15, genes.resilience * 0.55 + genes.attack * 0.45),
  maxHealth: lerp(52, 112, genes.resilience),
  maxEnergy: lerp(40, 82, genes.longevity * 0.45 + genes.speed * 0.15 + genes.fertility * 0.4),
  moveCost: lerp(4.8, 11.6, genes.speed * 0.65 + genes.attack * 0.2 + (1 - genes.resilience) * 0.15),
  attackPower: lerp(14, 38, genes.attack),
  attackRange: lerp(18, 36, genes.attack),
  sightRange: lerp(68, 170, genes.sight),
  mateCompatibility: lerp(0.08, 0.2, genes.fertility * 0.6 + (1 - genes.aggression) * 0.4),
  hostilityThreshold: lerp(0.18, 0.42, genes.aggression * 0.78 + genes.attack * 0.22),
  fertilityCooldown: lerp(9.6, 4.8, genes.fertility),
  longevityLimit: lerp(12, 40, genes.longevity),
  generationBorn
})

export const deriveRenderable = (kind: RenderKind, genes?: GenesValue, hue?: number) => {
  if (kind === "food") {
    return {
      kind,
      shape: "circle" as const,
      color: 0x7ddc82,
      accent: 0xd6ffd0,
      alpha: 0.96
    }
  }

  if (kind === "hazard") {
    return {
      kind,
      shape: "circle" as const,
      color: 0xbc4b51,
      accent: 0xffb4a2,
      alpha: 0.26
    }
  }

  const safeGenes = genes ?? {
    speed: 0.5,
    resilience: 0.5,
    attack: 0.5,
    longevity: 0.5,
    sight: 0.5,
    fertility: 0.5,
    aggression: 0.5
  }
  const safeHue = hue ?? 180
  return {
    kind,
    shape: deriveShape(safeGenes),
    color: hueToHex(safeHue, lerp(0.55, 0.84, safeGenes.sight), lerp(0.42, 0.58, safeGenes.longevity)),
    accent: hueToHex(safeHue + 18, lerp(0.35, 0.8, safeGenes.resilience), lerp(0.7, 0.86, safeGenes.fertility)),
    alpha: lerp(0.75, 0.96, safeGenes.resilience)
  }
}

export const makeInitialGenes = (seed: number, base: GenesValue): { seed: number; genes: GenesValue } => {
  let nextSeed = seed
  const mutate = (value: number, spread: number) => {
    const next = randomBetween(nextSeed, -spread, spread)
    nextSeed = next.seed
    return clamp(value + next.value, 0.04, 0.98)
  }

  return {
    seed: nextSeed,
    genes: {
      speed: mutate(base.speed, 0.16),
      resilience: mutate(base.resilience, 0.16),
      attack: mutate(base.attack, 0.16),
      longevity: mutate(base.longevity, 0.16),
      sight: mutate(base.sight, 0.16),
      fertility: mutate(base.fertility, 0.16),
      aggression: mutate(base.aggression, 0.16)
    }
  }
}

const archetypes: ReadonlyArray<{ hue: number; genes: GenesValue }> = [
  {
    hue: 28,
    genes: { speed: 0.78, resilience: 0.32, attack: 0.86, longevity: 0.34, sight: 0.66, fertility: 0.22, aggression: 0.96 }
  },
  {
    hue: 120,
    genes: { speed: 0.48, resilience: 0.78, attack: 0.42, longevity: 0.76, sight: 0.58, fertility: 0.52, aggression: 0.38 }
  },
  {
    hue: 205,
    genes: { speed: 0.82, resilience: 0.42, attack: 0.48, longevity: 0.48, sight: 0.84, fertility: 0.58, aggression: 0.42 }
  },
  {
    hue: 312,
    genes: { speed: 0.44, resilience: 0.62, attack: 0.58, longevity: 0.66, sight: 0.46, fertility: 0.82, aggression: 0.46 }
  },
  {
    hue: 356,
    genes: { speed: 0.68, resilience: 0.28, attack: 0.94, longevity: 0.24, sight: 0.74, fertility: 0.16, aggression: 0.98 }
  }
] as const

export const makeFounderPool = (seed: number, count: number): { seed: number; founders: ReadonlyArray<FounderSeed> } => {
  let nextSeed = seed
  const founders: FounderSeed[] = []

  for (let index = 0; index < count; index += 1) {
    const template = archetypes[index % archetypes.length]
    if (!template) {
      continue
    }
    const initial = makeInitialGenes(nextSeed, template.genes)
    nextSeed = initial.seed
    founders.push({
      lineageId: index % archetypes.length,
      speciesHue: template.hue,
      genes: initial.genes
    })
  }

  return {
    seed: nextSeed,
    founders
  }
}

export const sampleFoundersFromSurvivors = (
  seed: number,
  survivors: ReadonlyArray<AgentSnapshot>,
  count: number
): { seed: number; founders: ReadonlyArray<FounderSeed> } => {
  if (survivors.length === 0) {
    return makeFounderPool(seed, count)
  }

  let nextSeed = seed
  const weights = survivors.map((survivor) =>
    Math.max(
      1,
      survivor.vitals.health * 0.45 +
        survivor.vitals.energy * 0.35 +
        survivor.vitals.children * 18 +
        survivor.agent.maxHealth * 0.1
    )
  )
  const totalWeight = weights.reduce((total, value) => total + value, 0)

  const chooseParent = (): AgentSnapshot => {
    const draw = randomBetween(nextSeed, 0, totalWeight)
    nextSeed = draw.seed
    let cursor = 0
    const first = survivors[0]
    if (!first) {
      throw new Error("Expected at least one survivor when sampling founders")
    }
    for (let index = 0; index < survivors.length; index += 1) {
      cursor += weights[index] ?? 0
      if (draw.value <= cursor) {
        return survivors[index] ?? first
      }
    }
    return first
  }

  const founders: FounderSeed[] = []
  for (let index = 0; index < count; index += 1) {
    const primary = chooseParent()
    const secondaryCandidate = chooseParent()
    const distance = geneDistance(primary.genes, secondaryCandidate.genes)
    const compatible = distance <= Math.min(primary.agent.mateCompatibility, secondaryCandidate.agent.mateCompatibility)
    const secondary = compatible ? secondaryCandidate : primary

    const mixGene = (left: number, right: number) => {
      const blend = randomBetween(nextSeed, 0.35, 0.65)
      nextSeed = blend.seed
      const mutation = randomBetween(nextSeed, -0.08, 0.08)
      nextSeed = mutation.seed
      return clamp(lerp(left, right, blend.value) + mutation.value, 0.04, 0.98)
    }

    const genes: GenesValue = {
      speed: mixGene(primary.genes.speed, secondary.genes.speed),
      resilience: mixGene(primary.genes.resilience, secondary.genes.resilience),
      attack: mixGene(primary.genes.attack, secondary.genes.attack),
      longevity: mixGene(primary.genes.longevity, secondary.genes.longevity),
      sight: mixGene(primary.genes.sight, secondary.genes.sight),
      fertility: mixGene(primary.genes.fertility, secondary.genes.fertility),
      aggression: mixGene(primary.genes.aggression, secondary.genes.aggression)
    }

    const lineagePick = randomUnit(nextSeed)
    nextSeed = lineagePick.seed
    const lineageId = lineagePick.value > 0.5 ? primary.agent.lineageId : secondary.agent.lineageId
    const hue = lerp(primary.agent.speciesHue, secondary.agent.speciesHue, 0.5)

    founders.push({
      lineageId,
      speciesHue: hue,
      genes
    })
  }

  return {
    seed: nextSeed,
    founders
  }
}

export const spawnFoodDraft = (position: { x: number; y: number }) =>
  Game.Command.spawnWith(
    [Position, position],
    [Velocity, { x: 0, y: 0 }],
    [Food, { nutrition: FOOD_ENERGY }],
    [Renderable, deriveRenderable("food")]
  )

export const spawnAgentDraft = (
  founder: FounderSeed,
  position: { x: number; y: number },
  generationIndex: number,
  wanderAngle: number
) => {
  const agent = deriveAgentStats(founder.lineageId, founder.speciesHue, founder.genes, generationIndex)
  return Game.Command.spawnWith(
    [Position, position],
    [Velocity, { x: 0, y: 0 }],
    [Genes, founder.genes],
    [Agent, agent],
    [Vitals, {
      health: agent.maxHealth,
      energy: agent.maxEnergy * 0.82,
      fullness: 0.78,
      age: 0,
      mateCooldown: lerp(0.2, 2.5, founder.genes.fertility),
      matePartner: null,
      attackCooldown: lerp(0.1, 0.7, founder.genes.attack),
      bondProgress: 0,
      children: 0,
      pulse: 1
    }],
    [Behavior, {
      wanderAngle,
      wanderTimer: 0,
      intentMemoryX: Math.cos(wanderAngle),
      intentMemoryY: Math.sin(wanderAngle)
    }],
    [Intent, {
      kind: "wander",
      x: 0,
      y: 0
    }],
    [Renderable, deriveRenderable("agent", founder.genes, founder.speciesHue)]
  )
}

// The summary pass operates on detached snapshots so pairwise decisions stay stable
// even while later lookups re-enter the live world and can fail.
export const collectAgentSnapshots = (
  matches: ReadonlyArray<{
    entity: {
      id: Entity.EntityId<typeof schema, typeof Root>
    }
    data: {
      position: { get(): { x: number; y: number } }
      genes: { get(): GenesValue }
      agent: { get(): AgentSnapshot["agent"] }
      vitals: { get(): AgentSnapshot["vitals"] }
    }
  }>
): ReadonlyArray<AgentSnapshot> =>
  matches.map((match) => ({
    handle: Game.Entity.handleAs(Agent, match.entity.id),
    entityId: match.entity.id.value,
    position: match.data.position.get(),
    genes: match.data.genes.get(),
    agent: match.data.agent.get(),
    vitals: match.data.vitals.get()
  }))
