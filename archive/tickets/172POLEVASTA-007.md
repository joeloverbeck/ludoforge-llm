# 172POLEVASTA-007: Phase 6 — residual preview-drive rebuild elimination

**Status**: COMPLETED
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

Boundary correction (approved 2026-05-15): live isolation showed the raw `buildEncodedState` count includes legitimate unique preview-state first touches, not only duplicate cache misses. The final witness therefore keeps the original raw counter output for comparability, but gates on duplicate rebuild elimination: static cached structures must remain first-touch-only, and encoded-state builds must correspond to cache misses after object/hash cache reuse is counted.

## Assumption Reassessment (2026-05-15)

1. `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts` passes after `172POLEVASTA-006`: repeated contexts over the same `(GameDefRuntime, GameState)` keep all four `build*` counters at exactly one first touch.
2. `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` still fails on the live preview-drive workload with `total=451`, dominated by `buildEncodedState=413` and `buildExpressionFeatureTable=36`.
3. Mismatch + correction: the previous Phase 5 draft assumed the constructor invariant would be enough to flip the Phase 0 witness green. Live proof disproves that. This ticket owns the residual measured rebuild problem and the final perf-witness/headline closeout; `172POLEVASTA-006` owns only the constructor invariant.
4. 2026-05-15 implementation reassessment: `buildExpressionFeatureTable=36` was a true residual static-table extension cost and is now eliminated. `buildEncodedState=399` after the repair is not duplicate rebuild work: the same run reports `policyEncodedStateCacheObjectHit=4626`, `policyEncodedStateCacheHashHit=14`, `policyEncodedStateCacheMiss=399`, and `duplicateEncodedStateRebuilds=0`.

## Architecture Check

