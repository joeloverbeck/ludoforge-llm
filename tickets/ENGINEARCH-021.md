# ENGINEARCH-021: Centralize Selector-Cardinality Context Construction and Close Test Gaps

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — selector-cardinality context builder helpers + resolver/runtime tests
**Deps**: ENGINEARCH-020

## Problem

Selector-cardinality context payloads are still hand-built at emit sites. Manual construction increases drift risk as contracts evolve, and current tests miss two important guardrails: explicit coverage for the player `playerCount` error path and an explicit regression check for mixed-field context construction attempts.

## Assumption Reassessment (2026-02-25)

1. Selector-cardinality eval errors are emitted in `packages/engine/src/kernel/resolve-selectors.ts`.
2. Context payloads are currently assembled inline object literals at throw sites.
3. Existing `resolve-selectors` tests assert `selectorKind` for resolved-count branches, but do not directly lock the zero-player relative-selector `playerCount` branch metadata shape.

## Architecture Check

1. Centralized context builders improve maintainability and reduce contract drift versus repeated inline object literals.
2. This remains kernel-generic and does not introduce game-specific data or branching into GameDef/simulation/runtime.
3. No backwards-compatibility shims are introduced; emitters use the canonical contract helpers directly.

## What to Change

### 1. Add selector-cardinality context builder helpers

Add typed helpers in eval-error/kernel surface to construct player and zone selector-cardinality contexts consistently.

### 2. Migrate selector-cardinality emitters to helper usage

Update `resolve-selectors.ts` to use builders for all selector-cardinality throws.

### 3. Add missing branch-focused tests

Add tests that explicitly verify:
- zero-player relative selector emits `selectorKind: 'player'` with `playerCount`
- mixed-branch construction attempts are rejected at compile time via type tests (if not fully covered elsewhere)

## Files to Touch

- `packages/engine/src/kernel/eval-error.ts` (modify)
- `packages/engine/src/kernel/resolve-selectors.ts` (modify)
- `packages/engine/test/unit/resolve-selectors.test.ts` (modify)
- `packages/engine/test/unit/types-foundation.test.ts` (modify, if needed)

## Out of Scope

- Selector runtime selection semantics changes
- New eval-error codes or defer classes
- GameSpecDoc / visual-config schema changes

## Acceptance Criteria

### Tests That Must Pass

1. Selector-cardinality emitters no longer construct ad-hoc payload shapes.
2. Player zero-cardinality (`playerCount`) path has explicit metadata-shape assertions.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Selector-cardinality context construction has one canonical code path per branch kind.
2. GameDef/simulator remain game-agnostic and do not absorb selector-policy specifics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/resolve-selectors.test.ts` — add explicit assertion for zero-player relative selector context shape (`selectorKind: 'player'`, `playerCount`).
2. `packages/engine/test/unit/types-foundation.test.ts` — extend compile-time regression coverage for improper context construction patterns.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/resolve-selectors.test.js`
4. `pnpm -F @ludoforge/engine test:unit`
