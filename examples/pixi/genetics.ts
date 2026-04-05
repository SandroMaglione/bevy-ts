import { Application, Container, Graphics } from "pixi.js"

import { Descriptor, Entity, Fx, Schema } from "../../src/index.ts"

interface BrowserExampleHandle {
  destroy(): Promise<void>
}

const Root = Schema.defineRoot("GeneticsArena")

const STAGE_WIDTH = 920
const STAGE_HEIGHT = 560
const INITIAL_FOOD_COUNT = 22
const FOOD_TARGET = 24
const FOOD_ENERGY = 22
const FOUNDER_COUNT = 28
const GENERATION_DURATION_SECONDS = 38
const SUMMARY_DURATION_SECONDS = 5
const EXTINCTION_DURATION_SECONDS = 4
const MATING_CONTACT_RADIUS = 12
const ATTACK_CONTACT_PADDING = 16
const FOOD_MARGIN = 84

type GeneValue = number

type GenesValue = {
  speed: GeneValue
  resilience: GeneValue
  attack: GeneValue
  longevity: GeneValue
  sight: GeneValue
  fertility: GeneValue
  aggression: GeneValue
}

type FounderSeed = {
  lineageId: number
  speciesHue: number
  genes: GenesValue
}

type SummaryValue = {
  mode: "running" | "summary" | "extinction"
  title: string
  subtitle: string
  champion: string
  dominantLineage: string
}

type Phase = "Running" | "GenerationSummary" | "Extinction"
type IntentKind = "wander" | "seekFood" | "seekMate" | "attack" | "flee"
type ShapeKind = "circle" | "square" | "triangle" | "diamond" | "spike"
type RenderKind = "agent" | "food" | "hazard"

type PopulationStatsValue = {
  births: number
  deaths: number
  peak: number
}

type ArenaValue = {
  width: number
  height: number
}

type BrowserHud = {
  generation: HTMLSpanElement
  alive: HTMLSpanElement
  dominant: HTMLSpanElement
  births: HTMLSpanElement
  deaths: HTMLSpanElement
  status: HTMLSpanElement
  title: HTMLHeadingElement
  subtitle: HTMLParagraphElement
  champion: HTMLParagraphElement
  dominantLineage: HTMLParagraphElement
  footer: HTMLParagraphElement
  scrim: HTMLDivElement
  overlay: HTMLDivElement
}

type BrowserHostValue = {
  application: Application
  scene: Container
  nodes: Map<number, Graphics>
  clock: {
    deltaSeconds: number
  }
  hud: BrowserHud
}

type AgentSnapshot = {
  handle: Entity.Handle<typeof Root, typeof Agent>
  entityId: number
  position: { x: number; y: number }
  genes: GenesValue
  agent: {
    lineageId: number
    speciesHue: number
    shape: ShapeKind
    size: number
    maxHealth: number
    maxEnergy: number
    moveCost: number
    attackPower: number
    attackRange: number
    sightRange: number
    mateCompatibility: number
    hostilityThreshold: number
    fertilityCooldown: number
    longevityLimit: number
    generationBorn: number
  }
  vitals: {
    health: number
    energy: number
    fullness: number
    age: number
    mateCooldown: number
    matePartner: Entity.Handle<typeof Root, typeof Agent> | null
    attackCooldown: number
    bondProgress: number
    children: number
    pulse: number
  }
}

