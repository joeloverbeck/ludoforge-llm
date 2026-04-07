# 117ZONFILEVA-001: Define `ZoneFilterEvaluationResult` type and unit tests

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new kernel type module
**Deps**: `archive/specs/115-grant-lifecycle-protocol.md`, `archive/specs/116-probe-result-behavioral-contract.md`

## Problem

Zone-filter evaluation uses throw-and-catch for control flow across 8 sites in 6 files. This ticket introduces the `ZoneFilterEvaluationResult` discriminated union that will replace those exception paths. It establishes the type foundation that all subsequent tickets depend on.

## Assumption Reassessment (2026-04-07)

1. `packages/engine/src/kernel/` exists and is the correct location for kernel types — confirmed via glob.
2. `ZoneFilterEvaluationResult` does not already exist in the codebase — confirmed via grep (zero matches).
3. `ProbeResult` in `probe-result.ts` provides a precedent discriminated union pattern (`legal`/`illegal`/`inconclusive`) — confirmed. This ticket follows the same structural pattern.
4. `kernel/index.ts` re-exports kernel types — confirmed.

## Architecture Check

1. A dedicated module for the result type keeps the type definition separate from the evaluation logic, following the existing pattern where `probe-result.ts` is separate from `legal-moves.ts`.
2. The type is fully game-agnostic — it describes evaluation outcomes (`resolved`/`deferred`/`failed`), not game-specific concepts.
3. No backwards-compatibility shims — this is a new type with no existing consumers yet.

## What to Change

### 1. Create `zone-filter-evaluation-result.ts`

New file at `packages/engine/src/kernel/zone-filter-evaluation-result.ts`:

```typescript
export type ZoneFilterEvaluationResult =
  | { readonly status: 'resolved'; readonly matched: boolean }
  | { readonly status: 'deferred'; readonly reason: ZoneFilterDeferralReason }
  | { readonly status: 'failed'; readonly error: unknown };

export type ZoneFilterDeferralReason =
  | 'missingBinding'
  | 'missingVar';
```

Add factory/helper functions if needed for ergonomic construction (e.g., `zoneFilterResolved(matched)`, `zoneFilterDeferred(reason)`). Follow the `ProbeResult` pattern in `probe-result.ts` for guidance on whether helpers are warranted.

### 2. Re-export from `kernel/index.ts`

Add re-export of `ZoneFilterEvaluationResult` and `ZoneFilterDeferralReason` from `packages/engine/src/kernel/index.ts`.

### 3. Write unit tests

Create `packages/engine/test/unit/kernel/zone-filter-evaluation-result.test.ts` with tests for:
- Construction of each status variant (`resolved`, `deferred`, `failed`)
- Type narrowing via `status` discriminant
- `matched` field accessible only on `resolved` variant
- `reason` field accessible only on `deferred` variant
- `error` field accessible only on `failed` variant

## Files to Touch

- `packages/engine/src/kernel/zone-filter-evaluation-result.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add re-exports)
- `packages/engine/test/unit/kernel/zone-filter-evaluation-result.test.ts` (new)

## Out of Scope

- Converting any existing function to return this type (ticket 002)
- Migrating any catch blocks (tickets 003, 004)
- Removing the existing error code or factory (ticket 004)
- Test assertion migration (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. Unit tests for `ZoneFilterEvaluationResult` construction for all 3 status variants.
2. Type narrowing tests confirm discriminant-based access to variant-specific fields.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. `ZoneFilterEvaluationResult` is a pure type with no runtime dependencies on kernel state.
2. All fields are `readonly` — immutable by contract (Foundation 11).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/zone-filter-evaluation-result.test.ts` — validates type construction and discriminant narrowing

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
