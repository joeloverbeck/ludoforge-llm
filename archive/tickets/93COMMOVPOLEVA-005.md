# 93COMMOVPOLEVA-005: Integration test and golden fixture update

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No production changes expected after reassessment; ticket/test updates only unless verification exposes a real bug
**Deps**: `archive/tickets/93COMMOVPOLEVA-003.md`, `archive/tickets/93COMMOVPOLEVA-004.md`

## Problem

The original ticket assumed that once `trustedMoveIndex` reached the production `PolicyAgent`, the fixed-seed FITL policy summary would start producing resolved preview margins and a changed golden fixture.

That assumption is false in the current codebase. The trusted-move fast-path is already wired and already covered in lower-level tests, but the fixed-seed FITL production trace still has `unknownRefIds` for `victoryCurrentMargin.currentMargin.self` because the post-move player observation requires hidden sampling, and the authored FITL policy catalog marks that preview surface with `allowWhenHiddenSampling: false`.

This ticket therefore narrows to correcting the record and proving the real invariant:
1. FITL production policy evaluation already uses the trusted-move preview path where possible
2. The fixed-seed FITL summary remains unknown by design because hidden-sampling gating blocks that preview surface
3. FITL and Texas production goldens should remain unchanged unless verification reveals a real regression
4. Existing architecture is retained unless testing uncovers an actual defect

## Assumption Reassessment (2026-03-29)

1. The production golden test lives at `packages/engine/test/unit/policy-production-golden.test.ts`, not `packages/engine/test/unit/agents/policy-production-golden.test.ts`. Confirmed.
2. The FITL summary golden fixture lives at `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json`. Its current `unknownRefIds` entry matches real behavior today. Confirmed by direct fixed-seed execution.
3. Existing integration coverage already lives in `packages/engine/test/integration/fitl-policy-agent.test.ts` and `packages/engine/test/integration/texas-holdem-policy-agent.test.ts`; a new standalone `policy-agent-preview.test.ts` file is not required unless coverage isolation proves necessary.
4. `packages/engine/test/unit/agents/policy-agent.test.ts` already proves that the production `PolicyAgent` can complete template moves and evaluate preview surfaces for completed candidates. The remaining missing proof is FITL-production-specific hidden-sampling behavior, not generic trusted-index plumbing.
5. For the fixed-seed FITL production opening state, completed preview applications preserve RNG but still yield `requiresHiddenSampling === true` after move application. That is why `victoryCurrentMargin.currentMargin.self` remains unresolved in the policy trace despite the trusted fast-path.
6. `fitl-policy-catalog.golden.json`, `fitl-policy-summary.golden.json`, and the Texas policy summary golden are expected to remain unchanged unless verification exposes a real bug.

## Architecture Check

1. **Current architecture remains sound**: `trustedMoveIndex` injection into the policy runtime is cleaner than threading trusted payloads through every candidate type. That architecture is already in place and should not be reworked here.
2. **The FITL golden is currently correct**: changing it to resolved preview margins would encode a false assumption. The unknown preview is driven by authored visibility and hidden-sampling semantics, not by missing agent plumbing.
3. **The right proof gap is production semantics, not plumbing**: the missing high-value test is one that demonstrates why FITL stays unknown in production even though the move is already trusted and deterministic with respect to RNG.
4. **Agnosticism (F1)**: Texas coverage should remain unchanged; no FITL-specific special cases should be introduced to “force” preview availability.
5. **Ideal architecture note**: if this area needs future work, the most defensible improvement is richer trace attribution for why a preview ref was unavailable (for example hidden-sampling vs random vs failure). That would improve diagnosability without weakening the current generic architecture. It is not a ticket deliverable here.

## What to Change

### 1. Correct the ticket assumptions and scope

Document that the trusted preview path is already implemented and that the fixed-seed FITL summary remains unresolved because of hidden-sampling gating, not because of missing runtime wiring.

### 2. Add a focused FITL production integration test in the existing file

Add one test in `packages/engine/test/integration/fitl-policy-agent.test.ts` that:
- compiles FITL production data via `compileProductionSpec()`
- uses the fixed-seed opening state already exercised by the summary golden
- verifies at least one completed non-pass move preserves RNG when applied
- verifies the resulting player observation still requires hidden sampling
- runs `PolicyAgent.chooseMove` with verbose trace and asserts `previewUsage.unknownRefIds` still contains `victoryCurrentMargin.currentMargin.self`

This proves the current FITL trace behavior is an intentional semantic consequence of authored visibility plus hidden information, not a missing trusted-index fast-path.

### 3. Re-verify existing production goldens without changing fixtures

- `fitl-policy-summary.golden.json` should continue to match actual output
- `fitl-policy-catalog.golden.json` should remain unchanged
- Texas policy summary and catalog goldens should remain unchanged

## Files to Touch

- `tickets/93COMMOVPOLEVA-005.md` (modify — correct stale assumptions and scope)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify — add one FITL production hidden-sampling proof test)

## Out of Scope

- Performance benchmarking
- Changes to production source files unless verification reveals a real defect
- Changes to `fitl-policy-summary.golden.json`, `fitl-policy-catalog.golden.json`, or Texas golden fixtures unless tests prove they are wrong
- New YAML authoring surface or kernel changes
- Multi-ply search or rollouts
- Relaxing FITL preview visibility to allow hidden-sampling-based score resolution

## Acceptance Criteria

### Tests That Must Pass

1. New FITL integration test proving hidden-sampling-gated preview behavior passes
2. Existing `packages/engine/test/unit/policy-production-golden.test.ts` passes without fixture changes
3. Existing FITL and Texas policy integration tests pass
4. Full suite: `pnpm turbo test`
5. Full suite: `pnpm turbo typecheck`
6. Full suite: `pnpm turbo lint`

### Invariants

1. No kernel or production agent source files modified unless a real bug is uncovered
2. `fitl-policy-summary.golden.json` and `fitl-policy-catalog.golden.json` remain byte-identical
3. Texas Hold'em policy evaluation remains unchanged (engine agnosticism — F1)
4. Determinism (F5): the fixed-seed policy summary remains reproducible
5. FITL compilation and authored policy catalog remain unchanged
6. FITL preview unknowns in the fixed-seed opening trace are explained by hidden-sampling gating, not by missing trusted preview plumbing

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` — add 1 FITL production hidden-sampling proof test
2. `packages/engine/test/unit/policy-production-golden.test.ts` — re-verify unchanged FITL/Texas policy goldens

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js packages/engine/dist/test/integration/texas-holdem-policy-agent.test.js packages/engine/dist/test/unit/policy-production-golden.test.js`
3. `pnpm turbo test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - Corrected the ticket to reflect the current architecture and production behavior: the trusted preview path was already wired, and the fixed-seed FITL summary remains unresolved because post-move observation still requires hidden sampling while the authored FITL policy catalog disallows that preview surface under hidden sampling.
  - Added one focused FITL production integration test in `packages/engine/test/integration/fitl-policy-agent.test.ts` proving that completed non-pass opening moves preserve RNG, still require hidden sampling after application, and therefore legitimately leave `victoryCurrentMargin.currentMargin.self` in `unknownRefIds`.
- Deviations from original plan:
  - No production source changes were needed.
  - No new standalone integration test file was added.
  - No FITL or Texas golden fixtures changed; the original plan to rewrite `fitl-policy-summary.golden.json` was based on a false assumption.
- Verification results:
  - `pnpm turbo build`
  - `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js packages/engine/dist/test/integration/texas-holdem-policy-agent.test.js packages/engine/dist/test/unit/policy-production-golden.test.js`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
