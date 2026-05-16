# Spec 174 Phase 4d Zero-Counter Residual

**Date**: 2026-05-16
**Decision owner**: `archive/tickets/174WASMDEEPPRV-015.md`
**Witness report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-zero-counter-seed1005.md`
**Witness CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-zero-counter-seed1005.csv`
**Owner-probe report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-owner-probe-seed1005.md`
**Owner-probe CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-owner-probe-seed1005.csv`
**Structural-count-cache report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-structural-count-cache-seed1005.md`
**Structural-count-cache CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-structural-count-cache-seed1005.csv`
**Token-index shape-probe report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-token-index-shape-probe-seed1005.md`
**Token-index shape-probe CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-token-index-shape-probe-seed1005.csv`
**Zone-occurrence reuse report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-zone-occurrence-reuse-seed1005.md`
**Zone-occurrence reuse CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-zone-occurrence-reuse-seed1005.csv`
**Prior-zone skip report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-prior-zone-skip-seed1005.md`
**Prior-zone skip CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-prior-zone-skip-seed1005.csv`
**Choose-one drive probe report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-chooseone-drive-probe-seed1005.md`
**Choose-one drive probe CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-chooseone-drive-probe-seed1005.csv`
**Preview publication state-only report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-preview-publish-state-only-seed1005.md`
**Preview publication state-only CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-preview-publish-state-only-seed1005.csv`
**Post-preview owner-probe report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-post-preview-owner-probe-seed1005.md`
**Post-preview owner-probe CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-post-preview-owner-probe-seed1005.csv`
**Publish legal-actions probe report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-publish-legal-actions-probe-seed1005.md`
**Publish legal-actions probe CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-publish-legal-actions-probe-seed1005.csv`
**Continuation-support probe report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-continuation-support-probe-seed1005.md`
**Continuation-support probe CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-continuation-support-probe-seed1005.csv`
**Suspended viability-skip report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-suspended-viability-skip-seed1005.md`
**Suspended viability-skip CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-suspended-viability-skip-seed1005.csv`
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-zero-counter-seed1005 --profile-buckets`
**Result**: Completed for the ticket-owned zero-counter residual; retained candidates reduced `coupArvnRedeployPolice:chooseOne | continuedDeepening` to rank 3 in the bounded witness. The parent default-flip gate remains blocked by broader Phase 4 evidence.

## Summary

Phase 4d tried the smallest generic token-index owner suggested by the Phase 4c buckets: a unique-token same-slot refresh shortcut for `refreshCachedTokenStateIndexEntries`. A focused test proved the candidate could preserve fresh-rebuild parity for same-slot token-property mutations, but the bounded production witness regressed. Per the Foundation-aligned reassessment, the candidate was reverted rather than retained as non-improving hot-path complexity.

The later token-index shape probe identified repeated full-zone scans as the remaining owner. A retained per-refresh zone occurrence cache now scans each relevant zone once per `refreshCachedEntries` call and reuses the local occurrence map for affected token lookups. The decisive bounded witness used seed `1005`, which is one of the Phase 4c slow-tier seeds and exercises the zero-counter `coupArvnRedeployPolice:chooseOne` residual. This is a bounded equivalent, not the full 15-seed gate.

## Measurement

| Surface | Phase 4c baseline | Phase 4d candidate | Verdict |
|---|---:|---:|---|
| Seed `1005` wall ms | 101783.04 | 137795.87 | regressed |
| `coupArvnRedeployPolice:chooseOne` agent-call ms, seed `1005` | not isolated in Phase 4c seed row | 71070.51 | still dominant |
| `coupArvnRedeployPolice:chooseOne` route count | 0 | 0 | zero-counter residual preserved |
| `coupArvnRedeployPolice:chooseOne` unsupported count | 0 | 0 | zero-counter residual preserved |
| `coupArvnRedeployPolice:chooseOne` batch count | 0 | 0 | zero-counter residual preserved |
| `tokenStateIndex:refreshCachedEntries` bucket for `coupArvnRedeployPolice:chooseOne` | 23099.70 full Phase 4c slow-tier total | 34373.39 seed-1005 candidate | not reduced |
| `evalQuery:countMatchingTokens` bucket for `coupArvnRedeployPolice:chooseOne` | 8391.55 full Phase 4c slow-tier total | 2640.28 seed-1005 candidate | not decisive enough to offset regression |

The candidate also emitted `tokenStateIndex:refreshCachedEntriesPriorIndexHit=4228667` for the top residual class, which proved activation. Activation did not translate to a reduced measured residual.

## Decision

The rejected candidates are not retained. The retained Phase 4d runtime change is limited to per-refresh zone occurrence reuse inside `refreshCachedTokenStateIndexEntries`, with a focused parity test covering a multi-token, multi-zone refresh.

The zero-counter `continuedDeepening` residual is reduced but remains active and still blocks reopening `tickets/174WASMDEEPPRV-010.md`. A later diagnostic-only continuation identified a new concrete generic runtime owner: choose-one preview-drive continuation publication, specifically `publishMicroturnFromPreviewStateNoHash` inside `driveOption`. The retained implementation against that owner keeps preview no-hash stack publication state-only, avoiding observer projection work that preview-drive callers do not consume.

## Artifact Classification

- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-zero-counter-seed1005.md`: checked-in bounded witness report.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-zero-counter-seed1005.csv`: checked-in bounded witness CSV.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-owner-probe-seed1005.md`: checked-in owner-probe report captured under temporary instrumentation.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-owner-probe-seed1005.csv`: checked-in owner-probe CSV captured under temporary instrumentation.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-structural-count-cache-seed1005.md`: checked-in rejected structural-count-cache candidate report.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-structural-count-cache-seed1005.csv`: checked-in rejected structural-count-cache candidate CSV.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-token-index-shape-probe-seed1005.md`: checked-in token-index shape-probe report captured under temporary instrumentation.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-token-index-shape-probe-seed1005.csv`: checked-in token-index shape-probe CSV captured under temporary instrumentation.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-zone-occurrence-reuse-seed1005.md`: checked-in retained zone-occurrence reuse candidate report.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-zone-occurrence-reuse-seed1005.csv`: checked-in retained zone-occurrence reuse candidate CSV.
- Rejected source/test candidate diffs: reverted after Foundation-aligned reassessment.
- Retained source/test diff: `packages/engine/src/kernel/token-state-index.ts` and `packages/engine/test/kernel/token-state-index-incremental.test.ts`.

## Owner-Isolation Continuation

After the rejected token-index shortcut, `archive/tickets/174WASMDEEPPRV-015.md` continued in-place rather than creating a successor ticket. A temporary owner-isolation probe added hot-path counters around `evalQuery:countMatchingTokens`, ran the same bounded seed `1005` witness, then reverted the temporary source instrumentation.

Command:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-owner-probe-seed1005 --profile-buckets
```

