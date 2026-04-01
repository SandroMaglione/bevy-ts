import type { BrowserExampleHandle } from "../pixi.ts"
import { MAX_DELTA_SECONDS } from "./constants.ts"
import { createTopDownBrowserHost } from "./host.ts"
import { createTopDownRuntime } from "./runtime.ts"
import { setupSchedule, updateSchedule } from "./schedules.ts"

const failedHandle = (): BrowserExampleHandle => ({
  async destroy() {}
})

export const startTopDownExample = async (mount: HTMLElement): Promise<BrowserExampleHandle> => {
  const browserHost = await createTopDownBrowserHost(mount)
  const runtime = createTopDownRuntime(browserHost.host, browserHost.inputManager)
  if (!runtime.ok) {
    await browserHost.destroy()
    mount.textContent = runtime.error.message
    return failedHandle()
  }
  runtime.value.initialize(setupSchedule)

  const tick = (ticker: { readonly deltaMS: number }) => {
    browserHost.host.clock.deltaSeconds = Math.min(ticker.deltaMS / 1000, MAX_DELTA_SECONDS)
    runtime.value.runSchedule(updateSchedule)
  }

  browserHost.host.application.ticker.add(tick)

  return {
    async destroy() {
      browserHost.host.application.ticker.remove(tick)
      await browserHost.destroy()
    }
  }
}
