# ENGINEARCH-066: Enforce strict zone-write numeric invariants in scoped var constructor

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel scoped-var write invariant enforcement + unit test hardening
**Deps**: none

## Problem

`toScopedVarWrite(...)` currently validates zone writes with `typeof value === 'number'` only. This allows non-finite and non-integer payloads (`NaN`, `Infinity`, fractional numbers) to enter `state.zoneVars`, while zone int read paths enforce finite safe integer semantics. The write/read invariant mismatch weakens kernel robustness and can surface as delayed runtime failures.

## Assumption Reassessment (2026-02-26)

1. `ScopedVarWrite` type coupling already constrains zone writes to `number` at compile-time, but runtime malformed inputs can still reach constructor guards via unsafe/unknown values.
2. `toScopedVarWrite(...)` currently throws `EFFECT_RUNTIME` with `internalInvariantViolation` for non-number zone writes, but does not reject invalid numbers (`NaN`, `Infinity`, fractional).
3. Existing scoped-var runtime tests cover bool-invalid constructor input but do not assert invariant failures for invalid numeric zone payloads.
4. **Mismatch + correction**: zone write constructor invariants must match zone int runtime contract (`finite safe integer`) to preserve deterministic, fail-fast behavior.

## Architecture Check

1. Enforcing finite safe integer invariants at the zone-write constructor boundary is cleaner than relying on later read-time failures, because invalid state is rejected before mutation.
2. This is pure game-agnostic kernel contract hardening; it does not introduce game-specific behavior into GameDef/runtime/simulator.
3. No backwards-compatibility shims or alias paths are introduced.

## What to Change

### 1. Strengthen zone constructor invariant checks

In `toScopedVarWrite(...)`, for `endpoint.scope === 'zone'`, require `Number.isFinite(value) && Number.isSafeInteger(value)` in addition to numeric type.

### 2. Preserve canonical invariant diagnostics

Keep malformed zone-write failures on canonical `EFFECT_RUNTIME` with reason `internalInvariantViolation`.

### 3. Add explicit regression coverage for invalid numeric payloads

Add unit tests that assert constructor failures for `NaN`, `Infinity`, and fractional numbers.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify)

## Out of Scope

- Scoped write API surface narrowing (covered by `ENGINEARCH-063`)
- Unrelated effect/runtime reason taxonomy changes
- GameSpecDoc/GameDef schema changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Zone write constructor rejects `NaN`, `Infinity`, and fractional payloads with `EFFECT_RUNTIME` + `internalInvariantViolation`.
2. Valid integer zone writes continue to succeed with unchanged immutable write behavior.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Zone-scoped runtime writes cannot persist non-finite or non-integer values.
2. Scoped write constructor invariants and scoped int read invariants stay aligned.
3. Kernel/runtime remains game-agnostic and deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — add constructor guard cases for `NaN`, `Infinity`, and fractional zone payloads to prevent invariant drift.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
