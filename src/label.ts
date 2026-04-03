/**
 * Stable nominal labels used to identify systems.
 *
 * Labels provide human-readable names plus nominal identities so ordering and
 * dependency relationships remain explicit without relying on open strings.
 *
 * @example
 * ```ts
 * const move = Label.defineSystemLabel("move")
 * ```
 *
 * @module label
 *
 * @groupDescription Namespaces
 * Grouped label helpers for the different runtime-owned label domains.
 *
 * @groupDescription Interfaces
 * Public label contracts shared by systems, schedules, and sets.
 *
 * @groupDescription Type Aliases
 * Shared label identity and branding helpers.
 *
 * @groupDescription Functions
 * Public constructors for stable nominal labels.
 */
/**
 * String-literal type id used to brand labels.
 */
export type LabelTypeId = "~bevy-ts/Label"

const labelTypeId: LabelTypeId = "~bevy-ts/Label"

/**
 * The supported label categories in the runtime.
 */
export type LabelKind = "system"

/**
 * A nominal label used to reference systems without open strings.
 *
 * Labels are the only supported cross-reference mechanism for ordering and
 * identity. They are stable runtime objects and typed nominally.
 */
export interface Label<
  out Kind extends LabelKind,
  out Name extends string
> {
  readonly kind: Kind
  readonly name: Name
  readonly key: symbol
  readonly [labelTypeId]: {
    readonly _Kind: (_: never) => Kind
    readonly _Name: (_: never) => Name
  }
}

/**
 * Type-level helpers for labels.
 */
export namespace Label {
  /**
   * Any supported label.
   */
  export type Any = Label<LabelKind, string>
  /**
   * Any system label.
   */
  export type System = Label<"system", string>
}

const make = <Kind extends LabelKind, Name extends string>(kind: Kind, name: Name): Label<Kind, Name> =>
  ({
    kind,
    name,
    key: Symbol.for(`bevy-ts/${kind}/${name}`)
  }) as Label<Kind, Name>

/**
 * Defines a typed system label.
 */
export const defineSystemLabel = <const Name extends string>(name: Name): Label<"system", Name> =>
  make("system", name)