The probe completed with seed `1005` terminal in `102576.42 ms` and kept `coupArvnRedeployPolice:chooseOne | continuedDeepening` as the top residual class at `42112.11 ms`. That class still recorded production preview-drive route count `0`, unsupported count `0`, and batch count `0`, so the residual remains distinct from fallback route activity.

Hot-path bucket evidence for `coupArvnRedeployPolice:chooseOne | continuedDeepening`:

| Bucket | Count | Total ms |
|---|---:|---:|
| `tokenStateIndex:refreshCachedEntries` | 1633342 | 6859.17 |
| `evalQuery:countMatchingTokens` | 1738266 | 2523.72 |
| `evalQuery:countMatchingTokensCacheEligible` | 42927095 | 0 |
| `evalQuery:countMatchingTokensCacheHit` | 41188829 | 0 |
| `evalQuery:countMatchingTokensCacheMiss` | 1738266 | 0 |
| `evalQuery:countMatchingTokensCacheWrite` | 1738266 | 0 |
| `evalQuery:countMatchingTokensCompiled` | 1738266 | 0 |
| `evalQuery:countMatchingTokensFilteredItems` | 125757475 | 0 |
| `evalQuery:countMatchingTokensNoOverlay` | 42927095 | 0 |

This points away from overlay and context-dependent filter ownership: the counted work is cache-eligible and no-overlay, but still incurs `1738266` misses/writes/compiled evaluations under cloned token-array identities. `tokenStateIndex:refreshCachedEntries` remains the largest timed bucket, but the first prior-index candidate proved that a same-slot shortcut alone can regress the witness.

