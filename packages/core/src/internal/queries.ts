/**
 * Query execution: match caching, match objects, and entity lookup.
 *
 * Each query spec gets one compiled state per world. The state caches the
 * ordered list of matches and is recomputed only when a component or relation
 * it depends on changed membership. Match objects (entity view + cells) are
 * created once per entity and query and then reused, so steady-state iteration
 * allocates nothing.
 *
 * Lifecycle filters (`added`, `changed`) are evaluated per call from the
 * readable lifecycle buffers, starting from the smaller of the buffer and the
 * cached base match set.
 *
 * Matches are always returned in ascending entity id order, which is spawn
 * order, so iteration is deterministic.
 */
import * as DescriptorModule from "../descriptor.ts"
import type * as Entity from "../entity.ts"
import * as Query from "../query.ts"
import type { QueryMatch } from "../query.ts"
import type * as Relation from "../relation.ts"
import * as Result from "../Result.ts"
import * as Cells from "./cells.ts"
import type { EntityRecord, World } from "./world.ts"

type AnyQuery = Query.Query.Any<any>
type AnyMatch = QueryMatch<any, any>

type SlotPlan =
  | { readonly slot: string; readonly mode: "read" | "optional"; readonly ordinal: number }
  | {
      readonly slot: string
      readonly mode: "write"
      readonly ordinal: number
      readonly constructor: DescriptorModule.ResultConstructor<unknown, unknown, unknown> | undefined
    }
  | {
      readonly slot: string
      readonly mode: "readRelation" | "optionalRelation" | "readRelated" | "optionalRelated"
      readonly relation: Relation.Relation.Any
    }

interface LifecycleFilterPlan {
  readonly kind: "added" | "changed"
  readonly ordinal: number
}

interface QueryState {
  readonly ordinal: number
  readonly required: ReadonlyArray<number>
  readonly without: ReadonlyArray<number>
  readonly withRelations: ReadonlyArray<Relation.Relation.Any>
  readonly withoutRelations: ReadonlyArray<Relation.Relation.Any>
  readonly withRelated: ReadonlyArray<Relation.Relation.Any>
  readonly withoutRelated: ReadonlyArray<Relation.Relation.Any>
  readonly filters: ReadonlyArray<LifecycleFilterPlan>
  readonly slots: ReadonlyArray<SlotPlan>
  readonly proofSlots: ReadonlyArray<readonly [string, number]>
  readonly writeSlots: ReadonlyArray<readonly [string, number]>
  readonly componentDeps: ReadonlyArray<number>
  readonly relationDeps: ReadonlyArray<symbol>
  readonly componentSeen: Array<number>
  readonly relationSeen: Array<number>
  entitiesSeen: number
  matches: ReadonlyArray<AnyMatch> | undefined
  records: ReadonlyArray<EntityRecord>
}

const unique = <T>(values: ReadonlyArray<T>): ReadonlyArray<T> => [...new Set(values)]

/**
 * A live view over the proven component values of one record.
 */
const makeProof = (record: EntityRecord, slots: ReadonlyArray<readonly [string, number]>): object => {
  const proof = {}
  for (const [slot, ordinal] of slots) {
    Object.defineProperty(proof, slot, {
      enumerable: true,
      get: () => record.values[ordinal]
    })
  }
  return proof
}

/**
 * The `entity` part of a query match: an `EntityRef` for read-only queries and
 * an `EntityMut` for queries with write slots. Proofs are built on first access.
 */
class EntityView {
  readonly kind: "EntityRef" | "EntityMut"
  readonly id: Entity.EntityId<any, any>
  readonly __schemaRoot: undefined
  readonly #state: QueryState
  readonly #record: EntityRecord
  #proof: object | undefined
  #writable: object | undefined

  constructor(state: QueryState, record: EntityRecord) {
    this.kind = state.writeSlots.length > 0 ? "EntityMut" : "EntityRef"
    this.id = record.entityId
    this.__schemaRoot = undefined
    this.#state = state
    this.#record = record
    this.#proof = undefined
    this.#writable = undefined
  }

  get proof(): object {
    return this.#proof ??= makeProof(this.#record, this.#state.proofSlots)
  }

  get writable(): object {
    return this.#writable ??= makeProof(this.#record, this.#state.writeSlots)
  }
}

export type QueryEngine = ReturnType<typeof makeQueryEngine>

