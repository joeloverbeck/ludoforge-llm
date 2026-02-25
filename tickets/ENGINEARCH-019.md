# ENGINEARCH-019: Make Defer Classification Consume Canonical Taxonomy Map

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — classifier implementation/data-source consolidation + tests
**Deps**: ENGINEARCH-018

## Problem

`EVAL_ERROR_DEFER_CLASSES_BY_CODE` now defines defer taxonomy, but classification helpers still hardcode defer logic separately. This creates drift risk and duplicates policy source-of-truth.

## Assumption Reassessment (2026-02-25)

1. `EVAL_ERROR_DEFER_CLASSES_BY_CODE` currently exists in `eval-error-defer-class.ts`.
2. `hasEvalErrorDeferClass` currently compares against `error.context?.deferClass` directly without consuming the taxonomy map.
3. No active ticket currently enforces taxonomy-map-to-classifier parity as a single source of truth.

## Architecture Check

1. Classifier behavior should be derived from one canonical taxonomy map to eliminate drift and reduce maintenance cost.
2. This is game-agnostic kernel infrastructure hardening and does not move game-specific behavior into runtime.
3. No backwards-compatibility aliases/shims are introduced; classifier internals become stricter and centralized.

## What to Change

### 1. Derive defer-class checks from `EVAL_ERROR_DEFER_CLASSES_BY_CODE`

Refactor classifier helper implementation so accepted defer classes are sourced from the map for the relevant eval-error code.

### 2. Add parity guardrails between taxonomy map and classifier behavior

Add targeted tests proving every defer class listed for a code is accepted, and missing/unlisted values are rejected.

### 3. Keep policy callers stable while reducing internal duplication

Preserve existing policy semantics in `missing-binding-policy` and selector flows while removing hardcoded duplicate taxonomy assumptions from classification internals.

## Files to Touch

- `packages/engine/src/kernel/eval-error-classification.ts` (modify)
- `packages/engine/src/kernel/eval-error-defer-class.ts` (modify, if needed)
- `packages/engine/test/unit/eval-error-classification.test.ts` (modify)
- `packages/engine/test/unit/eval-error-defer-class.test.ts` (modify)

## Out of Scope

- New defer-class values or new eval error codes
- Runtime policy behavior changes beyond taxonomy sourcing
- GameSpecDoc / visual-config model changes

## Acceptance Criteria

### Tests That Must Pass

1. Classifier acceptance/rejection behavior is derived from the taxonomy map.
2. Existing policy semantics remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Defer taxonomy has a single authoritative representation.
2. GameDef and simulator remain game-agnostic and free of game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-error-classification.test.ts` — assert classifier behavior for all mapped defer classes and rejection for unmapped/no-context cases.
2. `packages/engine/test/unit/eval-error-defer-class.test.ts` — assert taxonomy map shape and literals remain canonical.
3. `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` — verify policy behavior parity under map-driven classification (modify if needed).

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/eval-error-classification.test.js`
4. `node --test packages/engine/dist/test/unit/eval-error-defer-class.test.js`
5. `pnpm -F @ludoforge/engine test:unit`

