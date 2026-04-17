# 132AGESTUVIA-008: FITL seed 1002 support/opposition lattice runtime violation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — FITL marker-state/runtime enforcement
**Deps**: `archive/tickets/132AGESTUVIA-004.md`, `archive/tickets/132AGESTUVIA-007.md`

## Problem

Current HEAD no longer shows the historical seed-1002 hang witness that ticket `132AGESTUVIA-005` originally referenced. Instead, replaying the campaign seat mapping on FITL seed 1002 throws a live runtime error: `EffectRuntimeError: Marker state "activeSupport" is illegal for lattice "supportOpposition" in space "phuoc-long:none"`. That is a real rules/data/runtime contract failure. `phuoc-long:none` is a population-0 province, and the production data explicitly constrains `supportOpposition` in any `population == 0` space to `[neutral]`. The engine must not generate or apply active/passive support/opposition states there.

## Assumption Reassessment (2026-04-17)

1. On current HEAD, a direct FITL replay with the campaign seat mapping (`us-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline`) throws on seed 1002 with `EffectRuntimeError: Marker state "activeSupport" is illegal for lattice "supportOpposition" in space "phuoc-long:none"`.
2. `data/games/fire-in-the-lake/40-content-data-assets.md` defines `phuoc-long:none` as a `province` with `population: 0`.
3. The same data file defines lattice `supportOpposition` with `allowedStates: [neutral]` whenever `population == 0`, so the thrown runtime is consistent with the production data contract rather than a false-positive validator check.
4. `rules/fire-in-the-lake/fire-in-the-lake-rules-section-6.md` aligns with the data model: support/opposition applies only where population exists; a populationless province cannot legally hold `activeSupport`.
5. This is a production bug, not a test-only gate concern, and it must be fixed separately before the full manual campaign smoke in `132AGESTUVIA-005` can be closed truthfully.

## Architecture Check

1. The fix must preserve a single authoritative support/opposition legality contract across FITL data, rulebook semantics, and runtime state transitions.
2. The engine should reject or prevent illegal population-0 support/opposition mutations at the source decision/effect boundary rather than relying on downstream crash-only detection.
3. No backwards-compatibility shims: the correct behavior is to stop generating illegal marker states, not to tolerate them in runtime schemas.

## What to Change

### 1. Reproduce and isolate the illegal support mutation path

Identify the effect or decision path reached on seed 1002 that attempts to set `supportOpposition` on `phuoc-long:none` to `activeSupport`. Determine whether the fault is in effect authoring, target selection, guard evaluation, or marker-state application.

### 2. Fix the production runtime/authoring seam

Implement the narrowest production fix that prevents population-0 spaces from receiving non-`neutral` `supportOpposition` states while preserving the intended FITL rules behavior for populated spaces.

### 3. Add regression proof

Add or update focused tests that:

- reproduce the seed-1002 witness under the campaign seat mapping,
- prove the illegal marker-state mutation no longer occurs,
- preserve the data/rules invariant that `population == 0` implies `supportOpposition == neutral`.

## Files to Touch

- `packages/engine/src/**` (modify, exact files TBD by repro)
- `packages/engine/test/**` (modify/add regression coverage)

## Out of Scope

- Rewriting the `fitl-arvn-agent-evolution` runner harness.
- Broad rebalancing of support/opposition gameplay outside the illegal population-0 mutation path.
- Closing `132AGESTUVIA-005` without the runtime fix.

## Acceptance Criteria

### Tests That Must Pass

1. The seed-1002 campaign witness no longer throws `EffectRuntimeError` for illegal `supportOpposition` state on `phuoc-long:none`.
2. Focused regression coverage proves population-0 spaces cannot acquire non-`neutral` `supportOpposition`.
3. Existing suite: `pnpm turbo test`.

### Invariants

1. Any FITL space with `population == 0` must remain `neutral` on the `supportOpposition` lattice.
2. Runtime behavior must stay aligned with both `data/games/fire-in-the-lake/*` and `rules/fire-in-the-lake/*`.

## Test Plan

### New/Modified Tests

1. `<exact regression test path TBD during implementation>` — reproduce and guard the seed-1002 lattice violation.

### Commands

1. `<targeted engine regression command TBD during implementation>`
2. `pnpm turbo test`

## Outcome

Completed: 2026-04-17

- Isolated the live seed-1002 witness to `card-48` `Nam Dong` after `Fact Finding` moved a COIN base into `phuoc-long:none`; the failing path was event authoring, not a generic engine-side marker validator defect.
- Updated `data/games/fire-in-the-lake/41-events/033-064.md` so both `Nam Dong` target selectors require `markerStateAllowed(...)` for the support/opposition state they intend to set, preventing population-0 provinces from being surfaced as legal targets.
- Added focused regression coverage in `packages/engine/test/integration/fitl-events-nam-dong.test.ts` proving compile-time selector intent and runtime exclusion of population-0 provinces.
- Added `packages/engine/test/integration/fitl-seed-1002-regression.test.ts` proving the campaign seat mapping replay for seed 1002 stays bounded and preserves neutral support/opposition in `phuoc-long:none`.

Deviations from original plan:

- The original ticket text named an `activeSupport` mutation path only; live evidence showed both unshaded and shaded `Nam Dong` branches could target a population-0 province, so the landed fix and proofs cover both `activeSupport` and `activeOpposition`.

Verification results:

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-events-nam-dong.test.js dist/test/integration/fitl-seed-1002-regression.test.js`
- `pnpm turbo test`
