/**
 * Structural equality for plain data: primitives by `Object.is`, arrays and
 * plain objects by their entries. Other objects (class instances, maps,
 * sets) compare by reference. Used to decide whether a resource write
 * changed the value (`Game.System.changedResource`).
 */
export const sameValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false
  if (Array.isArray(left)) {
    if (!Array.isArray(right) || left.length !== right.length) return false
    for (let index = 0; index < left.length; index++) {
      if (!sameValue(left[index], right[index])) return false
    }
    return true
  }
  if (Array.isArray(right) || !isPlain(left) || !isPlain(right)) return false
  const leftKeys = Object.keys(left)
  if (leftKeys.length !== Object.keys(right).length) return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  for (const key of leftKeys) {
    if (!(key in rightRecord) || !sameValue(leftRecord[key], rightRecord[key])) return false
  }
  return true
}

const isPlain = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value) as object | null
  return prototype === null || prototype === Object.prototype
}
