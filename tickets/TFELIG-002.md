# TFELIG-002: Harden Immediate Event Eligibility Override Coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test-only hardening around generic turn-flow eligibility behavior
**Deps**: tickets/README.md, tickets/_TEMPLATE.md, archive/specs/17-fitl-turn-sequence-eligibility-and-card-flow.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/test/integration/fitl-eligibility-window.test.ts, packages/engine/test/integration/fitl-events-son-tay.test.ts

## Problem

The new generic support for immediate `turn`-duration event eligibility overrides is covered for the positive path (`eligible: true`) and by Son Tay’s production behavior, but the contract is still lightly specified in tests for the negative path and mixed override combinations.

This leaves the engine vulnerable to subtle regressions in current-card candidate recomputation, especially when a turn-scoped ineligibility override combines with ordinary next-card overrides.

## Assumption Reassessment (2026-03-10)

1. Current tests prove immediate positive override application and Son Tay’s mixed immediate-plus-next-card behavior.
2. There is not yet a focused generic regression asserting immediate `eligible: false` behavior on the current card in isolation.
3. The missing work is test coverage, not additional Fire in the Lake-specific runtime logic.

## Architecture Check

1. Adding explicit generic regression tests is cleaner than expanding production-card-specific tests because it documents the engine contract directly where the generic behavior lives.
2. This preserves the game-agnostic architecture: the new tests validate generic turn-flow semantics without introducing game-specific behavior into kernel code.
3. No backwards-compatibility paths are needed. This is contract hardening for the current generic behavior.

## What to Change

### 1. Add immediate-negative-path coverage

Extend the generic eligibility-window integration tests to cover:
- a `turn`-duration override that makes another seat immediately ineligible,
- recomputation of `firstEligible` and `secondEligible` after that override,
- confirmation that the override is not queued into `pendingEligibilityOverrides`.

### 2. Add mixed immediate/deferred override coverage

Add a focused case showing that:
- `turn` overrides affect only current-card eligibility,
- `nextTurn` overrides still queue and apply only at card end,
- traces remain coherent when both appear on the same event.

## Files to Touch

- `packages/engine/test/integration/fitl-eligibility-window.test.ts` (modify)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify if a lower-level trace assertion is the cleanest place)

## Out of Scope

- Changing production FITL card data.
- Refactoring the window contract itself. That belongs in `TFELIG-001`.
- Adding new runtime features beyond what already shipped for immediate `turn` overrides.

## Acceptance Criteria

### Tests That Must Pass

1. A generic integration test proves immediate `eligible: false` current-card behavior.
2. A generic integration or unit test proves mixed `turn` + `nextTurn` overrides preserve the expected separation of effects.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `turn`-duration event eligibility overrides change only the current card’s active eligibility state.
2. `nextTurn` event eligibility overrides remain queued-only until card end.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-eligibility-window.test.ts` — add immediate negative-path and mixed override assertions.
2. `packages/engine/test/unit/kernel/apply-move.test.ts` — add lower-level trace assertions only if integration coverage is insufficient.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/integration/fitl-eligibility-window.test.js`
3. `pnpm -F @ludoforge/engine test`
