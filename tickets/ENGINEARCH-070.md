# ENGINEARCH-070: Complete EffectContext test-builder consolidation to eliminate contract drift

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — test architecture refactor (EffectContext builder consolidation)
**Deps**: ENGINEARCH-069

## Problem

EffectContext construction logic is still duplicated across multiple unit/integration tests. Partial helper migration reduces some duplication, but incomplete consolidation leaves drift risk whenever EffectContext contracts evolve (for example required mode, trace fields, runtime index handling).

## Assumption Reassessment (2026-02-26)

1. A shared EffectContext test helper exists and is already used in part of the suite.
2. Multiple tests still define local EffectContext builders with duplicated contract fields.
3. Previous contract hardening required widespread edits, showing duplication-induced maintenance cost.
4. **Mismatch + correction**: all practical EffectContext test construction should route through shared helpers, with only test-specific state/def setup remaining local.

## Architecture Check

1. Consolidating construction paths into a shared helper is cleaner and more robust than scattered local builders, because future contract changes become one focused edit.
2. This work is test-only architecture hygiene and remains game-agnostic.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Migrate remaining local EffectContext builders

Replace remaining duplicated local EffectContext builder literals/functions with shared helper usage where feasible.

### 2. Preserve test readability

Keep per-test def/state/token fixtures local; only centralize EffectContext envelope construction.

### 3. Avoid over-abstraction

Do not force migration where helper usage would reduce clarity; document exceptions inline when intentional.

## Files to Touch

- `packages/engine/test/helpers/effect-context-test-helpers.ts` (modify if helper capability gaps are found)
- Remaining tests with local `EffectContext` builders (modify as needed)

## Out of Scope

- Runtime/kernel production behavior changes
- Changes to GameSpecDoc/GameDef contracts

## Acceptance Criteria

### Tests That Must Pass

1. Remaining EffectContext test builders are consolidated through shared helper unless clearly justified.
2. Engine test suite remains green.
3. `pnpm -F @ludoforge/engine build`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

### Invariants

1. EffectContext contract duplication is minimized across tests.
2. Future EffectContext changes require minimal touch points.

## Test Plan

### New/Modified Tests

1. Modified unit/integration tests currently using local EffectContext builders — refactor-only updates that preserve assertions and behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
