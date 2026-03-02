# SEATRES-032: Add cross-surface seat-invariant parity contract tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — regression guards for kernel/effect active-seat invariant contract parity
**Deps**: archive/tickets/SEATRES-017-unify-seat-contract-runtime-errors-across-kernel-and-effects.md

## Problem

Current tests assert active-seat invariant fields on individual surfaces, but there is no dedicated parity guard that enforces the same canonical metadata/message contract across both kernel and effect emitters as one architectural invariant.

## Assumption Reassessment (2026-03-02)

1. `effects-turn-flow.test.ts` verifies effect-side active-seat invariant fields.
2. `kernel/legal-moves.test.ts` verifies kernel-side active-seat invariant fields.
3. There is no explicit cross-surface contract test that compares invariant id/core metadata/message semantics between both emitters in one place.

## Architecture Check

1. A parity guard test is a low-cost, high-signal way to prevent contract drift between kernel and effect surfaces.
2. This is purely runtime-contract hardening and remains game-agnostic.
3. No compatibility aliases are introduced; parity enforces a single forward contract.

## What to Change

### 1. Add explicit parity contract test coverage

1. Add a focused test that triggers unresolved-active-seat failures from both surfaces.
2. Assert parity on invariant id, activePlayer, seatOrder, and message structure, while preserving top-level code taxonomy differences.

### 2. Keep emitter tests focused and non-duplicative

1. Retain emitter-local tests for local behavior.
2. Move cross-surface assertions into one parity-focused test module to reduce drift and duplication.

## Files to Touch

- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify/add)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify only if overlapping assertions are consolidated)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify only if overlapping assertions are consolidated)

## Out of Scope

- Error taxonomy unification (`RUNTIME_CONTRACT_INVALID` vs `EFFECT_RUNTIME`)
- Seat-resolution context lifecycle threading/performance
- Validator/compiler diagnostics changes

## Acceptance Criteria

### Tests That Must Pass

1. A dedicated parity test fails when kernel/effect active-seat invariant metadata contract diverges.
2. Kernel and effect top-level error code categories remain intentionally distinct.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Active-seat invariant contract parity across surfaces is continuously enforced.
2. Engine/runtime remain game-agnostic and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — add parity assertions for kernel/effect active-seat invariant contract.
2. `packages/engine/test/unit/effects-turn-flow.test.ts` — adjust local assertions only if duplication is reduced.
3. `packages/engine/test/unit/kernel/legal-moves.test.ts` — adjust local assertions only if duplication is reduced.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