const Position = Descriptor.Component<{ x: number; y: number }>()("GeneticsArena/Position")
const Velocity = Descriptor.Component<{ x: number; y: number }>()("GeneticsArena/Velocity")
const Genes = Descriptor.Component<GenesValue>()("GeneticsArena/Genes")
const Agent = Descriptor.Component<{
  lineageId: number
  speciesHue: number
  shape: ShapeKind
  size: number
  maxHealth: number
  maxEnergy: number
  moveCost: number
  attackPower: number
  attackRange: number
  sightRange: number
  mateCompatibility: number
  hostilityThreshold: number
  fertilityCooldown: number
  longevityLimit: number
  generationBorn: number
}>()("GeneticsArena/Agent")
const Vitals = Descriptor.Component<{
  health: number
  energy: number
  fullness: number
  age: number
  mateCooldown: number
  matePartner: Entity.Handle<typeof Root, typeof Agent> | null
  attackCooldown: number
  bondProgress: number
  children: number
  pulse: number
}>()("GeneticsArena/Vitals")
const Behavior = Descriptor.Component<{
  wanderAngle: number
  wanderTimer: number
  intentMemoryX: number
  intentMemoryY: number
}>()("GeneticsArena/Behavior")
const Intent = Descriptor.Component<{
  kind: IntentKind
  x: number
  y: number
}>()("GeneticsArena/Intent")
const Renderable = Descriptor.Component<{
  kind: RenderKind
  shape: ShapeKind
  color: number
  accent: number
  alpha: number
}>()("GeneticsArena/Renderable")
const Food = Descriptor.Component<{
  nutrition: number
}>()("GeneticsArena/Food")
const DeltaTime = Descriptor.Resource<number>()("GeneticsArena/DeltaTime")
const Arena = Descriptor.Resource<ArenaValue>()("GeneticsArena/Arena")
const GenerationClock = Descriptor.Resource<{
  elapsed: number
  limit: number
  transitionTimer: number
}>()("GeneticsArena/GenerationClock")
const GenerationIndex = Descriptor.Resource<number>()("GeneticsArena/GenerationIndex")
const RngSeed = Descriptor.Resource<number>()("GeneticsArena/RngSeed")
const PopulationStats = Descriptor.Resource<PopulationStatsValue>()("GeneticsArena/PopulationStats")
const Summary = Descriptor.Resource<SummaryValue>()("GeneticsArena/Summary")
const NextGeneration = Descriptor.Resource<{
  founders: ReadonlyArray<FounderSeed>
  cause: "initial" | "survivors" | "extinction"
}>()("GeneticsArena/NextGeneration")

const BrowserHost = Descriptor.Service<BrowserHostValue>()("GeneticsArena/BrowserHost")

const Game = Schema.bind(
  Schema.fragment({
    components: {
      Position,
      Velocity,
      Genes,
      Agent,
      Vitals,
      Behavior,
      Intent,
      Renderable,
      Food
    },
    resources: {
      DeltaTime,
      Arena,
      GenerationClock,
      GenerationIndex,
      RngSeed,
      PopulationStats,
      Summary,
      NextGeneration
    }
  }),
  Root
)
const schema = Game.schema
const SimulationPhase = Game.StateMachine("SimulationPhase", ["Running", "GenerationSummary", "Extinction"] as const)

const AddedRenderableQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    renderable: Game.Query.read(Renderable),
    agent: Game.Query.optional(Agent),
    vitals: Game.Query.optional(Vitals)
  },
  filters: [Game.Query.added(Renderable)]
})

const LiveRenderableQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    renderable: Game.Query.read(Renderable),
    agent: Game.Query.optional(Agent),
    vitals: Game.Query.optional(Vitals)
  }
})

const AgentDecisionQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    genes: Game.Query.read(Genes),
    agent: Game.Query.read(Agent),
    vitals: Game.Query.read(Vitals),
    behavior: Game.Query.write(Behavior),
    intent: Game.Query.write(Intent)
  }
})

const AgentSnapshotQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    genes: Game.Query.read(Genes),
    agent: Game.Query.read(Agent),
    vitals: Game.Query.read(Vitals)
  }
})

const AgentTickQuery = Game.Query({
  selection: {
    position: Game.Query.write(Position),
    velocity: Game.Query.write(Velocity),
    agent: Game.Query.read(Agent),
    vitals: Game.Query.write(Vitals),
    intent: Game.Query.read(Intent)
  }
})

const FoodQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    food: Game.Query.read(Food)
  }
})

const AgentResolveQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    genes: Game.Query.read(Genes),
    agent: Game.Query.read(Agent),
    vitals: Game.Query.write(Vitals)
  }
})

const DespawnableQuery = Game.Query({
  selection: {
    renderable: Game.Query.read(Renderable)
  }
})

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

const lerp = (start: number, end: number, amount: number): number => start + (end - start) * amount

