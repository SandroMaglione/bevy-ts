#!/usr/bin/env node
/**
 * `bevy-ts-devtools`: devtools from the command line.
 *
 *   bevy-ts-devtools lint <entry>
 *
 * Imports `<entry>` (a module exporting `lintTarget`, see the `Lint` module),
 * prints every lint of its schedules with its fix, and exits with 1 when one
 * is a warning. Info-level lints are printed and do not fail.
 *
 * @module cli
 * @docGroup devtools
 */
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

import * as Lint from "./Lint.ts"

const usage = "usage: bevy-ts-devtools lint <entry>\n  <entry> exports lintTarget: () => { runtime, schedules, describe?, hostEvents? } (see the Lint module)"

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

/** Checks at runtime what the type of `lintTarget`'s result promises, so a wrong entry fails with a message. */
const isTarget = (value: unknown): value is Lint.Target<any, any> =>
  isRecord(value)
  && isRecord(value["runtime"])
  && isRecord(value["runtime"]["debug"])
  && typeof value["runtime"]["debug"]["describe"] === "function"
  && isRecord(value["schedules"])
  && (value["describe"] === undefined || isRecord(value["describe"]))
  && (value["hostEvents"] === undefined || Array.isArray(value["hostEvents"]))

const main = async (args: ReadonlyArray<string>): Promise<number> => {
  const [command, entry] = args
  if (command !== "lint" || entry === undefined) {
    console.error(usage)
    return 2
  }
  const loaded: unknown = await import(pathToFileURL(resolve(entry)).href)
  const make = isRecord(loaded) ? loaded["lintTarget"] : undefined
  if (typeof make !== "function") {
    console.error(`${entry} must export lintTarget: a function returning { runtime, schedules, describe? } (see the Lint module)`)
    return 2
  }
  const target: unknown = await make()
  if (!isTarget(target)) {
    console.error(`lintTarget in ${entry} must return { runtime, schedules, describe? } with a runtime made with debug: true`)
    return 2
  }
  const report = Lint.run(target)
  console.log(report.text)
  return report.data.ok ? 0 : 1
}

process.exitCode = await main(process.argv.slice(2))
