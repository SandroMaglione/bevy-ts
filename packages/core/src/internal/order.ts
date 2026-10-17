/**
 * The runtime form of the `Game.System.thisTick` check, for erased schedules
 * (`tryTick`) and the `this-tick-order` lint. The compile-time form lives in
 * `Schedule.ts` (`TickOrderErrors`) and produces the same messages.
 */
import type { Descriptor } from "../Descriptor.ts"
import * as Schedule from "../Schedule.ts"
import type { SystemDefinition } from "../System.ts"

type AnySystem = SystemDefinition<any, any, any, any, any>
type OrderIssue = Schedule.OrderIssue
type Access = { readonly mode: "read" | "write"; readonly descriptor: Descriptor.Any; readonly thisTick?: true }


const accesses = (system: AnySystem): ReadonlyArray<Access> => [
  ...Object.values(system.spec.events as Record<string, Access>),
  ...Object.values(system.spec.resources as Record<string, Access>)
]

const sameData = (left: Descriptor.Any, right: Descriptor.Any): boolean =>
  left.kind === right.kind && left.name === right.name

/**
 * Checks the systems of one tick, in the order they run. Events in `sent`
 * (published with `runtime.send` before the tick) count as already written.
 */
export const tickOrderIssues = (
  steps: ReadonlyArray<Schedule.ScheduleStep>,
  sent: ReadonlySet<string>
): Array<OrderIssue> => {
  const systems = steps.filter(Schedule.isSystemStep) as ReadonlyArray<AnySystem>
  const issues: Array<OrderIssue> = []
  systems.forEach((reader, index) => {
    for (const read of accesses(reader)) {
      if (read.mode !== "read" || read.thisTick !== true) continue
      const data = read.descriptor.name
      const writers = systems
        .map((system, at) => ({ system, at }))
        .filter(({ system }) => (system.base ?? system) !== (reader.base ?? reader)
          && accesses(system).some((access) => access.mode === "write" && sameData(access.descriptor, read.descriptor)))
      const late = writers.filter(({ at }) => at > index)
      for (const { system } of late) {
        issues.push({
          kind: "lateWriter",
          reader: reader.name,
          data,
          writer: system.name,
          message: `${reader.name} needs ${data} from this tick, but its writer ${system.name} runs after it: move ${system.name} before ${reader.name}, or read ${data} without thisTick`
        })
      }
      const sentBefore = read.descriptor.kind === "event" && sent.has(data)
      if (writers.length === 0 && !sentBefore) {
        issues.push({
          kind: "missingWriter",
          reader: reader.name,
          data,
          message: `${reader.name} needs ${data} from this tick, but no system in this tick writes it: add a writer before ${reader.name} in the same runtime.tick(...) call, or read ${data} without thisTick`
        })
      }
    }
  })
  return issues
}
