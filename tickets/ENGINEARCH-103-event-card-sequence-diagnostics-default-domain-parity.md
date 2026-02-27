# ENGINEARCH-103: Event-Card Sequence Diagnostics Default-Domain Parity

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler event-card effect lowering context plumbing
**Deps**: specs/17-fitl-turn-sequence-eligibility-and-card-flow.md

## Problem

Free-operation sequence viability diagnostics now account for effective action domains in most compile surfaces, but event-card effect lowering paths do not receive turn-flow default free-operation action IDs. This creates inconsistent diagnostics depending on where `grantFreeOperation` appears.

## Assumption Reassessment (2026-02-27)

1. `compiler-core` now computes turn-flow defaults and threads them through setup/turnStructure/actions/triggers/actionPipelines lowering paths.
2. `compile-event-cards` still calls `lowerEffectArray` without `freeOperationActionIds` context for `effects`, `setupEffects`, and `teardownEffects`.
3. Mismatch: sequence diagnostics are surface-dependent; corrected scope is to thread the same effective-domain context into event-card lowering.

## Architecture Check

1. Uniform diagnostics semantics across all effect-authoring surfaces is cleaner than path-dependent behavior and reduces surprise.
2. This preserves boundaries: game-specific authored data remains in `GameSpecDoc`, while compiler/runtime behavior stays game-agnostic; no visual-config coupling is introduced.
3. No backwards-compatibility aliases/shims; adopt one canonical lowering-context contract.

## What to Change

### 1. Thread free-operation defaults into event-card lowering

Add optional `freeOperationActionIds` parameter(s) to event-card lowering entry points and pass through to all internal `lowerEffectArray` calls.

### 2. Plumb from compiler core

Pass turn-flow defaults from `compiler-core` into `lowerEventDecks` so event-card effects use the same effective-domain model as other sections.

### 3. Add event-card specific regression coverage

Add compile tests demonstrating disjoint and overlapping explicit/default domains for event-card-authored sequence chains.

## Files to Touch

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/compile-event-cards.ts` (modify)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify if shared helpers/assertions are preferable)

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
2. `packages/engine/test/unit/compile-effects.test.ts` — optional shared assertions/helpers only if needed to avoid duplication.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compile-top-level.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`
