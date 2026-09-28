import { MAX_DELTA_SECONDS } from "./constants.ts"
import { createGeneticsBrowserHost } from "./host.ts"
import { createGeneticsRuntime } from "./runtime.ts"
import { setupSchedule, updateSchedule } from "./schedules.ts"

interface BrowserExampleHandle {
  destroy(): Promise<void>
}

export const startGeneticsExample = async (mount: HTMLElement): Promise<BrowserExampleHandle> => {
  const browserHost = await createGeneticsBrowserHost(mount)
  const runtime = createGeneticsRuntime(browserHost.host, browserHost.nodes)
  runtime.tick(setupSchedule)

  const tick = (ticker: { readonly deltaMS: number }) => {
    browserHost.host.clock.deltaSeconds = Math.min(ticker.deltaMS / 1000, MAX_DELTA_SECONDS)
    runtime.tick(updateSchedule)
  }

  browserHost.host.application.ticker.add(tick)

  return {
    async destroy() {
      browserHost.host.application.ticker.remove(tick)
      await browserHost.destroy()
    }
  }
}
