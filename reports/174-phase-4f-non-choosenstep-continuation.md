# Spec 174 Phase 4f - Non-chooseNStep deep continuation materialization

**Date**: 2026-05-16
**Ticket**: `archive/tickets/174WASMDEEPPRV-017.md`
**Status**: Retained generic `chooseOne` continuation materialization; no Phase 4 gate pass.

## Scope

Phase 4e showed that the seed-1005 train residual was dominated by `production-deep-choosenstep-continuation.pickInnerDecision`: the completion policy selected a non-`chooseNStep` continuation decision after a `chooseNStep` root continuation. CSV inspection showed the selected non-`chooseNStep` class was `chooseOne`.

Phase 4f keeps this slice generic:

- `chooseOne` continuations are lowered through the same deep continuation path as `chooseNStep`.
- The WASM preview-drive state-patch ABI adds `applyChooseOneDecision`.
- Host-side materialization republishes the continuation from `GameDef` and the current `GameState`, validates frame/key/value identity, and applies the published decision through the kernel.
- Unsupported and terminal-boundary rows remain explicit and do not count as route activation.

## Proof Artifacts

- Baseline report: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4e-train-choosenstep-baseline.md`
- Baseline CSV: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4e-train-choosenstep-baseline.csv`
- Final report: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4f-non-choosenstep-continuation-final.md`
- Final CSV: `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4f-non-choosenstep-continuation-final.csv`

Final command:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4f-non-choosenstep-continuation-final --profile-buckets
```

The final report/CSV contain no remaining `production-deep-choosenstep-continuation.pickInnerDecision` rows and no remaining `deep preview-drive selected a non-chooseNStep continuation decision` reasons.

## Seed-1005 Summary

| Metric | Phase 4e baseline | Phase 4f final | Delta |
|---|---:|---:|---:|
| Seed wall ms | 62297.98 | 63872.98 | +1575.00 |
| Decisions | 790 | 790 | 0 |
| WASM production preview-drive routes | 12 | 310 | +298 |
| WASM production preview-drive unsupported | 519 | 221 | -298 |
| WASM production preview-drive batches | 199 | 199 | 0 |

The route activated and the ticket-owned unsupported owner dropped, but wall time regressed by about 2.53%. This is not evidence for a default flip, A/B deletion, or broad Phase 4 gate pass.

## Reason-Granular Rows

| Microturn class | Baseline total ms | Final total ms | Baseline routes | Final routes | Baseline unsupported | Final unsupported | Ticket-owned pickInnerDecision delta |
|---|---:|---:|---:|---:|---:|---:|---:|
| `train:chooseNStep:add` | 15159.23 | 16401.44 | 2 | 145 | 148 | 5 | 143 -> 0 |
| `train:chooseNStep:confirm` | 10001.11 | 11149.88 | 8 | 102 | 97 | 3 | 94 -> 0 |
| `govern:chooseNStep:add` | not top-ranked | 4063.41 | 0 | 39 | 39 | 0 | 39 -> 0 |
| `assault:chooseNStep:add` | not top-ranked | 395.52 | 2 | 15 | 13 | 0 | 13 -> 0 |
| `assault:chooseNStep:confirm` | not top-ranked | 245.51 | 0 | 9 | 10 | 1 | 9 -> 0 |

The retained implementation removes the selected-non-`chooseNStep` unsupported owner from these rows. The residual unsupported rows are terminal-boundary/projected-state rows such as:

```text
unknown/production-deep-choosenstep-continuation.projectedState/deep preview-drive reached a terminal boundary before materializing a WASM projected state
```

## Verdict

Phase 4f is complete for generic continuation materialization and route activation. The safe non-`chooseNStep` continuation class was `chooseOne`, and it now materializes through the WASM state-patch contract with TypeScript parity coverage.

The bounded witness does not improve wall time. It shifts formerly unsupported work into active route execution and leaves terminal-boundary/projected-state residuals explicit. `tickets/174WASMDEEPPRV-010.md` remains rejected.

The next non-overlapping owner was `archive/tickets/174WASMDEEPPRV-018.md`, which owned the post-017 repeated `zobrist:digestDecisionStackFrame` and `zobrist:encodeDecisionStackFrame` cost visible in the dominant continued-deepening hot-path buckets. That owner recorded a bounded measured improvement before archival; a renewed gate/default-flip decision still requires a later measured gate.
