import type { BrowserExampleHandle } from "../pixi.ts"
import { createStateMachineBrowserHost } from "./host.ts"
import { createStateMachineRuntime } from "./runtime.ts"
import { setupSchedule, updateSchedule } from "./schedules.ts"

export const startStateMachineExample = async (mount: HTMLElement): Promise<BrowserExampleHandle> => {
  const browserHost = await createStateMachineBrowserHost(mount)
  const runtime = createStateMachineRuntime(browserHost.host, browserHost.inputManager)
  runtime.initialize(setupSchedule)

  const tick = (ticker: { readonly deltaMS: number }) => {
    browserHost.host.clock.deltaSeconds = Math.min(ticker.deltaMS / 1000, 0.05)
    runtime.runSchedule(updateSchedule)
  }

  browserHost.host.application.ticker.add(tick)

  return {
    async destroy() {
      browserHost.host.application.ticker.remove(tick)
      await browserHost.destroy()
    }
  }
}
