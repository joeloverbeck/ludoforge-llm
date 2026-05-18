# 181STRSTRPOL-011: Phase 1 — Conformance test: fixture-game declared-product selector

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/test/agents/conformance/` (test only)
**Deps**: `archive/tickets/181STRSTRPOL-006.md`, `archive/tickets/181STRSTRPOL-007.md`, `tickets/181STRSTRPOL-008.md`

## Problem

Spec 181 §8 Phase 1 acceptance (b) requires a declared-product (origin/destination) conformance test against a fixture game per Foundation #16. This ticket ships that test — an end-to-end selector over `kind: 'product'` with `maxPairs` enforcement, exercising the pair-selector codepath the proposal §6.3 identified as the missing primitive for movement/transport/conversion decisions. Companion ticket to 009 (FITL zones) and 010 (Hold'em cards).

## Assumption Reassessment (2026-05-18)

1. A small architectural fixture game exists under `packages/engine/test/architecture/` or similar (per Step 2 verification — `architecture/preview-post-grant/post-grant-fixture.ts` exists). If a suitable perfect-info fixture is available, use it; otherwise author a minimal one (zones + tokens, no hidden info, no stochasticity) inside the test directory. Confirm during implementation.
2. The pair-selector source uses `kind: 'product', left: zones, right: zones, maxPairs: <N>`; truncation emits `POLICY_SELECTOR_PRODUCT_TRUNCATED` advisory once per `(decisionId, selectorId)`.
3. Property-form assertions matter especially here because pair-selector outputs scale O(N²) — exact-pair pinning would be brittle.

## Architecture Check

1. The fixture game is perfect-information — completes the Foundation #16 game-family matrix (FITL = asymmetric+hidden+area-control; Hold'em = hidden+stochastic; fixture = perfect-info). No game-specific selector logic (Foundation #1, #16).
2. `maxPairs` enforcement is the load-bearing safety property for pair selectors — without it, `O(N²)` products would violate Foundation #10. This conformance test exercises both the no-truncation case (`maxPairs` ≥ product size) and the truncation case (`maxPairs` < product size).
3. Property assertions: deterministic truncation order, advisory-emit-once semantics, no engine-wide leakage of intermediate product material.

## What to Change

### 1. Fixture game (if needed)

If no suitable perfect-info fixture exists, create a minimal one at `packages/engine/test/agents/conformance/fixtures/perfect-info-fixture-game/` with: a 4-zone board, 2 token types, no hidden state, no stochasticity. Just enough to exercise selector evaluation.

If a fixture already exists, reuse it.

### 2. Test file

Create `packages/engine/test/agents/conformance/selector-product-pair.test.ts`:

```ts
// @test-class: architectural-invariant

describe('selector conformance — declared product (origin/destination)', () => {
  it('produces deterministic top-K from a bounded product', () => {
    const def = compileSelector({
      id: 'origin-destination-pair-quality',
      scopes: ['move'],
      source: {
        kind: 'product',
        left: { kind: 'zones' },
        right: { kind: 'zones' },
        maxPairs: 16,
      },
      where: { ref: 'feature.pairIsLegalTransfer' },
      quality: {
        components: [
          { id: 'origin-loss', value: { neg: { ref: 'feature.originStrategicLoss' } }, weight: 4 },
          { id: 'destination-gain', value: { ref: 'feature.destinationStrategicGain' }, weight: 8 },
        ],
        order: 'qualityDesc',
      },
      result: { maxItems: 8, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
    });

    const view = evaluateSelector(def, makeFixtureContext(seed));

    assertView({
      orderingMonotonic: 'qualityDesc',
      withinMaxItems: 8,
      pairKeysAreOriginDestComposites: true,
    });
  });

  it('truncates at maxPairs deterministically and emits advisory once', () => {
    // 4-zone board → 16 unordered pairs; with maxPairs: 8, truncation must fire.
    const def = compileSelector({ /* same but maxPairs: 8 */ });
    const ctx = makeFixtureContext(seed);
    const viewA = evaluateSelector(def, ctx);
    const viewB = evaluateSelector(def, ctx);

    assert.equal(viewA, viewB);                              // deterministic truncation
    assertAdvisoryEmittedOnce(ctx, 'POLICY_SELECTOR_PRODUCT_TRUNCATED');
  });

  it('no-truncation case: maxPairs >= product size', () => {
    // maxPairs: 64 against 4-zone board (16 pairs) — no truncation, no advisory.
    const def = compileSelector({ /* same but maxPairs: 64 */ });
    const view = evaluateSelector(def, makeFixtureContext(seed));
    assertNoAdvisory('POLICY_SELECTOR_PRODUCT_TRUNCATED');
  });
});
```

### 3. Property assertions

- Pair keys are `(originKey, destinationKey)` composites in stable order.
- Quality is monotonically non-increasing.
- `maxPairs` enforced at source materialisation, not at result truncation.
- Truncation advisory emits exactly once per `(decisionId, selectorId)`.
- Determinism: re-run produces bit-identical view AND bit-identical advisory count.

## Files to Touch

- `packages/engine/test/agents/conformance/selector-product-pair.test.ts` (new)
- `packages/engine/test/agents/conformance/fixtures/perfect-info-fixture-game/` (new directory — only if no existing fixture suffices)

## Out of Scope

- FITL zone-collection conformance (009).
- Hold'em card-collection conformance (010).
- ARVN profile migration (012).
- Production pair-selector use — this ticket is conformance-only.

## Acceptance Criteria

### Tests That Must Pass

1. `selector-product-pair.test.ts` — happy-path: pair selector produces ranked top-K.
2. `selector-product-pair.test.ts` — truncation case: `maxPairs` < product size triggers deterministic truncation + advisory.
3. `selector-product-pair.test.ts` — no-truncation case: `maxPairs` ≥ product size → no advisory.
4. Determinism: re-runs are bit-identical.
5. Existing suite: `pnpm turbo test`

### Invariants

1. `maxPairs` bound enforced; product never materialises beyond cap (Foundation #10).
2. Truncation order deterministic and stable across runs (Foundation #8).
3. Advisory emitted once per `(decisionId, selectorId)`, not once per truncated pair.
4. No game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/agents/conformance/selector-product-pair.test.ts` — three cases (happy-path, truncation, no-truncation).

### Commands

1. `pnpm -F @ludoforge/engine test -- selector-product-pair`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
