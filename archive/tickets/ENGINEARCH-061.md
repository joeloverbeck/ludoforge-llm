# ENGINEARCH-061: Enforce fail-fast scoped-write invariants and canonicalize invalid-write diagnostics

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel scoped-var write invariant/error handling
**Deps**: none

## Problem

Scoped-write construction still has one non-canonical invariant diagnostic path: `toScopedVarWrite(...)` throws a raw `TypeError` for malformed runtime input (`zone` endpoint + non-number value). This weakens consistency with kernel runtime diagnostics (`EffectRuntimeError`) and makes invariant failures harder to classify uniformly in tests/telemetry.

## Assumption Reassessment (2026-02-26)

1. `ScopedVarWrite` is a strict discriminated union (`zone -> number`, `global|pvar -> VariableValue`) in `scoped-var-runtime-access.ts`.
2. `writeScopedVarToBranches` no longer has a silent fallback branch; it already writes by explicit scope branches and has no no-op "impossible path" return.
3. `toScopedVarWrite(...)` still throws raw `TypeError` for `zone` + non-number runtime input.
4. **Mismatch + correction**: this ticket previously assumed a stale no-op fallback in write application. Current discrepancy is constructor-level diagnostic shape only.

## Architecture Check

1. The stale "remove no-op fallback" work is not beneficial now because that branch no longer exists.
2. Canonical kernel diagnostics for invalid write construction remain beneficial: they keep invariant errors consistently machine-classifiable.
3. This remains game-agnostic kernel hardening; no GameSpecDoc/GameDef or asset coupling is introduced.
4. No backwards-compatibility shims or alias paths are introduced.

## What to Change

### 1. Canonicalize invalid scoped-write constructor diagnostics

Refactor `toScopedVarWrite(...)` invalid-input handling (`zone` + non-number) to use canonical kernel error signaling instead of raw `TypeError`.

### 2. Add explicit invariant regression coverage

Add/strengthen unit tests to assert constructor-level malformed runtime writes fail with canonical kernel diagnostics.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify)

## Out of Scope

- `writeScopedVarToBranches` branch-shape refactors (stale assumption; no fallback exists now)
- New variable effect features
- GameSpecDoc/GameDef schema changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Invalid constructor writes (`zone` endpoint with non-number payload) emit canonical kernel diagnostics (`EFFECT_RUNTIME`) instead of raw `TypeError`.
2. Existing scoped write/read behavior and immutability guarantees remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped-write helper boundaries remain strictly scope/value-coupled.
2. Kernel invariant violations fail fast and deterministically with consistent diagnostics.
3. Runtime/contracts remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — add runtime invariant/error-path assertions for constructor canonical error behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Reassessed assumptions and corrected stale scope in this ticket (removed obsolete `writeScopedVarToBranches` fallback concern).
  - Updated `toScopedVarWrite(...)` malformed zone-write runtime guard to throw canonical `EFFECT_RUNTIME` (`variableRuntimeValidationFailed`) diagnostics instead of raw `TypeError`.
  - Added unit regression coverage for malformed zone-write construction diagnostic shape.
- Deviations from original plan:
  - Did not modify `writeScopedVarToBranches`; no silent fallback branch exists in current code.
  - Did not change `effects-var.ts`; call-site threading changes were unnecessary.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
