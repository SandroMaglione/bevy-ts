/**
 * Save and load the world as plain data.
 *
 * `runtime.snapshot()` captures entities (with their ids), component values,
 * relation edges, resources, and committed state-machine values, keyed by
 * descriptor, relation, and machine names. A bound schema guarantees those
 * names are unique, so they are stable save keys. The snapshot is plain data:
 * store it with `JSON.stringify` or `structuredClone`.
 *
 * `runtime.restore(data)` accepts `unknown`, because saved data comes from
 * outside the program, and validates it before touching the world: shape,
 * unknown names, constructed-descriptor values (through their constructors),
 * and machine states. On failure the world is unchanged.
 *
 * Restoring despawns every current entity and spawns the saved ones with their
 * original ids, so change detection and renderer sync see a restore as normal
 * despawns and spawns. Pending commands and events are dropped. Values of
 * plain (non-constructed) descriptors are trusted as-is; use constructed
 * descriptors for state that must be validated on load.
 *
 * @module snapshot
 * @docGroup runtime
 *
 * @example
 * ```ts
 * localStorage.setItem("save", JSON.stringify(runtime.snapshot()))
 *
 * const restored = runtime.restore(JSON.parse(localStorage.getItem("save") ?? "null"))
 * if (!restored.ok) {
 *   console.error(restored.error)
 * }
 * ```
 */
import * as Result from "./Result.ts"

export interface EntitySnapshot {
  readonly id: number
  /** Component values by descriptor name. */
  readonly components: Readonly<Record<string, unknown>>
}

export interface WorldSnapshot {
  readonly version: 1
  /** The next id the runtime will allocate. */
  readonly nextEntity: number
  readonly entities: ReadonlyArray<EntitySnapshot>
  /** Per relation name: `[target, sources in order]` pairs. */
  readonly relations: Readonly<Record<string, ReadonlyArray<readonly [number, ReadonlyArray<number>]>>>
  /** Resource values by descriptor name. */
  readonly resources: Readonly<Record<string, unknown>>
  /** Committed machine values by machine name. */
  readonly machines: Readonly<Record<string, string | number>>
}

/**
 * Why a snapshot could not be restored.
 */
export type RestoreError =
  | { readonly _tag: "InvalidSnapshot"; readonly path: string }
  | { readonly _tag: "UnsupportedVersion"; readonly version: unknown }
  | { readonly _tag: "UnknownComponent"; readonly entityId: number; readonly name: string }
  | { readonly _tag: "InvalidComponent"; readonly entityId: number; readonly name: string; readonly error: unknown }
  | { readonly _tag: "UnknownResource"; readonly name: string }
  | { readonly _tag: "InvalidResource"; readonly name: string; readonly error: unknown }
  | { readonly _tag: "UnknownRelation"; readonly name: string }
  | { readonly _tag: "InvalidRelation"; readonly name: string; readonly sourceId: number; readonly targetId: number }
  | { readonly _tag: "UnknownMachine"; readonly name: string }
  | { readonly _tag: "InvalidMachineState"; readonly name: string; readonly value: unknown }
  | { readonly _tag: "DuplicateEntity"; readonly entityId: number }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isEntityId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0

const invalid = (path: string) => Result.failure<RestoreError>({ _tag: "InvalidSnapshot", path })

/**
 * Checks the structure of untrusted snapshot data. Names and values are
 * checked against the schema by the runtime.
 */
export const parse = (data: unknown): Result.Result<WorldSnapshot, RestoreError> => {
  if (!isRecord(data)) return invalid("$")
  if (data["version"] !== 1) return Result.failure({ _tag: "UnsupportedVersion", version: data["version"] })
  if (!isEntityId(data["nextEntity"])) return invalid("$.nextEntity")
  const entities = data["entities"]
  if (!Array.isArray(entities)) return invalid("$.entities")
  for (const [index, entity] of entities.entries()) {
    if (!isRecord(entity) || !isEntityId(entity["id"])) return invalid(`$.entities[${index}].id`)
    if (!isRecord(entity["components"])) return invalid(`$.entities[${index}].components`)
  }
  const relations = data["relations"]
  if (!isRecord(relations)) return invalid("$.relations")
  for (const [name, edges] of Object.entries(relations)) {
    if (!Array.isArray(edges)) return invalid(`$.relations.${name}`)
    for (const [index, edge] of edges.entries()) {
      const valid = Array.isArray(edge)
        && edge.length === 2
        && isEntityId(edge[0])
        && Array.isArray(edge[1])
        && edge[1].every(isEntityId)
      if (!valid) return invalid(`$.relations.${name}[${index}]`)
    }
  }
  if (!isRecord(data["resources"])) return invalid("$.resources")
  const machines = data["machines"]
  if (!isRecord(machines)) return invalid("$.machines")
  for (const [name, value] of Object.entries(machines)) {
    if (typeof value !== "string" && typeof value !== "number") return invalid(`$.machines.${name}`)
  }
  return Result.success(data as unknown as WorldSnapshot)
}
