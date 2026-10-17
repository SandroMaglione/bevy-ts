/**
 * A `Replay.Sink` for Node: each saved replay becomes a JSON file in a
 * directory. For headless runs (bots, scripts) that record replays.
 *
 * @module ReplayNodeSink
 * @docGroup devtools
 *
 * @example
 * ```ts
 * const recorder = Replay.recorder(runtime, { ..., sink: ReplayNodeSink.make({ directory: ".replays" }) })
 * ```
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type * as Replay from "./Replay.ts"

/** Where the last replay was written, and every path written so far. */
export interface NodeSink extends Replay.Sink {
  readonly written: ReadonlyArray<string>
}

/** The file name of a replay: its save time, then its tick count. */
export const fileName = (file: Replay.ReplayFile): string =>
  `${new Date(file.savedAt).toISOString().replaceAll(":", "-")}-tick-${file.ticks.at(-1)?.tick ?? file.start.tick}.json`

export const make = (options: { readonly directory: string }): NodeSink => {
  const written: Array<string> = []
  return {
    written,
    save: (file) => {
      mkdirSync(options.directory, { recursive: true })
      const path = join(options.directory, fileName(file))
      writeFileSync(path, `${JSON.stringify(file)}\n`)
      written.push(path)
    }
  }
}
