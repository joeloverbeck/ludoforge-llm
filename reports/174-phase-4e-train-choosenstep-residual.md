# Spec 174 Phase 4e Train chooseNStep Residual

**Date**: 2026-05-16
**Decision owner**: `archive/tickets/174WASMDEEPPRV-016.md`
**Baseline witness report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4e-train-choosenstep-baseline.md`
**Baseline witness CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4e-train-choosenstep-baseline.csv`
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4e-train-choosenstep-baseline --profile-buckets`
**Result**: Completed diagnostic classification. No runtime candidate was retained under Phase 4e.

## Summary

The bounded seed-1005 witness re-established the Phase 4d handoff: the slow-axis table is dominated by `train:chooseNStep:add | continuedDeepening` and `train:chooseNStep:confirm | continuedDeepening`. Both classes preserve explicit unsupported/fallback provenance and do not authorize reopening the rejected default-flip ticket.

The dominant unsupported owner is not a malformed `chooseNStep` state patch. It is `production-deep-choosenstep-continuation.pickInnerDecision`: the deep preview-drive completion policy selects a non-`chooseNStep` continuation decision, while the current WASM continuation materialization route only lowers `chooseNStep` continuations. That is a broader generic continuation-ABI/runtime coverage gap, not a safe Phase 4e micro-optimization.

## Residual Classification

| Surface | Value |
|---|---:|
| Seed `1005` wall ms | 62297.98 |
| Decisions | 790 |
| WASM production preview-drive route count | 12 |
| WASM production preview-drive unsupported count | 519 |
| WASM production preview-drive batch count | 199 |
| `train:chooseNStep:add` total ms | 15159.23 |
| `train:chooseNStep:add` route count | 2 |
| `train:chooseNStep:add` unsupported count | 148 |
| `train:chooseNStep:add` batch count | 0 |
| `train:chooseNStep:confirm` total ms | 10001.11 |
| `train:chooseNStep:confirm` route count | 8 |
| `train:chooseNStep:confirm` unsupported count | 97 |
| `train:chooseNStep:confirm` batch count | 0 |
| `coupArvnRedeployPolice:chooseOne` total ms | 8390.28 |

Unsupported rows for the two train classes:

| Microturn class | Unsupported class | Unsupported owner | Reason | Count | Class unsupported total | Class route total |
|---|---|---|---|---:|---:|---:|
| `train:chooseNStep:add` | `agent-guided-completion` | `production-deep-choosenstep-continuation.pickInnerDecision` | deep preview-drive selected a non-chooseNStep continuation decision | 143 | 148 | 2 |
| `train:chooseNStep:add` | `unknown` | `production-deep-choosenstep-continuation.projectedState` | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 5 | 148 | 2 |
| `train:chooseNStep:confirm` | `agent-guided-completion` | `production-deep-choosenstep-continuation.pickInnerDecision` | deep preview-drive selected a non-chooseNStep continuation decision | 94 | 97 | 8 |
| `train:chooseNStep:confirm` | `unknown` | `production-deep-choosenstep-continuation.projectedState` | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 3 | 97 | 8 |

Hot-path buckets for the dominant train rows:

| Microturn class | Bucket | Count | Total ms |
|---|---|---:|---:|
| `train:chooseNStep:add` | `zobrist:digestDecisionStackFrame` | 20128 | 3450.39 |
| `train:chooseNStep:add` | `zobrist:encodeDecisionStackFrame` | 21059 | 1989.96 |
| `train:chooseNStep:add` | `tokenStateIndex:refreshCachedEntries` | 7741 | 156.75 |
| `train:chooseNStep:add` | `evalQuery:applyTokenFilter` | 4636 | 15.13 |
| `train:chooseNStep:add` | `evalQuery:countMatchingTokens` | 7451 | 13.48 |
| `train:chooseNStep:confirm` | `zobrist:digestDecisionStackFrame` | 12646 | 2248.93 |
| `train:chooseNStep:confirm` | `zobrist:encodeDecisionStackFrame` | 13628 | 1361.42 |
| `train:chooseNStep:confirm` | `tokenStateIndex:refreshCachedEntries` | 5338 | 115.62 |
| `train:chooseNStep:confirm` | `evalQuery:countMatchingTokens` | 3526 | 8.30 |
| `train:chooseNStep:confirm` | `evalQuery:applyTokenFilter` | 1718 | 5.26 |

## Decision

Phase 4e is a diagnostic closeout with no retained runtime code. The measured owner is generic, but the safe implementation boundary is larger than this ticket: the deep continuation WASM path must materialize non-`chooseNStep` continuation decisions selected by the completion policy, while preserving unsupported provenance and TypeScript parity.

The non-overlapping follow-up owner is `tickets/174WASMDEEPPRV-017.md`. It should extend the generic deep continuation materialization contract beyond `chooseNStep` continuations or explicitly prove a smaller safe substrate before attempting a full Phase 4 gate rerun.

## Artifact Classification

- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4e-train-choosenstep-baseline.md`: checked-in bounded witness report.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4e-train-choosenstep-baseline.csv`: checked-in bounded witness CSV.
- `reports/174-phase-4e-train-choosenstep-residual.md`: checked-in Phase 4e decision report.
- Runtime/test diffs: none retained.
- Schema, golden, GameSpecDoc, WASM ABI, and generated JSON fallout: none.

## Next Gate

A full 15-seed Phase 4 gate rerun is not justified by this ticket alone because no runtime improvement was retained. The next gate candidate should wait until `tickets/174WASMDEEPPRV-017.md` or a later owner records nonzero generic support for the current `production-deep-choosenstep-continuation.pickInnerDecision` residual without hiding unsupported/fallback counts.
