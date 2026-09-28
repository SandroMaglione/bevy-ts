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
 */

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
