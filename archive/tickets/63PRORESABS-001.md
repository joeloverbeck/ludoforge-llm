# 63PRORESABS-001: Introduce `ProbeOutcome` and `ProbeResult` types

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new kernel type module + index re-export
**Deps**: `specs/63-probe-result-abstraction.md`

## Problem

The kernel has no first-class type for the result of speculative move evaluation ("probing"). Probe outcomes are currently communicated via thrown exceptions and catch-and-classify patterns across 6 files. This ticket introduces the type definitions that subsequent tickets will use to replace those catch blocks.

## Assumption Reassessment (2026-04-07)

1. `packages/engine/src/kernel/probe-result.ts` does not exist — confirmed via Glob (no match).
2. `packages/engine/src/kernel/index.ts` exists and re-exports kernel types — confirmed (127 re-exported modules).
3. The three error categories to model are: owner mismatch (`isChoiceDecisionOwnerMismatchDuringProbe`), missing binding (`shouldDeferMissingBinding`), stacking violation (`isEffectErrorCode('STACKING_VIOLATION')`) — confirmed via Grep across kernel files.
4. A fourth reason `selectorCardinality` is needed — `shouldDeferMissingBinding` in `missing-binding-policy.ts` also defers `isDeferrableUnresolvedSelectorCardinality` errors.

## Architecture Check

1. The types are pure data definitions with no runtime behavior — minimal risk, maximum composability.
2. Fully game-agnostic: `ProbeResult` describes kernel evaluation outcomes, not game-specific concepts. No game identifiers, zone names, or card references.
3. No backwards-compatibility shims — this is additive. Existing throw-based paths continue working until migration tickets replace them.

## What to Change

### 1. Create `packages/engine/src/kernel/probe-result.ts`

Define the following types:

```typescript
/** Outcome of a speculative move evaluation. */
export type ProbeOutcome =
  | 'legal'           // Probe completed successfully; move is legal
  | 'illegal'         // Probe completed; move is definitively illegal
  | 'inconclusive'    // Probe could not determine legality
  ;

/** Why a probe was inconclusive. */
export type ProbeInconclusiveReason =
  | 'ownerMismatch'         // Choice decision belongs to a different player during probe
  | 'missingBinding'        // A binding required for evaluation is not yet resolved
  | 'stackingViolation'     // Effect would violate stacking constraints
  | 'selectorCardinality'   // Selector cardinality unresolvable during probe
  ;

/** Result of a speculative move evaluation. */
export interface ProbeResult<T = void> {
  readonly outcome: ProbeOutcome;
  readonly reason?: ProbeInconclusiveReason;
  /** Payload present when outcome is 'legal'. Shape varies by call site. */
  readonly value?: T;
}
```

### 2. Export from `packages/engine/src/kernel/index.ts`

Add a re-export line for the new module:

```typescript
export type { ProbeOutcome, ProbeInconclusiveReason, ProbeResult } from './probe-result.js';
```

## Files to Touch

- `packages/engine/src/kernel/probe-result.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add re-export)

## Out of Scope

- Refactoring any existing catch blocks (tickets 002-004)
- Deleting `isChoiceDecisionOwnerMismatchDuringProbe` (ticket 005)
- Runtime probe helper functions (e.g., `probeOk()`, `probeInconclusive()` constructors) — add only if migration tickets find them necessary

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` — the new types compile without errors.
2. `pnpm turbo lint` — no lint violations.
3. `pnpm -F @ludoforge/engine test` — all existing tests pass (no behavioral change).

### Invariants

1. `ProbeOutcome` is a string literal union — not an enum, not a const object. Consistent with kernel type conventions.
2. `ProbeResult` is generic with a default of `void` — call sites opt in to payload typing.
3. No runtime code in `probe-result.ts` — types only.

## Test Plan

### New/Modified Tests

1. No new tests needed — this is a pure type definition. Compilation via `tsc` is sufficient verification.

### Commands

1. `pnpm turbo typecheck`
2. `pnpm turbo lint`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completed: 2026-04-07
- What changed:
  - Added `packages/engine/src/kernel/probe-result.ts` with the `ProbeOutcome`, `ProbeInconclusiveReason`, and generic `ProbeResult<T = void>` type definitions.
  - Re-exported those types from `packages/engine/src/kernel/index.ts`.
- Deviations from original plan:
  - None. The ticket remained a narrow additive type-only slice of the broader Spec 63 series.
- Verification results:
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
  - `pnpm -F @ludoforge/engine test` ✅
