import { clamp } from "../../../src/internal/scalar.ts"
import { Fx } from "../../../src/index.ts"

import { AddedRenderableQuery, AgentSnapshotQuery, BrowserHost, Game, GenerationClock, GenerationIndex, LiveRenderableQuery, PopulationStats, SimulationPhase, Summary } from "../schema.ts"
import { collectAgentSnapshots } from "../logic.ts"
import { makeAgentNode, makeFoodNode } from "../render/nodes.ts"

export const CreateRenderNodesSystem = Game.System(
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

export const SyncRenderNodesSystem = Game.System(
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
