/**
 * World storage behind the runtime.
 *
 * Layout:
 *
 * - every live entity is one `EntityRecord` holding its component values in a
 *   dense array indexed by component ordinal (`ABSENT` marks a missing slot)
 * - every component ordinal keeps the set of records that currently have it,
 *   so a query only visits entities that carry its rarest required component
 * - every component ordinal and relation keeps a membership version, bumped on
 *   structural change, so queries know when their cached match set is stale
 * - every component slot records the change tick it was added and last
 *   changed at; `added`/`changed` filters compare those ticks with the tick
 *   of the reading system's previous run
 *
 * Ordinals are assigned per world from the schema, in schema order. Component
 * identity is the descriptor key, which is derived from `(kind, name)`; a bound
 * schema guarantees those names are unique.
 */
import type { Descriptor } from "../Descriptor.ts"
import * as Entity from "../Entity.ts"
import * as Relation from "../Relation.ts"
import * as Result from "../Result.ts"
import type { Schema } from "../Schema.ts"

/**
 * Marks a component slot that the entity does not currently have.
 */
export const ABSENT: unique symbol = Symbol("bevy-ts/absent")

export interface EntityRecord {
  readonly id: number
  /**
   * The public id value handed out for this entity, created once.
   */
  readonly entityId: Entity.EntityId<any, any>
  /**
   * Component values by ordinal. Slots past the end are absent.
   */
  readonly values: Array<unknown>
  /**
   * Per component ordinal, `MARK_STRIDE` numbers: the tick the component was
   * added, the tick it last changed, and the transaction that last journaled
   * it.
   */
  readonly marks: Array<number>
  /**
   * Cached query matches by query ordinal, reused while the entity matches.
   */
  readonly matches: Array<unknown>
  alive: boolean
}

const ADDED = 0
const CHANGED = 1
const JOURNALED = 2
const MARK_STRIDE = 3
const NO_MARK = -1

/**
 * An append-only list of entity ids with the change tick each entry was
 * recorded at. Ticks are non-decreasing, so readers binary-search their start.
 */
interface TickLog {
  readonly ids: Array<number>
  readonly ticks: Array<number>
}

const makeLog = (): TickLog => ({ ids: [], ticks: [] })

const appendLog = (log: TickLog, id: number, tick: number): void => {
  log.ids.push(id)
  log.ticks.push(tick)
}

/**
 * Index of the first entry recorded after `since`.
 */
const firstAfter = (log: TickLog, since: number): number => {
  let low = 0
  let high = log.ticks.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (log.ticks[middle]! > since) high = middle
    else low = middle + 1
  }
  return low
}

/**
 * Drops entries recorded at or before `boundary`.
 */
const trimLog = (log: TickLog, boundary: number): void => {
  const count = firstAfter(log, boundary)
  if (count > 0) {
    log.ids.splice(0, count)
    log.ticks.splice(0, count)
  }
}

type ComponentDescriptor = Descriptor<"component", string, any>

const noSources: ReadonlyArray<number> = Object.freeze([])

export type World = ReturnType<typeof makeWorld>

