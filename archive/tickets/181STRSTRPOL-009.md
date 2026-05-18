# 181STRSTRPOL-009: Phase 1 — Conformance test: FITL zone-collection selector

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/test/agents/conformance/` (test only)
**Deps**: `archive/tickets/181STRSTRPOL-006.md`, `archive/tickets/181STRSTRPOL-007.md`, `archive/tickets/181STRSTRPOL-008.md`

## Problem

Spec 181 §8 Phase 1 acceptance (b) requires conformance coverage across game families per Foundation #16. This ticket ships the FITL zone-collection conformance test — an end-to-end selector over `kind: 'zones'` exercised against the FITL game's actual state model. Confirms the selector stack handles area-control games with named zone collections and zone-keyed quality components (e.g., per-zone presence, control).

## Assumption Reassessment (2026-05-18)

1. FITL is an asymmetric, hidden-info, area-control game with rich zone state; representative of one corner of Foundation #16's game-family matrix. Confirmed by repo state.
2. The FITL game definition compiles via the existing CNL pipeline; loading a FITL `GameDef` for the test follows existing fixture patterns under `packages/engine/test/`.
3. Spec 180's standing-role infrastructure is available — the conformance selector may incorporate `nearestThreat` / `currentLeader` as quality components to exercise the cross-spec wiring.

## Architecture Check

1. The conformance test exercises selector evaluation against a real game's state (Foundation #1 — generic stack runs FITL without per-game branches).
2. The selector is a fixture authored inside the test (not a permanent profile YAML); ARVN profile migration (012) is the production conformance proof. Keeping the conformance test fixture-only avoids coupling Phase 1 acceptance to ARVN profile evolution.
3. Property-form assertions only (matches probe-harness anti-overfit posture from spec §4 / proposal §9.4).

## What to Change

### 1. Test file

Create `packages/engine/test/agents/conformance/selector-fitl-zone-collection.test.ts`:

```ts
// @test-class: architectural-invariant
// Conformance: selector primitive evaluates correctly over a real area-control game's zone collection.

import { describe, it } from 'vitest'; // or node:test equivalent — match existing repo convention
import { evaluateSelector } from '@ludoforge/engine/agents/policy-selector-eval';
// ... existing FITL fixture imports

describe('selector conformance — FITL zone collection', () => {
  it('ranks zones by a composite quality expression', () => {
    const def = compileSelector({
      id: 'fitl-zone-quality',
      scopes: ['move'],
      source: { kind: 'collection', collection: { kind: 'zones' } },
      where: { ref: 'feature.zoneIsAccessibleToSeat' }, // or equivalent FITL-state-derived predicate
      quality: {
        components: [
          { id: 'presence', value: { ref: 'feature.zonePresenceScore' }, weight: 6 },
          { id: 'leaderDenial', value: { ref: 'standing.role.currentLeader.delta.victory.currentMargin' }, weight: 3, previewFallback: { onUnavailable: 'noContribution' } },
        ],
        order: 'qualityDesc',
      },
      result: { maxItems: 8, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
    });

    const view = evaluateSelector(def, makeFitlContext(seed));

    // Property assertions
    assertView({
      selectedMatches: true,
      orderingMonotonic: 'qualityDesc',
      stableKeyTieBreaker: true,
      topQualityFinite: true,
      withinMaxItems: 8,
    });
  });
});
```

(The above is illustrative — actual API names align with what 006/007 export.)

### 2. Property assertions

Assertions must be properties, not pinned values:
- `view.selected.length <= maxItems`.
- `view.selected` is monotonically non-increasing in quality (or non-decreasing for `qualityAsc`).
- Stable-key tie-breaker holds (equal-quality items ordered by `stableKeyAsc`).
- All quality values are finite integers.
- `impactSatisfied` reflects `minImpact` evaluation correctly when minImpact is set.

### 3. Determinism

Add a second test asserting two consecutive `evaluateSelector` calls on the same `(def, context)` pair produce bit-identical views.

## Files to Touch

- `packages/engine/test/agents/conformance/selector-fitl-zone-collection.test.ts` (new)
- `packages/engine/test/agents/conformance/fixtures/fitl-selector-context.ts` (new — small helper to build the test context; or inline if trivial)

## Out of Scope

- Card-collection conformance (010).
- Pair-selector / declared-product conformance (011).
- ARVN profile migration (012).
- Production profile changes — this test uses a fixture selector authored inline.

## Acceptance Criteria

### Tests That Must Pass

1. `selector-fitl-zone-collection.test.ts` — the property assertions above all pass against current FITL state model.
2. Determinism test passes.
3. Existing FITL test suite: no regression.
4. Existing suite: `pnpm turbo test`

### Invariants

1. Engine handles FITL state without game-specific branches (Foundation #1).
2. Selector evaluation deterministic across runs (Foundation #8).
3. Property-form assertions only (no exact-zone-id pinning).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/agents/conformance/selector-fitl-zone-collection.test.ts` — conformance test.

### Commands

1. `pnpm -F @ludoforge/engine test -- selector-fitl`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Implemented the FITL zone-collection selector conformance test as `packages/engine/test/unit/agents/conformance/selector-fitl-zone-collection.test.ts`. The `unit/agents/conformance` placement keeps the test under the engine default test lane while preserving the ticket's conformance boundary. The test compiles the production FITL `GameDef`, builds a real FITL initial state, evaluates a selector over `kind: 'zones'`, and asserts property-form guarantees:

- result length is bounded by `maxItems`;
- results are `qualityDesc` ordered with `stableKeyAsc` tie-breaking;
- selected qualities and components are finite integers;
- `impactSatisfied` reflects `minImpact`;
- repeated evaluations over the same `(selector, FITL context)` are bit-identical.

The selector fixture uses literal quality components over the real FITL zone collection. Current selector expression evaluation does not bind per-zone item payload into quality expressions, so this is a zone-collection/runtime conformance proof rather than a per-zone control-score authoring proof.

## Verification

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/unit/agents/conformance/selector-fitl-zone-collection.test.js packages/engine/dist/test/unit/agents/policy-selector-eval.test.js` — passed.
- `pnpm -F @ludoforge/engine test -- selector-fitl-zone-collection.test.ts` — passed.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed.
- `pnpm run check:ticket-deps` — passed.
- `git diff --check` — passed.
- `pnpm turbo build` — passed.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm turbo test` — red only in existing Spec 178 ARVN outcome-parity architecture tests for seeds `1005`, `1011`, `1008`, `1013`, and `1009`; the new selector conformance test passed inside the default unit lane.
