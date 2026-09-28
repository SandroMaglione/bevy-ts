
import { RenderSync } from "@bevy-ts/pixi"
import { clamp } from "../math.ts"
import { Agent, AgentSnapshotQuery, BrowserHost, ChangedAgentVitalsQuery, Game, GenerationClock, GenerationIndex, PopulationStats, Position, RenderNodes, Renderable, SimulationPhase, Summary } from "../schema.ts"
import { collectAgentSnapshots } from "../logic.ts"
import { makeAgentNode, makeFoodNode } from "../render/nodes.ts"

const render = RenderSync.system(Game, {
  name: "GeneticsArena/Render",
  renderable: Renderable,
  transform: Position,
  registry: RenderNodes,
  select: { agent: Game.Query.optional(Agent) },
  create: ({ renderable, data }) =>
    renderable.kind === "food"
      ? makeFoodNode(renderable)
      : makeAgentNode(renderable, data.agent.present ? data.agent.get().size : 8),
  apply: (node, { transform }) => node.position.set(transform.x, transform.y)
})

export const RenderNodesSystem = render

// Vitals pulse every frame, independently of movement.
export const AnimateAgentNodesSystem = Game.System(
  "GeneticsArena/AnimateAgentNodes",
  {
    queries: {
      agents: ChangedAgentVitalsQuery
    },
    services: {
      nodes: Game.System.service(RenderNodes)
    }
  },
  ({ queries, services }) =>
    {
      for (const match of queries.agents.each()) {
        const node = services.nodes.get(match.entity.id)
        if (!node) {
          continue
        }

        const agent = match.data.agent.get()
        const vitals = match.data.vitals.get()
        node.rotation += (vitals.pulse - 1) * 0.03
        node.scale.set(vitals.pulse, vitals.pulse)
        node.alpha = clamp(match.data.renderable.get().alpha + (agent.maxHealth - vitals.health) / agent.maxHealth * 0.06, 0.45, 1)
      }
    }
)

export const SyncHudSystem = Game.System(
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
    {
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
    }
)
