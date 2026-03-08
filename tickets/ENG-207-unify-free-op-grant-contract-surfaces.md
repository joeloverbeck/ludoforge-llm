# ENG-207: Unify Free-Operation Grant Contract Surfaces

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — AST/effect grant contracts + event grant contracts
**Deps**: archive/tickets/FITLEVENTARCH/ENG-201-free-op-grant-viability-gating.md, packages/engine/src/kernel/types-events.ts, packages/engine/src/kernel/types-ast.ts, packages/engine/src/cnl/compile-effects.ts, packages/engine/src/kernel/schemas-ast.ts, packages/engine/src/kernel/schemas-extensions.ts

## Problem

Grant capabilities are currently split: event-side grants support `viabilityPolicy`, while effect-based `grantFreeOperation` does not. This creates divergent semantics for conceptually identical grant behavior.

## Assumption Reassessment (2026-03-08)

1. Event free-operation grants include `viabilityPolicy` in schema/types.
2. Effect AST `grantFreeOperation` contract does not currently expose equivalent policy fields.
3. Mismatch: same grant concept has different capabilities depending on declaration surface. Correction: unify contracts so behavior is defined once and reused everywhere.

## Architecture Check

1. Unified grant contracts reduce semantic drift and improve long-term extensibility.
2. Shared contract remains game-agnostic and data-driven (`GameSpecDoc`), with no game-specific runtime branching.
3. No backwards-compatibility aliases/shims: one canonical grant policy model across surfaces.

## What to Change

### 1. Introduce shared grant policy contract

Define shared grant-policy fields/types once and reuse in both event grant and effect grant structures.

### 2. Extend effect grant schema/lowering/validation

Add unified policy fields to `grantFreeOperation` AST schema/lowering/runtime validation so effect grants can express the same policy semantics as event grants.

### 3. Ensure consistent runtime enforcement

Ensure unified policy fields are honored identically after lowering to runtime pending grants regardless of source surface.

## Files to Touch

- `packages/engine/src/kernel/types-events.ts` (modify)
- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Mandating all existing cards use effect grants.
- Sequence context and mandatory outcome contracts (ENG-202/ENG-203).

## Acceptance Criteria

### Tests That Must Pass

1. Event-defined and effect-defined grants both accept and enforce shared policy fields.
2. Lowered runtime pending grants are equivalent for semantically equivalent event/effect grant declarations.
3. Existing suites: `node --test packages/engine/dist/test/unit/compile-effects.test.js packages/engine/dist/test/unit/effects-turn-flow.test.js`

### Invariants

1. Free-operation grant semantics are defined by one canonical shared contract model.
2. Runtime enforcement does not branch by grant declaration source.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — policy field parsing/lowering for `grantFreeOperation`.
2. `packages/engine/test/unit/effects-turn-flow.test.ts` — runtime enforcement parity for effect grants.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — cross-surface parity regression tests.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-effects.test.js packages/engine/dist/test/unit/effects-turn-flow.test.js`
3. `pnpm -F @ludoforge/engine test`
