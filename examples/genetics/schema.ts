import { Descriptor, Entity, Schema } from "../../src/index.ts"
import type {
  ArenaValue,
  BrowserHostValue,
  FounderSeed,
  GenesValue,
  IntentKind,
  PopulationStatsValue,
  RenderKind,
  ShapeKind,
  SummaryValue
} from "./types.ts"

export const Root = Schema.defineRoot("GeneticsArena")

export const Position = Descriptor.Component<{ x: number; y: number }>()("GeneticsArena/Position")
export const Velocity = Descriptor.Component<{ x: number; y: number }>()("GeneticsArena/Velocity")
export const Genes = Descriptor.Component<GenesValue>()("GeneticsArena/Genes")
export const Agent = Descriptor.Component<{
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
export const Vitals = Descriptor.Component<{
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
export const Behavior = Descriptor.Component<{
  wanderAngle: number
  wanderTimer: number
  intentMemoryX: number
  intentMemoryY: number
}>()("GeneticsArena/Behavior")
export const Intent = Descriptor.Component<{
  kind: IntentKind
  x: number
  y: number
}>()("GeneticsArena/Intent")
export const Renderable = Descriptor.Component<{
  kind: RenderKind
  shape: ShapeKind
  color: number
  accent: number
  alpha: number
}>()("GeneticsArena/Renderable")
export const Food = Descriptor.Component<{
  nutrition: number
}>()("GeneticsArena/Food")
export const DeltaTime = Descriptor.Resource<number>()("GeneticsArena/DeltaTime")
export const Arena = Descriptor.Resource<ArenaValue>()("GeneticsArena/Arena")
export const GenerationClock = Descriptor.Resource<{
  elapsed: number
  limit: number
  transitionTimer: number
}>()("GeneticsArena/GenerationClock")
export const GenerationIndex = Descriptor.Resource<number>()("GeneticsArena/GenerationIndex")
export const RngSeed = Descriptor.Resource<number>()("GeneticsArena/RngSeed")
export const PopulationStats = Descriptor.Resource<PopulationStatsValue>()("GeneticsArena/PopulationStats")
export const Summary = Descriptor.Resource<SummaryValue>()("GeneticsArena/Summary")
export const NextGeneration = Descriptor.Resource<{
  founders: ReadonlyArray<FounderSeed>
  cause: "initial" | "survivors" | "extinction"
}>()("GeneticsArena/NextGeneration")

export const BrowserHost = Descriptor.Service<BrowserHostValue>()("GeneticsArena/BrowserHost")

export const Game = Schema.bind(
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

export const schema = Game.schema
export const SimulationPhase = Game.StateMachine("SimulationPhase", ["Running", "GenerationSummary", "Extinction"] as const)

export const AddedRenderableQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    renderable: Game.Query.read(Renderable),
    agent: Game.Query.optional(Agent),
    vitals: Game.Query.optional(Vitals)
  },
  filters: [Game.Query.added(Renderable)]
})

export const LiveRenderableQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    renderable: Game.Query.read(Renderable),
    agent: Game.Query.optional(Agent),
    vitals: Game.Query.optional(Vitals)
  }
})

export const AgentDecisionQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    genes: Game.Query.read(Genes),
    agent: Game.Query.read(Agent),
    vitals: Game.Query.read(Vitals),
    behavior: Game.Query.write(Behavior),
    intent: Game.Query.write(Intent)
  }
})

export const AgentSnapshotQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    genes: Game.Query.read(Genes),
    agent: Game.Query.read(Agent),
    vitals: Game.Query.read(Vitals)
  }
})

export const AgentTickQuery = Game.Query({
  selection: {
    position: Game.Query.write(Position),
    velocity: Game.Query.write(Velocity),
    agent: Game.Query.read(Agent),
    vitals: Game.Query.write(Vitals),
    intent: Game.Query.read(Intent)
  }
})

export const FoodQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    food: Game.Query.read(Food)
  }
})

export const AgentResolveQuery = Game.Query({
  selection: {
    position: Game.Query.read(Position),
    genes: Game.Query.read(Genes),
    agent: Game.Query.read(Agent),
    vitals: Game.Query.write(Vitals)
  }
})

export const DespawnableQuery = Game.Query({
  selection: {
    renderable: Game.Query.read(Renderable)
  }
})
