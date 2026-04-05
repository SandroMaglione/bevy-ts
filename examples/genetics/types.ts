import type { Application, Container, Graphics } from "pixi.js"

export type GeneValue = number

export type GenesValue = {
  speed: GeneValue
  resilience: GeneValue
  attack: GeneValue
  longevity: GeneValue
  sight: GeneValue
  fertility: GeneValue
  aggression: GeneValue
}

export type FounderSeed = {
  lineageId: number
  speciesHue: number
  genes: GenesValue
}

export type SummaryValue = {
  mode: "running" | "summary" | "extinction"
  title: string
  subtitle: string
  champion: string
  dominantLineage: string
}

export type Phase = "Running" | "GenerationSummary" | "Extinction"
export type IntentKind = "wander" | "seekFood" | "seekMate" | "attack" | "flee"
export type ShapeKind = "circle" | "square" | "triangle" | "diamond" | "spike"
export type RenderKind = "agent" | "food" | "hazard"

export type PopulationStatsValue = {
  births: number
  deaths: number
  peak: number
}

export type ArenaValue = {
  width: number
  height: number
}

export type BrowserHud = {
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

export type BrowserHostValue = {
  application: Application
  scene: Container
  nodes: Map<number, Graphics>
  clock: {
    deltaSeconds: number
  }
  hud: BrowserHud
}

export type AgentSnapshot = {
  handle: unknown
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
    matePartner: { value: number } | null
    attackCooldown: number
    bondProgress: number
    children: number
    pulse: number
  }
}
