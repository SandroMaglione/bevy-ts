/**
 * The top-down game without a browser: the simulation schedules on a
 * runtime that needs only a keyboard and a frame context, with the debug
 * handle attached.
 *
 * Tests, benchmarks, and coding agents drive it directly:
 *
 * ```ts
 * const keyboard = Keyboard.scripted(inputBindings, [{ frame: 0, press: ["right"] }])
 * const simulation = createTopDownSimulation({ keyboard })
 * if (simulation.ok) {
 *   simulation.value.runtime.tick(simulation.value.setup)
 *   simulation.value.runtime.tick(simulation.value.update)
 * }
 * ```
 */
import * as Result from "@typeonce/bevy-ts/Result"

import { FIXED_STEP_SECONDS } from "./constants.ts"
import { describeRuntimeError, initialMachines, initialResources } from "./runtime.ts"
import { FrameContext, Game, KeyboardInput } from "./schema.ts"
import { setupWorldSchedule, simulationSchedule } from "./schedules.ts"
import type { FrameContextValue, KeyboardInput as KeyboardInputValue } from "./types.ts"

export interface TopDownSimulationOptions {
  readonly keyboard: KeyboardInputValue
  /** Defaults to one fixed step on a 1280x720 viewport. */
  readonly frame?: FrameContextValue
}

export const defaultFrameContext: FrameContextValue = {
  deltaSeconds: FIXED_STEP_SECONDS,
  viewport: { width: 1280, height: 720 }
}

export const createTopDownSimulation = (options: TopDownSimulationOptions) => {
  const frame = options.frame ?? defaultFrameContext
  const made = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(KeyboardInput, options.keyboard),
      Game.Runtime.service(FrameContext, frame)
    ),
    resources: initialResources(frame),
    machines: initialMachines(),
    debug: true
  })
  return Result.match(made, {
    onSuccess: (runtime) => {
      runtime.debug.nameSchedules({ setup: setupWorldSchedule, update: simulationSchedule })
      return Result.success({ runtime, setup: setupWorldSchedule, update: simulationSchedule })
    },
    onFailure: (error) => Result.failure({ message: describeRuntimeError(error) })
  })
}
