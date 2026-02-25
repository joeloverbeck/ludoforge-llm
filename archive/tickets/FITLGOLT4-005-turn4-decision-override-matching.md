# FITLGOLT4-005: Stabilize Turn 4 Decision Override Matching

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: FITLGOLT4-004

## Problem

The Turn 4 golden E2E test currently matches one decision override by a positional document path (`doc.eventDecks.0.cards.17...`). That is brittle: harmless event-deck reordering can break tests without behavior regressions.

## Assumption Reassessment (2026-02-25)

1. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` currently uses an index-based override matcher for Gulf of Tonkin (`doc.eventDecks.0.cards.17.unshaded.effects.0.chooseN`).
2. `decisionId` is not a stable identity surface in this flow because it embeds compiled document-path fragments.
3. Stable matching should key off semantic decision `name` values (`$selectedPieces...`, `$targetCity...`) and request shape/options, not path-derived ids.
4. No runtime behavior needs to change; this is only test robustness and maintainability.

## Architecture Check

1. Name/domain-based matching is cleaner because it couples tests to semantic intent instead of incidental ordering/path serialization.
2. This preserves game-specific data in `GameSpecDoc` and keeps `GameDef`/kernel behavior game-agnostic (no engine changes).
3. No backward-compatibility aliases or shims are introduced.

## What to Change

### 1. Replace positional override matcher with stable matcher

Update Turn 4 decision override rules to avoid hardcoded `eventDecks[0].cards[17]` path matching.

Preferred match strategy:
1. Match the Gulf of Tonkin `chooseN` decision by stable decision `name` pattern (`$selectedPieces`) rather than `decisionId`.
2. Match city assignment decisions by stable decision `name` pattern (`$targetCity`) as already used.
3. Guard the `chooseN` override with request shape/domain checks so it cannot accidentally match unrelated future decisions.
4. Keep deterministic selection behavior equivalent to current expectations.

### 2. Add regression assertion for matcher stability

Add a targeted assertion proving override resolution still works when decision-id path prefixes differ but semantic decision names are the same.

## Files to Touch

- `packages/engine/test/e2e/fitl-playbook-golden.test.ts` (modify)
- `packages/engine/test/unit/decision-param-helpers.test.ts` (modify)

## Out of Scope

- Any engine/kernel/runtime logic changes
- Reworking other playbook turns
- Introducing new event schema fields solely for tests

## Acceptance Criteria

### Tests That Must Pass

1. Turn 4 golden replay passes with stable semantic override matching.
2. A targeted robustness assertion verifies no dependence on card array index / path-derived decision-id fragments.
3. Existing suite: `pnpm -F @ludoforge/engine test:e2e`

### Invariants

1. Test behavior remains deterministic for the same seed/moves.
2. Override matching does not depend on incidental document ordering or decision-id path serialization.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` — replace brittle matcher and verify Turn 4 still passes.
2. `packages/engine/test/unit/decision-param-helpers.test.ts` — add selector-stability regression check for name-based override matching across varied decision-id prefixes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/e2e/fitl-playbook-golden.test.js`
3. `node --test packages/engine/dist/test/unit/decision-param-helpers.test.js`
4. `pnpm -F @ludoforge/engine test:e2e`

## Outcome

- Completion date: 2026-02-25
- Actually changed:
  - Turn 4 override matching now uses stable decision-name matching (`$selectedPieces`, `$targetCity`) instead of path-derived `decisionId` matching.
  - Added unit regression coverage to prove name-targeted overrides remain stable when decision-id prefixes differ.
  - Reassessed and corrected ticket assumptions/scope to reflect that `decisionId` is path-derived and brittle in this flow.
- Deviations from original plan:
  - No change to `packages/engine/test/helpers/decision-param-helpers.ts` was needed; regression was added in existing unit tests instead.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/decision-param-helpers.test.js` passed.
  - `node --test packages/engine/dist/test/e2e/fitl-playbook-golden.test.js` passed.
  - `pnpm -F @ludoforge/engine test:e2e` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
