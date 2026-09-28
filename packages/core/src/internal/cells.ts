/**
 * Cell implementations behind query slots, resources, and states.
 *
 * Cells are small prototype-based objects instead of per-call closures so a
 * query can create one set of cells per matched entity and reuse them for as
 * long as the entity keeps matching. Every read goes to live storage, so a
 * reused cell never observes a stale value.
 */
import type { ResultConstructor } from "../descriptor.ts"
import * as Result from "../Result.ts"
import type { EntityRecord, World } from "./world.ts"
import { ABSENT } from "./world.ts"

/**
 * Validation behavior shared by every writable cell.
 */
abstract class WriteCellBase<T> {
  abstract get(): T
  abstract set(value: T): void

  setResult<E>(result: Result.Result<T, E>): Result.Result<void, E> {
    if (!result.ok) {
      return Result.failure(result.error)
    }
    this.set(result.value)
    return Result.success(undefined)
  }

  update(f: (current: T) => T): void {
    this.set(f(this.get()))
  }

  updateResult<E>(f: (current: T) => Result.Result<T, E>): Result.Result<void, E> {
    return this.setResult(f(this.get()))
  }
}

/**
 * Adds raw-validation helpers for values owned by constructed descriptors.
 */
const withConstructor = <T, Raw, Error>(
  cell: WriteCellBase<T>,
  constructor: ResultConstructor<T, Raw, Error>
) => Object.assign(cell, {
  setRaw(raw: Raw): Result.Result<void, Error> {
    return cell.setResult(constructor.result(raw))
  },
  updateRaw(f: (current: T) => Raw): Result.Result<void, Error> {
    return cell.setResult(constructor.result(f(cell.get())))
  }
})

class ComponentReadCell {
  readonly record: EntityRecord
  readonly ordinal: number

  constructor(record: EntityRecord, ordinal: number) {
    this.record = record
    this.ordinal = ordinal
  }

  get(): unknown {
    return this.record.values[this.ordinal]
  }
}

class ComponentWriteCell extends WriteCellBase<unknown> {
  readonly record: EntityRecord
  readonly ordinal: number
  readonly world: World

  constructor(record: EntityRecord, ordinal: number, world: World) {
    super()
    this.record = record
    this.ordinal = ordinal
    this.world = world
  }

  get(): unknown {
    return this.record.values[this.ordinal]
  }

  set(value: unknown): void {
    this.world.setComponentValue(this.record, this.ordinal, value)
  }
}

class OptionalComponentCell {
  readonly record: EntityRecord
  readonly ordinal: number

  constructor(record: EntityRecord, ordinal: number) {
    this.record = record
    this.ordinal = ordinal
  }

  get present(): boolean {
    const values = this.record.values
    return this.ordinal < values.length && values[this.ordinal] !== ABSENT
  }

  get(): unknown {
    return this.record.values[this.ordinal]
  }
}

class StoreReadCell {
  readonly store: Map<symbol, unknown>
  readonly key: symbol

  constructor(store: Map<symbol, unknown>, key: symbol) {
    this.store = store
    this.key = key
  }

  get(): unknown {
    return this.store.get(this.key)
  }
}

class StoreWriteCell extends WriteCellBase<unknown> {
  readonly store: Map<symbol, unknown>
  readonly key: symbol

  constructor(store: Map<symbol, unknown>, key: symbol) {
    super()
    this.store = store
    this.key = key
  }

  get(): unknown {
    return this.store.get(this.key)
  }

  set(value: unknown): void {
    this.store.set(this.key, value)
  }
}

export const componentRead = (record: EntityRecord, ordinal: number): { get(): unknown } =>
  new ComponentReadCell(record, ordinal)

export const componentWrite = (
  record: EntityRecord,
  ordinal: number,
  world: World,
  constructor: ResultConstructor<unknown, unknown, unknown> | undefined
): WriteCellBase<unknown> => {
  const cell = new ComponentWriteCell(record, ordinal, world)
  return constructor === undefined ? cell : withConstructor(cell, constructor)
}

export const componentOptional = (record: EntityRecord, ordinal: number): { readonly present: boolean; get(): unknown } =>
  new OptionalComponentCell(record, ordinal)

export const storeRead = (store: Map<symbol, unknown>, key: symbol): { get(): unknown } =>
  new StoreReadCell(store, key)

export const storeWrite = (
  store: Map<symbol, unknown>,
  key: symbol,
  constructor: ResultConstructor<unknown, unknown, unknown> | undefined
): WriteCellBase<unknown> => {
  const cell = new StoreWriteCell(store, key)
  return constructor === undefined ? cell : withConstructor(cell, constructor)
}

/**
 * A read cell over a derived value, used for relation slots.
 */
export const derivedRead = <T>(read: () => T): { get(): T } => ({ get: read })

/**
 * A maybe-present cell over a derived value, used for optional relation slots.
 */
export const derivedOptional = <T>(
  isPresent: () => boolean,
  read: () => T
): { readonly present: boolean; get(): T } => ({
  get present() {
    return isPresent()
  },
  get: read
})
