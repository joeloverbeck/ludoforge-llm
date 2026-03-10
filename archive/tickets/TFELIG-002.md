# TFELIG-002: Harden Immediate Event Eligibility Override Coverage

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test-only hardening around generic turn-flow eligibility behavior
**Deps**: tickets/README.md, tickets/_TEMPLATE.md, archive/specs/17-fitl-turn-sequence-eligibility-and-card-flow.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/test/integration/fitl-eligibility-window.test.ts, packages/engine/test/integration/fitl-events-son-tay.test.ts

## Problem

The new generic support for immediate `turn`-duration event eligibility overrides is covered for the positive path (`eligible: true`) and by Son Tay’s production behavior, but the contract is still lightly specified in tests for the negative path and mixed override combinations.

This leaves the engine vulnerable to subtle regressions in current-card candidate recomputation, especially when a turn-scoped ineligibility override combines with ordinary next-card overrides.

## Assumption Reassessment (2026-03-10)

1. `packages/engine/test/integration/fitl-eligibility-window.test.ts` already proves generic immediate `turn`-duration `eligible: true` behavior and confirms those overrides are not queued into `pendingEligibilityOverrides`.
2. `packages/engine/test/integration/fitl-events-son-tay.test.ts` already proves a production mixed case where a `turn` override applies immediately while a `nextTurn` override is queued, including `overrideCreate` trace assertions.
3. There is still no focused generic regression asserting immediate `eligible: false` behavior on the current card, and there is no generic mixed-contract test that documents the separation of `turn` vs `nextTurn` effects without relying on production FITL card payloads.
4. The missing work is test coverage, not additional Fire in the Lake-specific runtime logic.

## Architecture Check

1. Adding explicit generic regression tests remains cleaner than expanding production-card-specific tests because it documents the engine contract directly where the generic behavior lives.
2. A generic mixed-contract test is still beneficial even though Son Tay already covers the behavior in production, because the contract under test belongs to the reusable turn-flow engine and should be understandable without a FITL card-specific fixture.
3. This preserves the game-agnostic architecture: the new tests validate generic turn-flow semantics without introducing game-specific behavior into kernel code.
4. No backwards-compatibility paths are needed. This is contract hardening for the current generic behavior.

## What to Change

### 1. Add immediate-negative-path coverage

Extend the generic eligibility-window integration tests to cover:
- a `turn`-duration override that makes another seat immediately ineligible,
- recomputation of `firstEligible` and `secondEligible` after that override,
- confirmation that the override is not queued into `pendingEligibilityOverrides`.

### 2. Add mixed immediate/deferred override coverage

Add a focused generic case showing that:
- `turn` overrides affect only current-card eligibility,
- `nextTurn` overrides still queue and apply only at card end,
- `overrideCreate` traces remain coherent when both appear on the same event.

## Files to Touch

- `packages/engine/test/integration/fitl-eligibility-window.test.ts` (modify)

`packages/engine/test/unit/kernel/apply-move.test.ts` is no longer expected for this ticket unless integration-level trace assertions prove insufficient during implementation.

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

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/integration/fitl-eligibility-window.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

Completed on 2026-03-10.

What actually changed:
- Added the planned generic integration coverage in `packages/engine/test/integration/fitl-eligibility-window.test.ts` for immediate negative `turn` overrides and mixed `turn` plus `nextTurn` overrides.
- Did not change engine runtime behavior for the ticketed eligibility semantics because the current architecture already handled the intended contract correctly.
- Hardened `packages/engine/src/contracts/turn-flow-linked-window-contract.ts` so malformed or stale `turnFlow` objects without `windows` fail closed during validation instead of throwing.
- Added a unit regression in `packages/engine/test/unit/contracts/turn-flow-linked-window-contract.test.ts` for absent `turnFlow.windows`.
- Updated `packages/runner/test/model/derive-render-model-zones.test.ts` to use the current `turnFlow.windows` contract and regenerated `packages/runner/src/bootstrap/fitl-game-def.json` from the canonical bootstrap fixture generator so the runner test suite matches the current engine contract.

What changed versus the original plan:
- The original ticket correctly narrowed the functional work to tests, and that remained true for the eligibility behavior itself.
- Additional repository-health work was required outside the original ticket scope because full repo verification exposed stale runner fixtures and an avoidable validator crash path unrelated to the core FITL behavior.

Verification completed:
- `pnpm -F @ludoforge/engine build`
- `node dist/test/integration/fitl-eligibility-window.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm -F @ludoforge/runner exec vitest run test/bootstrap/resolve-bootstrap-config.test.ts test/model/derive-render-model-zones.test.ts`
- `pnpm turbo lint`
- `pnpm turbo test`
- `pnpm run check:ticket-deps`
