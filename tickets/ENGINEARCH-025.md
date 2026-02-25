# ENGINEARCH-025: Add Direct Contract Tests for Selector-Cardinality Context Builders

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — eval-error helper contract tests (runtime + compile-time)
**Deps**: ENGINEARCH-021

## Problem

Selector-cardinality context builders now centralize payload construction, but there is no direct test coverage on those helpers. Current tests only validate behavior through `resolve-selectors` throw paths, so helper contract regressions could slip in with weaker localization.

## Assumption Reassessment (2026-02-25)

1. `selectorCardinalityPlayerCountContext`, `selectorCardinalityPlayerResolvedContext`, and `selectorCardinalityZoneResolvedContext` are defined in `packages/engine/src/kernel/eval-error.ts`.
2. `packages/engine/test/unit/resolve-selectors.test.ts` covers downstream emitted context shape, not direct helper function contracts.
3. `packages/engine/test/unit/types-foundation.test.ts` already covers mixed player/zone context rejection for `selectorCardinalityError`, but not helper-return contract specifics.

## Architecture Check

1. Testing the canonical builders directly is cleaner than relying only on indirect call-path assertions and improves regression localization.
2. The work is kernel-generic contract hardening and does not add game-specific behavior to `GameDef` or simulation/runtime.
3. No backwards-compatibility shims or aliases are introduced; tests enforce strict current helper contracts.

## What to Change

### 1. Add direct runtime shape checks for helper outputs

Add unit tests that call each selector-cardinality context helper directly and assert exact branch-shape semantics (`selectorKind`, count source, optional defer handling).

### 2. Add direct compile-time guardrails for helper misuse

Add type tests that verify helper calls reject mixed branch payload inputs and invalid defer-class literals at construction boundaries.

## Files to Touch

- `packages/engine/test/unit/eval-error.test.ts` (modify)
- `packages/engine/test/unit/types-foundation.test.ts` (modify)

## Out of Scope

- Selector resolution runtime logic changes
- New eval-error codes or defer classes
- GameSpecDoc or visual-config schema changes

## Acceptance Criteria

### Tests That Must Pass

1. Each selector-cardinality helper has direct unit assertions for expected context shape.
2. Compile-time tests prevent helper misuse that would blur player/zone branch contracts.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Selector-cardinality context construction remains centralized and contract-driven.
2. `GameDef`/simulation remain fully game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-error.test.ts` — add direct runtime contract tests for selector-cardinality context builders.
2. `packages/engine/test/unit/types-foundation.test.ts` — add compile-time misuse checks for helper call shapes and defer metadata.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/eval-error.test.js`
4. `pnpm -F @ludoforge/engine test:unit`

