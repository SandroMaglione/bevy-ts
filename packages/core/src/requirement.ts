/**
 * Normalized runtime requirements carried by systems and schedules.
 *
 * Requirements are nominal descriptor or machine values. Combining
 * requirements is therefore a union operation instead of an intersection of
 * reconstructed registry objects.
 *
 * @module requirement
 * @docGroup runtime
 */
interface DescriptorRequirement {
  readonly kind: "resource" | "state" | "service"
  readonly name: string
  readonly key: symbol
}

interface StateMachineRequirement {
  readonly kind: "stateMachine"
  readonly name: string
  readonly key: symbol
  readonly values: readonly [string | number, ...(string | number)[]]
}

/** A value that must be provisioned before a system can run. */
export type Requirement =
  | DescriptorRequirement
  | StateMachineRequirement

/** Runtime metadata shared by descriptors and state machines. */
export interface RequirementValue {
  readonly kind: "resource" | "state" | "service" | "stateMachine"
  readonly name: string
  readonly key: symbol
}

/** Extracts the requirement union carried by a branded value. */
export type Of<Value> = Value extends { readonly requirements: ReadonlyArray<infer R extends Requirement> }
  ? R
  : never

/** Removes duplicate runtime requirement values while preserving order. */
export const collect = (
  values: ReadonlyArray<RequirementValue>
): ReadonlyArray<RequirementValue> => {
  const seen = new Set<symbol>()
  const requirements: Array<RequirementValue> = []

  for (const value of values) {
    if (seen.has(value.key)) {
      continue
    }
    seen.add(value.key)
    requirements.push(value)
  }

  return requirements
}
