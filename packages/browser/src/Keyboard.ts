/**
 * Keyboard input as caller-named actions.
 *
 * Games bind actions to keys once and read one snapshot per update. The
 * module owns the browser plumbing every game rewrites: key normalization,
 * `preventDefault` for bound keys, press/release edges that survive taps
 * shorter than one frame, clearing on window blur, and listener cleanup. It
 * does not know about the ECS; `InputCapture.system(...)` copies snapshots
 * from a service into a resource.
 *
 * @module Keyboard
 * @docGroup browser
 *
 * @example
 * ```ts
 * const input = Keyboard.actions(window, {
 *   left: ["ArrowLeft", "a"],
 *   right: ["ArrowRight", "d"],
 *   jump: [" ", "ArrowUp", "w"]
 * })
 *
 * // Once per update:
 * const snapshot = input.snapshot()
 * if (snapshot.jump.pressed) jump()
 *
 * // On teardown:
 * input.dispose()
 * ```
 *
 * For tests, replays, and headless runs, `scripted(...)` plays a timeline of
 * presses and releases instead of listening to a host, and `recording(...)`
 * wraps live actions to capture the timeline a session produced.
 * `parseTimeline(...)` validates a timeline loaded from JSON.
 *
 * @example
 * ```ts
 * // Browser: record a session, then save `recorder.timeline()` as JSON.
 * const recorder = Keyboard.recording(Keyboard.actions(window, bindings))
 *
 * // Node: replay it frame by frame.
 * const parsed = Keyboard.parseTimeline(bindings, JSON.parse(saved))
 * if (parsed.ok) {
 *   const replay = Keyboard.scripted(bindings, parsed.value)
 * }
 * ```
 */
import * as Result from "@typeonce/bevy-ts/Result"

/**
 * The subset of `KeyboardEvent` the module reads.
 */
export interface KeyEvent {
  readonly key: string
  readonly repeat: boolean
  preventDefault(): void
}

/**
 * The event target the module listens on, usually `window`.
 */
export interface KeyboardHost {
  addEventListener(type: "keydown" | "keyup", listener: (event: KeyEvent) => void): void
  addEventListener(type: "blur", listener: () => void): void
  removeEventListener(type: "keydown" | "keyup", listener: (event: KeyEvent) => void): void
  removeEventListener(type: "blur", listener: () => void): void
}

/**
 * Action name to the keys that trigger it, as `KeyboardEvent.key` values.
 * Single characters match case-insensitively. Every action needs at least one
 * key.
 */
export type Bindings = Readonly<Record<string, readonly [string, ...Array<string>]>>

/**
 * One action's state in a snapshot.
 */
export interface ActionState {
  /** At least one bound key is down now. */
  readonly held: boolean
  /** A bound key went down since the previous snapshot, even if already released. */
  readonly pressed: boolean
  /** A bound key went up since the previous snapshot and none is held now. */
  readonly released: boolean
}

export type Snapshot<B extends Bindings> = {
  readonly [Action in keyof B]: ActionState
}

export interface Actions<B extends Bindings> {
  /**
   * Returns every action's state and starts a new press/release window.
   */
  snapshot(): Snapshot<B>
  /**
   * Removes the event listeners.
   */
  dispose(): void
}

export interface ActionsOptions {
  /**
   * Call `preventDefault()` for bound keys, so arrows and space do not scroll
   * the page. Defaults to `true`.
   */
  readonly preventDefault?: boolean
}

/**
 * A snapshot with every action idle, for initializing an input resource
 * before the first capture.
 */
export const idle = <const B extends Bindings>(bindings: B): Snapshot<B> => {
  const snapshot = {} as Record<keyof B, ActionState>
  for (const name of Object.keys(bindings) as Array<keyof B>) {
    snapshot[name] = { held: false, pressed: false, released: false }
  }
  return snapshot
}

const normalize = (key: string): string => key.length === 1 ? key.toLowerCase() : key

/**
 * Starts tracking bound keys on `host`.
 */
