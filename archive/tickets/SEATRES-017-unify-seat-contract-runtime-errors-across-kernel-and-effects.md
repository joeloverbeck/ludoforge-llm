# SEATRES-017: Unify seat-contract runtime errors across kernel and effects

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — runtime invariant diagnostics/error-shape consistency for active-seat resolution across kernel and effect surfaces
**Deps**: archive/tickets/SEATRES-010-remove-runtime-numeric-seat-fallback-and-fail-fast-on-unresolvable-active-seat.md

## Problem

Active-seat resolution invariant failures still use mixed construction paths (`kernelRuntimeError` vs `effectRuntimeError`) with non-uniform diagnostic payload shape. This weakens cross-surface observability and log tooling even when both failures represent the same seat-contract break.

## Assumption Reassessment (2026-03-02)

1. Kernel call sites already route active-seat resolution through `requireCardDrivenActiveSeat()` and throw `RUNTIME_CONTRACT_INVALID`.
2. The kernel error message is mostly canonicalized, but kernel `RUNTIME_CONTRACT_INVALID` context typing currently models selector-contract failures only, so active-seat invariant metadata is not structured.
3. `applyGrantFreeOperation()` in `effects-turn-flow.ts` still performs its own active-seat resolution path and throws `EFFECT_RUNTIME` (`reason: turnFlowRuntimeValidationFailed`) with effect-local payload keys.
4. Unit tests in `effects-turn-flow`, `phase-advance`, and `kernel/legal-moves` mostly verify throw/code/message, but do not enforce a shared invariant metadata contract across kernel/effect surfaces.
5. Previous ticket text referenced `packages/engine/test/unit/legal-moves.test.ts`; actual file is `packages/engine/test/unit/kernel/legal-moves.test.ts`.

## Architecture Check

1. A shared seat-invariant diagnostic payload contract (invariant id + surface + active seat context) is cleaner and more extensible than duplicating ad-hoc payload keys.
2. Keep kernel/effect top-level taxonomies distinct (`RUNTIME_CONTRACT_INVALID` vs `EFFECT_RUNTIME`) but standardize invariant metadata shape underneath. This preserves existing error domains while unifying seat-contract observability.
3. No backwards-compat alias layer: adopt one canonical metadata schema and update tests/callers accordingly.

## Scope

This ticket is scoped to **active-seat resolution invariant failures** only.

## What to Change

### 1. Define one canonical active-seat invariant payload schema

1. Introduce a shared helper in turn-flow runtime invariants for active-seat resolution failure diagnostics.
2. Required fields: deterministic invariant id, surface identifier, activePlayer, seatOrder.

### 2. Apply helper consistently in kernel + effect surface

1. Use the helper in `requireCardDrivenActiveSeat()` for kernel throws.
2. Use the same helper metadata in `applyGrantFreeOperation()` for unresolved active-seat throws.

### 3. Allow kernel `RUNTIME_CONTRACT_INVALID` to carry seat-invariant context

1. Extend runtime error context typing so this invariant metadata is first-class (not ad-hoc/unsafe).
2. Preserve existing selector-contract context support.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-runtime-invariants.ts` (modify/add helper + canonical payload)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify active-seat unresolved throw path)
- `packages/engine/src/kernel/runtime-error.ts` (extend `RUNTIME_CONTRACT_INVALID` context contract)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify/add assertions)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add assertions)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (add union-context contract coverage)

## Out of Scope

- Seat identity semantics changes
- SeatCatalog compiler diagnostics
- Non-active-seat invariant taxonomy refactors
- Turn-flow performance optimization

## Acceptance Criteria

### Tests That Must Pass

1. Equivalent unresolved-active-seat invariant failures expose canonical seat metadata fields on both kernel and effect surfaces.
2. Kernel path remains `RUNTIME_CONTRACT_INVALID`; effect path remains `EFFECT_RUNTIME` with `reason: turnFlowRuntimeValidationFailed`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Active-seat invariant diagnostics are deterministic and schema-consistent regardless of call surface.
2. Runtime remains strictly canonical-seat, game-agnostic, and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-turn-flow.test.ts` — assert canonical active-seat invariant metadata on effect runtime error context.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — assert canonical active-seat invariant metadata on kernel runtime error context.
3. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — assert `RUNTIME_CONTRACT_INVALID` supports active-seat invariant context without weakening selector-context typing.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-02
- **What actually changed**:
  - Added a canonical active-seat invariant metadata contract (`turnFlow.activeSeat.unresolvable`) in runtime invariant helpers.
  - Unified unresolved-active-seat diagnostics between kernel (`requireCardDrivenActiveSeat`) and effect (`applyGrantFreeOperation`) surfaces using shared metadata + message formatting.
  - Extended `RUNTIME_CONTRACT_INVALID` context typing to support both selector-contract and active-seat invariant contracts.
  - Strengthened unit tests to assert structured invariant metadata on both surfaces and added runtime-error contract-union coverage.
- **Deviations from original plan**:
  - No `phase-advance` source/test changes were required; existing coverage already exercised the relevant runtime path once shared invariant metadata behavior was validated through legal-moves/effects and runtime-error contract tests.
- **Verification results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (`343 passed, 0 failed`)
  - `pnpm turbo test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
