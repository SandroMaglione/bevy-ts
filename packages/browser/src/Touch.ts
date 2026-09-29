/**
 * Touch controls over one element: a floating stick and buttons, some of which
 * aim by dragging (tap to use, drag to aim, release to fire).
 *
 * The layout is a function of the element's size, so controls stay anchored
 * to corners on any screen. Each finger belongs to the first control it lands
 * on: a button when it lands inside one, otherwise the stick when it lands in
 * the stick's region (the stick then appears under the thumb). Fingers that
 * land elsewhere are ignored, and a control keeps its finger until it lifts.
 *
 * Games read one snapshot per update, like keyboard actions: the stick's
 * vector, and per button `held`/`pressed`/`released` edges that survive taps
 * shorter than a frame, plus the drag `aim`, which is still reported on the
 * release. A touch the browser cancels (a system gesture, the window losing
 * focus) releases with `cancelled: true`, so games can skip firing. `view()`
 * returns the live positions for drawing the controls without consuming edges.
 *
 * Only `touch` pointers are tracked by default, so a mouse keeps working
 * through `Pointer`; pass `pointerTypes` to also drive the controls with a
 * mouse while developing. The module sets `touch-action: none` on the element
 * so the browser does not scroll or zoom under the controls.
 *
 * @module Touch
 * @docGroup browser
 *
 * @example
 * ```ts
 * const touch = Touch.track(canvas, window, ({ width, height }) => ({
 *   stick: { region: { left: 0, top: 0, width: width / 2, height }, radius: 60 },
 *   buttons: {
 *     attack: { center: { x: width - 90, y: height - 90 }, radius: 55, aimRadius: 80 },
 *     dash: { center: { x: width - 200, y: height - 60 }, radius: 36 }
 *   }
 * }))
 *
 * // Once per update:
 * const { stick, buttons } = touch.snapshot()
 * move(stick.vector)
 * if (buttons.attack.released && !buttons.attack.cancelled) fire(buttons.attack.aim)
 * ```
 *
 * For tests and headless runs, `scripted(...)` plays a timeline of stick
 * vectors, presses, drags, and releases.
 */
import type { ActionState } from "./Keyboard.ts"

/** A position in CSS pixels relative to the element's top-left corner. */
export interface Position {
  readonly x: number
  readonly y: number
}

/** A direction and strength, with length at most 1. `y` grows down the screen. */
export interface Vector {
  readonly x: number
  readonly y: number
}

export interface Rect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface StickZone {
  /** Where a touch starts the stick. The stick is centered where the thumb lands. */
  readonly region: Rect
  /** Drag distance in CSS pixels for full tilt. */
  readonly radius: number
  /** Fraction of `radius` that reads as zero. Defaults to 0.15. */
  readonly deadZone?: number
}

export interface ButtonZone {
  readonly center: Position
  /** Touch radius in CSS pixels. */
  readonly radius: number
  /** Drag distance in CSS pixels for a full-length aim. Without it the button does not aim. */
  readonly aimRadius?: number
  /** Fraction of `aimRadius` that counts as a tap (no aim). Defaults to 0.2. */
  readonly aimDeadZone?: number
}

export interface Layout<B extends string> {
  readonly stick: StickZone
  readonly buttons: { readonly [K in B]: ButtonZone }
}

/** The element's size in CSS pixels, passed to the layout function. */
export interface Size {
  readonly width: number
  readonly height: number
}

export interface Stick {
  /** Whether a thumb is on the stick. */
  readonly active: boolean
  /** Tilt with the dead zone removed: zero at rest, length 1 at full tilt. */
  readonly vector: Vector
}

export interface ButtonState extends ActionState {
  /**
   * The drag from the button's center as a fraction of `aimRadius` (length at
   * most 1), or `null` for a tap, a button without aim, or a button not held.
   * On a release it is the aim at the moment the finger lifted.
   */
  readonly aim: Vector | null
  /** The release came from a cancelled touch, not a finger lifting. */
  readonly cancelled: boolean
}

export interface Snapshot<B extends string> {
  readonly stick: Stick
  readonly buttons: { readonly [K in B]: ButtonState }
  /** Whether any tracked touch has been seen, for switching controls on. */
  readonly touched: boolean
}

/** Live control positions for drawing, in CSS pixels. Reading it consumes nothing. */
export interface View<B extends string> {
  readonly layout: Layout<B>
  /** Where the stick was centered and where the thumb is, while it is held. */
  readonly stick: { readonly origin: Position; readonly knob: Position } | null
  readonly buttons: { readonly [K in B]: { readonly held: boolean; readonly aim: Vector | null } }
}