export const makeWorld = <S extends Schema.Any>(schema: S) => {
  let nextEntity = 1
  const records = new Map<number, EntityRecord>()

  const ordinals = new Map<symbol, number>()
  const descriptors: Array<ComponentDescriptor> = []
  const members: Array<Set<EntityRecord>> = []
  const componentVersions: Array<number> = []
  /**
   * Bumped on every spawn and despawn, for queries without required components.
   */
  let entitiesVersion = 0

  const relationTargets = new Map<symbol, Map<number, number>>()
  const relatedSources = new Map<symbol, Map<number, Array<number>>>()
  const relationVersions = new Map<symbol, number>()
  const relationDefinitions = Object.values(schema.relations) as ReadonlyArray<Relation.Relation.Any>

  /**
   * The world change tick. It advances for every system run and every command
   * flush; all writes in that span are stamped with it.
   */
  let tick = 0
  /**
   * Logs of changed and removed components per ordinal, and of despawned
   * entities. They back sparse `changed` iteration and removed/despawned
   * reads, and keep entries from the current and previous frame only (see
   * `advanceFrame`). `retainedAfter` is the tick up to which entries may
   * already have been dropped.
   */
  const changedLogs: Array<TickLog | undefined> = []
  /**
   * Per ordinal, the records whose membership changed, with the component
   * version after the change. Queries replay it to update their cached match
   * set incrementally. `membershipFrom[ordinal]` is the version after which
   * the log is complete.
   */
  const membershipRecords: Array<Array<EntityRecord>> = []
  const membershipVersions: Array<Array<number>> = []
  const membershipFrom: Array<number> = []
  const frameVersions: Array<number> = []
  /**
   * Per ordinal, the tick from which the changed log is complete, or
   * `undefined` while no query filters on the component (writes then skip the
   * log entirely).
   */
  const changedLogFrom: Array<number | undefined> = []
  const removedLogs: Array<TickLog | undefined> = []
  const despawnedLog = makeLog()
  let retainedAfter = 0
  let frameStart = 0

  /**
   * Journal of in-place component writes made by the running system. Each
   * record/ordinal pair is journaled once per transaction with its original
   * value, so commit can record lifecycle changes and rollback can restore.
   */
  let transaction = 0
  let inTransaction = false
  const journalRecords: Array<EntityRecord> = []
  const journalOrdinals: Array<number> = []
  const journalValues: Array<unknown> = []

  /**
   * Entity ownership used by scene and level lifetime scopes.
   */
  const scopeByEntity = new Map<number, symbol>()
  const scopeMembers = new Map<symbol, Set<number>>()

  const ordinalOf = (descriptor: ComponentDescriptor): number => {
    const known = ordinals.get(descriptor.key)
    if (known !== undefined) {
      return known
    }
    const ordinal = descriptors.length
    ordinals.set(descriptor.key, ordinal)
    descriptors.push(descriptor)
    members.push(new Set())
    componentVersions.push(0)
    membershipRecords.push([])
    membershipVersions.push([])
    membershipFrom.push(0)
    frameVersions.push(0)
    return ordinal
  }

  for (const descriptor of Object.values(schema.components) as ReadonlyArray<ComponentDescriptor>) {
    ordinalOf(descriptor)
  }

  const has = (record: EntityRecord, ordinal: number): boolean =>
    ordinal < record.values.length && record.values[ordinal] !== ABSENT

  /**
   * Records a membership change of `record` for one component.
   */
  const bumpMembership = (record: EntityRecord, ordinal: number): void => {
    const version = componentVersions[ordinal]! + 1
    componentVersions[ordinal] = version
    membershipRecords[ordinal]!.push(record)
    membershipVersions[ordinal]!.push(version)
  }

  const logFor = (logs: Array<TickLog | undefined>, ordinal: number): TickLog => {
    let log = logs[ordinal]
    if (log === undefined) {
      log = makeLog()
      logs[ordinal] = log
    }
    return log
  }

  /**
   * Stamps a component slot as changed at the current tick, logging it once
   * per tick.
   */
  const markChanged = (record: EntityRecord, ordinal: number): void => {
    const slot = ordinal * MARK_STRIDE + CHANGED
    if (record.marks[slot] === tick) {
      return
    }
    record.marks[slot] = tick
    if (changedLogFrom[ordinal] !== undefined) {
      appendLog(logFor(changedLogs, ordinal), record.id, tick)
    }
  }

  const ensureSlots = (record: EntityRecord, ordinal: number): void => {
    const values = record.values
    while (values.length <= ordinal) {
      values.push(ABSENT)
      for (let index = 0; index < MARK_STRIDE; index++) {
        record.marks.push(NO_MARK)
      }
    }
  }

  const bumpRelation = (key: symbol): void => {
    relationVersions.set(key, (relationVersions.get(key) ?? 0) + 1)
  }

  const entityIdOf = (id: number): Entity.EntityId<any, any> =>
    records.get(id)?.entityId ?? Entity.makeEntityId(id)

  const allocateEntity = (): Entity.EntityId<any, any> => {
    const id = Entity.makeEntityId(nextEntity)
    nextEntity += 1
    return id
  }

  /**
   * Creates the record for a reserved id and writes its initial components.
   */
  const spawnEntity = (
    entityId: Entity.EntityId<any, any>,
    components: ReadonlyArray<Entity.StagedComponent>
  ): void => {
    let record = records.get(entityId.value)
    if (!record) {
      const values: Array<unknown> = new Array(descriptors.length)
      values.fill(ABSENT)
      const marks: Array<number> = new Array(descriptors.length * MARK_STRIDE)
      marks.fill(NO_MARK)
      record = {
        id: entityId.value,
        entityId,
        values,
        marks,
        matches: [],
        alive: true
      }
      records.set(record.id, record)
      entitiesVersion += 1
    }
    for (let index = 0; index < components.length; index++) {
      const component = components[index]!
      writeRecord(record, ordinalOf(component[0]), component[1])
    }
  }

  /**
   * Writes an existing component value in place and records the change.
   */
  const setComponentValue = (record: EntityRecord, ordinal: number, value: unknown): void => {
    if (!record.alive) {
      return
    }
    if (!inTransaction) {
      record.values[ordinal] = value
      markChanged(record, ordinal)
      return
    }
    const slot = ordinal * MARK_STRIDE + JOURNALED
    if (record.marks[slot] !== transaction) {
      record.marks[slot] = transaction
      journalRecords.push(record)
      journalOrdinals.push(ordinal)
      journalValues.push(record.values[ordinal])
    }
    record.values[ordinal] = value
  }

  const clearJournal = (): void => {
    journalRecords.length = 0
    journalOrdinals.length = 0
    journalValues.length = 0
  }

  /**
   * Starts journaling in-place component writes for one system run.
   */
  const beginTransaction = (): void => {
    transaction += 1
    inTransaction = true
  }

  /**
   * Keeps the journaled writes and records them as lifecycle changes.
   */
  const commitTransaction = (): void => {
    inTransaction = false
    for (let index = 0; index < journalRecords.length; index++) {
      const record = journalRecords[index]!
      if (record.alive) {
        markChanged(record, journalOrdinals[index]!)
      }
    }
    clearJournal()
  }

  /**
   * Restores every journaled slot to its value before the transaction.
   */
  const rollbackTransaction = (): void => {
    inTransaction = false
    for (let index = 0; index < journalRecords.length; index++) {
      journalRecords[index]!.values[journalOrdinals[index]!] = journalValues[index]
    }
    clearJournal()
  }

  const clearEntityScope = (id: number): void => {
    const scopeKey = scopeByEntity.get(id)
    if (scopeKey === undefined) {
      return
    }
    scopeByEntity.delete(id)
    const members = scopeMembers.get(scopeKey)
    members?.delete(id)
    if (members?.size === 0) {
      scopeMembers.delete(scopeKey)
    }
  }

  const assignEntityScope = (id: number, scopeKey: symbol): void => {
    if (!records.has(id)) {
      return
    }
    clearEntityScope(id)
    let members = scopeMembers.get(scopeKey)
    if (!members) {
      members = new Set()
      scopeMembers.set(scopeKey, members)
    }
    members.add(id)
    scopeByEntity.set(id, scopeKey)
  }

  const destroyEntityScope = (scopeKey: symbol): void => {
    for (const id of [...(scopeMembers.get(scopeKey) ?? [])]) {
      destroyEntity(id)
    }
  }

  const writeRecord = (record: EntityRecord, ordinal: number, value: unknown): void => {
    if (!has(record, ordinal)) {
      ensureSlots(record, ordinal)
      members[ordinal]!.add(record)
      bumpMembership(record, ordinal)
      record.marks[ordinal * MARK_STRIDE + ADDED] = tick
    }
    record.values[ordinal] = value
    markChanged(record, ordinal)
  }

  const writeComponent = (id: number, descriptor: ComponentDescriptor, value: unknown): void => {
    const record = records.get(id)
    if (record) {
      writeRecord(record, ordinalOf(descriptor), value)
    }
  }

  const removeComponent = (id: number, descriptor: ComponentDescriptor): void => {
    const record = records.get(id)
    if (!record) {
      return
    }
    const ordinal = ordinalOf(descriptor)
    if (!has(record, ordinal)) {
      return
    }
    record.values[ordinal] = ABSENT
    members[ordinal]!.delete(record)
    bumpMembership(record, ordinal)
    appendLog(logFor(removedLogs, ordinal), id, tick)
  }

  const relatedSourceIds = (relation: Relation.Relation.Any, targetId: number): ReadonlyArray<number> =>
    relatedSources.get(relation.key)?.get(targetId) ?? noSources

  const relationTarget = (relation: Relation.Relation.Any, sourceId: number): number | undefined =>
    relationTargets.get(relation.key)?.get(sourceId)

  const addRelatedSource = (relation: Relation.Relation.Any, targetId: number, sourceId: number): void => {
    let store = relatedSources.get(relation.key)
    if (!store) {
      store = new Map()
      relatedSources.set(relation.key, store)
    }
    const entries = store.get(targetId)
    if (!entries) {
      store.set(targetId, [sourceId])
      return
    }
    if (!entries.includes(sourceId)) {
      entries.push(sourceId)
    }
  }

  const removeRelatedSource = (relation: Relation.Relation.Any, targetId: number, sourceId: number): void => {
    const store = relatedSources.get(relation.key)
    const entries = store?.get(targetId)
    if (!store || !entries) {
      return
    }
    const next = entries.filter((entry) => entry !== sourceId)
    if (next.length === 0) {
      store.delete(targetId)
      return
    }
    store.set(targetId, next)
  }

  const unrelate = (sourceId: number, relation: Relation.Relation.Any): void => {
    const targets = relationTargets.get(relation.key)
    const previousTarget = targets?.get(sourceId)
    if (previousTarget === undefined) {
      return
    }
    targets!.delete(sourceId)
    removeRelatedSource(relation, previousTarget, sourceId)
    bumpRelation(relation.key)
  }

  const wouldCreateHierarchyCycle = (relation: Relation.Relation.Any, sourceId: number, targetId: number): boolean => {
    let current: number | undefined = targetId
    while (current !== undefined) {
      if (current === sourceId) {
        return true
      }
      current = relationTarget(relation, current)
    }
    return false
  }

  const tryRelate = (
    sourceId: number,
    relation: Relation.Relation.Any,
    targetId: number
  ): Result.Result<void, Relation.Relation.MutationError> => {
    if (!records.has(sourceId)) {
      return Result.failure(Relation.missingEntityError(sourceId))
    }
    if (!records.has(targetId)) {
      return Result.failure(Relation.missingTargetEntityError(sourceId, targetId, relation.name))
    }
    if (!relation.allowSelf && sourceId === targetId) {
      return Result.failure(Relation.selfRelationNotAllowedError(sourceId, relation.name))
    }
    if (relation.relationKind === "hierarchy" && wouldCreateHierarchyCycle(relation, sourceId, targetId)) {
      return Result.failure(Relation.hierarchyCycleError(sourceId, targetId, relation.name))
    }

    let targets = relationTargets.get(relation.key)
    if (!targets) {
      targets = new Map()
      relationTargets.set(relation.key, targets)
    }
    const previousTarget = targets.get(sourceId)
    if (previousTarget !== undefined && previousTarget !== targetId) {
      removeRelatedSource(relation, previousTarget, sourceId)
    }
    targets.set(sourceId, targetId)
    addRelatedSource(relation, targetId, sourceId)
    bumpRelation(relation.key)
    return Result.success(undefined)
  }

  const reorderChildren = (
    parentId: number,
    relation: Relation.Relation.Any,
    childIds: ReadonlyArray<number>
  ): Result.Result<void, Relation.Relation.MutationError> => {
    if (!records.has(parentId)) {
      return Result.failure(Relation.missingEntityError(parentId))
    }

    const currentChildren = relatedSourceIds(relation, parentId)
    const seenChildren = new Set<number>()

    for (const childId of childIds) {
      if (!records.has(childId)) {
        return Result.failure(Relation.missingChildEntityError(parentId, childId, relation.name))
      }
      if (seenChildren.has(childId)) {
        return Result.failure(Relation.duplicateChildError(parentId, childId, relation.name))
      }
      seenChildren.add(childId)
      if (relationTarget(relation, childId) !== parentId) {
        return Result.failure(Relation.childNotRelatedToParentError(parentId, childId, relation.name))
      }
    }

    if (currentChildren.length !== childIds.length) {
      return Result.failure(Relation.childSetMismatchError(parentId, relation.name))
    }
    for (const childId of currentChildren) {
      if (!seenChildren.has(childId)) {
        return Result.failure(Relation.childSetMismatchError(parentId, relation.name))
      }
    }

    if (childIds.length > 0) {
      relatedSources.get(relation.key)!.set(parentId, [...childIds])
      bumpRelation(relation.key)
    }
    return Result.success(undefined)
  }

  const destroyEntity = (id: number): void => {
    const record = records.get(id)
    if (!record) {
      return
    }
    for (const relation of relationDefinitions) {
      const current = relatedSourceIds(relation, id)
      const sources = current.length === 0 ? noSources : [...current]
      if (relation.linkedDespawn) {
        for (const sourceId of sources) {
          destroyEntity(sourceId)
        }
      } else {
        for (const sourceId of sources) {
          unrelate(sourceId, relation)
        }
      }
      unrelate(id, relation)
    }
    const values = record.values
    for (let ordinal = 0; ordinal < values.length; ordinal++) {
      if (values[ordinal] === ABSENT) {
        continue
      }
      values[ordinal] = ABSENT
      members[ordinal]!.delete(record)
      bumpMembership(record, ordinal)
      appendLog(logFor(removedLogs, ordinal), id, tick)
    }
    clearEntityScope(id)
    appendLog(despawnedLog, id, tick)
    record.alive = false
    records.delete(id)
    entitiesVersion += 1
  }

  /**
   * Advances the change tick and returns it.
   */
  const advanceTick = (): number => {
    tick += 1
    return tick
  }

  /**
   * Starts a new frame (one `runtime.tick(...)` call): log entries older than
   * the previous frame are dropped. Returns that boundary tick (entries at or
   * before it are gone), or `0` when nothing was dropped yet.
   */
  const advanceFrame = (): number => {
    for (let ordinal = 0; ordinal < descriptors.length; ordinal++) {
      // Keep membership changes from the current and previous frame.
      const boundary = frameVersions[ordinal]!
      const versions = membershipVersions[ordinal]!
      let count = 0
      while (count < versions.length && versions[count]! <= boundary) count++
      if (count > 0) {
        versions.splice(0, count)
        membershipRecords[ordinal]!.splice(0, count)
        membershipFrom[ordinal] = boundary
      }
      frameVersions[ordinal] = componentVersions[ordinal]!
    }
    if (frameStart > 0) {
      for (const log of changedLogs) if (log) trimLog(log, frameStart)
      for (const log of removedLogs) if (log) trimLog(log, frameStart)
      trimLog(despawnedLog, frameStart)
      retainedAfter = frameStart
    }
    frameStart = tick
    return retainedAfter
  }

  const entriesSince = (log: TickLog | undefined, since: number): ReadonlyArray<number> => {
    if (log === undefined) return noSources
    const start = firstAfter(log, since)
    return start === log.ids.length ? noSources : log.ids.slice(start)
  }

  /**
   * Plain export of every live entity: id and component values by
   * descriptor name, in spawn order, leaving out `skip`ped descriptors.
   */
  const exportEntities = (
    skip: (descriptor: ComponentDescriptor) => boolean
  ): Array<{ readonly id: number; readonly components: Record<string, unknown> }> =>
    [...records.values()]
      .sort((left, right) => left.id - right.id)
      .map((record) => {
        const components: Record<string, unknown> = {}
        record.values.forEach((value, ordinal) => {
          const descriptor = descriptors[ordinal]!
          if (value !== ABSENT && !skip(descriptor)) components[descriptor.name] = value
        })
        return { id: record.id, components }
      })

  /**
   * Relation edges grouped by target, preserving the stored source order.
   */
  const exportRelations = (): Record<string, Array<readonly [number, ReadonlyArray<number>]>> => {
    const exported: Record<string, Array<readonly [number, ReadonlyArray<number>]>> = {}
    for (const relation of relationDefinitions) {
      exported[relation.name] = [...(relatedSources.get(relation.key)?.entries() ?? [])]
        .map(([target, sources]) => [target, [...sources]] as const)
    }
    return exported
  }

  /**
   * Despawns every live entity (recorded like normal despawns).
   */
  const despawnAll = (): void => {
    for (const id of [...records.keys()]) {
      destroyEntity(id)
    }
  }

  const nextEntityValue = (): number => nextEntity

  const setNextEntity = (value: number): void => {
    nextEntity = Math.max(nextEntity, value)
  }

  return {
    records,
    relationDefinitions,
    ordinalOf,
    has,
    entityIdOf,
    allocateEntity,
    spawnEntity,
    setComponentValue,
    writeComponent,
    removeComponent,
    destroyEntity,
    assignEntityScope,
    destroyEntityScope,
    beginTransaction,
    commitTransaction,
    rollbackTransaction,
    tryRelate,
    unrelate,
    reorderChildren,
    relationTarget,
    relatedSourceIds,
    advanceTick,
    advanceFrame,
    exportEntities,
    exportRelations,
    despawnAll,
    nextEntityValue,
    setNextEntity,
    descriptorAt: (ordinal: number): ComponentDescriptor => descriptors[ordinal]!,
    membersOf: (ordinal: number): ReadonlySet<EntityRecord> => members[ordinal]!,
    /**
     * Records whose membership of `ordinal` changed after `version`, or
     * `undefined` when the log no longer covers that range. May repeat.
     */
    membershipChangesSince: (ordinal: number, version: number): ReadonlyArray<EntityRecord> | undefined => {
      if (version < membershipFrom[ordinal]!) return undefined
      const versions = membershipVersions[ordinal]!
      let low = 0
      let high = versions.length
      while (low < high) {
        const middle = (low + high) >>> 1
        if (versions[middle]! > version) high = middle
        else low = middle + 1
      }
      return membershipRecords[ordinal]!.slice(low)
    },
    componentVersion: (ordinal: number): number => componentVersions[ordinal]!,
    relationVersion: (key: symbol): number => relationVersions.get(key) ?? 0,
    entitiesVersion: (): number => entitiesVersion,
    currentTick: (): number => tick,
    /**
     * Whether the component was added after `since`.
     */
    addedSince: (record: EntityRecord, ordinal: number, since: number): boolean =>
      has(record, ordinal) && record.marks[ordinal * MARK_STRIDE + ADDED]! > since,
    /**
     * Whether the component was added or changed after `since`.
     */
    changedSince: (record: EntityRecord, ordinal: number, since: number): boolean =>
      has(record, ordinal) && record.marks[ordinal * MARK_STRIDE + CHANGED]! > since,
    /**
     * Candidate ids for a `changed`/`added` filter on `ordinal` after `since`,
     * or `undefined` when the log no longer covers that range. Ids may repeat.
     */
    changedCandidates: (ordinal: number, since: number): ReadonlyArray<number> | undefined => {
      const from = changedLogFrom[ordinal]
      return from === undefined || since < from || since < retainedAfter
        ? undefined
        : entriesSince(changedLogs[ordinal], since)
    },
    /**
     * Starts logging changes of one component, for sparse `added`/`changed`
     * queries. Changes before this point are found by scanning instead.
     */
    trackChanges: (ordinal: number): void => {
      if (changedLogFrom[ordinal] === undefined) {
        changedLogFrom[ordinal] = tick
      }
    },
    removedSince: (ordinal: number, since: number): ReadonlyArray<number> => entriesSince(removedLogs[ordinal], since),
    despawnedSince: (since: number): ReadonlyArray<number> => entriesSince(despawnedLog, since)
  }
}
