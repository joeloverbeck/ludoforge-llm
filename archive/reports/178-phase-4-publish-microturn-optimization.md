# Spec 178 Phase 4 - publishMicroturn Optimization

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17
**Status**: Implementation landed; Spec 178 target owner reduced below the slow-tier 5% bar.
**Ticket**: `archive/tickets/178CONTDEEPINNER-005.md`

## Question

Phase 4 tests whether the generic `policyInnerPreviewDriveOption:publishMicroturn` child owner inside chooseOne `driveOption` can be reduced without changing selected outcomes or Foundation 20 preview-signal carriers.

## Implementation

The optimization keeps publication inside the kernel one-rules protocol. `driveOption` now scores a policy-guided chooseOne continuation first, then asks the kernel to publish and verify only that preferred continuation. If the preferred continuation is not constructible, the code falls back to the existing full `publishMicroturnFromPreviewStateNoHash` path and selection logic.

No FITL-specific branch, profile tuning, GameSpecDoc change, visual-config change, schema change, or WASM route extension was added.

## Evidence Inputs

| Input | Command | Use in this report |
|---|---|---|
| `reports/178-phase-3-residual-drive-option-investigation.md` | Historical Phase 3 report. | Baseline values for the `publishMicroturn` child owner. |
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-4-publish-microturn-optimization.md` | `pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-spec-178-phase-4-publish-microturn-optimization --profile-buckets` | Decisive Phase 4 five-seed rollup. |
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-4-publish-microturn-optimization.csv` | Same command as above. | Flat per-decision artifact. |

The Phase 4 witness completed all five seeds: `1005`, `1011`, `1008`, `1013`, and `1009`. Same-run wall time was `88,302.59 ms`, so the current 5% materiality bar is `4,415.13 ms`.

## Primary Axis Result

Target axis: `coupArvnRedeployPolice:chooseOne | continuedDeepening`.

| Metric | Phase 3 baseline | Phase 4 final | Delta | Percent change | Verdict |
|---|---:|---:|---:|---:|---|
| Axis total | `7,286.87 ms` | `4,220.50 ms` | `-3,066.37 ms` | `-42.08%` | Below the current 5% same-run wall bar. |
| `continued-deepening-orchestration-inclusive` | `7,230.43 ms` | `4,164.54 ms` | `-3,065.89 ms` | `-42.40%` | Below the current 5% same-run wall bar. |
| `policyInnerPreviewSubroutine:driveOption` | `6,494.10 ms` | `3,435.14 ms` | `-3,058.96 ms` | `-47.10%` | Clears the original >= 40% owner-reduction target. |
| `policyInnerPreviewDriveOption:publishMicroturn` | `3,056.07 ms` | `1,648.83 ms` | `-1,407.24 ms` | `-46.05%` | Material reduction of the ticket-owned child owner. |

The primary chooseOne continued-deepening axis no longer clears the 5% same-run slow-tier materiality bar after this implementation.

## Sister Axis Result

Sister axis: `coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening`.

| Metric | Phase 3 baseline | Phase 4 final | Delta | Percent change | Verdict |
|---|---:|---:|---:|---:|---|
| Axis total | `1,679.06 ms` | `1,418.62 ms` | `-260.44 ms` | `-15.51%` | Directionally improved. |
| `continued-deepening-orchestration-inclusive` | `1,641.82 ms` | `1,378.42 ms` | `-263.40 ms` | `-16.04%` | Directionally improved. |
| `policyInnerPreviewSubroutine:driveOption` | `1,350.80 ms` | `1,075.70 ms` | `-275.10 ms` | `-20.36%` | Directionally improved but below the earlier Phase 2 sister-axis 25% guidepost. |
| `policyInnerPreviewDriveOption:publishMicroturn` | `357.82 ms` | `295.70 ms` | `-62.12 ms` | `-17.36%` | Directionally improved. |

The sister axis was already below the 5% materiality bar. It improved in the same direction, but did not reach the earlier Phase 2 25% sister-axis guidepost.

## Carrier Preservation

| Carrier | Phase 3 | Phase 4 | Verdict |
|---|---:|---:|---|
| WASM production preview-drive route count | `1,299` | `1,299` | Pass |
| WASM production preview-drive unsupported count | `751` | `751` | Pass |
| Unsupported reason taxonomy | Existing reason rows only. | Existing reason rows only. | Pass |
| Advisory and selected-outcome parity | Covered by `policy-preview-inner-outcome-parity.test.js`. | Same five seeds passed. | Pass |

No route counter, unsupported counter, or unsupported reason collapse was observed.

## Source-Size Ledger

| Path | Before lines | After lines | Crossed cap? | Active growth | Extraction/defer rationale | Successor |
|---|---:|---:|---|---:|---|---|
| `packages/engine/src/agents/policy-preview-inner.ts` | 583 | 639 | No | +56 | Under the 800-line cap; helper stays local to the ticket-owned inner-preview seam. | none |
| `packages/engine/src/kernel/microturn/publish.ts` | 961 | 960 | No; preexisting oversize decreased | -1 | Existing helper generalized without net growth in the preexisting oversized publication hub. | none |

## Verification

- `pnpm -F @ludoforge/engine build` - passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/microturn-publication.test.js dist/test/architecture/policy-preview-inner-outcome-parity.test.js` - passed, 17 tests.
- `pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-spec-178-phase-4-publish-microturn-optimization --profile-buckets` - passed, 5/5 seeds.

## Recommendation

stop: the ticket-owned `publishMicroturn` child owner was reduced materially, and the primary chooseOne continued-deepening axis is now below the 5% same-run slow-tier materiality bar. Spec 178 should record this Phase 4 result as closing the chooseOne orchestration target. The remaining top slow axes are chooseNStep continued-deepening families, which Spec 178 already marks out of scope.