export interface Touch<B extends string> {
  /** Returns the controls' state and starts a new press/release window. */
  snapshot(): Snapshot<B>
  /** The live state for drawing. */
  view(): View<B>
  /** Removes the event listeners and restores the element's `touch-action`. */
  dispose(): void
}

/** The subset of `PointerEvent` the module reads. */
export interface TouchEventLike {
  readonly clientX: number
  readonly clientY: number
  readonly pointerId: number
  readonly pointerType: string
  preventDefault(): void
}

/** The element the controls are over, usually the game canvas. */
export interface TouchTarget {
  addEventListener(type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel", listener: (event: TouchEventLike) => void): void
  removeEventListener(type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel", listener: (event: TouchEventLike) => void): void
  getBoundingClientRect(): { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
  setPointerCapture?(pointerId: number): void
  readonly style?: { touchAction: string }
}

/** Where window blur is observed, usually `window`. Held controls are cancelled on blur. */
export interface BlurHost {
  addEventListener(type: "blur", listener: () => void): void
  removeEventListener(type: "blur", listener: () => void): void
}

export interface TrackOptions {
  /** `PointerEvent.pointerType`s that drive the controls. Defaults to `["touch"]`. */
  readonly pointerTypes?: ReadonlyArray<string>
}

const zero: Vector = { x: 0, y: 0 }

const released = (): ButtonState => ({ held: false, pressed: false, released: false, aim: null, cancelled: false })

/** A snapshot with nothing held, for initializing an input resource before the first capture. */
export const idle = <const B extends string>(buttons: ReadonlyArray<B>): Snapshot<B> => ({
  stick: { active: false, vector: zero },
  buttons: Object.fromEntries(buttons.map((button) => [button, released()])) as { readonly [K in B]: ButtonState },
  touched: false
})

/** `offset / radius`, clamped to length 1, with the inner `deadZone` fraction mapped to zero. */
const tilt = (offset: Position, radius: number, deadZone: number): Vector => {
  const length = Math.hypot(offset.x, offset.y)
  if (radius <= 0 || length <= deadZone * radius) return zero
  const strength = Math.min(1, (length / radius - deadZone) / (1 - deadZone))
  return { x: (offset.x / length) * strength, y: (offset.y / length) * strength }
}

/** `offset / aimRadius` clamped to length 1, or `null` inside the tap dead zone. */
const aimOf = (zone: ButtonZone, at: Position): Vector | null => {
  if (zone.aimRadius === undefined) return null
  const offset = { x: at.x - zone.center.x, y: at.y - zone.center.y }
  const length = Math.hypot(offset.x, offset.y)
  if (length <= (zone.aimDeadZone ?? 0.2) * zone.aimRadius) return null
  const scale = Math.min(1, length / zone.aimRadius) / length
  return { x: offset.x * scale, y: offset.y * scale }
}

const inside = (rect: Rect, at: Position): boolean =>
  at.x >= rect.left && at.x <= rect.left + rect.width && at.y >= rect.top && at.y <= rect.top + rect.height

/** Button state between snapshots. */
interface ButtonTrack {
  held: boolean
  pressed: boolean
  released: boolean
  cancelled: boolean
  /** Live aim while held; the aim at release until the next snapshot. */
  aim: Vector | null
}

const makeButtonTracks = <B extends string>(names: ReadonlyArray<B>): Map<B, ButtonTrack> =>
  new Map(names.map((name) => [name, { held: false, pressed: false, released: false, cancelled: false, aim: null }]))

const buttonSnapshot = (track: ButtonTrack): ButtonState => ({
  held: track.held,
  pressed: track.pressed,
  released: track.released && !track.held,
  aim: track.aim,
  cancelled: track.released && !track.held && track.cancelled
})

/** Clears the edges after a snapshot, and the release aim of lifted buttons. */
const startWindow = (track: ButtonTrack): void => {
  track.pressed = false
  track.released = false
  track.cancelled = false
  if (!track.held) track.aim = null
}

const press = (track: ButtonTrack, aim: Vector | null): void => {
  track.held = true
  track.pressed = true
  track.aim = aim
}

const lift = (track: ButtonTrack, cancelled: boolean): void => {
  if (!track.held) return
  track.held = false
  track.released = true
  track.cancelled = cancelled
}

/**
 * Starts tracking touches over `target` with the controls `layout` returns
 * for the element's current size (it is read again on every new touch, so a
 * resize takes effect at the next touch). `blurHost` (usually `window`)
 * cancels held controls when the page loses focus.
 */
export const track = <const B extends string>(
  target: TouchTarget,
  blurHost: BlurHost,
  layout: (size: Size) => Layout<B>,
  options: TrackOptions = {}
): Touch<B> => {
  const pointerTypes = options.pointerTypes ?? ["touch"]
  const sizeOf = (): Size => {
    const rect = target.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }
  let current = layout(sizeOf())
  const names = Object.keys(current.buttons) as Array<B>
  const buttons = makeButtonTracks(names)
  let touched = false
  let stick: { readonly pointerId: number; readonly origin: Position; knob: Position } | undefined
  /** Which button each finger holds. */
  const fingers = new Map<number, B>()

  const locate = (event: TouchEventLike): Position => {
    const rect = target.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const tracked = (event: TouchEventLike): boolean => pointerTypes.includes(event.pointerType)

  const onDown = (event: TouchEventLike): void => {
    if (!tracked(event)) return
    event.preventDefault()
    touched = true
    current = layout(sizeOf())
    const at = locate(event)
    for (const name of names) {
      const zone = current.buttons[name]
      const button = buttons.get(name)!
      if (button.held || Math.hypot(at.x - zone.center.x, at.y - zone.center.y) > zone.radius) continue
      press(button, aimOf(zone, at))
      fingers.set(event.pointerId, name)
      target.setPointerCapture?.(event.pointerId)
      return
    }
    if (stick === undefined && inside(current.stick.region, at)) {
      stick = { pointerId: event.pointerId, origin: at, knob: at }
      target.setPointerCapture?.(event.pointerId)
    }
  }

  const onMove = (event: TouchEventLike): void => {
    if (!tracked(event)) return
    const at = locate(event)
    if (stick !== undefined && stick.pointerId === event.pointerId) {
      stick.knob = at
      return
    }
    const name = fingers.get(event.pointerId)
    if (name !== undefined) buttons.get(name)!.aim = aimOf(current.buttons[name], at)
  }

  const end = (event: TouchEventLike, cancelled: boolean): void => {
    if (!tracked(event)) return
    if (stick !== undefined && stick.pointerId === event.pointerId) {
      stick = undefined
      return
    }
    const name = fingers.get(event.pointerId)
    if (name === undefined) return
    fingers.delete(event.pointerId)
    const button = buttons.get(name)!
    if (!cancelled) button.aim = aimOf(current.buttons[name], locate(event))
    lift(button, cancelled)
  }

  const onUp = (event: TouchEventLike): void => end(event, false)
  const onCancel = (event: TouchEventLike): void => end(event, true)
  const onBlur = (): void => {
    stick = undefined
    fingers.clear()
    for (const button of buttons.values()) lift(button, true)
  }

  const previousTouchAction = target.style?.touchAction
  if (target.style !== undefined) target.style.touchAction = "none"
  target.addEventListener("pointerdown", onDown)
  target.addEventListener("pointermove", onMove)
  target.addEventListener("pointerup", onUp)
  target.addEventListener("pointercancel", onCancel)
  blurHost.addEventListener("blur", onBlur)

  const stickState = (): Stick => {
    if (stick === undefined) return { active: false, vector: zero }
    const offset = { x: stick.knob.x - stick.origin.x, y: stick.knob.y - stick.origin.y }
    return { active: true, vector: tilt(offset, current.stick.radius, current.stick.deadZone ?? 0.15) }
  }

  return {
    snapshot() {
      const snapshot: Snapshot<B> = {
        stick: stickState(),
        buttons: Object.fromEntries(names.map((name) => [name, buttonSnapshot(buttons.get(name)!)])) as { readonly [K in B]: ButtonState },
        touched
      }
      for (const button of buttons.values()) startWindow(button)
      return snapshot
    },
    view() {
      const radius = current.stick.radius
      return {
        layout: current,
        stick: stick === undefined
          ? null
          : (() => {
            const offset = { x: stick.knob.x - stick.origin.x, y: stick.knob.y - stick.origin.y }
            const length = Math.hypot(offset.x, offset.y)
            const scale = length > radius ? radius / length : 1
            return { origin: stick.origin, knob: { x: stick.origin.x + offset.x * scale, y: stick.origin.y + offset.y * scale } }
          })(),
        buttons: Object.fromEntries(names.map((name) => {
          const button = buttons.get(name)!
          return [name, { held: button.held, aim: button.held ? button.aim : null }]
        })) as View<B>["buttons"]
      }
    },
    dispose() {
      target.removeEventListener("pointerdown", onDown)
      target.removeEventListener("pointermove", onMove)
      target.removeEventListener("pointerup", onUp)
      target.removeEventListener("pointercancel", onCancel)
      blurHost.removeEventListener("blur", onBlur)
      if (target.style !== undefined && previousTouchAction !== undefined) target.style.touchAction = previousTouchAction
    }
  }
}

/**
 * Control changes applied just before one snapshot, in this order: the stick,
 * presses, aims, releases. `frame` is the snapshot's index, counting from 0 at
 * the first `snapshot()` call. A button pressed and released in one frame is a
 * tap shorter than a frame.
 */
export interface TimelineEntry<B extends string> {
  readonly frame: number
  /** The stick's vector from this frame on; `null` lifts the thumb. */
  readonly stick?: Vector | null
  readonly press?: ReadonlyArray<B>
  /** Aims of held buttons from this frame on (`null` for no aim). */
  readonly aim?: { readonly [K in B]?: Vector | null }
  readonly release?: ReadonlyArray<B>
  /** Releases that cancel instead of lifting. */
  readonly cancel?: ReadonlyArray<B>
}

/** Control changes by snapshot index. Plain data, so it round-trips through JSON. */
export type Timeline<B extends string> = ReadonlyArray<TimelineEntry<B>>

/** Touch controls driven by a timeline instead of an element. */
export interface Scripted<B extends string> extends Touch<B> {
  /** Number of snapshots taken so far, which is the next frame index. */
  readonly frames: () => number
}

/**
 * Plays `timeline` over controls named `buttons`: before the snapshot at index
 * `frame`, every entry for that frame is applied. Vectors longer than 1 are
 * clamped. Scripted controls report `touched` from the first entry on.
 */
export const scripted = <const B extends string>(buttons: ReadonlyArray<B>, timeline: Timeline<NoInfer<B>>): Scripted<B> => {
  const byFrame = new Map<number, Array<TimelineEntry<B>>>()
  for (const entry of timeline) {
    const entries = byFrame.get(entry.frame)
    if (entries) entries.push(entry)
    else byFrame.set(entry.frame, [entry])
  }
  const clamp = (vector: Vector): Vector => {
    const length = Math.hypot(vector.x, vector.y)
    return length <= 1 ? vector : { x: vector.x / length, y: vector.y / length }
  }
  const tracks = makeButtonTracks(buttons)
  let stick: Vector | null = null
  let touched = false
  let frame = 0
  const layout: Layout<B> = {
    stick: { region: { left: 0, top: 0, width: 0, height: 0 }, radius: 1 },
    buttons: Object.fromEntries(buttons.map((button) => [button, { center: zero, radius: 0 }])) as Layout<B>["buttons"]
  }
  return {
    snapshot() {
      for (const track of tracks.values()) startWindow(track)
      for (const entry of byFrame.get(frame) ?? []) {
        touched = true
        if (entry.stick !== undefined) stick = entry.stick === null ? null : clamp(entry.stick)
        for (const name of entry.press ?? []) press(tracks.get(name)!, null)
        for (const [name, aim] of Object.entries(entry.aim ?? {}) as Array<[B, Vector | null | undefined]>) {
          const track = tracks.get(name)
          if (track !== undefined && aim !== undefined) track.aim = aim === null ? null : clamp(aim)
        }
        for (const name of entry.release ?? []) lift(tracks.get(name)!, false)
        for (const name of entry.cancel ?? []) lift(tracks.get(name)!, true)
      }
      frame += 1
      return {
        stick: { active: stick !== null, vector: stick ?? zero },
        buttons: Object.fromEntries(buttons.map((name) => [name, buttonSnapshot(tracks.get(name)!)])) as { readonly [K in B]: ButtonState },
        touched
      }
    },
    view() {
      return {
        layout,
        stick: null,
        buttons: Object.fromEntries(buttons.map((name) => {
          const track = tracks.get(name)!
          return [name, { held: track.held, aim: track.held ? track.aim : null }]
        })) as View<B>["buttons"]
      }
    },
    dispose() {},
    frames: () => frame
  }
}
