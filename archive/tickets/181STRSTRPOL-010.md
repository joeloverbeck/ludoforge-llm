# 181STRSTRPOL-010: Phase 1 — Conformance test: Texas Hold'em card-collection selector

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-selector-eval.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`, `packages/engine/test/agents/conformance/`
**Deps**: `archive/tickets/181STRSTRPOL-006.md`, `archive/tickets/181STRSTRPOL-007.md`, `archive/tickets/181STRSTRPOL-008.md`

## Problem

Spec 181 §8 Phase 1 acceptance (b) requires conformance coverage across game families per Foundation #16. This ticket ships the Texas Hold'em card-collection conformance test — an end-to-end selector over `kind: 'cards'` exercised against Hold'em's deck/hand state. Confirms the selector stack handles hidden-information, stochastic card games and card-keyed quality components (e.g., per-card hand-strength contribution). Companion ticket to 009 (FITL zones) and 011 (declared product).

## Assumption Reassessment (2026-05-18)

1. Texas Hold'em was completed and archived per Spec 33; its game definition compiles via the existing CNL pipeline. Confirmed by Step 2 verification this session.
2. Hold'em is hidden-info + stochastic — representative of a different corner of Foundation #16's game-family matrix than FITL.
3. The selector binds to `kind: 'cards'`; visible-vs-hidden card filtering is enforced by the existing observer-policy / visibility layer (Foundation #4) — selector source materialisation must respect the seat's observer view.

## Architecture Check

1. Card-collection selector exercises Foundation #4 (Authoritative State and Observer Views): the selector ranks only visible cards for the asking seat; hidden cards do not leak via `where` or `quality.components` (Foundation #4, #20).
2. No game-specific branch in the selector evaluator — Hold'em's card visibility flows through the same observer-view facade FITL uses.
3. Property-form assertions only.

## Scope Correction (2026-05-18)

Live reassessment found the ticket's "test only" scope was stale: `collection.kind === 'cards'` was accepted by the compiler but returned an empty runtime source. Per Foundations #4, #15, and #16, this ticket now owns the missing generic runtime materialization for card selectors plus the Texas conformance proof. The runtime change must remain game-agnostic and observer-view-driven.

Current selector IR does not bind the source item payload into quality expressions, so this ticket proves visible card source materialization, bounded deterministic ranking, and hidden-card non-leakage. Per-card hand-strength scoring remains outside this ticket until selector item bindings exist.

## What to Change

### 1. Test file

Create `packages/engine/test/agents/conformance/selector-holdem-card-collection.test.ts` (implemented under `packages/engine/test/unit/agents/conformance/` so the default engine lane runs it):

```ts
// @test-class: architectural-invariant

import { describe, it } from 'vitest'; // match repo convention

describe('selector conformance — Texas Hold\'em card collection', () => {
  it('ranks visible cards by hand-strength contribution', () => {
    const def = compileSelector({
      id: 'holdem-card-rank',
      scopes: ['move'],
      source: { kind: 'collection', collection: { kind: 'cards' } },
      where: { ref: 'feature.cardIsVisibleToSeat' },         // observer-view-derived
      quality: {
        components: [
          { id: 'rank-value', value: { ref: 'feature.cardRankNumeric' }, weight: 4 },
          { id: 'suit-flush-potential', value: { ref: 'feature.cardSuitFlushContribution' }, weight: 2 },
        ],
        order: 'qualityDesc',
      },
      result: { maxItems: 7, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
    });

    const view = evaluateSelector(def, makeHoldemContext(seed));

    assertView({
      selectedMatchesIfHandHasCards: true,
      hiddenCardsAbsent: true,                              // observer-view enforcement
      orderingMonotonic: 'qualityDesc',
      stableKeyTieBreaker: true,
      withinMaxItems: 7,
    });
  });

  it('does not leak hidden cards via where or quality', () => {
    // Construct two contexts identical except for hidden-card payload.
    // Selector outputs must be bit-identical (observer view masks hidden cards).
    const viewA = evaluateSelector(def, ctxA);
    const viewB = evaluateSelector(def, ctxB);
    assert.equal(viewA, viewB); // structural equality
  });
});
```

### 2. Property assertions

- Selected set contains only cards visible to the asking seat.
- Hidden-card payload change does not change selector output (Foundation #4 leak check — the load-bearing property for this game family).
- Quality is monotonically non-increasing.
- Stable-key tie-breaker holds.

## Files to Touch

- `packages/engine/src/agents/policy-selector-eval.ts`
- `packages/engine/src/agents/policy-evaluation-core.ts`
- `packages/engine/test/agents/conformance/selector-holdem-card-collection.test.ts` (new)
- `packages/engine/test/agents/conformance/fixtures/holdem-selector-context.ts` (new — helper; or inline if trivial)

## Out of Scope

- FITL zone-collection conformance (009).
- Pair-selector / declared-product conformance (011).
- ARVN profile migration (012).
- New observer-view infrastructure — uses existing Foundation #4 facade.

## Acceptance Criteria

### Tests That Must Pass

1. `selector-holdem-card-collection.test.ts` — happy-path: visible-card ranking property assertions all pass.
2. Hidden-card leak check passes (two contexts identical except hidden cards → bit-identical selector view).
3. Determinism: re-run produces bit-identical view.
4. Existing Hold'em test suite: no regression.
5. Existing suite: `pnpm turbo test`

### Invariants

1. Hidden cards never surface in selector output for non-omniscient seats (Foundation #4).
2. Engine handles Hold'em state without game-specific branches (Foundation #1).
3. Deterministic ranking (Foundation #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/agents/conformance/selector-holdem-card-collection.test.ts` — conformance test.

### Commands

1. `pnpm -F @ludoforge/engine test -- selector-holdem`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Implemented generic card collection materialization for policy selectors and added the Texas Hold'em conformance proof as `packages/engine/test/unit/agents/conformance/selector-holdem-card-collection.test.ts`. The runtime now:

- materializes `collection.kind === 'cards'` as a deterministic finite token-key collection;
- filters card selector sources through `derivePlayerObservation` when an observer player/profile is present;
- threads the active policy observer profile from `PolicyEvaluationContext` into selector evaluation;
- keeps low-level direct selector calls deterministic when no observer is supplied.

The Texas conformance test uses the production Texas `GameDef`, advances to a real preflop decision state, evaluates the card selector from the active player's `currentPlayer` observer view, and asserts property-form guarantees:

- selected card keys are visible to the active player;
- hidden opponent/deck card changes do not alter selector output;
- result length is bounded by `maxItems`;
- results are `qualityDesc` ordered with `stableKeyAsc` tie-breaking;
- repeated evaluations are bit-identical.

Current selector IR still does not bind the selected source item into quality expressions, so the test uses a literal quality component. This ticket proves generic visible-card source materialization and hidden-card non-leakage, not per-card rank/hand-strength scoring.

## Verification

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/unit/agents/conformance/selector-holdem-card-collection.test.js packages/engine/dist/test/unit/agents/conformance/selector-fitl-zone-collection.test.js packages/engine/dist/test/unit/agents/policy-selector-eval.test.js` — passed.
- `pnpm -F @ludoforge/engine test -- selector-holdem-card-collection.test.ts` — passed.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed.
- `pnpm run check:ticket-deps` — passed.
- `git diff --check` — passed.
- `pnpm turbo build` — passed.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm turbo test` — red only in existing Spec 178 ARVN outcome-parity architecture tests for seeds `1005`, `1011`, `1008`, `1013`, and `1009`; both selector conformance tests passed inside the default unit lane and the runner tests passed.
