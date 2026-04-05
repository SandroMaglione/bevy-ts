import {
  FOUNDER_COUNT,
  GENERATION_DURATION_SECONDS,
  SUMMARY_DURATION_SECONDS
} from "./constants.ts"
import { makeFounderPool, makePopulationStats, makeRunningSummary } from "./logic.ts"
import { BrowserHost, Game, SimulationPhase } from "./schema.ts"
import type { BrowserHostValue } from "./types.ts"

export const createGeneticsRuntime = (browser: BrowserHostValue) => {
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
