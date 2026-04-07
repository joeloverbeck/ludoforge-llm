# 116PRORESBEH-001: Refactor ProbeResult to discriminated union and add resolveProbeResult utility

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel probe-result type refactoring, new resolution utility
**Deps**: None

## Problem

`ProbeResult<T>` uses optional fields (`value?: T`, `reason?: ProbeInconclusiveReason`) instead of a proper discriminated union. This prevents TypeScript from narrowing the type in `switch`/`if` blocks, forcing consumers to use non-null assertions (`result.value!`) or casts (`result.value as T`). Additionally, 6 consumer files independently re-implement inconclusive-handling logic across 12 total sites with no centralized resolution pattern.

This ticket lays the foundation: refactor the type to a DU, add the `resolveProbeResult()` utility, update construction sites, and write unit tests. Consumer migration is handled in subsequent tickets.

## Assumption Reassessment (2026-04-07)

1. `ProbeResult<T>` is defined in `packages/engine/src/kernel/probe-result.ts` with `outcome: ProbeOutcome`, `reason?: ProbeInconclusiveReason`, `value?: T` — confirmed.
2. `ProbeOutcome` is `'legal' | 'illegal' | 'inconclusive'` — confirmed, no changes needed.
3. `ProbeInconclusiveReason` is `'ownerMismatch' | 'missingBinding' | 'stackingViolation' | 'selectorCardinality'` — confirmed, no changes needed.
4. `missing-binding-policy.ts` constructs `ProbeResult` objects (lines 66-82 in `classifyMissingBindingProbeError`) — confirmed, construction sites must be updated to DU variant shapes.
5. `kernel/index.ts` re-exports `ProbeOutcome`, `ProbeInconclusiveReason`, `ProbeResult` — confirmed, new symbols must be added.
6. No existing `resolveProbeResult` or `ProbeResultPolicy` in the codebase — confirmed via grep.
7. Existing test file `packages/engine/test/unit/kernel/probe-result-export-surface-guard.test.ts` validates export surface — may need updating for new exports.

## Architecture Check

1. **Discriminated union is the idiomatic TypeScript pattern** for tagged outcomes. It eliminates a class of bugs (accessing `.value` on illegal results) that the current optional-field design permits.
2. **Game-agnostic**: The probe result protocol governs kernel-level move enumeration uncertainty. No game-specific identifiers, rules, or payloads are involved.
3. **No backwards compatibility shims**: The old `ProbeResult` interface is replaced entirely. All construction sites in `missing-binding-policy.ts` are updated in this ticket. Consumer migration (reading sites) is handled in 002/003 but the DU is backwards-compatible for reads — existing `result.outcome === 'inconclusive'` checks still compile.
4. **Foundation 15** (Architectural Completeness): Addresses root cause of type unsafety rather than patching with utilities alone.

## What to Change

### 1. Refactor `ProbeResult` to discriminated union in `probe-result.ts`

Replace the current single interface with three variant interfaces and a union type:

```typescript
export interface ProbeResultLegal<T> {
  readonly outcome: 'legal';
  readonly value: T;
}

export interface ProbeResultIllegal {
  readonly outcome: 'illegal';
}

export interface ProbeResultInconclusive {
  readonly outcome: 'inconclusive';
  readonly reason?: ProbeInconclusiveReason;
}

export type ProbeResult<T = void> =
  | ProbeResultLegal<T>
  | ProbeResultIllegal
  | ProbeResultInconclusive;
```

Remove the old `ProbeResult` interface definition.

### 2. Add `ProbeResultPolicy` type and `resolveProbeResult()` function in `probe-result.ts`

```typescript
export type ProbeResultPolicy<T, TFallback> = {
  readonly onLegal: (value: T) => TFallback;
  readonly onIllegal: () => TFallback;
  readonly onInconclusive: (reason: ProbeInconclusiveReason | undefined) => TFallback;
};

export const resolveProbeResult = <T, TFallback>(
  result: ProbeResult<T>,
  policy: ProbeResultPolicy<T, TFallback>,
): TFallback => {
  switch (result.outcome) {
    case 'legal': return policy.onLegal(result.value);
    case 'illegal': return policy.onIllegal();
    case 'inconclusive': return policy.onInconclusive(result.reason);
  }
};
```

### 3. Update ProbeResult construction sites in `missing-binding-policy.ts`

Update `classifyMissingBindingProbeError()` to construct DU-shaped objects:
- `{ outcome: 'inconclusive', reason: ... }` (no `value` field)
- `{ outcome: 'illegal' }` (no `value` or `reason` fields)

