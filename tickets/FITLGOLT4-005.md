# FITLGOLT4-005: Stabilize Turn 4 Decision Override Matching

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: FITLGOLT4-004

## Problem

The Turn 4 golden E2E test currently matches one decision override by a positional document path (`doc.eventDecks.0.cards.17...`). That is brittle: harmless event-deck reordering can break tests without behavior regressions.

## Assumption Reassessment (2026-02-25)

1. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` currently uses an index-based override matcher for Gulf of Tonkin (`doc.eventDecks.0.cards.17.unshaded.effects.0.chooseN`).
2. The engine emits stable decision metadata (`decisionId`, bound names, and option sets) that can be matched without relying on array indices.
3. No runtime behavior needs to change; this is only test robustness and maintainability.

## Architecture Check

1. Identifier-based matching is cleaner because it couples test logic to semantic identities (card/effect intent) instead of incidental ordering.
2. This preserves game-specific data in `GameSpecDoc` and keeps `GameDef`/kernel behavior game-agnostic (no engine changes).
3. No backward-compatibility aliases or shims are introduced.

## What to Change

### 1. Replace positional override matcher with stable matcher

Update Turn 4 decision override rules to avoid hardcoded `eventDecks[0].cards[17]` path matching.

Preferred match strategy:
1. Match by decision metadata that references the Gulf of Tonkin event and/or stable decision id pattern.
2. Keep deterministic selection behavior equivalent to current expectations.

### 2. Add regression assertion for matcher stability

Add a small targeted assertion in the same test file or helper test proving that override resolution still works if card ordering changes while card id/decision identity stays consistent.

## Files to Touch

- `packages/engine/test/e2e/fitl-playbook-golden.test.ts` (modify)
- `packages/engine/test/helpers/decision-param-helpers.ts` (modify, if needed for stable matching)

## Out of Scope

- Any engine/kernel/runtime logic changes
- Reworking other playbook turns
- Introducing new event schema fields solely for tests

## Acceptance Criteria

### Tests That Must Pass

1. Turn 4 golden replay passes with identifier-based override matching.
2. A targeted robustness assertion verifies no dependence on card array index.
3. Existing suite: `pnpm -F @ludoforge/engine test:e2e`

### Invariants

1. Test behavior remains deterministic for the same seed/moves.
2. Override matching does not depend on incidental document ordering.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` — replace brittle matcher and verify Turn 4 still passes.
2. `packages/engine/test/helpers/decision-param-helpers.test.ts` (if present) or nearby relevant test — add selector-stability regression check.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/e2e/fitl-playbook-golden.test.js`
3. `pnpm -F @ludoforge/engine test:e2e`