The next same-ticket candidate should therefore target lower-overhead token-index reuse that reduces `refreshCachedEntries` without adding per-token work to the hot path.

Any retained `eval-query.ts` path must address the existing oversize source risk before coding; the owner-isolation probe was temporary and left no source diff.

## Rejected Structural Count-Cache Candidate

The same-ticket continuation next tried a generic structural count cache for context-independent compiled token filters. The candidate extracted array/result cache mechanics out of `eval-query.ts`, keyed count reuse by the token fields the filter could read, added a focused unit test for cloned-array reuse and changed-prop isolation, and then ran the bounded seed `1005` witness.

Command:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-structural-count-cache-seed1005 --profile-buckets
```

Correctness proof while the candidate existed:

```bash
pnpm -F @ludoforge/engine build
pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/token-filter-query-cache.test.js
```

The candidate activated, but it did not improve the owned residual:

| Surface | Owner-probe baseline | Structural-count-cache candidate | Verdict |
|---|---:|---:|---|
| Seed `1005` wall ms | 102576.42 | 103349.93 | regressed |
| `coupArvnRedeployPolice:chooseOne` continuedDeepening total ms | 42112.11 | 43018.87 | regressed |
| `coupArvnRedeployPolice:chooseOne` route count | 0 | 0 | zero-counter residual preserved |
| `coupArvnRedeployPolice:chooseOne` unsupported count | 0 | 0 | zero-counter residual preserved |
| `coupArvnRedeployPolice:chooseOne` batch count | 0 | 0 | zero-counter residual preserved |
| `evalQuery:countMatchingTokens` timed bucket | 2523.72 | 12.96 | local submetric improved |
| `evalQuery:countMatchingTokensCompiled` count | 1738266 | 5552 | local submetric improved |
| `evalQuery:countMatchingTokensStructuralCacheHit` count | 0 | 1732714 | activated |
| `tokenStateIndex:refreshCachedEntries` timed bucket | 6859.17 | 6732.48 | not decisive |

Because the decisive seed wall time and top zero-counter class regressed despite strong local activation, the candidate was reverted. Retaining it would add generic hot-path complexity without reducing the ticket-owned blocker, so it remains rejected evidence rather than implementation substrate.

The remaining same-ticket owner should move away from query-count reuse alone. The most concrete residual is now lower-overhead token-index lifetime/reuse that reduces `tokenStateIndex:refreshCachedEntries` without per-token bookkeeping overhead.

## Token-Index Shape Probe

After the structural count-cache candidate was rejected, a temporary `refreshCachedEntries` shape probe classified the token-index refresh work without retaining source changes.

Command:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-token-index-shape-probe-seed1005 --profile-buckets
```

The probe completed seed `1005` in `102593.12 ms`, kept `coupArvnRedeployPolice:chooseOne | continuedDeepening` as the top zero-counter residual class at `40844.39 ms`, and preserved production preview-drive route count `0`, unsupported count `0`, and batch count `0` for that class.

Shape evidence for `coupArvnRedeployPolice:chooseOne | continuedDeepening`:

| Bucket | Count | Total ms |
|---|---:|---:|
| `tokenStateIndex:refreshCachedEntries` | 1633342 | 7207.27 |
| `tokenStateIndex:refreshCachedEntriesCall` | 1633342 | 0 |
| `tokenStateIndex:refreshCachedEntriesAffectedTokens` | 15270074 | 0 |
| `tokenStateIndex:refreshCachedEntriesMutatedZones` | 1938027 | 0 |
| `tokenStateIndex:refreshCachedEntriesPriorSingle` | 15270074 | 0 |
| `tokenStateIndex:refreshCachedEntriesResultSingle` | 15270074 | 0 |
| `tokenStateIndex:refreshCachedEntriesScanZone` | 20336478 | 0 |
| `tokenStateIndex:refreshCachedEntriesScannedTokens` | 279810798 | 0 |
| `tokenStateIndex:refreshCachedEntriesScanSkippedDuplicateZone` | 15270074 | 0 |

