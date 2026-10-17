/**
 * Runtime side of `Schema.requires`: the requirement index built once per
 * bound schema, used to expand `Game.System.spawns(...)`, to check commands
 * when they are applied, and to check restored entities.
 *
 * The compile-time counterpart lives in `Command.ts` (spawn, insert, remove)
 * and `Schema.ts` (`ValidateRequires`).
 */
import type { Descriptor } from "../Descriptor.ts"
import type { Schema } from "../Schema.ts"

type ComponentDescriptor = Descriptor<"component", string, any>

export interface RequirementIndex {
  /** Whether the schema declares any requirement. */
  readonly empty: boolean
  /** Component name to the components it directly requires. */
  readonly requires: ReadonlyMap<string, ReadonlyArray<ComponentDescriptor>>
  /** Component name to the components that directly require it. */
  readonly requiredBy: ReadonlyMap<string, ReadonlyArray<ComponentDescriptor>>
}

const push = (map: Map<string, Array<ComponentDescriptor>>, key: string, value: ComponentDescriptor): void => {
  const list = map.get(key)
  if (list === undefined) map.set(key, [value])
  else if (!list.some((entry) => entry.name === value.name)) list.push(value)
}

export const requirementIndex = (schema: Schema.Any): RequirementIndex => {
  const requires = new Map<string, Array<ComponentDescriptor>>()
  const requiredBy = new Map<string, Array<ComponentDescriptor>>()
  for (const requirement of schema.requires) {
    for (const required of requirement.required) {
      push(requires, requirement.component.name, required)
      push(requiredBy, required.name, requirement.component)
    }
  }
  return { empty: requires.size === 0, requires, requiredBy }
}

/** `components` and everything they require, transitively, without duplicates. */
export const withRequired = (
  index: RequirementIndex,
  components: ReadonlyArray<ComponentDescriptor>
): ReadonlyArray<ComponentDescriptor> => {
  if (index.empty) return components
  const result: Array<ComponentDescriptor> = []
  const seen = new Set<string>()
  const visit = (descriptor: ComponentDescriptor): void => {
    if (seen.has(descriptor.name)) return
    seen.add(descriptor.name)
    result.push(descriptor)
    for (const required of index.requires.get(descriptor.name) ?? []) visit(required)
  }
  components.forEach(visit)
  return result
}

/** The first requirement `held` breaks, as `[requirer, missing]`, or `undefined`. */
export const firstMissing = (
  index: RequirementIndex,
  held: (name: string) => boolean,
  names: Iterable<string>
): readonly [string, string] | undefined => {
  for (const name of names) {
    for (const required of index.requires.get(name) ?? []) {
      if (!held(required.name)) return [name, required.name]
    }
  }
  return undefined
}