export const actions = <const B extends Bindings>(
  host: KeyboardHost,
  bindings: B,
  options: ActionsOptions = {}
): Actions<B> => {
  const preventDefault = options.preventDefault ?? true
  const names = Object.keys(bindings) as Array<keyof B & string>
  const actionsByKey = new Map<string, Array<keyof B & string>>()
  for (const name of names) {
    for (const key of bindings[name]!) {
      const normalized = normalize(key)
      const bound = actionsByKey.get(normalized)
      if (bound) bound.push(name)
      else actionsByKey.set(normalized, [name])
    }
  }

  const heldKeys = new Set<string>()
  const pressed = new Set<keyof B>()
  const released = new Set<keyof B>()

  const onKeyDown = (event: KeyEvent): void => {
    const key = normalize(event.key)
    const bound = actionsByKey.get(key)
    if (!bound) return
    if (preventDefault) event.preventDefault()
    if (event.repeat || heldKeys.has(key)) return
    heldKeys.add(key)
    for (const name of bound) pressed.add(name)
  }

  const onKeyUp = (event: KeyEvent): void => {
    const key = normalize(event.key)
    const bound = actionsByKey.get(key)
    if (!bound || !heldKeys.delete(key)) return
    for (const name of bound) released.add(name)
  }

  const onBlur = (): void => {
    for (const key of heldKeys) {
      for (const name of actionsByKey.get(key)!) released.add(name)
    }
    heldKeys.clear()
  }

  host.addEventListener("keydown", onKeyDown)
  host.addEventListener("keyup", onKeyUp)
  host.addEventListener("blur", onBlur)

  const isHeld = (name: keyof B & string): boolean => {
    for (const key of bindings[name]!) {
      if (heldKeys.has(normalize(key))) return true
    }
    return false
  }

  return {
    snapshot() {
      const snapshot = {} as Record<keyof B, ActionState>
      for (const name of names) {
        const held = isHeld(name)
        snapshot[name] = {
          held,
          pressed: pressed.has(name),
          released: released.has(name) && !held
        }
      }
      pressed.clear()
      released.clear()
      return snapshot
    },
    dispose() {
      host.removeEventListener("keydown", onKeyDown)
      host.removeEventListener("keyup", onKeyUp)
      host.removeEventListener("blur", onBlur)
    }
  }
}

/**
 * Input changes applied just before one snapshot: presses first, then
 * releases. `frame` is the snapshot's index, counting from 0 at the first
 * `snapshot()` call. An action both pressed and released in one frame is a
 * tap shorter than a frame.
 */
export interface TimelineEntry<B extends Bindings> {
  readonly frame: number
  readonly press?: ReadonlyArray<keyof B & string>
  readonly release?: ReadonlyArray<keyof B & string>
}

/**
 * Input changes by snapshot index. Plain data, so it round-trips through
 * JSON; load it back with `parseTimeline`.
 */
export type Timeline<B extends Bindings> = ReadonlyArray<TimelineEntry<B>>

/**
 * Actions driven by a timeline instead of a host.
 */
export interface Scripted<B extends Bindings> extends Actions<B> {
  /** Number of snapshots taken so far, which is the next frame index. */
  readonly frames: () => number
}

/**
 * Plays `timeline`: before the snapshot at index `frame`, every entry for
 * that frame is applied. Actions stay held from their press until their
 * release, like keys.
 */
export const scripted = <const B extends Bindings>(bindings: B, timeline: Timeline<B>): Scripted<B> => {
  const names = Object.keys(bindings) as Array<keyof B & string>
  const byFrame = new Map<number, Array<TimelineEntry<B>>>()
  for (const entry of timeline) {
    const entries = byFrame.get(entry.frame)
    if (entries) entries.push(entry)
    else byFrame.set(entry.frame, [entry])
  }
  const held = new Set<keyof B>()
  let frame = 0
  return {
    snapshot() {
      const pressed = new Set<keyof B>()
      const released = new Set<keyof B>()
      for (const entry of byFrame.get(frame) ?? []) {
        for (const name of entry.press ?? []) {
          held.add(name)
          pressed.add(name)
        }
        for (const name of entry.release ?? []) {
          if (held.delete(name)) released.add(name)
        }
      }
      frame += 1
      const snapshot = {} as Record<keyof B, ActionState>
      for (const name of names) {
        const isHeld = held.has(name)
        snapshot[name] = { held: isHeld, pressed: pressed.has(name), released: released.has(name) && !isHeld }
      }
      return snapshot
    },
    dispose() {},
    frames: () => frame
  }
}