1. This ticket preserves Foundation #15 by treating the red perf witness as evidence of an incomplete architectural fix, not as noise to be renamed away.
2. Any fix must stay engine-agnostic (Foundation #1): no FITL-specific branches, seed-specific shortcuts, or profile retuning to hide the residual rebuild count.
3. Any cache or memoization change must preserve determinism and immutability (Foundations #8/#11). `GameState` object-identity reuse is safe only when the same immutable object is truly reused; broader reuse requires a canonical-state oracle, never Zobrist alone. The implemented hash-addressed cache treats `stateHash` only as an accelerator and reuses an encoded state only after canonical serialized-state equality matches.
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

Apply the narrowest generic repair that eliminates duplicate residual rebuilds without changing policy semantics. If the repair changes cache keys, cache ownership, runtime lifetime, or encoded-state identity assumptions, update the relevant spec/ticket text before final proof.

### 3. Flip the Phase 0 perf witness and headline closeout

After the residual seam is fixed, update `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` so it no longer describes itself as an expected red witness. Confirm the witness passes by proving static cached structures are first-touch-only and encoded-state duplicate rebuilds are zero. The raw `buildEncodedState` count remains printed because it is now classified as unique preview-state first-touch work.

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
- Replacing the `172POLEVASTA-001` workload with a weaker workload or higher threshold. The approved correction changes the measured noun from raw unique-state `buildEncodedState` count to duplicate rebuild count while preserving the same workload and raw counter output.
- Any game-specific engine branch.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` passes: `buildEncodedStateLayout + buildFeatureTable + buildExpressionFeatureTable` stays at or below the first-touch-only threshold, `duplicateEncodedStateRebuilds=0`, and encoded-state cache object/hash hits prove reuse is active.
2. The constructor invariant from `172POLEVASTA-006` still passes.
3. Determinism gates byte-identical: `spec-140-replay-identity.test.ts`, `forked-vs-fresh-runtime-parity.test.ts`, `zobrist-incremental-parity-fitl-seed-42.test.ts`, and `zobrist-incremental-parity-fitl-seed-123.test.ts`.
4. `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts` pass when the repair touches bytecode/cache routing.
5. Headline: `node campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs --only 1013 --max-turns 200` completes without the historical hang.
6. Existing suite: `pnpm -F @ludoforge/engine test` and `pnpm -F @ludoforge/engine test:integration:fitl-rules`.

### Invariants

1. Cache warmth changes no observable policy result: selected action, score, preview status, trace content, replay identity, and Zobrist parity remain unchanged.
2. Residual cache keys are collision-safe and deterministic; canonical serialized state remains the source of truth for any value-based state identity.
3. The final `172POLEVASTA_STATIC_REBUILD_WITNESS` output is the decisive measured gate; a green process exit without the static threshold, duplicate rebuild count, and cache-hit/miss counters is not sufficient.
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

## Outcome

Outcome amended: 2026-05-15.

Completion date: 2026-05-15.

Implementation complete under the user-approved proof-boundary correction.

Authorization ledger:

- Approved option: Option 1 / proof-boundary correction.
- Scope effect: proof-only correction; same workload and raw `172POLEVASTA_STATIC_REBUILD_WITNESS` output retained, but the terminal gate now distinguishes duplicate rebuilds from legitimate unique preview-state first touches.
- Durable location: this ticket and `archive/specs/172-policy-eval-static-structure-caching.md`.

What landed:

- Added a run-local `policyEncodedStateHashCache` on `GameDefRuntime`, reset on runtime fork with other run-local caches.
- Added `packages/engine/src/agents/policy-encoded-state-cache.ts`, which reuses encoded states by object identity and by `stateHash` plus canonical serialized-state equality. `stateHash` is only an accelerator; serialized-state equality is the collision guard.
- Routed `PolicyEvaluationContext` and `evaluatePolicyMove` encoded-state construction through the runtime cache.
- Changed policy-bytecode expression feature-table construction to reuse the per-`GameDef` base feature table when an expression adds no refs outside that base table.
- Updated the constructor invariant to allow zero expression feature-table extensions when the base table already covers the expression.
- Updated the preview-drive perf witness from expected-red to a duplicate-rebuild regression witness.

Residual classification:

- `buildExpressionFeatureTable=36` baseline was ticket-owned duplicate static work and is now `0`.
- `buildEncodedState=399` final is unique preview-state first-touch work, not duplicate rebuild work: final witness reports `policyEncodedStateCacheObjectHit=4626`, `policyEncodedStateCacheHashHit=14`, `policyEncodedStateCacheMiss=399`, and `duplicateEncodedStateRebuilds=0`.
- Deferred scope: reducing the raw unique-state `buildEncodedState` count below first-touch work would require a larger encoded-state projection redesign or preview-result transposition layer; that remains outside this ticket per Spec 172 out-of-scope guidance.

Generated/schema fallout: none. No schemas, goldens, compiled GameDefs, or serialized trace shapes changed.

Source-size ledger:

| path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor |
|---|---:|---:|---|---|---|---|
| `packages/engine/src/agents/policy-evaluation-core.ts` | 2249 | 2242 | no; preexisting over 800 | none; net shrink | extraction done into `policy-encoded-state-cache.ts`; no further split in this ticket | none |
| `packages/engine/src/agents/policy-eval.ts` | 1505 | 1509 | no; preexisting over 800 | +4 lines to route existing encoded-state prebuild through the shared cache | narrow adjacent extraction would obscure the ticket-owned cache seam; helper lives in `policy-encoded-state-cache.ts` | none |

Verification:

| command | result |
|---|---|
| `pnpm -F @ludoforge/engine build` | passed |
| `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/policy-evaluation-context-constructor-invariant.test.js` | passed |
| `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.js` | passed; `total=401`, `staticOnlyTotal=2`, `duplicateEncodedStateRebuilds=0`, `buildEncodedStateLayout=1`, `buildFeatureTable=1`, `buildExpressionFeatureTable=0`, `buildEncodedState=399`, `policyEncodedStateCacheObjectHit=4626`, `policyEncodedStateCacheHashHit=14`, `policyEncodedStateCacheMiss=399` |
| `node campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs --only 1013 --max-turns 200` | passed; `DONE in 74.5s`, `stop=terminal`, `decisions=257` |
| `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-140-replay-identity.test.js dist/test/determinism/forked-vs-fresh-runtime-parity.test.js dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js dist/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.js dist/test/integration/policy-bytecode-equivalence.test.js dist/test/integration/policy-bytecode-equivalence-partial-visibility.test.js` | passed; 26 tests / 7 suites |
| `pnpm -F @ludoforge/engine test:perf` | passed; 5 tests / 5 suites. Advisory emissions from Spec 149 and preview-corpus fixtures remained non-fatal and non-ticket-owned. |
| `pnpm -F @ludoforge/engine test:integration:fitl-rules` | passed; 79/79 files |
| `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-bytecode-cache.test.js dist/test/unit/agents/policy-encoded-state-cache.test.js` | passed after updating stale expectations for zero expression-table extension and canonical hash-cache reuse |
| `pnpm -F @ludoforge/engine test` | passed; unit default 5635 tests / 909 suites, architecture 90 tests / 49 suites, integration 81/81 files |
| `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.js` after the broad engine test lane | passed; same final witness line as above |

Late-edit proof validity: the final ticket/spec closeout edits only transcribed the approved proof boundary, status, source-size ledger, and verification results. No production or test semantics changed after the final post-broad-lane perf witness rerun.
