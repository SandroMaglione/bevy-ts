import type { BrowserExampleHandle } from "../pixi.ts"
import type { ScheduleDefinition } from "../../schedule.ts"
import { MAX_DELTA_SECONDS } from "./constants.ts"
import { createTopDownBrowserHost } from "./host.ts"
import { createTopDownRuntime } from "./runtime.ts"
import { setupSchedule, updateSchedule } from "./schedules.ts"

type AnyExecutableSchedule = ScheduleDefinition<any, any, any>

export const startTopDownExample = async (mount: HTMLElement): Promise<BrowserExampleHandle> => {
  const browserHost = await createTopDownBrowserHost(mount)
  const runtime = createTopDownRuntime(browserHost.host, browserHost.inputManager)

  const bootstrap = runtime.initialize as (schedule: AnyExecutableSchedule) => void
  const runFrame = runtime.runSchedule as (schedule: AnyExecutableSchedule) => void

  bootstrap(setupSchedule as never)

  const tick = (ticker: { readonly deltaMS: number }) => {
    browserHost.host.clock.deltaSeconds = Math.min(ticker.deltaMS / 1000, MAX_DELTA_SECONDS)
    runFrame(updateSchedule as never)
  }

  browserHost.host.application.ticker.add(tick)

  return {
    async destroy() {
      browserHost.host.application.ticker.remove(tick)
      await browserHost.destroy()
    }
  }
}
