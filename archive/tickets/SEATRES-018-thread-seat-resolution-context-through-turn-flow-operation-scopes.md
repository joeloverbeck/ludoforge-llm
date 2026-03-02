# SEATRES-018: Thread seat-resolution context through turn-flow operation scopes

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel seat-resolution API ergonomics and turn-flow eligibility/runtime call chains
**Deps**: archive/tickets/SEATRES-011-seat-resolution-index-lifecycle-hardening-and-hot-path-deduplication.md

## Problem

SEATRES-011 removed hidden index construction from resolver helpers, but several turn-flow operation paths still build `SeatResolutionIndex` independently inside adjacent helper calls. This keeps lifecycle discipline partially convention-based and leaves avoidable rebuilds inside the same logical operation scope.

## Assumption Reassessment (2026-03-02)

1. `seat-resolution` now requires explicit prebuilt indexes for seat lookups.
2. `turn-flow-eligibility` still builds indexes in multiple nearby helpers (`withActiveFromFirstEligible`, `resolveCardSeatOrder`, `parsePlayerId`) instead of threading one operation-scoped context.
3. `SEATRES-012` through `SEATRES-017` are archived/completed and do not cover seat-resolution context threading/lifecycle reuse for these turn-flow operation chains.
4. Additional index construction still exists in `turn-flow-runtime-invariants`, `phase-advance`, and `effects-turn-flow`; those are adjacent architecture opportunities but not required for this ticket’s focused turn-flow eligibility scope.

## Architecture Check

1. A small explicit seat-resolution context (`build once, pass through`) is cleaner than repeating local builder calls in each helper.
2. This keeps engine logic game-agnostic: context contains canonical seat-index data only, with no game-specific branching.
3. No compatibility aliases/shims are introduced; callers must adopt explicit context ownership.

## What to Change

### 1. Introduce operation-scoped seat-resolution context APIs

1. Add a lightweight context type/helper in `seat-resolution.ts` that wraps `SeatResolutionIndex` construction for operation scope reuse.
2. Keep resolver APIs explicit about consuming the context/index rather than `(def, playerCount)` primitives.

### 2. Thread context through turn-flow eligibility call chains

1. Refactor internal helper signatures in `turn-flow-eligibility.ts` so related operations share one prebuilt context.
2. Remove remaining intra-operation duplicate `buildSeatResolutionIndex(...)` calls.
3. Preserve deterministic runtime behavior and current strict seat contract semantics.

## Updated Scope

### In Scope

1. Add an explicit operation-scoped seat-resolution context helper in `seat-resolution.ts`.
2. Thread one context instance through `turn-flow-eligibility` helper chains where a single logical operation currently rebuilds seat indexes.
3. Keep public behavior and runtime invariant semantics unchanged while removing duplicate index construction in these chains.

### Out of Scope

1. Cross-module deduplication in `turn-flow-runtime-invariants`, `phase-advance`, or `effects-turn-flow`.
2. Runtime error taxonomy changes.
3. Seat-catalog/compiler validation changes.

## Files to Touch

- `packages/engine/src/kernel/seat-resolution.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add if call-chain behavior assertions are needed)
- `packages/engine/test/unit/kernel/seat-resolution.test.ts` (modify/add)

## Acceptance Criteria

### Tests That Must Pass

1. Turn-flow eligibility operation paths build seat-resolution context once per operation scope and reuse it across helper lookups.
2. Existing behavior for valid canonical seat flows remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Seat-resolution lifecycle ownership is explicit at operation boundaries.
2. GameDef/runtime remain game-agnostic with no game-specific seat logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/seat-resolution.test.ts` — context/index API parity coverage for resolver outcomes.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — turn-flow call-chain regression coverage to ensure behavioral parity after context threading.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/seat-resolution.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-02
- **What actually changed**:
  - Added explicit operation-scoped context API in `packages/engine/src/kernel/seat-resolution.ts`:
    - `SeatResolutionContext`
    - `createSeatResolutionContext(def, playerCount)`
  - Refactored `packages/engine/src/kernel/turn-flow-eligibility.ts` to thread one context through operation-local helper chains instead of rebuilding seat indexes in each helper:
    - `withActiveFromFirstEligible(...)`
    - `resolveCardSeatOrder(...)`
    - `parsePlayerId(...)`
    - call chains in `initializeTurnFlowEligibilityState`, `resolveFreeOperationDiscoveryAnalysis`, and `applyTurnFlowEligibilityAfterMove`.
  - Added/strengthened tests in:
    - `packages/engine/test/unit/kernel/seat-resolution.test.ts`
    - `packages/engine/test/unit/kernel/legal-moves.test.ts`
- **Deviations from original plan**:
  - Kept cross-module index-dedup work (`turn-flow-runtime-invariants`, `phase-advance`, `effects-turn-flow`) out of scope to preserve tight ticket boundaries.
  - Added a positive initialization regression in `legal-moves.test.ts` (mapped card metadata seat order) to lock the threaded context path behavior, not only failure-path coverage.
- **Verification results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/seat-resolution.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (`343 pass, 0 fail`)
  - `pnpm turbo test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅

## Post-Archival Architecture Refinement (2026-03-02)

- **Why**:
  - Extending explicit seat-resolution context ownership across adjacent turn-flow operation boundaries is cleaner and more robust than keeping localized index builders in separate modules.
  - This further reduces lifecycle-by-convention and keeps seat-resolution concerns game-agnostic.

- **What changed**:
  - Removed remaining direct `buildSeatResolutionIndex(...)` calls from:
    - `packages/engine/src/kernel/turn-flow-runtime-invariants.ts`
    - `packages/engine/src/kernel/phase-advance.ts`
    - `packages/engine/src/kernel/effects-turn-flow.ts`
  - Added optional prebuilt context injection to invariant boundary:
    - `requireCardDrivenActiveSeat(def, state, surface, seatResolution?)`
  - Threaded one operation-scoped context through coup phase helper paths in `phase-advance.ts`.
  - Kept behavior/error semantics unchanged; no compatibility aliases/shims introduced.

- **Additional tests**:
  - Added `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts`:
    - verifies `requireCardDrivenActiveSeat` resolves correctly using an injected prebuilt context, including repeated lookups with the same context.

- **Verification refresh**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js` ✅
  - `node --test packages/engine/dist/test/unit/phase-advance.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/seat-resolution.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/turn-flow-runtime-invariants.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (`344 pass, 0 fail`)
  - `pnpm turbo test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
