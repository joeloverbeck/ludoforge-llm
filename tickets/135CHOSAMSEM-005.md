# 135CHOSAMSEM-005: Add `choose-n-sampler-purity.test.ts` proving uniform sampling

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None (test-only)
**Deps**: `archive/tickets/135CHOSAMSEM-004.md`

## Problem

Spec 135 Contract §1 (Sampler Purity) states that `selectFromChooseN(options, min, max, rng)` samples `count ∈ [min, max]` uniformly via `nextInt(rng, min, max)`, with no per-call rewrite. After 135CHOSAMSEM-004 deletes `sampledMin`, this invariant holds by construction, but there is no dedicated test proving it. Spec 135 §Required Proof §Unit/Kernel Proof 1 explicitly calls for this test, both as architectural-invariant proof (per `.claude/rules/testing.md`) and as a regression guard against any future reintroduction of hidden clamping.

## Assumption Reassessment (2026-04-18)

1. No existing test at `packages/engine/test/unit/kernel/choose-n-sampler-purity.test.ts` — confirmed during spec 135 reassessment. This is a net-new test file.
2. `selectFromChooseN` is not exported from `move-completion.ts` (module-internal). The test therefore cannot invoke it directly. Uniform-sampling proof must be asserted via the exported completion surface (e.g., calling `completeTemplateMove` on fixtures whose chooseN declarations force the sampler through specific `(min, max)` configurations, and observing the resulting count distribution across a deterministic seed range).
3. The test exercises fixtures that DO NOT go through the retry layer, so `retryBiasNonEmpty` is not set. This isolates the sampler-purity property from the retry-layer-bias property (which has its own test coverage in 135CHOSAMSEM-003).

## Architecture Check

1. **Why this approach is cleaner**: The test is an `architectural-invariant` class test (per `.claude/rules/testing.md`) that asserts a property — uniform sampling — which must hold for every legitimate kernel evolution. It is not a convergence witness for a specific seed trajectory; it is a distributional property asserted across a seed range.
2. **Agnostic boundaries**: The fixtures use the generic chooseN primitive with non-game-specific options. Foundation 1 preserved.
3. **No backwards-compatibility shims**: The test lands after 135CHOSAMSEM-004 deletes `sampledMin`, so there is no transitional state to accommodate.

## What to Change

### 1. Create the test file

New file: `packages/engine/test/unit/kernel/choose-n-sampler-purity.test.ts`.

File-top class marker (per `.claude/rules/testing.md`):

```ts
// @test-class: architectural-invariant
```

### 2. Test cases

Each test case constructs a completion fixture that routes the sampler through a specific `(min, max)` configuration, then runs the completion across a deterministic seed range and asserts the count distribution.

**Case A: `min: 0, max: N` samples all counts including zero**

- Fixture: optional chooseN with `min: 0, max: N` (pick N = 4 for clarity) over `options.length >= 4` distinct options.
- Range: seeds `0n` through `127n` (128 seeds — enough for distribution sampling).
- Assertion: the multiset of sampled counts across the seed range contains at least one count equal to 0, at least one count equal to `max`, and the count values span the full `[0, N]` range. This proves no hidden clamp to `min = 1`.
- Optional stronger assertion: the distribution is approximately uniform (e.g., no count value has 0 occurrences). This is a weaker statement than strict uniformity; strict uniformity is the invariant but exact distribution tests are fragile — the "includes 0" assertion alone is the load-bearing regression guard.

**Case B: `min: 1, max: N` samples counts ≥ 1**

- Fixture: chooseN with `min: 1, max: 3` over `options.length >= 3`.
- Range: seeds `0n` through `63n`.
- Assertion: every sampled count is in `[1, 3]`. No count equals 0. Proves that when the spec declares `min: 1`, the sampler honors it.

**Case C: `min: 2, max: N` samples counts ≥ 2**

- Fixture: chooseN with `min: 2, max: 4` over `options.length >= 4`.
- Range: seeds `0n` through `63n`.
- Assertion: every sampled count is in `[2, 4]`. Proves declared minimums other than 0 or 1 are respected.

### 3. Fixture construction

Construct fixtures inline in the test file using the helpers already present in `move-completion-retry.test.ts` (e.g., `createDef`, `createTemplateProfile`) or equivalents. If no existing helper supports the minimum shape needed, extract a small local helper — do NOT pull in FITL-specific fixtures.

## Files to Touch

- `packages/engine/test/unit/kernel/choose-n-sampler-purity.test.ts` (new)

## Out of Scope

- Changes to `selectFromChooseN` — already complete in 135CHOSAMSEM-004.
- Changes to the retry-layer bias tests — those live in 135CHOSAMSEM-003.
- Strict uniformity / chi-squared distribution tests. The "count distribution includes 0" and "respects declared min" assertions are sufficient as regression guards; a chi-squared test would be brittle and add no marginal architectural proof value.

## Acceptance Criteria

### Tests That Must Pass

1. Case A passes: across the seed range, `min: 0, max: N` produces at least one count = 0 and spans to count = N.
2. Case B passes: across the seed range, `min: 1, max: N` produces only counts in `[1, N]`.
3. Case C passes: across the seed range, `min: 2, max: N` produces only counts in `[2, N]`.
4. Existing suite: `pnpm turbo test` — no regressions.

### Invariants

1. `selectFromChooseN` samples uniformly in `[min, max]` — proven by Case A (includes 0) + Case B + Case C (respect arbitrary declared minimums).
2. Any future reintroduction of hidden sampler-internal clamping will fail Case A.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choose-n-sampler-purity.test.ts` (new) — the three test cases described above.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo build test lint typecheck`
