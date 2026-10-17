/**
 * A `Replay.Sink` for a page served by Vite in development: each saved
 * replay is posted to the dev server, where `ReplayVitePlugin` writes it
 * into the game's repository (`.replays/`). The page's `fetch` is passed in.
 *
 * @module ReplayViteSink
 * @docGroup devtools
 *
 * @example
 * ```ts
 * if (import.meta.env.DEV) {
 *   const sink = ReplayViteSink.make({ fetch: (url, init) => fetch(url, init) })
 * }
 * ```
 */
import type * as Replay from "./Replay.ts"

/** The dev server's endpoint for replays (what `ReplayVitePlugin` serves). */
export const endpoint = "/__ritmo/replays"

export interface Options {
  /** The page's `fetch` (or any function with its shape for these two arguments). */
  readonly fetch: (url: string, init: { readonly method: "POST"; readonly headers: Readonly<Record<string, string>>; readonly body: string }) => Promise<unknown>
  /** Called when a post fails (the dev server is down, the plugin is not installed). */
  readonly onError?: (error: unknown) => void
}

export const make = (options: Options): Replay.Sink => ({
  save: (file) => {
    void options.fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(file) })
      .catch((error: unknown) => options.onError?.(error))
  }
})
