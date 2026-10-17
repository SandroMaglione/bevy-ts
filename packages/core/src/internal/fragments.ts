/**
 * Runtime side of schema composition: merging fragments into one schema.
 *
 * The compile-time counterpart is `ValidateFragments` in `Schema.ts`; these
 * guards cover schemas assembled from erased types.
 */
import type { Schema, SchemaDefinition } from "../Schema.ts"

type NamedRegistry = Record<string, { readonly name: string }>

const kinds = ["components", "resources", "events", "relations"] as const

export const emptySchema = (): SchemaDefinition => ({
  components: {},
  resources: {},
  events: {},
  relations: {},
  requires: []
})

/**
 * Merges two registries after checking for duplicate keys and descriptor names.
 */
const mergeRegistry = (left: NamedRegistry, right: NamedRegistry): NamedRegistry => {
  const names = new Set(Object.values(left).map((entry) => entry.name))
  for (const [key, entry] of Object.entries(right)) {
    if (key in left) {
      throw new Error(`Duplicate schema key: ${key}`)
    }
    if (names.has(entry.name)) {
      throw new Error(`Duplicate descriptor name: ${entry.name}`)
    }
    names.add(entry.name)
  }
  return { ...left, ...right }
}

export const mergeSchemas = (left: Schema.Any, right: Schema.Any): Schema.Any => {
  const merged: Record<string, unknown> = {}
  for (const kind of kinds) {
    merged[kind] = mergeRegistry(left[kind], right[kind])
  }
  merged["requires"] = [...left.requires, ...right.requires]
  return merged as unknown as Schema.Any
}

export const buildSchema = (fragments: ReadonlyArray<Schema.Any>): Schema.Any => {
  let current: Schema.Any = emptySchema()
  for (const fragment of fragments) {
    current = mergeSchemas(current, fragment)
  }
  const registered = new Set(Object.values(current.components).map((descriptor) => descriptor.name))
  for (const requirement of current.requires) {
    for (const descriptor of [requirement.component, ...requirement.required]) {
      if (!registered.has(descriptor.name)) {
        throw new Error(`${descriptor.name} is named in Schema.requires(...) but no fragment registers it: add it to a fragment's components`)
      }
    }
  }
  return current
}
