import { createStateMachineBrowserHost } from "./host.ts"
import { createStateMachineRuntime } from "./runtime.ts"
import { setupSchedule, updateSchedule } from "./schedules.ts"

interface BrowserExampleHandle {
  destroy(): Promise<void>
}

const failedHandle = (): BrowserExampleHandle => ({
  async destroy() {}
})

export const startStateMachineExample = async (mount: HTMLElement): Promise<BrowserExampleHandle> => {
  const browserHost = await createStateMachineBrowserHost(mount)
  const runtime = createStateMachineRuntime(browserHost.host, browserHost.inputManager)
  if (!runtime.ok) {
    await browserHost.destroy()
    mount.textContent = runtime.error.message
    return failedHandle()
  }
  runtime.value.initialize(setupSchedule)

  const tick = (ticker: { readonly deltaMS: number }) => {
    browserHost.host.clock.deltaSeconds = Math.min(ticker.deltaMS / 1000, 0.05)
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
