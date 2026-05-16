# 174WASMDEEPPRV-015: Phase 4d — Optimize zero-counter continuedDeepening token/query residuals

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — generic token/query/runtime optimization only
**Deps**: `archive/tickets/174WASMDEEPPRV-014.md`

## Problem

`reports/174-phase-4c-residual-owner.md` shows that the dominant post-011 residual class is not a production preview-drive route failure. `coupArvnRedeployPolice:chooseOne` recorded `278705.94 ms` of measured agent-call time with `0` production preview-drive route count, `0` unsupported count, and `0` batch count. Its slow-tier top axis is dominated by token/query hot-path buckets, especially `tokenStateIndex:refreshCachedEntries` and `evalQuery:countMatchingTokens`.

The rejected default-flip ticket `tickets/174WASMDEEPPRV-010.md` remains non-actionable until the zero-counter runtime residual is reduced or disproved as the primary blocker.

## Assumption Reassessment (2026-05-16)

1. `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4c-residual.md` completed all 15 seeds and recorded the same production preview-drive route totals as the post-011 gate witness: route count `181`, unsupported count `3394`, batch count `1712`.
2. The largest residual classes `coupArvnRedeployPolice:chooseOne` and `coupArvnRedeployOptionalTroops:chooseOne` both record zero production preview-drive route, unsupported, and batch counts.
3. The top hot-path buckets for those zero-counter classes are generic token/query buckets, not FITL-specific rule branches and not WASM route activation.

## Architecture Check

1. Foundation #1 still forbids FITL-specific branches; any optimization must be generic over token indexes, query evaluation, state snapshots, or policy preview runtime lifetimes.
2. Foundation #11 allows scoped internal mutation only when isolated; cache or index reuse must prove no aliasing leaks across state transitions or preview branches.
3. Foundation #16 requires the optimization to prove both correctness and the measured residual classification before reopening any default-flip path.

## What to Change

### 1. Token/query residual probe

Add the smallest generic diagnostic or focused test needed to isolate why `coupArvnRedeployPolice:chooseOne` repeatedly refreshes token indexes and counts matching tokens during `continuedDeepening` chooseOne evaluation.

### 2. Generic optimization

Implement a generic token/query/runtime optimization only after the probe identifies a safe owner. Candidate seams include token-state-index lifetime reuse, query-count caching, or preview-branch state/index sharing. Do not add game-specific identifiers or policy-profile special cases.

### 3. Decisive witness

Rerun the Phase 4c witness or a justified bounded equivalent that still exercises the zero-counter chooseOne residual and reports:

- `coupArvnRedeployPolice:chooseOne` agent-call ms;
- token/query hot-path bucket totals;
- production preview-drive route/unsupported/batch counts, to prove the residual did not silently move into fallback route activity.

## Files to Touch

- `packages/engine/src/kernel/token-state-index.ts` (modify only if the probe selects token-index lifetime)
- `packages/engine/src/kernel/eval-query.ts` (modify only if the probe selects query-count reuse)
- `packages/engine/src/agents/` (modify only for generic preview-runtime lifetime ownership)
- `packages/engine/test/**` (new or modified focused correctness/perf guard)
- `reports/174-phase-4d-zero-counter-residual.md` (new)

## Out of Scope

- No default flip or A/B deletion.
- No FITL-specific runtime branch, profile retuning, GameSpecDoc change, or budget weakening.
- No attempt to solve the reason-granular unsupported preview-drive classes unless the zero-counter residual is first reduced or disproved as dominant.

## Acceptance Criteria

### Tests That Must Pass

1. A focused correctness test proves any new cache/index lifetime cannot mutate caller-visible state or cross-contaminate preview branches.
2. The Phase 4d report records the zero-counter residual before/after numbers and names whether the residual is reduced, disproved, or still dominant.
3. Existing engine suite remains green: `pnpm turbo test`.

### Invariants

1. Zero production preview-drive counters remain distinguishable from unsupported/fallback route activity.
2. Token/query optimization remains generic and deterministic across GameDef, state, seed, and actions.

## Test Plan

### New/Modified Tests

1. Add focused tests only after the selected generic owner is known from the probe.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds <bounded set including zero-counter residual witnesses> --timeout-ms 400000 --date <YYYY-MM-DD>-phase-4d-zero-counter --profile-buckets`
3. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
