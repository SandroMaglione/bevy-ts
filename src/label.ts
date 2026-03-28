/**
 * String-literal type id used to brand labels.
 */
export type LabelTypeId = "~bevy-ts/Label"

const labelTypeId: LabelTypeId = "~bevy-ts/Label"

/**
 * The supported label categories in the runtime.
 */
export type LabelKind = "system" | "schedule" | "systemSet"

/**
 * A nominal label used to reference systems and schedules without open strings.
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
  /**
   * Any schedule label.
   */
  export type Schedule = Label<"schedule", string>
  /**
   * Any system-set label.
   */
  export type SystemSet = Label<"systemSet", string>
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

/**
 * Defines a typed schedule label.
 */
export const defineScheduleLabel = <const Name extends string>(name: Name): Label<"schedule", Name> =>
  make("schedule", name)

/**
 * Defines a typed system-set label.
 *
 * System sets let schedules express higher-level ordering constraints without
 * introducing open string references.
 */
export const defineSystemSetLabel = <const Name extends string>(name: Name): Label<"systemSet", Name> =>
  make("systemSet", name)
