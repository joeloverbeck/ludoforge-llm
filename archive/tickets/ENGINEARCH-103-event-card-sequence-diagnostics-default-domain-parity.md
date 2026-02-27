# ENGINEARCH-103: Event-Card Sequence Diagnostics Default-Domain Parity

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler event-card effect lowering context plumbing
**Deps**: archive/specs/17-fitl-turn-sequence-eligibility-and-card-flow.md

## Problem

Free-operation sequence viability diagnostics now account for effective action domains in most compile surfaces, but event-card effect lowering paths do not receive turn-flow default free-operation action IDs. This creates inconsistent diagnostics depending on where `grantFreeOperation` appears.

## Assumption Reassessment (2026-02-27)

1. `compiler-core` now computes turn-flow defaults and threads them through setup/turnStructure/actions/triggers/actionPipelines lowering paths.
2. `compile-event-cards` still calls `lowerEffectArray` without `freeOperationActionIds` context across all event-card effect surfaces:
   - side `effects`
   - branch `effects`
   - side/branch `lastingEffects.setupEffects`
   - side/branch `lastingEffects.teardownEffects`
3. Existing `compile-effects` tests already validate sequence-viability behavior at the primitive lowerer level; the missing coverage is integration parity at compile top-level for event decks.
4. Mismatch: sequence diagnostics are still surface-dependent for event decks; corrected scope is to thread the same effective-domain context into all event-card lowering paths and add compile-level regression coverage.

## Architecture Check

1. Uniform diagnostics semantics across all effect-authoring surfaces is cleaner than path-dependent behavior and reduces surprise.
2. This preserves boundaries: game-specific authored data remains in `GameSpecDoc`, while compiler/runtime behavior stays game-agnostic; no visual-config coupling is introduced.
3. No backwards-compatibility aliases/shims; adopt one canonical lowering-context contract.

## What to Change

### 1. Thread free-operation defaults into event-card lowering

Add optional `freeOperationActionIds` parameter(s) to event-card lowering entry points and pass through to all internal `lowerEffectArray` calls (including branch and lasting-effect paths).

### 2. Plumb from compiler core

Pass turn-flow defaults from `compiler-core` into `lowerEventDecks` so event-card effects use the same effective-domain model as other sections.

### 3. Add event-card specific regression coverage

Add compile tests demonstrating disjoint and overlapping explicit/default domains for event-card-authored sequence chains at the `compileGameSpecToGameDef` surface.

## Files to Touch

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/compile-event-cards.ts` (modify)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (no change required unless helper reuse becomes necessary)

## Out of Scope

- Runtime free-operation legality behavior changes.
- Any game-specific rules or card-specific hardcoded logic.

## Acceptance Criteria

### Tests That Must Pass

1. Event-card effect sequence diagnostics warn for explicit/default disjoint effective domains.
2. Event-card effect sequence diagnostics do not warn when effective domains overlap.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `CNL_COMPILER_FREE_OPERATION_SEQUENCE_VIABILITY_RISK` behavior is consistent across setup/actions/triggers/actionPipelines/eventDeck effects.
2. Compiler behavior remains deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-top-level.test.ts` — compile-level eventDeck effect diagnostics with turn-flow defaults (disjoint and overlap cases).
2. `packages/engine/test/unit/compile-effects.test.ts` — unchanged; existing lowerer-level domain viability tests remain authoritative for primitive behavior.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compile-top-level.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-02-27
- **What Changed**:
  - Threaded `freeOperationActionIds` from `compiler-core` into `lowerEventDecks`.
  - Extended `compile-event-cards` lowering context plumbing so event-card `effects`, branch `effects`, and side/branch `lastingEffects.setupEffects` + `lastingEffects.teardownEffects` all receive `freeOperationActionIds`.
  - Added compile-level regression tests in `packages/engine/test/unit/compile-top-level.test.ts` for event-deck sequence viability parity:
    - disjoint explicit/default action domains emit `CNL_COMPILER_FREE_OPERATION_SEQUENCE_VIABILITY_RISK`
    - overlapping explicit/default action domains do not emit that warning
- **Deviations From Original Plan**:
  - `compile-effects` tests were not modified because lowerer-level domain viability coverage was already present and sufficient; only compile-level parity coverage was missing.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/compile-top-level.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo lint` passed.