/**
 * Live actions that also record the timeline they produce.
 */
export interface Recording<B extends Bindings> extends Actions<B> {
  /** The recorded timeline; `scripted(bindings, timeline)` replays it exactly. */
  readonly timeline: () => Timeline<B>
}

/**
 * Wraps `actions` and records, for every snapshot, the actions pressed and
 * released since the previous one.
 */
export const recording = <B extends Bindings>(actions: Actions<B>): Recording<B> => {
  const entries: Array<TimelineEntry<B>> = []
  let frame = 0
  return {
    snapshot() {
      const snapshot = actions.snapshot()
      const press: Array<keyof B & string> = []
      const release: Array<keyof B & string> = []
      for (const name of Object.keys(snapshot) as Array<keyof B & string>) {
        const state = snapshot[name]!
        if (state.pressed) press.push(name)
        if (state.released) release.push(name)
      }
      if (press.length > 0 || release.length > 0) {
        entries.push({
          frame,
          ...(press.length > 0 ? { press } : {}),
          ...(release.length > 0 ? { release } : {})
        })
      }
      frame += 1
      return snapshot
    },
    dispose() {
      actions.dispose()
    },
    timeline: () => [...entries]
  }
}

/**
 * Why loaded data is not a timeline for the bindings. `path` points at the
 * offending value, for example `[3].press[0]`.
 */
export interface InvalidTimeline {
  readonly _tag: "InvalidTimeline"
  readonly path: string
  readonly message: string
}

/**
 * Validates untrusted data, such as a parsed JSON file, as a timeline for
 * `bindings`: an array of entries with a non-negative integer `frame` and
 * optional `press`/`release` arrays of bound action names.
 */
export const parseTimeline = <const B extends Bindings>(
  bindings: B,
  data: unknown
): Result.Result<Timeline<B>, InvalidTimeline> => {
  const invalid = (path: string, message: string) => Result.failure<InvalidTimeline>({ _tag: "InvalidTimeline", path, message })
  if (!Array.isArray(data)) return invalid("", "expected an array of entries")
  const entries: Array<TimelineEntry<B>> = []
  for (let index = 0; index < data.length; index++) {
    const entry: unknown = data[index]
    const path = `[${index}]`
    if (typeof entry !== "object" || entry === null) return invalid(path, "expected an object")
    const { frame, press, release } = entry as { readonly frame?: unknown; readonly press?: unknown; readonly release?: unknown }
    if (typeof frame !== "number" || !Number.isInteger(frame) || frame < 0) {
      return invalid(`${path}.frame`, "expected a non-negative integer")
    }
    const actionsAt = (value: unknown, field: string): Result.Result<Array<keyof B & string> | undefined, InvalidTimeline> => {
      if (value === undefined) return Result.success(undefined)
      if (!Array.isArray(value)) return invalid(`${path}.${field}`, "expected an array of action names")
      const names: Array<keyof B & string> = []
      for (let offset = 0; offset < value.length; offset++) {
        const name: unknown = value[offset]
        if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(bindings, name)) {
          return invalid(`${path}.${field}[${offset}]`, `expected one of ${Object.keys(bindings).join(", ")}`)
        }
        names.push(name)
      }
      return Result.success(names)
    }
    const pressed = actionsAt(press, "press")
    if (!pressed.ok) return pressed
    const released = actionsAt(release, "release")
    if (!released.ok) return released
    entries.push({
      frame,
      ...(pressed.value === undefined ? {} : { press: pressed.value }),
      ...(released.value === undefined ? {} : { release: released.value })
    })
  }
  return Result.success(entries)
}
