# Spec 178 Phase 4 - Continued-Deepening Orchestration Residual

**Date**: 2026-05-17
**Status**: Phase 4 residual split complete.
**Ticket**: `archive/tickets/178POLWASMPERF-005.md`

## Question

`reports/178-phase-3-same-run-attribution-counters.md` found that the remaining material no-counter axis was `coupArvnRedeployPolice:chooseOne | continuedDeepening`, with `7,743.6802 ms` of same-run slow-tier agent-call wall time and no route/unsupported signal. Existing same-run hot-path buckets explained only `1,655.1061 ms`; the remaining residual was material but not yet implementation-ready.

This report records the next attribution split and decides whether the next owner is a concrete implementation spec, another investigation ticket, or no material owner.

The decisive Phase 4 slow-tier run measured `77,224.1179 ms` across seeds `1005`, `1011`, `1008`, `1013`, and `1009`, so the current same-run `5%` bar is `3,861.2059 ms`.

## Evidence Inputs

| Input | Command | Use in this report |
|---|---|---|
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-4-continued-deepening-orchestration-residual.csv` | `pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-phase-4-continued-deepening-orchestration-residual --profile-buckets` | Decisive same-run slow-tier artifact with the new continued-deepening residual split column. |
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-4-continued-deepening-orchestration-residual.md` | Same command as above. | Rendered rollup proving the new `Continued-Deepening No-Counter Residual Split` section is emitted. |
| `reports/178-phase-3-same-run-attribution-counters.md` | Historical report input. | Prior no-counter axis and materiality framing. |
| `packages/engine/src/agents/policy-agent-inner-preview.ts` | Source change. | Emits top-level same-run hot-path buckets for inner-preview orchestration. |
| `packages/engine/src/agents/microturn-option-evaluator.ts` | Source change. | Emits nested same-run hot-path buckets for microturn candidate scoring/search. |
| `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` | Source change. | Adds CSV field and rendered section for the residual split. |

## Target No-Counter Axis

| Axis | Decision rows | Wall ms | Share of same-run slow-tier wall | Route/unsupported signal |
|---|---:|---:|---:|---:|
| `coupArvnRedeployPolice:chooseOne | continuedDeepening` | 58 | `7,635.87` | `9.888%` | 0 |

The axis remains material and still has zero WASM route/unsupported signal. The new split now identifies a concrete generic owner.

## Residual Split

The new section is intentionally hierarchical. `continued-deepening-orchestration-inclusive` is a top-level same-run bucket. Rows ending in `-nested` are child hot-path evidence inside that bucket and are not additive with the top-level row.

| Classification | Count | Wall ms | Share of target axis wall | Share of same-run slow-tier wall | Verdict |
|---|---:|---:|---:|---:|---|
| `continued-deepening-orchestration-inclusive` | 116 | `7,581.42` | `99.2869%` | `9.8174%` | Material concrete owner; clears the `5%` bar. |
| `existing-hot-path-bucket-nested` | 14,385,302 | `1,619.58` | `21.2102%` | `2.0972%` | Nested evidence; below the `5%` bar as a separate owner. |
| `policy-search-candidate-scoring-nested` | 61,724 | `1,537.43` | `20.1343%` | `1.991%` | Nested evidence; below the `5%` bar as a separate owner. |
| `unattributed-after-top-level-orchestration` | n/a | `54.45` | `0.7131%` | `0.0705%` | No material missing-measurement owner remains on the target axis. |

Nearby same-owner evidence also appears for `coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening`: `1,671.7 ms`, or `2.165%` of same-run slow-tier wall time, under the same `continued-deepening-orchestration-inclusive` classification. It does not clear the threshold alone, but it supports the same generic owner.

## Foundation Alignment

| Foundation | Alignment |
|---|---|
| #1 Engine Agnosticism | FITL ARVN remains the witness workload. The measured owner is generic inner-preview orchestration, not ARVN-specific rules. |
| #14 No Backwards Compatibility | The current profiler/report shape was extended in place. No legacy alias, compatibility shim, or parallel report format was added. |
| #15 Architectural Completeness | The recommendation names a concrete root owner instead of turning nested token/query/scoring buckets into separate speculative specs. |
| #16 Testing as Proof | The decision is backed by checked-in same-run CSV/Markdown artifacts plus focused automated report-rendering proof. |
| #20 Preview Signal Integrity | Route/unsupported counters, top-level orchestration, nested hot buckets, and unattributed residual remain separate carriers. |

## Recommendation Inputs

**Problem statement for the next spec:** `continuedDeepening` chooseOne inner-preview orchestration dominates the remaining no-counter target axis. The current implementation repeatedly performs top-level inner-preview orchestration work before the policy agent can choose a value, while nested token/query and policy-scoring buckets are below the materiality bar as separate owners.

**Materiality threshold:** The current same-run slow-tier wall time is `77,224.1179 ms`; `5%` is `3,861.2059 ms`. The target axis top-level orchestration row is `7,581.42 ms`, or `9.8174%`, and therefore clears the threshold.

**Required proof lanes for the next spec:**

- Build the engine package before compiled-test or profiler witnesses: `pnpm -F @ludoforge/engine build`.
- Keep a focused report/profiler shape test proving any new attribution or output contract.
- Use the same slow-tier FITL ARVN decomposition command as a witness workload, with `--profile-buckets` and route/unsupported counters preserved.
- Prove any optimization through the generic inner-preview/policy-agent seam, not through game-specific FITL branches or profile-only shortcuts.
- Preserve a no-WASM or WASM-disabled comparison only as diagnostic unless the next spec explicitly owns a route-vs-reference gate.

**Foundation constraints for the next spec:**

- Foundation #20: do not convert unavailable preview refs or missing route counters into scalar score evidence; keep provenance fields visible.
- Foundation #14: do not add a compatibility path or parallel report format; migrate the existing profiler/report contract in place.
- Foundation #1: FITL ARVN is only the workload; implementation must be generic to policy-agent inner-preview orchestration.

create-spec: Optimize continued-deepening inner-preview orchestration
