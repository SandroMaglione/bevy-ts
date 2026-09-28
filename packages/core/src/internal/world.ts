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
 *
 * Ordinals are assigned per world from the schema, in schema order. Component
 * identity is the descriptor key, which is derived from `(kind, name)`; a bound
 * schema guarantees those names are unique.
 */
import type { Descriptor } from "../descriptor.ts"
import * as Entity from "../entity.ts"
import * as Relation from "../relation.ts"
import type { Schema } from "../schema.ts"

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
   * Lifecycle epoch marks, `MARK_STRIDE` numbers per component ordinal. See
   * `track` for the layout.
   */
  readonly marks: Array<number>
  /**
   * Cached query matches by query ordinal, reused while the entity matches.
   */
  readonly matches: Array<unknown>
  alive: boolean
}

/**
 * Lifecycle channels tracked per component. Each channel uses two mark slots:
 * the epoch of the latest record, and the epoch of the record before it.
 */
const ADDED = 0
const CHANGED = 2
const REMOVED = 4
const MARK_STRIDE = 6
const NO_MARK = -1

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
   * Lifecycle buffers: entity ids per component ordinal, deduplicated through
   * the record marks. `updateLifecycle()` swaps pending into readable and
   * advances `epoch`, so "readable" means "recorded during epoch - 1".
   */
  let epoch = 1
  let pendingAdded: Array<Array<number> | undefined> = []
  let readableAdded: Array<Array<number> | undefined> = []
  let pendingChanged: Array<Array<number> | undefined> = []
  let readableChanged: Array<Array<number> | undefined> = []
  let pendingRemoved: Array<Array<number> | undefined> = []
  let readableRemoved: Array<Array<number> | undefined> = []
  let pendingDespawned: Array<number> = []
  let readableDespawned: Array<number> = []

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
    return ordinal
  }

  for (const descriptor of Object.values(schema.components) as ReadonlyArray<ComponentDescriptor>) {
    ordinalOf(descriptor)
  }

  const has = (record: EntityRecord, ordinal: number): boolean =>
    ordinal < record.values.length && record.values[ordinal] !== ABSENT

  /**
   * Records one lifecycle entry at most once per epoch. The channel's first
   * mark slot holds the latest epoch, the second the epoch before it, which is
   * enough to answer "recorded during epoch - 1" after a newer record.
   */
  const track = (
    buffers: Array<Array<number> | undefined>,
    channel: number,
    record: EntityRecord,
    ordinal: number
  ): void => {
    const marks = record.marks
    const slot = ordinal * MARK_STRIDE + channel
    const latest = marks[slot]!
    if (latest === epoch) {
      return
    }
    marks[slot + 1] = latest
    marks[slot] = epoch
    const buffer = buffers[ordinal]
    if (buffer === undefined) {
      buffers[ordinal] = [record.id]
    } else {
      buffer.push(record.id)
    }
  }

  const isReadable = (channel: number, record: EntityRecord, ordinal: number): boolean => {
    const slot = ordinal * MARK_STRIDE + channel
    const readableEpoch = epoch - 1
    return record.marks[slot] === readableEpoch || record.marks[slot + 1] === readableEpoch
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
    record.values[ordinal] = value
    track(pendingChanged, CHANGED, record, ordinal)
  }

  const writeRecord = (record: EntityRecord, ordinal: number, value: unknown): void => {
    if (!has(record, ordinal)) {
      ensureSlots(record, ordinal)
      members[ordinal]!.add(record)
      componentVersions[ordinal]! += 1
      track(pendingAdded, ADDED, record, ordinal)
    }
    record.values[ordinal] = value
    track(pendingChanged, CHANGED, record, ordinal)
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
    componentVersions[ordinal]! += 1
    track(pendingRemoved, REMOVED, record, ordinal)
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
  ): Relation.Relation.Result<void, Relation.Relation.MutationError> => {
    if (!records.has(sourceId)) {
      return Relation.failure(Relation.missingEntityError(sourceId))
    }
    if (!records.has(targetId)) {
      return Relation.failure(Relation.missingTargetEntityError(sourceId, targetId, relation.name))
    }
    if (!relation.allowSelf && sourceId === targetId) {
      return Relation.failure(Relation.selfRelationNotAllowedError(sourceId, relation.name))
    }
    if (relation.relationKind === "hierarchy" && wouldCreateHierarchyCycle(relation, sourceId, targetId)) {
      return Relation.failure(Relation.hierarchyCycleError(sourceId, targetId, relation.name))
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
    return Relation.success(undefined)
  }

  const reorderChildren = (
    parentId: number,
    relation: Relation.Relation.Any,
    childIds: ReadonlyArray<number>
  ): Relation.Relation.Result<void, Relation.Relation.MutationError> => {
    if (!records.has(parentId)) {
      return Relation.failure(Relation.missingEntityError(parentId))
    }

    const currentChildren = relatedSourceIds(relation, parentId)
    const seenChildren = new Set<number>()

    for (const childId of childIds) {
      if (!records.has(childId)) {
        return Relation.failure(Relation.missingChildEntityError(parentId, childId, relation.name))
      }
      if (seenChildren.has(childId)) {
        return Relation.failure(Relation.duplicateChildError(parentId, childId, relation.name))
      }
      seenChildren.add(childId)
      if (relationTarget(relation, childId) !== parentId) {
        return Relation.failure(Relation.childNotRelatedToParentError(parentId, childId, relation.name))
      }
    }

    if (currentChildren.length !== childIds.length) {
      return Relation.failure(Relation.childSetMismatchError(parentId, relation.name))
    }
    for (const childId of currentChildren) {
      if (!seenChildren.has(childId)) {
        return Relation.failure(Relation.childSetMismatchError(parentId, relation.name))
      }
    }

    if (childIds.length > 0) {
      relatedSources.get(relation.key)!.set(parentId, [...childIds])
      bumpRelation(relation.key)
    }
    return Relation.success(undefined)
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
      componentVersions[ordinal]! += 1
      track(pendingRemoved, REMOVED, record, ordinal)
    }
    pendingDespawned.push(id)
    record.alive = false
    records.delete(id)
    entitiesVersion += 1
  }

  const updateLifecycle = (): void => {
    readableAdded = pendingAdded
    pendingAdded = []
    readableChanged = pendingChanged
    pendingChanged = []
    readableRemoved = pendingRemoved
    pendingRemoved = []
    readableDespawned = pendingDespawned
    pendingDespawned = []
    epoch += 1
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
    tryRelate,
    unrelate,
    reorderChildren,
    relationTarget,
    relatedSourceIds,
    updateLifecycle,
    descriptorAt: (ordinal: number): ComponentDescriptor => descriptors[ordinal]!,
    membersOf: (ordinal: number): ReadonlySet<EntityRecord> => members[ordinal]!,
    componentVersion: (ordinal: number): number => componentVersions[ordinal]!,
    relationVersion: (key: symbol): number => relationVersions.get(key) ?? 0,
    entitiesVersion: (): number => entitiesVersion,
    readableAdded: (ordinal: number): ReadonlyArray<number> | undefined => readableAdded[ordinal],
    readableChanged: (ordinal: number): ReadonlyArray<number> | undefined => readableChanged[ordinal],
    readableRemoved: (ordinal: number): ReadonlyArray<number> | undefined => readableRemoved[ordinal],
    readableDespawned: (): ReadonlyArray<number> => readableDespawned,
    isAdded: (record: EntityRecord, ordinal: number): boolean => isReadable(ADDED, record, ordinal),
    isChanged: (record: EntityRecord, ordinal: number): boolean => isReadable(CHANGED, record, ordinal)
  }
}