This narrows the remaining owner: the top class is not dominated by duplicate-token ordering complexity. Every affected token resolved as prior-single and result-single, while refresh work repeatedly scanned full zone arrays. The next retained candidate should target generic per-refresh zone occurrence reuse inside `refreshCachedEntries`, so each scanned zone is indexed once per refresh call and token lookups reuse that local scan result. That candidate needs a focused correctness test proving parity for same-zone property mutation, moved tokens, removed tokens, and duplicate-token ordering before rerunning the bounded seed witness.

## Retained Zone-Occurrence Reuse Candidate

The retained candidate adds a refresh-local zone occurrence cache inside `refreshCachedEntries`. For each refresh call, a zone is scanned at most once into a local `tokenId -> occurrences` map; each affected token then reuses that map instead of rescanning the same zone arrays. The cache is local to the synchronous refresh call and is not attached to `GameState`, so it does not create a cross-state aliasing surface.

Correctness proof:

```bash
pnpm -F @ludoforge/engine build
pnpm -F @ludoforge/engine exec node --test dist/test/kernel/token-state-index-incremental.test.js
```

Decisive bounded witness:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-zone-occurrence-reuse-seed1005 --profile-buckets
```

Measured result:

| Surface | Token-index shape-probe baseline | Zone-occurrence reuse | Verdict |
|---|---:|---:|---|
| Seed `1005` wall ms | 102593.12 | 101758.60 | improved |
| Seed `1005` vs Phase 4c baseline | 101783.04 | 101758.60 | narrowly improved |
| `coupArvnRedeployPolice:chooseOne` continuedDeepening total ms | 40844.39 | 40590.39 | improved |
| `coupArvnRedeployPolice:chooseOne` route count | 0 | 0 | zero-counter residual preserved |
| `coupArvnRedeployPolice:chooseOne` unsupported count | 0 | 0 | zero-counter residual preserved |
| `coupArvnRedeployPolice:chooseOne` batch count | 0 | 0 | zero-counter residual preserved |
| `tokenStateIndex:refreshCachedEntries` timed bucket | 7207.27 | 6551.81 | improved |
| `evalQuery:countMatchingTokens` timed bucket | 2598.61 | 2651.23 | still active |

The retained optimization reduces the token-index refresh owner identified by the shape probe, but the zero-counter class remains dominant and query-count work remains active. This is a partial Phase 4d landing, not enough evidence to reopen the default-flip path in `tickets/174WASMDEEPPRV-010.md`.

## Rejected Prior-Zone Skip Candidate

After retaining zone-occurrence reuse, the same-ticket continuation tried the smallest remaining duplicate-scan reduction: skip the prior-entry zone scan call when that zone was already present in `mutatedZoneIds`. The shape probe had recorded `15270074` duplicate prior-zone scan skips, so this was a plausible generic token-index micro-optimization. It did not change occurrence semantics and passed the focused token-state-index test before measurement.

Correctness proof while the candidate existed:

```bash
pnpm -F @ludoforge/engine build
pnpm -F @ludoforge/engine exec node --test dist/test/kernel/token-state-index-incremental.test.js
```

Decisive bounded witness while the candidate existed:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-prior-zone-skip-seed1005 --profile-buckets
```

Measured result:

