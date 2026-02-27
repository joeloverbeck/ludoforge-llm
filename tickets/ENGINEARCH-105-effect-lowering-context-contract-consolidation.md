# ENGINEARCH-105: Effect-Lowering Context Contract Consolidation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — CNL lowering API refactor to a single extensible context contract
**Deps**: tickets/ENGINEARCH-103-event-card-sequence-diagnostics-default-domain-parity.md, tickets/ENGINEARCH-104-free-operation-effective-domain-compiler-runtime-parity.md

## Problem

Effect lowering currently threads many optional parameters (`tokenTraitVocabulary`, `namedSets`, `typeInference`, `freeOperationActionIds`, binding scopes, ownership maps) across multiple function signatures. This creates parameter sprawl and increases drift risk when adding new compiler invariants.

## Assumption Reassessment (2026-02-27)

1. `lowerEffectsWithDiagnostics` and callers now carry expanded optional argument lists across compile-lowering/compiler-core/compile-operations.
2. Recent changes required touching multiple call sites to propagate one additional context field.
3. Mismatch: the architecture is functionally correct but not ideal for long-term extensibility; corrected scope is to centralize effect-lowering dependencies in a canonical context object.

## Architecture Check

1. A single explicit context contract is cleaner than long positional parameter chains and reduces refactor blast radius.
2. This preserves core boundaries: game-specific content remains authored in `GameSpecDoc` (and visual data in visual-config), while `GameDef`/compiler/runtime mechanics stay generic.
3. No backwards-compatibility aliases/shims; perform direct internal API migration.

## What to Change

### 1. Introduce canonical lowering context type(s)

Define one context object for effect lowering call paths (for example ownership, binding scope, vocabularies, type inference, free-operation defaults).

### 2. Migrate callers to context-object API

Refactor `compile-lowering`, `compile-operations`, `compile-event-cards`, and `compiler-core` call chains to pass structured context instead of expanding positional optional params.

### 3. Harden contract tests and compile-time checks

Add tests and type-level assertions that new context fields can be introduced with minimal call-site churn and without semantic regressions.

## Files to Touch

- `packages/engine/src/cnl/compile-lowering.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/cnl/compile-operations.ts` (modify)
- `packages/engine/src/cnl/compile-event-cards.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)

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
3. `packages/engine/test/unit/compile-actions.test.ts` — optional call-path regression coverage if signature-level changes affect action lowering flow.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
3. `node --test packages/engine/dist/test/unit/compile-top-level.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`
