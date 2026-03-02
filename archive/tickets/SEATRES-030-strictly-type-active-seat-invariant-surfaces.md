# SEATRES-030: Strictly type active-seat invariant surfaces

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — runtime error contract typing for active-seat invariant metadata
**Deps**: archive/tickets/SEATRES-017-unify-seat-contract-runtime-errors-across-kernel-and-effects.md

## Problem

The active-seat invariant metadata currently types `surface` as a plain `string`, which allows typoed/unknown surface identifiers to compile and weakens deterministic diagnostics for runtime tooling.

## Assumption Reassessment (2026-03-02)

1. `TurnFlowActiveSeatInvariantContext` is currently defined in `runtime-error.ts` with `surface: string`.
2. Current callers pass known literals across multiple kernel/effect surfaces (`isActiveSeatEligibleForTurnFlow`, `analyzeFreeOperationGrantMatch`, `applyTurnFlowEligibilityAfterMove`, `consumeTurnFlowFreeOperationGrant`, `resolveCurrentCoupSeat`, `applyTurnFlowWindowFilters`, `applyPendingFreeOperationVariants`, `applyGrantFreeOperation`), but there is no compile-time guard against drift/typos.
3. Active follow-up tickets currently in `tickets/` (`SEATRES-031+`) do not enforce strict literal typing for active-seat invariant surface identifiers.

## Architecture Check

1. A closed union for active-seat invariant surface IDs is cleaner and more robust than open strings because it enforces contract correctness at compile time.
2. This is fully game-agnostic metadata hygiene in kernel/effect error contracts; no game-specific behavior enters GameDef/runtime.
3. No backwards-compat alias layer is introduced; invalid/unknown surface identifiers become type errors.

## What to Change

### 1. Introduce canonical surface ID type for active-seat invariant

1. Define/export a literal union type (or canonical readonly list) of valid active-seat invariant surfaces.
2. Replace `surface: string` in `TurnFlowActiveSeatInvariantContext` with the canonical surface type.

### 2. Align helper/callers/tests to strict surface typing

1. Update `makeActiveSeatUnresolvableInvariantContext(...)` and all call sites to use typed surface IDs.
2. Add/adjust contract tests so unsupported surface identifiers fail at compile time while runtime metadata/message assertions remain deterministic.

## Files to Touch

- `packages/engine/src/kernel/runtime-error.ts` (modify)
- `packages/engine/src/kernel/turn-flow-runtime-invariants.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add if affected by literal constraints)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify/add)

## Out of Scope

- Seat-resolution lifecycle optimization (`SEATRES-018`, `SEATRES-019`)
- Validator seat-canonicality work (`SEATRES-029`)
- Turn-flow performance optimization

## Acceptance Criteria

### Tests That Must Pass

1. Active-seat invariant `surface` values are compile-time constrained to canonical literals.
2. Existing active-seat invariant emitters continue producing deterministic metadata and messages.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Active-seat invariant metadata contract remains deterministic and strongly typed.
2. Kernel/effect runtime remains game-agnostic and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — assert canonical surface typing contract and runtime metadata shape parity.
2. `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts` — replace ad-hoc test surface literals with canonical surface IDs and keep invariant helper behavior checks.
3. `packages/engine/test/unit/effects-turn-flow.test.ts` — assert effect emitter still exposes valid canonical surface metadata.
4. `packages/engine/test/unit/kernel/legal-moves.test.ts` — keep/adjust runtime assertions where active-seat invariant surface literals are asserted.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/turn-flow-runtime-invariants.test.js`
4. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
5. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-02
- **What Changed**:
  - Added canonical active-seat invariant surface literals and type (`TurnFlowActiveSeatInvariantSurface`) in `runtime-error.ts`.
  - Tightened `TurnFlowActiveSeatInvariantContext.surface` and active-seat invariant helper signatures to use canonical surface typing.
  - Updated invariant-callsite tests to use canonical surface IDs and added a contract test asserting the canonical surface set.
  - Fixed an adjacent architecture issue exposed during hard-test runs: engine build now cleans `dist` before `tsc` to prevent stale compiled tests from being executed.
  - Added regression coverage for the clean-before-build policy (`build-script-clean-policy.test.ts`).
- **Deviations From Original Plan**:
  - Scope was expanded to include all real active-seat invariant call surfaces (not just `isActiveSeatEligibleForTurnFlow` and `applyGrantFreeOperation`).
  - Added one non-ticketed but directly blocking robustness fix (`build` script clean step) to make the required full test suite pass deterministically.
- **Verification Results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/turn-flow-runtime-invariants.test.js` ✅
  - `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