| Surface | Retained zone-occurrence reuse | Prior-zone skip candidate | Verdict |
|---|---:|---:|---|
| Seed `1005` wall ms | 101758.60 | 103081.91 | regressed |
| `coupArvnRedeployPolice:chooseOne` continuedDeepening total ms | 40590.39 | 41340.25 | regressed |
| `coupArvnRedeployPolice:chooseOne` route count | 0 | 0 | zero-counter residual preserved |
| `coupArvnRedeployPolice:chooseOne` unsupported count | 0 | 0 | zero-counter residual preserved |
| `coupArvnRedeployPolice:chooseOne` batch count | 0 | 0 | zero-counter residual preserved |
| `tokenStateIndex:refreshCachedEntries` timed bucket | 6551.81 | 6915.18 | regressed |
| `evalQuery:countMatchingTokens` timed bucket | 2651.23 | 2592.42 | not decisive |

The candidate was reverted and the engine was rebuilt. It remains rejected evidence because it reduced an apparently redundant call path but worsened the decisive measured residual.

## Choose-One Drive Publication Probe

After the final Option 1 closeout, a diagnostic-only continuation added temporary hot-path timers around `chooseOne` inner preview drive phases in `policy-preview-inner.ts`. The instrumentation was not retained; it only produced an owner-isolation witness for the remaining zero-counter residual.

Command:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-chooseone-drive-probe-seed1005 --profile-buckets
```

The probe completed seed `1005` in `101848.76 ms`. `coupArvnRedeployPolice:chooseOne | continuedDeepening` remained the top zero-counter residual class at `40296.76 ms`, with production preview-drive route count `0`, unsupported count `0`, and batch count `0`.

Hot-path bucket evidence for `coupArvnRedeployPolice:chooseOne | continuedDeepening`:

| Bucket | Count | Total ms |
|---|---:|---:|
| `policyPreviewInner:chooseOne:driveOption` | 1763 | 39510.64 |
| `policyPreviewInner:chooseOne:publishContinuation` | 2400 | 35557.18 |
| `tokenStateIndex:refreshCachedEntries` | 1633342 | 6443.66 |
| `evalQuery:countMatchingTokens` | 1738266 | 2571.39 |
| `policyPreviewInner:chooseOne:pickContinuation` | 2400 | 1651.08 |
| `policyPreviewInner:chooseOne:canonicalizeState` | 1763 | 781.43 |
| `policyPreviewInner:chooseOne:applyContinuation` | 2400 | 722.58 |
| `policyPreviewInner:chooseOne:resolveRefs` | 1763 | 717.38 |
| `policyPreviewInner:chooseOne:rootApply` | 1763 | 528.69 |

This shifts the next concrete owner away from token/query micro-optimizations: the dominant remaining time is preview-state continuation publication. The next implementation attempt should inspect `publishMicroturnFromPreviewStateNoHash` and its preview-state decision publication work for a generic reuse or no-hash publication path before touching token/query caches again.

## Retained Preview Publication State-Only Candidate

The retained candidate changes only preview no-hash stack publication: `publishMicroturnFromPreviewStateNoHash` now returns a state-only `projectedState` for stack-top microturns, while normal `publishMicroturn` and `publishMicroturnFromCanonicalState` continue to publish observer projections. This is generic over all preview-drive stack contexts and is scoped to callers that already canonicalize and resolve preview surfaces outside the intermediate microturn projection.

Correctness proof:

```bash
pnpm -F @ludoforge/engine build
pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/microturn-publication.test.js
pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-inner-chooseone.test.js
```

Decisive bounded witness:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-preview-publish-state-only-seed1005 --profile-buckets
```

Measured result:

| Surface | Retained zone-occurrence reuse | Preview publication state-only | Verdict |
|---|---:|---:|---|
| Seed `1005` wall ms | 101758.60 | 99047.62 | improved |
| Seed `1005` vs Phase 4c baseline | 101783.04 | 99047.62 | improved |
| `coupArvnRedeployPolice:chooseOne` continuedDeepening total ms | 40590.39 | 39805.08 | improved |
| `coupArvnRedeployPolice:chooseOne` route count | 0 | 0 | zero-counter residual preserved |
| `coupArvnRedeployPolice:chooseOne` unsupported count | 0 | 0 | zero-counter residual preserved |
| `coupArvnRedeployPolice:chooseOne` batch count | 0 | 0 | zero-counter residual preserved |
| `tokenStateIndex:refreshCachedEntries` timed bucket | 6551.81 | 6410.68 | still active |
| `evalQuery:countMatchingTokens` timed bucket | 2651.23 | 2497.73 | still active |

