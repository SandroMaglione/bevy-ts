import { FixedLoop } from "@bevy-ts/browser"

import { FIXED_STEP_SECONDS, MAX_FRAME_SECONDS, MAX_STEPS_PER_FRAME } from "./constants.ts"
import { createTopDownBrowserHost } from "./host.ts"
import { createTopDownRuntime } from "./runtime.ts"
import { setupSchedule, updateSchedule } from "./schedules.ts"

interface BrowserExampleHandle {
  destroy(): Promise<void>
}

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

  const loop = FixedLoop.start({
    source: FixedLoop.source((onTick) => {
      const tick = (ticker: { readonly deltaMS: number }) => onTick(ticker)
      browserHost.host.application.ticker.add(tick)
      return {
        stop: () => browserHost.host.application.ticker.remove(tick)
      }
    }),
    stepSeconds: FIXED_STEP_SECONDS,
    maxFrameSeconds: MAX_FRAME_SECONDS,
    maxStepsPerFrame: MAX_STEPS_PER_FRAME,
    update: (stepSeconds) => {
      browserHost.host.clock.deltaSeconds = stepSeconds
      return runtime.value.runSchedule(updateSchedule)
    },
    render: () => {},
    onFailure: (failure) => {
      mount.textContent = failure.kind === "InvalidTickDelta"
        ? `Invalid frame delta: ${failure.deltaMS}`
        : "The game update stopped after an expected system failure."
    }
  })

  if (!loop.ok) {
    await browserHost.destroy()
    mount.textContent = `Invalid fixed-loop option: ${loop.error.field}`
    return failedHandle()
  }

  return {
    async destroy() {
      loop.value.stop()
      await browserHost.destroy()
    }
  }
}
