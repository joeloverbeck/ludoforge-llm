# SEATRES-002: Canonical seat identity source for selector lowering

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler core (`compiler-core.ts`)
**Deps**: archive/tickets/SEATRES-001-universal-seat-name-resolution.md

## Problem

Seat-name selector resolution currently depends on `seatIds` sourced from `derivedFromAssets.seats` in compiler core. But selector-relevant seat identity also exists in turn-flow (`turnOrder.config.turnFlow.eligibility.seats`).

This creates a split-brain risk:

1. Selector resolution can fail when turn-flow seats exist but piece-catalog seats are absent.
2. Selector resolution can silently use one seat list while turn execution semantics use another.

The compiler should expose one canonical, deterministic seat identity list for selector lowering based on explicit representation rules.

## Assumption Reassessment (2026-03-01)

1. `compiler-core.ts` currently computes selector `seatIds` only from `derivedFromAssets.seats?.map((s) => s.id)` and does not consume lowered `turnOrder.config.turnFlow.eligibility.seats` as a fallback canonical source.
2. `compile-turn-flow.ts` already validates turn-flow seat shape/duplicates, but compiler-core does not reconcile turn-flow seat identity with piece-catalog seat identity when both are present.
3. SEATRES-001 already propagated `seatIds` through lowering call sites (`compile-lowering.ts`, `compile-conditions.ts`, `compile-zones.ts`, `compile-effects.ts`), so the remaining architecture gap is canonical identity sourcing, not additional selector plumbing.
4. Cross-validation currently treats turn-flow seats as canonical for victory/event-seat references, while selector lowering treats piece-catalog seats as canonical. This is the concrete split-brain contract mismatch.
5. Production specs use two seat-id contracts today:
   1. turn-flow ids as numeric runtime seats (`"0".."N-1"`) with piece-catalog faction ids for selector ergonomics
   2. turn-flow ids that directly match piece-catalog ids
   Seat reconciliation must support both contracts explicitly for selector lowering.

## Architecture Check

1. A single canonical seat identity source in compiler core is cleaner than implicit precedence spread across modules.
2. Consistency checks remain game-agnostic: they validate structural identity contract, not game rules.
3. No aliasing/back-compat shims: canonicalization should be deterministic and representation-driven.

## What to Change

### 1. Introduce canonical seat identity derivation in compiler core

Add a dedicated compiler-core helper that derives seat identity from available seat surfaces:

1. `turnOrder.config.turnFlow.eligibility.seats` (when present)
2. `derivedFromAssets.seats`

Define and document deterministic precedence and reconciliation rules (strict, no aliasing):

1. If turn-flow seats are non-numeric ids, use turn-flow seats as canonical selector seat ids.
2. If turn-flow seats are numeric index ids (`"0".."N-1"`) and piece-catalog seats exist with matching count, use piece-catalog seats as canonical selector seat ids.
3. If turn-flow seats are numeric and piece-catalog seats are absent (or count-mismatched), use turn-flow seats.
4. If turn-flow is absent, use piece-catalog seats.

### 2. Feed only canonical seat identity into lowering contexts

Replace direct `derivedFromAssets.seats` usage for selector lowering with canonical seat ids from step 1.

### 3. Add targeted canonical-source regression tests

Add tests that pin both canonicalization contracts:

1. turn-flow-only selector lowering
2. piece-catalog-only selector lowering
3. named turn-flow precedence when both surfaces exist
4. numeric turn-flow + piece-catalog count mapping when both surfaces exist

## Files to Touch

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/test/unit/compile-actions.test.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify)

## Out of Scope

- Runtime/kernel seat resolution behavior changes
- Visual config (`visual-config.yaml`) concerns
- Seat alias migration layers

## Acceptance Criteria

### Tests That Must Pass

1. When only turn-flow seats exist, seat-name selectors compile using those seat ids.
2. When only data-asset seats exist, seat-name selectors compile using those seat ids.
3. When both exist and turn-flow seats are non-numeric ids, selector lowering uses turn-flow seats.
4. When both exist and turn-flow seats are numeric index ids matching piece-catalog seat count, selector lowering uses piece-catalog seats.
4. Existing suite: `pnpm turbo test`

### Invariants

1. Compiler publishes one canonical seat identity list for selector lowering.
2. GameDef/runtime remain game-agnostic; no game-specific branching introduced.
3. No aliasing/back-compat fallback between seat surfaces.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-actions.test.ts` — verify actor/executor/terminal seat-name lowering works from canonical seat source, including turn-flow-only seat identity.
2. `packages/engine/test/unit/compiler-structured-results.test.ts` — verify mismatch diagnostics when turn-flow and data-asset seats diverge.
3. Existing condition-lowering seat-name tests remain green and unchanged; this ticket does not alter condition parser internals.

### Commands

1. `node --test packages/engine/dist/test/unit/compile-actions.test.js`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-01
- **What Changed**:
  1. Added canonical seat-id derivation in `compiler-core.ts` so selector lowering uses deterministic seat identities from turn-flow and/or piece-catalog based on representation contract.
  2. Implemented canonicalization policy:
     - named turn-flow seats are authoritative for selector lowering,
     - numeric turn-flow seats (`"0".."N-1"`) use piece-catalog seats when counts match,
     - otherwise numeric turn-flow seats remain canonical.
  3. Updated compiler tests to lock behavior for:
     - turn-flow-only seat-name selector lowering,
     - named turn-flow precedence when both surfaces exist,
     - numeric turn-flow + piece-catalog canonical mapping.
- **Deviations From Original Plan**:
  1. Removed planned strict cross-surface mismatch diagnostics and diagnostic-code additions after reassessment showed piece-catalog seats are not a reliable global player-seat identity surface in existing architecture (can be subset/orthogonal to turn-flow seats).
  2. Narrowed implementation scope to canonical selector seat sourcing in `compiler-core.ts` rather than enforcing global seat-surface equality.
- **Verification Results**:
  1. `pnpm turbo build` ✅
  2. `node --test packages/engine/dist/test/unit/compile-actions.test.js` ✅
  3. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` ✅
  4. `node --test packages/engine/dist/test/integration/compile-pipeline.test.js` ✅
  5. `node --test packages/engine/dist/test/integration/fitl-coup-victory.test.js` ✅
  6. `pnpm -F @ludoforge/engine test` ✅
  7. `pnpm turbo test` ✅
  8. `pnpm turbo typecheck` ✅
  9. `pnpm turbo lint` ✅