The retained preview-publication slice improves the bounded witness and keeps the residual distinct from preview-drive fallback activity. It still does not prove the full default-flip gate; `tickets/174WASMDEEPPRV-010.md` remains blocked until a later measured gate records a pass.

## Post-Preview Publication Owner Probes

After retaining preview no-hash state-only publication, the same-ticket continuation added temporary hot-path timers in `policy-preview-inner.ts` and `microturn/publish.ts`. The instrumentation was not retained; it produced two owner-isolation witnesses and was removed before the retained candidate measurement.

Commands:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-post-preview-owner-probe-seed1005 --profile-buckets
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-publish-legal-actions-probe-seed1005 --profile-buckets
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-continuation-support-probe-seed1005 --profile-buckets
```

The probes kept `coupArvnRedeployPolice:chooseOne | continuedDeepening` as the top zero-counter class and preserved production preview-drive route count `0`, unsupported count `0`, and batch count `0`. The decisive owner breakdown was:

| Probe | Top-class total ms | Dominant bucket | Count | Total ms |
|---|---:|---|---:|---:|
| post-preview owner probe | 44584.62 | `policyPreviewInner:chooseOne:loopPublish` | 2400 | 39449.11 |
| publish legal-actions probe | 42552.79 | `publish:isSupportedFrameContinuationMove` | 61638 | 37472.30 |
| continuation-support probe | 37193.94 | `publish:isSupportedContinuationResult:probeMoveViability` | 61638 | 32644.45 |

This identified the next concrete generic owner: repeated full `probeMoveViability` reprobes for already-suspended microturn continuations after `resumeSuspendedEffectFrame` had produced a concrete continuation for the selected option.

## Retained Suspended-Continuation Viability-Skip Candidate

The retained candidate keeps the normal action-selection support path unchanged, but skips the independent `probeMoveViability` reprobe when `isSupportedFrameContinuationMove` is already validating a suspended effect-frame continuation produced by `resumeSuspendedEffectFrame`. The resumed continuation still rejects illegal/throwing options, still runs publication admission, and still runs bridgeability checks for nonterminal next decisions.

Correctness proof:

```bash
pnpm -F @ludoforge/engine build
pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/microturn-publication.test.js
pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-inner-chooseone.test.js
```

The publication suite includes the existing guard that filters a resumed `chooseOne` option which would throw during execution.

Decisive bounded witness:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-suspended-viability-skip-seed1005 --profile-buckets
```

Measured result:

| Surface | Preview publication state-only | Suspended viability skip | Verdict |
|---|---:|---:|---|
| Seed `1005` wall ms | 99047.62 | 66089.91 | improved |
| `coupArvnRedeployPolice:chooseOne` continuedDeepening total ms | 39805.08 | 8828.85 | improved |
| `coupArvnRedeployPolice:chooseOne` slow-axis rank | 1 | 3 | no longer dominant |
| `coupArvnRedeployPolice:chooseOne` route count | 0 | 0 | zero-counter residual preserved |
| `coupArvnRedeployPolice:chooseOne` unsupported count | 0 | 0 | zero-counter residual preserved |
| `coupArvnRedeployPolice:chooseOne` batch count | 0 | 0 | zero-counter residual preserved |
| `tokenStateIndex:refreshCachedEntries` timed bucket | 6410.68 | 1572.76 | improved |
| `evalQuery:countMatchingTokens` timed bucket | 2497.73 | 226.50 | improved |

The retained candidate reduces and deprioritizes the ticket-owned zero-counter residual. It still does not prove the full Phase 4 default-flip gate: the bounded sample is now dominated by `train:chooseNStep:add` and `train:chooseNStep:confirm` continued-deepening classes with reason-granular unsupported preview-drive activity. `tickets/174WASMDEEPPRV-010.md` remains blocked until a later measured gate records a pass.
