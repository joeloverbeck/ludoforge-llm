# ENGINEARCH-015: Discriminate Selector-Cardinality EvalError Context by Selector Kind

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel eval-error context contracts + selector error call-sites + type tests
**Deps**: ENGINEARCH-014

## Problem

`SELECTOR_CARDINALITY` context typing is stricter than before but still not fully sound: player-selector failures can structurally match zone-selector context branches because both rely on `selector` values that overlap at type level (`ZoneSel` is `string`). This allows semantically invalid context combinations to compile.

## Assumption Reassessment (2026-02-25)

1. `SELECTOR_CARDINALITY` currently maps to a union type in `packages/engine/src/kernel/eval-error.ts`, but it is not explicitly discriminated.
2. `ZoneSel` is currently `string` in `packages/engine/src/kernel/types-ast.ts`, so player string literals (for example `'all'`) are assignable to zone-selector branches.
3. Type tests in `packages/engine/test/unit/types-foundation.test.ts` cover several invalid contexts but do not yet prove that player selectors cannot be paired with zone metadata (`resolvedZones`) and vice versa.

## Architecture Check

1. A true discriminator (`selectorKind`) is cleaner and more robust than structural unions over overlapping primitives.
2. This refinement is kernel-generic and keeps game semantics in GameSpecDoc data, not in runtime type loopholes.
3. No alias paths/backward-compat shims are introduced; invalid mixed contexts become compile-time failures directly.

## What to Change

### 1. Introduce explicit selector-kind discrimination in `SELECTOR_CARDINALITY` context

Add `selectorKind: 'player' | 'zone'` and split payload requirements by selector kind.

### 2. Update selector-cardinality emitters to construct discriminated payloads

Update `resolve-selectors` and any other selector-cardinality call sites so emitted contexts include correct discriminator and branch-specific required fields.

### 3. Add compile-time guardrails for cross-branch misuse

Add `@ts-expect-error` cases that explicitly reject:
- player selector + zone payload fields
- zone selector + player payload fields
- missing discriminator

## Files to Touch

- `packages/engine/src/kernel/eval-error.ts` (modify)
- `packages/engine/src/kernel/resolve-selectors.ts` (modify)
- `packages/engine/test/unit/types-foundation.test.ts` (modify)
- `packages/engine/test/unit/eval-error.test.ts` (modify, if needed)

## Out of Scope

- Selector runtime semantics changes
- GameSpecDoc schema or CNL grammar changes
- Runner/UI behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Type system rejects mixed selector-kind payloads for `SELECTOR_CARDINALITY`.
2. Runtime selector-cardinality behavior remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Selector-cardinality metadata is compile-time unambiguous and branch-safe.
2. GameDef/simulator remain game-agnostic and policy-generic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-foundation.test.ts` — add discriminator-focused compile-time rejection/acceptance coverage.
2. `packages/engine/test/unit/eval-error.test.ts` — verify runtime metadata payload shape still supports current guard behavior.
3. `packages/engine/test/unit/resolve-selectors.test.ts` — confirm emitted selector-cardinality metadata remains behaviorally stable.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/resolve-selectors.test.js`
4. `pnpm -F @ludoforge/engine test:unit`