const wrap = (value: number, size: number): number => {
  if (value < 0) {
    return value + size
  }
  if (value >= size) {
    return value - size
  }
  return value
}

const formatGene = (value: number): string => value.toFixed(2)

const hueToHex = (hue: number, saturation: number, lightness: number): number => {
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

const makePopulationStats = (births: number): PopulationStatsValue => ({
  births,
  deaths: 0,
  peak: births
})

const makeRunningSummary = (): SummaryValue => ({
  mode: "running",
  title: "Selection pressure is live.",
  subtitle: "Food is scarce, hostile phenotypes chase weakness, and lingering in crowds raises risk.",
  champion: "Champions are decided at the end of the season.",
  dominantLineage: "Dominant lineage: evaluating"
})

const mulberry32 = (seed: number): number => {
  let next = seed + 0x6d2b79f5
  next = Math.imul(next ^ (next >>> 15), next | 1)
  next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
  return ((next ^ (next >>> 14)) >>> 0)
}

const randomUnit = (seed: number): { seed: number; value: number } => {
  const nextSeed = mulberry32(seed)
  return {
    seed: nextSeed,
    value: nextSeed / 0xffffffff
  }
}

const randomBetween = (seed: number, min: number, max: number): { seed: number; value: number } => {
  const next = randomUnit(seed)
  return {
    seed: next.seed,
    value: lerp(min, max, next.value)
  }
}

const normalizeVector = (x: number, y: number): { x: number; y: number; length: number } => {
  const length = Math.hypot(x, y)
  if (length <= 0.0001) {
    return {
      x: 0,
      y: 0,
      length: 0
    }
  }
  return {
    x: x / length,
    y: y / length,
    length
  }
}

const geneDistance = (left: GenesValue, right: GenesValue): number =>
  (
    Math.abs(left.speed - right.speed) +
    Math.abs(left.resilience - right.resilience) +
    Math.abs(left.attack - right.attack) +
    Math.abs(left.longevity - right.longevity) +
    Math.abs(left.sight - right.sight) +
    Math.abs(left.fertility - right.fertility) +
    Math.abs(left.aggression - right.aggression)
  ) / 7

const deriveShape = (genes: GenesValue): ShapeKind => {
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

const deriveAgentStats = (
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

const deriveRenderable = (kind: RenderKind, genes?: GenesValue, hue?: number) => {
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

const makeInitialGenes = (seed: number, base: GenesValue): { seed: number; genes: GenesValue } => {
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

const makeFounderPool = (seed: number, count: number): { seed: number; founders: ReadonlyArray<FounderSeed> } => {
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

const sampleFoundersFromSurvivors = (
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

const spawnFoodDraft = (position: { x: number; y: number }) =>
  Game.Command.spawnWith(
    [Position, position],
    [Velocity, { x: 0, y: 0 }],
    [Food, { nutrition: FOOD_ENERGY }],
    [Renderable, deriveRenderable("food")]
  )

const spawnAgentDraft = (
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

type AgentSnapshotMatch = {
  entity: {
    id: Entity.EntityId<typeof schema, typeof Root>
  }
  data: {
    position: {
      get(): { x: number; y: number }
    }
    genes: {
      get(): GenesValue
    }
    agent: {
      get(): AgentSnapshot["agent"]
    }
    vitals: {
      get(): AgentSnapshot["vitals"]
    }
  }
}

const collectAgentSnapshots = (matches: ReadonlyArray<AgentSnapshotMatch>): ReadonlyArray<AgentSnapshot> =>
  matches.map((match) => ({
    handle: Game.Entity.handleAs(Agent, match.entity.id),
    entityId: match.entity.id.value,
    position: match.data.position.get(),
    genes: match.data.genes.get(),
    agent: match.data.agent.get(),
    vitals: match.data.vitals.get()
  }))

const makeAgentNode = (
  renderable: {
    shape: ShapeKind
    color: number
    accent: number
    alpha: number
  },
  size: number
): Graphics => {
  const node = new Graphics()
  const radius = size

  if (renderable.shape === "circle") {
    node.circle(0, 0, radius)
  } else if (renderable.shape === "square") {
    node.roundRect(-radius, -radius, radius * 2, radius * 2, radius * 0.5)
  } else if (renderable.shape === "spike") {
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8 - Math.PI / 2
      const pointRadius = index % 2 === 0 ? radius * 1.34 : radius * 0.5
      const x = Math.cos(angle) * pointRadius
      const y = Math.sin(angle) * pointRadius
      if (index === 0) {
        node.moveTo(x, y)
      } else {
        node.lineTo(x, y)
      }
    }
    node.closePath()
  } else if (renderable.shape === "triangle") {
    node.moveTo(0, -radius * 1.2)
    node.lineTo(radius * 1.1, radius * 0.95)
    node.lineTo(-radius * 1.1, radius * 0.95)
    node.closePath()
  } else {
    node.moveTo(0, -radius * 1.2)
    node.lineTo(radius * 1.1, 0)
    node.lineTo(0, radius * 1.2)
    node.lineTo(-radius * 1.1, 0)
    node.closePath()
  }

  node.fill(renderable.color)
  node.stroke({
    color: renderable.accent,
    width: Math.max(2, radius * 0.22),
    alpha: 0.95
  })
  node.alpha = renderable.alpha
  return node
}

const makeFoodNode = (renderable: { color: number; accent: number; alpha: number }): Graphics => {
  const node = new Graphics()
  node.circle(0, 0, 4)
  node.fill(renderable.color)
  node.stroke({
    color: renderable.accent,
    width: 2,
    alpha: 0.9
  })
  node.alpha = renderable.alpha
  return node
}

const createBoard = (width: number, height: number): Graphics => {
  const board = new Graphics()
  board.roundRect(0, 0, width, height, 28)
  board.fill(0x0b1119)

  for (let x = 20; x < width; x += 40) {
    board.moveTo(x, 16)
    board.lineTo(x, height - 16)
  }
  for (let y = 20; y < height; y += 40) {
    board.moveTo(16, y)
    board.lineTo(width - 16, y)
  }

  board.stroke({
    color: 0x1d2a38,
    width: 1,
    alpha: 0.7
  })
  board.roundRect(0, 0, width, height, 28)
  board.stroke({
    color: 0x5bc0be,
    width: 2,
    alpha: 0.45
  })
  return board
}

const makeChip = (): HTMLSpanElement => {
  const chip = document.createElement("span")
  chip.style.padding = "8px 12px"
  chip.style.borderRadius = "999px"
  chip.style.border = "1px solid rgba(255,255,255,0.08)"
  chip.style.background = "rgba(6, 10, 14, 0.72)"
  chip.style.fontFamily = "\"IBM Plex Mono\", monospace"
  chip.style.fontSize = "12px"
  chip.style.letterSpacing = "0.06em"
  chip.style.textTransform = "uppercase"
  chip.style.color = "#e7edf2"
  return chip
}

const createHud = (): { root: HTMLDivElement; hud: BrowserHud } => {
  const root = document.createElement("div")
  root.style.position = "absolute"
  root.style.inset = "0"
  root.style.display = "grid"
  root.style.gridTemplateRows = "auto 1fr auto"
  root.style.pointerEvents = "none"

  const top = document.createElement("div")
  top.style.display = "flex"
  top.style.flexWrap = "wrap"
  top.style.gap = "10px"
  top.style.padding = "16px"

  const generation = makeChip()
  const alive = makeChip()
  const dominant = makeChip()
  const births = makeChip()
  const deaths = makeChip()
  const status = makeChip()
  top.append(generation, alive, dominant, births, deaths, status)

  const middle = document.createElement("div")
  middle.style.display = "grid"
  middle.style.placeItems = "center"
  middle.style.padding = "22px"
  middle.style.position = "relative"

  const scrim = document.createElement("div")
  scrim.style.position = "absolute"
  scrim.style.inset = "0"
  scrim.style.background = "linear-gradient(180deg, rgba(2,7,10,0.04), rgba(2,7,10,0.72))"
  scrim.style.opacity = "0"
  scrim.style.transition = "opacity 150ms ease"

  const overlay = document.createElement("div")
  overlay.style.position = "relative"
  overlay.style.display = "grid"
  overlay.style.gap = "10px"
  overlay.style.justifyItems = "center"
  overlay.style.maxWidth = "520px"
  overlay.style.padding = "22px 28px"
  overlay.style.borderRadius = "24px"
  overlay.style.background = "rgba(8, 12, 16, 0.52)"
  overlay.style.border = "1px solid rgba(255,255,255,0.08)"
  overlay.style.backdropFilter = "blur(10px)"
  overlay.style.textAlign = "center"
  overlay.style.opacity = "0"
  overlay.style.transition = "opacity 150ms ease"

  const title = document.createElement("h2")
  title.style.margin = "0"
  title.style.fontSize = "46px"
  title.style.lineHeight = "0.96"
  title.style.letterSpacing = "-0.05em"

  const subtitle = document.createElement("p")
  subtitle.style.margin = "0"
  subtitle.style.fontSize = "15px"
  subtitle.style.lineHeight = "1.6"
  subtitle.style.color = "#c2d1dd"

  const champion = document.createElement("p")
  champion.style.margin = "0"
  champion.style.fontFamily = "\"IBM Plex Mono\", monospace"
  champion.style.fontSize = "13px"
  champion.style.letterSpacing = "0.04em"
  champion.style.textTransform = "uppercase"
  champion.style.color = "#f7c948"

  const dominantLineage = document.createElement("p")
  dominantLineage.style.margin = "0"
  dominantLineage.style.fontSize = "13px"
  dominantLineage.style.color = "#dde8f0"

  overlay.append(title, subtitle, champion, dominantLineage)
  middle.append(scrim, overlay)

  const footer = document.createElement("p")
  footer.style.margin = "0"
  footer.style.padding = "0 18px 18px"
  footer.style.color = "#9fb4c3"
  footer.style.fontSize = "13px"
  footer.style.letterSpacing = "0.02em"
  footer.textContent = "Traits map to phenotype: sharper shapes are more aggressive, larger bodies are tougher, brighter tones live longer."

  root.append(top, middle, footer)

  return {
    root,
    hud: {
      generation,
      alive,
      dominant,
      births,
      deaths,
      status,
      title,
      subtitle,
      champion,
      dominantLineage,
      footer,
      scrim,
      overlay
    }
  }
}

const createBrowserHost = async (mount: HTMLElement) => {
  const application = new Application()
  await application.init({
    antialias: true,
    background: "#081018",
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

  const scene = new Container()
  application.stage.addChild(createBoard(STAGE_WIDTH, STAGE_HEIGHT))
  application.stage.addChild(scene)

  const { root, hud } = createHud()
  wrapper.appendChild(root)
  mount.replaceChildren(wrapper)

  return {
    host: {
      application,
      scene,
      nodes: new Map<number, Graphics>(),
      clock: {
        deltaSeconds: 1 / 60
      },
      hud
    } satisfies BrowserHostValue,
    async destroy() {
      for (const node of scene.children) {
        if (node instanceof Graphics) {
          node.destroy()
        }
      }
      application.destroy(true)
      mount.replaceChildren()
    }
  }
}

const SetupWorldSystem = Game.System(
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
      let seed = resources.rngSeed.get()

      for (let index = 0; index < INITIAL_FOOD_COUNT; index += 1) {
        const xDraw = randomBetween(seed, FOOD_MARGIN, arena.width - FOOD_MARGIN)
        seed = xDraw.seed
        const yDraw = randomBetween(seed, FOOD_MARGIN, arena.height - FOOD_MARGIN)
        seed = yDraw.seed
        commands.spawn(spawnFoodDraft({ x: xDraw.value, y: yDraw.value }))
      }

      const founders = resources.nextGeneration.get().founders
      for (const founder of founders) {
        const xDraw = randomBetween(seed, 42, arena.width - 42)
        seed = xDraw.seed
        const yDraw = randomBetween(seed, 42, arena.height - 42)
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

const ResetGenerationOnRunningEnterSystem = Game.System(
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

const CaptureFrameContextSystem = Game.System(
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

const TickGenerationClockSystem = Game.System(
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

const TickAgentVitalsSystem = Game.System(
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

const ChooseIntentSystem = Game.System(
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
            (
              predatorBias ||
              full ||
              genes.aggression >= 0.42 ||
              genes.attack >= 0.68 ||
              vitals.fullness > 0.38
            )
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

const ApplyMovementSystem = Game.System(
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
        const speed = lerp(22, 92, match.data.agent.get().moveCost / 11.6)
        const position = match.data.position.get()
        let velocityX = currentVelocity.x * 0.58 + normalized.x * speed * 0.42
        let velocityY = currentVelocity.y * 0.58 + normalized.y * speed * 0.42

        const velocity = {
          x: velocityX,
          y: velocityY
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

const ResolveFoodAndHazardSystem = Game.System(
  "GeneticsArena/ResolveFoodAndHazard",
  {
    when: [Game.Condition.inState(SimulationPhase, "Running")],
    queries: {
      agents: AgentTickQuery,
      foods: FoodQuery
    },
    resources: {
      deltaTime: Game.System.readResource(DeltaTime)
    }
  },
  ({ queries, commands, resources }) =>
    Fx.sync(() => {
      const dt = resources.deltaTime.get()
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

const ResolveAgentInteractionsSystem = Game.System(
  "GeneticsArena/ResolveAgentInteractions",
  {
    when: [Game.Condition.inState(SimulationPhase, "Running")],
    queries: {
      agents: AgentSnapshotQuery
    },
    resources: {
      deltaTime: Game.System.readResource(DeltaTime),
      generationIndex: Game.System.readResource(GenerationIndex),
      rngSeed: Game.System.writeResource(RngSeed),
      populationStats: Game.System.writeResource(PopulationStats)
    }
  },
  ({ queries, resources, commands, lookup }) =>
    Fx.sync(() => {
      const dt = resources.deltaTime.get()
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

          const leftLive = lookup.getHandle(left.handle, AgentResolveQuery)
          const rightLive = lookup.getHandle(right.handle, AgentResolveQuery)
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
              const founder: FounderSeed = {
                lineageId: lineage.value >= 0.5 ? left.agent.lineageId : right.agent.lineageId,
                speciesHue: clamp(lerp(left.agent.speciesHue, right.agent.speciesHue, 0.5) + hueMutation.value, 0, 359),
                genes: childGenes
              }
              const offsetX = randomBetween(seed, -18, 18)
              seed = offsetX.seed
              const offsetY = randomBetween(seed, -18, 18)
              seed = offsetY.seed
              commands.spawn(
                spawnAgentDraft(
                  founder,
                  {
                    x: clamp((left.position.x + right.position.x) * 0.5 + offsetX.value, 20, STAGE_WIDTH - 20),
                    y: clamp((left.position.y + right.position.y) * 0.5 + offsetY.value, 20, STAGE_HEIGHT - 20)
                  },
                  resources.generationIndex.get(),
                  randomBetween(seed, 0, Math.PI * 2).value
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

          if (
            hostile &&
            distance <= Math.max(left.agent.attackRange, right.agent.attackRange) + ATTACK_CONTACT_PADDING
          ) {
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

const CleanupDeadAgentsSystem = Game.System(
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

const MaintainFoodSystem = Game.System(
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
      const spawnRoll = randomUnit(seed)
      seed = spawnRoll.seed
      if (spawnRoll.value < 0.48) {
        resources.rngSeed.set(seed)
        return
      }

      const deficit = FOOD_TARGET - foods.length
      const refillCount = Math.min(deficit, 3)
      for (let index = 0; index < refillCount; index += 1) {
        const xDraw = randomBetween(seed, FOOD_MARGIN, arena.width - FOOD_MARGIN)
        seed = xDraw.seed
        const yDraw = randomBetween(seed, FOOD_MARGIN, arena.height - FOOD_MARGIN)
        seed = yDraw.seed
        commands.spawn(spawnFoodDraft({ x: xDraw.value, y: yDraw.value }))
      }
      resources.rngSeed.set(seed)
    })
)

const QueuePhaseOutcomeSystem = Game.System(
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

const TickTransitionStateSystem = Game.System(
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

const QueueResumeSystem = Game.System(
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

const CreateRenderNodesSystem = Game.System(
  "GeneticsArena/CreateRenderNodes",
  {
    queries: {
      renderables: AddedRenderableQuery
    },
    services: {
      browser: Game.System.service(BrowserHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      for (const match of queries.renderables.each()) {
        if (services.browser.nodes.has(match.entity.id.value)) {
          continue
        }

        const renderable = match.data.renderable.get()
        const agent = match.data.agent.present ? match.data.agent.get() : null
        const node =
          renderable.kind === "food"
            ? makeFoodNode(renderable)
            : makeAgentNode(renderable, agent?.size ?? 8)

        services.browser.scene.addChild(node)
        services.browser.nodes.set(match.entity.id.value, node)
      }
    })
)

const SyncRenderNodesSystem = Game.System(
  "GeneticsArena/SyncRenderNodes",
  {
    queries: {
      renderables: LiveRenderableQuery
    },
    services: {
      browser: Game.System.service(BrowserHost)
    }
  },
  ({ queries, services }) =>
    Fx.sync(() => {
      const live = new Set<number>()

      for (const match of queries.renderables.each()) {
        const id = match.entity.id.value
        live.add(id)
        let node = services.browser.nodes.get(id)
        if (!node) {
          const renderable = match.data.renderable.get()
          const agent = match.data.agent.present ? match.data.agent.get() : null
          node =
            renderable.kind === "food"
              ? makeFoodNode(renderable)
              : makeAgentNode(renderable, agent?.size ?? 8)
          services.browser.scene.addChild(node)
          services.browser.nodes.set(id, node)
        }

        const position = match.data.position.get()
        node.position.set(position.x, position.y)

        const agent = match.data.agent.present ? match.data.agent.get() : null
        const vitals = match.data.vitals.present ? match.data.vitals.get() : null
        if (agent && vitals) {
          node.rotation += (vitals.pulse - 1) * 0.03
          node.scale.set(vitals.pulse, vitals.pulse)
          node.alpha = clamp(match.data.renderable.get().alpha + (agent.maxHealth - vitals.health) / agent.maxHealth * 0.06, 0.45, 1)
        }
      }

      for (const [entityId, node] of services.browser.nodes) {
        if (live.has(entityId)) {
          continue
        }

        services.browser.scene.removeChild(node)
        node.destroy()
        services.browser.nodes.delete(entityId)
      }
    })
)

const SyncHudSystem = Game.System(
  "GeneticsArena/SyncHud",
  {
    queries: {
      agents: AgentSnapshotQuery
    },
    resources: {
      generationIndex: Game.System.readResource(GenerationIndex),
      populationStats: Game.System.readResource(PopulationStats),
      summary: Game.System.readResource(Summary),
      generationClock: Game.System.readResource(GenerationClock)
    },
    machines: {
      phase: Game.System.machine(SimulationPhase)
    },
    services: {
      browser: Game.System.service(BrowserHost)
    }
  },
  ({ queries, resources, machines, services }) =>
    Fx.sync(() => {
      const hud = services.browser.hud
      const summary = resources.summary.get()
      const agents = collectAgentSnapshots(queries.agents.each())
      const stats = resources.populationStats.get()
      const counts = new Map<number, number>()

      for (const agent of agents) {
        counts.set(agent.agent.lineageId, (counts.get(agent.agent.lineageId) ?? 0) + 1)
      }

      let dominantLabel = "none"
      let dominantCount = 0
      for (const [lineageId, count] of counts) {
        if (count > dominantCount) {
          dominantLabel = String(lineageId)
          dominantCount = count
        }
      }

      hud.generation.textContent = `Generation ${resources.generationIndex.get()}`
      hud.alive.textContent = `${agents.length} alive`
      hud.dominant.textContent = `lineage ${dominantLabel}`
      hud.births.textContent = `${stats.births} births`
      hud.deaths.textContent = `${stats.deaths} deaths`
      hud.status.textContent =
        machines.phase.get() === "Running"
          ? `${Math.max(0, resources.generationClock.get().limit - resources.generationClock.get().elapsed).toFixed(1)}s left`
          : `${resources.generationClock.get().transitionTimer.toFixed(1)}s`

      hud.title.textContent = summary.title
      hud.subtitle.textContent = summary.subtitle
      hud.champion.textContent = summary.champion
      hud.dominantLineage.textContent = summary.dominantLineage

      const overlayVisible = summary.mode !== "running"
      hud.scrim.style.opacity = overlayVisible ? "1" : "0"
      hud.overlay.style.opacity = overlayVisible ? "1" : "0"
      hud.footer.textContent =
        summary.mode === "running"
          ? "Traits map to phenotype: sharper shapes are more aggressive, larger bodies are tougher, brighter tones live longer."
          : "The next generation is seeded from survivors unless the arena fully collapses, in which case the ecosystem reseeds from fresh founders."
    })
)

const runningEntry = Game.Schedule.fragment({
  entries: [
    ResetGenerationOnRunningEnterSystem,
    Game.Schedule.applyDeferred(),
    SetupWorldSystem
  ]
})

const stateTransitions = Game.Schedule.transitions(
  Game.Schedule.onEnter(SimulationPhase, "Running", [runningEntry])
)

const setupSchedule = Game.Schedule(
  SetupWorldSystem,
  Game.Schedule.applyDeferred(),
  Game.Schedule.updateLifecycle(),
  CreateRenderNodesSystem,
  SyncRenderNodesSystem,
  SyncHudSystem
)

const updateSchedule = Game.Schedule(
  CaptureFrameContextSystem,
  TickGenerationClockSystem,
  TickAgentVitalsSystem,
  ChooseIntentSystem,
  ApplyMovementSystem,
  ResolveFoodAndHazardSystem,
  ResolveAgentInteractionsSystem,
  CleanupDeadAgentsSystem,
  MaintainFoodSystem,
  QueuePhaseOutcomeSystem,
  TickTransitionStateSystem,
  QueueResumeSystem,
  Game.Schedule.applyStateTransitions(stateTransitions),
  Game.Schedule.applyDeferred(),
  Game.Schedule.updateLifecycle(),
  CreateRenderNodesSystem,
  SyncRenderNodesSystem,
  SyncHudSystem
)

const createRuntime = (browser: BrowserHostValue) => {
  const initialPool = makeFounderPool(0x1f123bb, FOUNDER_COUNT)

  return Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(BrowserHost, browser)
    ),
    resources: {
      DeltaTime: 1 / 60,
      Arena: {
        width: browser.application.screen.width,
        height: browser.application.screen.height
      },
      GenerationClock: {
        elapsed: 0,
        limit: GENERATION_DURATION_SECONDS,
        transitionTimer: SUMMARY_DURATION_SECONDS
      },
      GenerationIndex: 1,
      RngSeed: initialPool.seed,
      PopulationStats: makePopulationStats(FOUNDER_COUNT),
      Summary: makeRunningSummary(),
      NextGeneration: {
        founders: initialPool.founders,
        cause: "initial"
      }
    },
    machines: Game.Runtime.machines(
      Game.Runtime.machine(SimulationPhase, "Running")
    )
  })
}

export const startGeneticsExample = async (mount: HTMLElement): Promise<BrowserExampleHandle> => {
  const browserHost = await createBrowserHost(mount)
  const runtime = createRuntime(browserHost.host)
  runtime.initialize(setupSchedule)

  const tick = (ticker: { readonly deltaMS: number }) => {
    browserHost.host.clock.deltaSeconds = Math.min(ticker.deltaMS / 1000, 0.05)
    runtime.runSchedule(updateSchedule)
  }

  browserHost.host.application.ticker.add(tick)

  return {
    async destroy() {
      browserHost.host.application.ticker.remove(tick)
      for (const node of browserHost.host.nodes.values()) {
        browserHost.host.scene.removeChild(node)
        node.destroy()
      }
      browserHost.host.nodes.clear()
      await browserHost.destroy()
    }
  }
}
