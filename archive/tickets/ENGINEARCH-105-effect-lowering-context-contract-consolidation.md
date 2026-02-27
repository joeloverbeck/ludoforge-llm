# ENGINEARCH-105: Effect-Lowering Context Contract Consolidation

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — CNL lowering API refactor to a single extensible context contract
**Deps**: tickets/ENGINEARCH-103-event-card-sequence-diagnostics-default-domain-parity.md, tickets/ENGINEARCH-104-free-operation-effective-domain-compiler-runtime-parity.md

## Problem

Effect lowering currently threads many optional parameters (`tokenTraitVocabulary`, `namedSets`, `typeInference`, `freeOperationActionIds`, binding scopes, ownership maps) across multiple function signatures. This creates parameter sprawl and increases drift risk when adding new compiler invariants.

## Assumption Reassessment (2026-02-27)

1. Verified: `lowerEffectsWithDiagnostics` currently accepts a positional chain of context-like parameters (`ownershipByBase`, `bindingScope`, `tokenTraitVocabulary`, `namedSets`, `typeInference`, `freeOperationActionIds`), and this shape is repeated in multiple call paths.
2. Verified: `compiler-core` currently forwards the same context components separately into `lowerTurnStructure`, `lowerActions`, `lowerTriggers`, and `lowerActionPipelines`, creating broad call-site churn risk when adding one new lowering dependency.
3. Verified: `compile-event-cards` does not call `lowerEffectsWithDiagnostics`; it repeats ad-hoc `lowerEffectArray` context-object assembly in several helpers (`lowerOptionalEffects`, `lowerEventLastingEffects`) and should be normalized to the same canonical context-construction pattern.
4. Correction: no dedicated compile-time/type-level contract tests currently exist for this boundary; scope should require runtime/unit regression coverage that proves reduced call-site churn and parity.

## Architecture Check

1. A single explicit context contract is cleaner than long positional parameter chains and reduces refactor blast radius.
2. This preserves core boundaries: game-specific content remains authored in `GameSpecDoc` (and visual data in visual-config), while `GameDef`/compiler/runtime mechanics stay generic.
3. No backwards-compatibility aliases/shims; perform direct internal API migration.

## What to Change

### 1. Introduce canonical effect-lowering context type(s)

Define one canonical context object for effect-lowering dependencies (ownership, vocabularies, named sets, type inference, free-operation defaults) plus per-call binding scope. This contract must be shared across compiler call paths that lower effects.

### 2. Migrate callers to context-object API

Refactor `compile-lowering`, `compile-operations`, `compile-event-cards`, and `compiler-core` call chains to pass structured context instead of expanding positional optional params.

### 3. Harden contract tests and compile-time checks

Add/adjust unit tests that demonstrate:
1. refactored lowering keeps compile outputs/diagnostics stable, and
2. effect-lowering callers can provide one structured context object rather than expanded positional parameter chains.

## Files to Touch

- `packages/engine/src/cnl/compile-lowering.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/cnl/compile-operations.ts` (modify)
- `packages/engine/src/cnl/compile-event-cards.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/unit/compile-actions.test.ts` (modify if needed for action-lowering call-path parity)

## Out of Scope

- New gameplay behavior.
- Any game-specific branching or schema specialization.

## Acceptance Criteria

### Tests That Must Pass

1. Refactored lowering paths preserve existing compile outputs and diagnostics.
2. Adding a new effect-lowering context field requires local/context-object changes, not widespread positional-parameter surgery.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. One canonical context contract exists for effect-lowering dependencies.
2. Compiler and runtime layers remain game-agnostic and decoupled from visual-config concerns.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-top-level.test.ts` — compile regression coverage across major sections after context refactor.
2. `packages/engine/test/unit/compile-effects.test.ts` — diagnostics and lowering behavior parity after API migration.
3. `packages/engine/test/unit/compile-actions.test.ts` — action-lowering regression coverage for context-object based effect lowering.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
3. `node --test packages/engine/dist/test/unit/compile-top-level.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-02-27
- **What Changed**:
  - Introduced shared effect-lowering context contract in `compile-lowering` (`EffectLoweringSharedContext` + `buildEffectLoweringContext`) and migrated `lowerEffectsWithDiagnostics` to consume it.
  - Migrated `lowerTurnStructure`, `lowerActions`, and `lowerTriggers` signatures to use the shared context object.
  - Migrated `compile-operations` (`lowerActionPipelines`) and `compile-event-cards` (`lowerEventDecks`/helpers) to use the same context-object pattern.
  - Consolidated context construction in `compiler-core` into one `loweringContext` object forwarded through lowering call paths.
  - Follow-up architectural cleanup: migrated `lowerOptionalCondition` to the same shared context-object style (`ConditionLoweringSharedContext` + `buildConditionLoweringContext`) and updated all action/pipeline/trigger condition-lowering call sites.
  - Added regression tests in `compile-effects.test.ts` and `compile-actions.test.ts` to lock context-adapter parity and action-path free-operation sequence diagnostics.
- **Deviations from Original Plan**:
  - `packages/engine/src/cnl/compile-effects.ts` did not require code changes because the canonical `EffectLoweringContext` already existed there; consolidation was done by standardizing callers around that contract.
  - `packages/engine/test/unit/compile-top-level.test.ts` required no edits because existing coverage already validated event-deck free-operation sequence paths after migration.
- **Verification Results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/compile-effects.test.js` ✅
  - `node --test packages/engine/dist/test/unit/compile-actions.test.js` ✅
  - `node --test packages/engine/dist/test/unit/compile-top-level.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (312/312 passing)
  - `pnpm turbo lint` ✅