export const makeQueryEngine = (world: World) => {
  const states = new WeakMap<AnyQuery, QueryState>()
  let nextOrdinal = 0

  const compile = (query: AnyQuery): QueryState => {
    const required: Array<number> = query.with.map((descriptor) => world.ordinalOf(descriptor))
    const withRelations: Array<Relation.Relation.Any> = [...query.withRelations]
    const withRelated: Array<Relation.Relation.Any> = [...query.withRelated]
    const slots: Array<SlotPlan> = []
    const proofSlots: Array<readonly [string, number]> = []
    const writeSlots: Array<readonly [string, number]> = []

    for (const [slot, access] of Object.entries(query.selection)) {
      switch (access.mode) {
        case "read":
        case "write": {
          const ordinal = world.ordinalOf(access.descriptor)
          required.push(ordinal)
          proofSlots.push([slot, ordinal])
          if (access.mode === "write") {
            writeSlots.push([slot, ordinal])
            slots.push({ slot, mode: "write", ordinal, constructor: DescriptorModule.constructorOf(access.descriptor) })
          } else {
            slots.push({ slot, mode: "read", ordinal })
          }
          break
        }
        case "optional":
          slots.push({ slot, mode: "optional", ordinal: world.ordinalOf(access.descriptor) })
          break
        case "readRelation":
          withRelations.push(access.descriptor)
          slots.push({ slot, mode: access.mode, relation: access.descriptor })
          break
        case "readRelated":
          withRelated.push(access.descriptor)
          slots.push({ slot, mode: access.mode, relation: access.descriptor })
          break
        case "optionalRelation":
        case "optionalRelated":
          slots.push({ slot, mode: access.mode, relation: access.descriptor })
          break
      }
    }

    const without = query.without.map((descriptor) => world.ordinalOf(descriptor))
    const componentDeps = unique([...required, ...without])
    const relationDeps = unique([
      ...withRelations,
      ...query.withoutRelations,
      ...withRelated,
      ...query.withoutRelated
    ].map((relation) => relation.key))

    return {
      ordinal: nextOrdinal++,
      required: unique(required),
      without: unique(without),
      withRelations: unique(withRelations),
      withoutRelations: query.withoutRelations,
      withRelated: unique(withRelated),
      withoutRelated: query.withoutRelated,
      filters: query.filters.map((filter) => ({ kind: filter.kind, ordinal: world.ordinalOf(filter.descriptor) })),
      slots,
      proofSlots,
      writeSlots,
      componentDeps,
      relationDeps,
      componentSeen: componentDeps.map(() => -1),
      relationSeen: relationDeps.map(() => -1),
      entitiesSeen: -1,
      matches: undefined,
      records: []
    }
  }

  const stateOf = (query: AnyQuery): QueryState => {
    let state = states.get(query)
    if (!state) {
      state = compile(query)
      states.set(query, state)
    }
    return state
  }

  /**
   * Structural match: components and relations, without lifecycle filters.
   */
  const matchesStructure = (state: QueryState, record: EntityRecord): boolean => {
    for (const ordinal of state.required) {
      if (!world.has(record, ordinal)) return false
    }
    for (const ordinal of state.without) {
      if (world.has(record, ordinal)) return false
    }
    for (const relation of state.withRelations) {
      if (world.relationTarget(relation, record.id) === undefined) return false
    }
    for (const relation of state.withoutRelations) {
      if (world.relationTarget(relation, record.id) !== undefined) return false
    }
    for (const relation of state.withRelated) {
      if (world.relatedSourceIds(relation, record.id).length === 0) return false
    }
    for (const relation of state.withoutRelated) {
      if (world.relatedSourceIds(relation, record.id).length > 0) return false
    }
    return true
  }

  const matchesFilters = (state: QueryState, record: EntityRecord): boolean => {
    for (const filter of state.filters) {
      if (!world.has(record, filter.ordinal)) return false
      const readable = filter.kind === "added"
        ? world.isAdded(record, filter.ordinal)
        : world.isChanged(record, filter.ordinal)
      if (!readable) return false
    }
    return true
  }

  const relatedIds = (relation: Relation.Relation.Any, id: number): ReadonlyArray<Entity.EntityId<any, any>> =>
    world.relatedSourceIds(relation, id).map(world.entityIdOf)

  const makeCell = (plan: SlotPlan, record: EntityRecord): unknown => {
    switch (plan.mode) {
      case "read":
        return Cells.componentRead(record, plan.ordinal)
      case "write":
        return Cells.componentWrite(record, plan.ordinal, world, plan.constructor)
      case "optional":
        return Cells.componentOptional(record, plan.ordinal)
      case "readRelation":
        return Cells.derivedRead(() => world.entityIdOf(world.relationTarget(plan.relation, record.id)!))
      case "optionalRelation":
        return Cells.derivedOptional(
          () => world.relationTarget(plan.relation, record.id) !== undefined,
          () => world.entityIdOf(world.relationTarget(plan.relation, record.id)!)
        )
      case "readRelated":
        return Cells.derivedRead(() => relatedIds(plan.relation, record.id))
      case "optionalRelated":
        return Cells.derivedOptional(
          () => world.relatedSourceIds(plan.relation, record.id).length > 0,
          () => relatedIds(plan.relation, record.id)
        )
    }
  }

  const makeEntityView = (state: QueryState, record: EntityRecord): object => new EntityView(state, record)

  const matchFor = (state: QueryState, record: EntityRecord): AnyMatch => {
    const cached = record.matches[state.ordinal]
    if (cached !== undefined) {
      return cached as AnyMatch
    }
    const data: Record<string, unknown> = {}
    for (const plan of state.slots) {
      data[plan.slot] = makeCell(plan, record)
    }
    const match = { entity: makeEntityView(state, record), data } as unknown as AnyMatch
    record.matches[state.ordinal] = match
    return match
  }

  const isStale = (state: QueryState): boolean => {
    if (state.matches === undefined) return true
    if (state.required.length === 0 && state.entitiesSeen !== world.entitiesVersion()) return true
    const componentDeps = state.componentDeps
    for (let index = 0; index < componentDeps.length; index++) {
      if (state.componentSeen[index] !== world.componentVersion(componentDeps[index]!)) return true
    }
    const relationDeps = state.relationDeps
    for (let index = 0; index < relationDeps.length; index++) {
      if (state.relationSeen[index] !== world.relationVersion(relationDeps[index]!)) return true
    }
    return false
  }

  const byId = (left: EntityRecord, right: EntityRecord): number => left.id - right.id

  const refresh = (state: QueryState): void => {
    if (!isStale(state)) return

    let candidates: Iterable<EntityRecord> = world.records.values()
    let candidateCount = Infinity
    for (const ordinal of state.required) {
      const members = world.membersOf(ordinal)
      if (members.size < candidateCount) {
        candidates = members
        candidateCount = members.size
      }
    }

    const records: Array<EntityRecord> = []
    let sorted = true
    let previous = -1
    for (const record of candidates) {
      if (!matchesStructure(state, record)) continue
      if (record.id < previous) sorted = false
      previous = record.id
      records.push(record)
    }
    if (!sorted) records.sort(byId)

    state.records = records
    state.matches = records.map((record) => matchFor(state, record))
    state.entitiesSeen = world.entitiesVersion()
    state.componentDeps.forEach((ordinal, index) => {
      state.componentSeen[index] = world.componentVersion(ordinal)
    })
    state.relationDeps.forEach((key, index) => {
      state.relationSeen[index] = world.relationVersion(key)
    })
  }

  const each = (query: AnyQuery): ReadonlyArray<AnyMatch> => {
    const state = stateOf(query)
    refresh(state)
    if (state.filters.length === 0) {
      return state.matches!
    }

    // Start from whichever is smaller: the base match set or one lifecycle buffer.
    let smallest: ReadonlyArray<number> | undefined
    for (const filter of state.filters) {
      const buffer = filter.kind === "added"
        ? world.readableAdded(filter.ordinal)
        : world.readableChanged(filter.ordinal)
      if (buffer === undefined || buffer.length === 0) return []
      if (smallest === undefined || buffer.length < smallest.length) smallest = buffer
    }

    if (smallest!.length >= state.records.length) {
      const result: Array<AnyMatch> = []
      for (const record of state.records) {
        if (matchesFilters(state, record)) result.push(matchFor(state, record))
      }
      return result
    }

    const records: Array<EntityRecord> = []
    for (const id of smallest!) {
      const record = world.records.get(id)
      if (record && matchesStructure(state, record) && matchesFilters(state, record)) {
        records.push(record)
      }
    }
    records.sort(byId)
    return records.map((record) => matchFor(state, record))
  }

  const get = (
    id: number,
    query: AnyQuery
  ): Result.Result<AnyMatch, Query.Query.LookupError> => {
    const record = world.records.get(id)
    if (!record) {
      return Result.failure(Query.missingEntityError(id))
    }
    const state = stateOf(query)
    if (!matchesStructure(state, record) || !matchesFilters(state, record)) {
      return Result.failure(Query.queryMismatchError(id))
    }
    return Result.success(matchFor(state, record))
  }

  return { each, get }
}
