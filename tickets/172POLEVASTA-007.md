# 172POLEVASTA-007: Phase 6 — residual preview-drive rebuild elimination

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — residual policy-preview/cache routing to be isolated from the `172POLEVASTA-001` witness
**Deps**: `archive/tickets/172POLEVASTA-006.md`

## Problem

`172POLEVASTA-006` proved the constructor-level warm-runtime invariant, but the Phase 0 perf witness still exceeds the first-touch-only threshold:

```text
172POLEVASTA_STATIC_REBUILD_WITNESS total=451 threshold=4 buildEncodedStateLayout=1 buildFeatureTable=1 buildExpressionFeatureTable=36 buildEncodedState=413 seed=1013 maxTurns=1 profiles=us-baseline,arvn-evolved,nva-baseline,vc-baseline
```

That means the constructor no-direct-build guard is necessary but not sufficient for the broader Spec 172 headline. The remaining work must isolate why the preview-drive workload still constructs/evaluates enough distinct contexts or states to rebuild `buildExpressionFeatureTable` and `buildEncodedState` far past first touch, then repair the actual runtime/cache seam without weakening the witness.

## Assumption Reassessment (2026-05-15)

1. `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts` passes after `172POLEVASTA-006`: repeated contexts over the same `(GameDefRuntime, GameState)` keep all four `build*` counters at exactly one first touch.
2. `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` still fails on the live preview-drive workload with `total=451`, dominated by `buildEncodedState=413` and `buildExpressionFeatureTable=36`.
3. Mismatch + correction: the previous Phase 5 draft assumed the constructor invariant would be enough to flip the Phase 0 witness green. Live proof disproves that. This ticket owns the residual measured rebuild problem and the final perf-witness/headline closeout; `172POLEVASTA-006` owns only the constructor invariant.

## Architecture Check

1. This ticket preserves Foundation #15 by treating the red perf witness as evidence of an incomplete architectural fix, not as noise to be renamed away.
2. Any fix must stay engine-agnostic (Foundation #1): no FITL-specific branches, seed-specific shortcuts, or profile retuning to hide the residual rebuild count.
3. Any cache or memoization change must preserve determinism and immutability (Foundations #8/#11). `GameState` object-identity reuse is safe only when the same immutable object is truly reused; broader reuse requires a canonical-state oracle, never Zobrist alone.
4. No backwards-compatible alias path or fallback shim is allowed (Foundation #14). The chosen runtime path should be the single authoritative path for the residual seam.

## What to Change

### 1. Isolate the residual rebuild owner

Instrument or extend the existing witness just enough to identify where the remaining `buildEncodedState` and `buildExpressionFeatureTable` calls come from after the constructor invariant is green. Preserve the existing `172POLEVASTA_STATIC_REBUILD_WITNESS` counter output so the final comparison remains direct.

Classify the residual calls by seam before changing behavior:

- same `GameState` object not reusing `policyEncodedStateCache`;
- distinct-but-canonically-equal `GameState` objects created during preview drive;
- explicit `encodedState` / `encodedStateLayout` construction that bypasses runtime-owned caches;
- bytecode cache misses caused by expression identity, layout identity, or fallback-cache routing;
- unrelated first-touch work that should not count against the threshold.

### 2. Repair the actual runtime/cache seam

Apply the narrowest generic repair that makes the Phase 0 witness first-touch-only without changing policy semantics. If the repair changes cache keys, cache ownership, runtime lifetime, or encoded-state identity assumptions, update the relevant spec/ticket text before final proof.

### 3. Flip the Phase 0 perf witness and headline closeout

After the residual seam is fixed, update `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` so it no longer describes itself as an expected red witness. Confirm the witness passes with combined `build*` work at or below the first-touch-only threshold.

Confirm the headline command completes:

```bash
node campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs --only 1013 --max-turns 200
```

Record the observed timing and stop reason in this ticket outcome. The target is feasibility, not exact parity with the shallow-preview control.

## Files to Touch

- `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` (modify) — residual classification if needed; final expected-green wording once the witness passes
- `packages/engine/src/agents/**` or `packages/engine/src/kernel/**` (modify as needed) — residual generic cache/runtime repair after live isolation
- `tickets/172POLEVASTA-007.md` (modify) — outcome, residual classification, final metrics

## Out of Scope

- Retuning `arvn-evolved`, `arvn-cubes`, or any production profile to reduce work by policy choice rather than cache correctness.
- Preview-result transposition memoization and `PreviewWorkBudget` accounting unless live isolation proves the residual rebuild problem is actually that deferred spec seam.
- Replacing the `172POLEVASTA-001` witness with a weaker workload or higher threshold without a separate Foundations-aligned boundary reset.
- Any game-specific engine branch.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` passes: combined `buildEncodedStateLayout + buildFeatureTable + buildExpressionFeatureTable + buildEncodedState` count is at or below the first-touch-only threshold.
2. The constructor invariant from `172POLEVASTA-006` still passes.
3. Determinism gates byte-identical: `spec-140-replay-identity.test.ts`, `forked-vs-fresh-runtime-parity.test.ts`, `zobrist-incremental-parity-fitl-seed-42.test.ts`, and `zobrist-incremental-parity-fitl-seed-123.test.ts`.
4. `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts` pass when the repair touches bytecode/cache routing.
5. Headline: `node campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs --only 1013 --max-turns 200` completes without the historical hang.
6. Existing suite: `pnpm -F @ludoforge/engine test` and `pnpm -F @ludoforge/engine test:integration:fitl-rules`.

### Invariants

1. Cache warmth changes no observable policy result: selected action, score, preview status, trace content, replay identity, and Zobrist parity remain unchanged.
2. Residual cache keys are collision-safe and deterministic; canonical serialized state remains the source of truth for any value-based state identity.
3. The final `172POLEVASTA_STATIC_REBUILD_WITNESS` output is the decisive measured gate; a green process exit without the counter threshold is not sufficient.
4. No new production build-counter instrumentation is introduced unless it is explicitly removed or narrowed to test/internal before closeout.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` — final residual rebuild witness; should pass after this ticket.
2. Focused regression test(s) for the isolated residual seam if the repair is not fully covered by the perf witness and existing constructor/cache invariants.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/policy-evaluation-context-constructor-invariant.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.js`
4. `pnpm -F @ludoforge/engine test:perf`
5. `node campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs --only 1013 --max-turns 200`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
