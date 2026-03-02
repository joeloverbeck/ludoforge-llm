# SEATRES-032: Add cross-surface seat-invariant parity contract tests

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — regression guards for kernel/effect active-seat invariant contract parity
**Deps**: archive/tickets/SEATRES-017-unify-seat-contract-runtime-errors-across-kernel-and-effects.md

## Problem

Current tests assert active-seat invariant fields on individual surfaces, but there is no dedicated parity guard that enforces the same canonical metadata/message contract across both kernel and effect emitters as one architectural invariant.

## Assumption Reassessment (2026-03-02)

1. Kernel contract typing and literals for active-seat invariant context are currently anchored in `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (not only behavior tests).
2. Effect-side typed active-seat invariant context is currently anchored in `packages/engine/test/unit/effect-error-contracts.test.ts`, while `packages/engine/test/unit/effects-turn-flow.test.ts` exercises emitter behavior/runtime throw paths.
3. `packages/engine/test/unit/kernel/legal-moves.test.ts` covers one kernel behavior throw path, but there is still no explicit cross-surface parity assertion that compares canonical invariant payload/message semantics between kernel and effect runtime errors in one place.

## Architecture Check

1. A parity guard test is a low-cost, high-signal way to prevent contract drift between kernel and effect surfaces.
2. The proposed change improves architecture by enforcing a single canonical invariant payload/message shape while preserving intentional top-level code/reason taxonomy differences.
3. This is runtime-contract hardening only, remains game-agnostic, and introduces no compatibility aliases.

## What to Change

### 1. Add explicit parity contract test coverage

1. Add a focused test that constructs unresolved-active-seat runtime errors from both kernel and effect contract helpers.
2. Assert parity on invariant id, activePlayer, seatOrder, and active-seat invariant message semantics, while preserving top-level code taxonomy differences.

### 2. Keep emitter tests focused and non-duplicative

1. Retain emitter-local tests for local behavior (`effects-turn-flow`, `legal-moves`).
2. Keep cross-surface parity assertions in contract-focused tests to reduce duplication and drift.

## Files to Touch

- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify; add cross-surface parity test)
- `packages/engine/test/unit/effect-error-contracts.test.ts` (modify only if a small helper assertion is needed for parity clarity)
- `tickets/SEATRES-032-add-cross-surface-seat-invariant-parity-contract-tests.md` (update assumptions/scope/status)

## Out of Scope

- Error taxonomy unification (`RUNTIME_CONTRACT_INVALID` vs `EFFECT_RUNTIME`)
- Seat-resolution context lifecycle threading/performance
- Validator/compiler diagnostics changes

## Acceptance Criteria

### Tests That Must Pass

1. A dedicated parity test fails when kernel/effect active-seat invariant metadata/message contract diverges.
2. Kernel and effect top-level error code categories remain intentionally distinct.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Active-seat invariant contract parity across surfaces is continuously enforced.
2. Engine/runtime remain game-agnostic and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — add kernel/effect active-seat invariant cross-surface parity assertions.
2. `packages/engine/test/unit/effect-error-contracts.test.ts` — no change expected unless parity fixture clarity is needed.
3. Existing behavior tests remain as guards:
- `packages/engine/test/unit/effects-turn-flow.test.ts`
- `packages/engine/test/unit/kernel/legal-moves.test.ts`

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
4. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
5. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-02
- **What Changed**:
1. Added a dedicated cross-surface parity contract test in `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts`.
2. The parity test now asserts shared invariant payload parity (`invariant`, `surface`, `activePlayer`, `seatOrder`) between kernel and effect runtime errors.
3. The parity test enforces canonical invariant message semantics via shared message-prefix checks while preserving intentional top-level taxonomy/context differences.
4. Reassessed and corrected ticket assumptions/scope so contract anchors reflect current architecture (`runtime-error-contracts` + `effect-error-contracts`), with behavior tests (`effects-turn-flow`, `legal-moves`) remaining local.
5. Refined architecture after archival by extracting cross-surface parity assertions into reusable helper `packages/engine/test/helpers/active-seat-invariant-parity-helpers.ts`, and delegated the runtime contract parity test to that helper.
- **Deviations From Original Plan**:
1. No changes were needed in `effects-turn-flow.test.ts` or `legal-moves.test.ts`; parity coverage was fully satisfied in `runtime-error-contracts.test.ts`.
2. No changes were needed in `effect-error-contracts.test.ts`; existing typed effect-context contract coverage remained valid.
3. Post-archive refinement centralized parity assertions in a helper to reduce duplication and make future parity surfaces easier to add without rewriting assertion blocks.
- **Verification Results**:
1. `pnpm turbo build` passed.
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js` passed.
3. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js` passed.
4. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js` passed.
5. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js` passed.
6. `pnpm -F @ludoforge/engine test` passed (355 tests, 0 failed).
7. `pnpm turbo test` passed.
8. `pnpm turbo typecheck` passed.
9. `pnpm turbo lint` passed.