Ensure no construction site includes extraneous fields (e.g., `{ outcome: 'legal', value: x, reason: undefined }`).

### 4. Update `kernel/index.ts` re-exports

Add re-exports for: `ProbeResultLegal`, `ProbeResultIllegal`, `ProbeResultInconclusive`, `ProbeResultPolicy`, `resolveProbeResult`.

### 5. Update export surface guard test

Update `packages/engine/test/unit/kernel/probe-result-export-surface-guard.test.ts` if it validates specific export names — add the new symbols.

## Files to Touch

- `packages/engine/src/kernel/probe-result.ts` (modify)
- `packages/engine/src/kernel/missing-binding-policy.ts` (modify)
- `packages/engine/src/kernel/index.ts` (modify)
- `packages/engine/test/unit/kernel/probe-result-export-surface-guard.test.ts` (modify)
- `packages/engine/test/unit/kernel/probe-result-policy.test.ts` (new)

## Out of Scope

- Migrating consumer files that read `ProbeResult` (tickets 002 and 003)
- Changing `ProbeOutcome` or `ProbeInconclusiveReason` types
- Changing `classifyMissingBindingProbeError()` logic (only its return shapes)
- Changing `shouldDeferMissingBinding()` policy
- Budget-driven degradation in `decision-sequence-satisfiability.ts`

## Acceptance Criteria

### Tests That Must Pass

1. `resolveProbeResult()` with `{ outcome: 'legal', value: 42 }` calls `onLegal(42)` and returns its result.
2. `resolveProbeResult()` with `{ outcome: 'illegal' }` calls `onIllegal()` and returns its result.
3. `resolveProbeResult()` with `{ outcome: 'inconclusive', reason: 'missingBinding' }` calls `onInconclusive('missingBinding')` and returns its result.
4. `resolveProbeResult()` with `{ outcome: 'inconclusive' }` (no reason) calls `onInconclusive(undefined)`.
5. DU type narrowing: test code that accesses `result.value` in `case 'legal'` without assertion compiles successfully under `tsc --noEmit`.
6. Existing suite: `pnpm -F @ludoforge/engine test` passes with zero failures.

### Invariants

1. `ProbeResult<T>` is a union of exactly three discriminated variants keyed on `outcome`.
2. Construction sites produce only well-formed DU variants (no extraneous optional fields).
3. `resolveProbeResult()` is exhaustive — every `ProbeOutcome` branch is covered, no default case needed.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/probe-result-policy.test.ts` — unit tests for `resolveProbeResult()` with all three outcomes, plus DU narrowing compile-time verification.
2. `packages/engine/test/unit/kernel/probe-result-export-surface-guard.test.ts` — update expected exports if needed.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "probe-result"` — targeted test run
2. `pnpm turbo test --force` — full suite verification
3. `pnpm turbo typecheck` — verify DU narrowing compiles

## Outcome

**Completed**: 2026-04-07

**What changed**:
- `packages/engine/src/kernel/probe-result.ts` — Refactored from single interface to 3-variant DU (`ProbeResultLegal<T>`, `ProbeResultIllegal`, `ProbeResultInconclusive`). Added `ProbeResultPolicy<T, TFallback>` type and `resolveProbeResult()` function.
- `packages/engine/src/kernel/index.ts` — Added re-exports for all new symbols (8 total: 3 variant interfaces + union + policy type + resolver function + 2 original types).
- `packages/engine/test/unit/kernel/probe-result-export-surface-guard.test.ts` — Updated expected exports from 3 to 8.
- `packages/engine/test/unit/kernel/probe-result-policy.test.ts` — New: 8 tests covering `resolveProbeResult()` and DU type narrowing.

**Deviations from ticket**:
1. `ProbeResultIllegal` includes `reason?: ProbeInconclusiveReason` — ticket proposed no `reason` field, but `legal-choices.ts` constructs `{ outcome: 'illegal', reason: 'stackingViolation' }`, requiring the field for compilation.
2. `ProbeResultIllegal` and `ProbeResultInconclusive` include `readonly value?: never` — migration bridge to prevent consumer compilation failures. Consumers still access `result.value!` after filtering `inconclusive`; without this bridge, `ProbeResultIllegal` (which has no `value`) breaks those accesses. Removal tracked in 116PRORESBEH-003.
3. `missing-binding-policy.ts` was not modified — existing construction shapes (`{ outcome: 'inconclusive', reason: ... }`) were already valid `ProbeResultInconclusive` shapes with no extraneous fields.

**Verification**: Build passes. 8/8 new tests pass. 5599/5599 full suite tests pass.
