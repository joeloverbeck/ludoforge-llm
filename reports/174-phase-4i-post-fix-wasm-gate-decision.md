# Spec 174 Phase 4i — Post-fix(wasm) Re-Measurement and Attribution

**Date**: 2026-05-17
**Verdict**: Pass (with caveat — see Attribution Analysis)
**Witness report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-post-fix-wasm.md`
**Witness CSV**: `reports/fitl-arvn-15-seed-decomposition-2026-05-17-post-fix-wasm.csv`
**Command**: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-post-fix-wasm`
**Trigger**: Post-merge re-measurement requested after PR #262 (spec 174 closeout) plus commit `278003969` (`fix(wasm): graceful preview-drive fallback restores WASM/TS equivalence`).

## Context

Spec 174 closed on 2026-05-16 with Phase 4h recording a Fail (slow-tier median `28601.78 ms` vs `<= 20408.8125 ms` threshold; `archive/reports/174-phase-4h-post-4g-gate-decision.md`). Default-flip ticket `174WASMDEEPPRV-010` was archived rejected. Spec 174 §9 Outcome (line 162) anticipated this measurement:

> If later measured evidence records a real broad Phase 4 pass, create a new default-flip ticket from that evidence instead of resurrecting `174WASMDEEPPRV-010`.

This report records such a measurement, plus a TS-only reference baseline that materially changes the architectural interpretation.

## Gate Math

| Metric | Value |
|---|---:|
| Post-008 baseline slow-tier median | 27211.75 ms |
| Phase 4 pass threshold (25% improvement) | <= 20408.8125 ms |
| Phase 4h post-4g slow-tier median | 28601.78 ms (Fail) |
| Phase 4i post-fix(wasm) slow-tier median | **11536.43 ms** |
| Delta vs Phase 4h | −17065.35 ms |
| Delta vs pass threshold | −8872.38 ms |
| Improvement vs post-008 baseline | 57.6% |
| Verdict | **Pass** |

## Slow-Tier Per-Seed Comparison

Slow tier: `1005`, `1011`, `1008`, `1013`, `1009` (frozen since Spec 173).

| Seed | Phase 4h wall ms | Phase 4i wall ms | Δ ms | Phase 4h decisions | Phase 4i decisions | Δ decisions |
|---:|---:|---:|---:|---:|---:|---:|
| 1005 | 64149.54 | 45070.63 | −19078.91 | 790 | 398 | **−49.6%** |
| 1011 | 33182.64 | 7530.37 | −25652.27 | 473 | 206 | **−56.4%** |
| 1008 | 28601.78 | 19628.36 | −8973.42 | 679 | 346 | **−49.0%** |
| 1013 | 7018.31 | 7791.95 | +773.64 | 261 | 258 | −1.1% |
| 1009 | 9484.70 | 11536.43 | +2051.73 | 296 | 292 | −1.4% |

Three of five slow-tier seeds end in roughly half the decision count post-fix. Per-decision wall time is, if anything, slightly higher post-fix (e.g., seed 1005: 81.2 ms/decision → 113.2 ms/decision). The wall-time win comes from *shorter games*, not from *faster decisions*.

## WASM-On vs No-WASM Reference Baseline

The Phase 4i witness above is the canonical WASM-on measurement. A second 15-seed pass with the WASM runtime explicitly disabled (no `initializePolicyWasmRuntimeSync` call) was taken for reference. Both passes run serially in the same process, same compiled engine artifacts.

| Seed | WASM-on wall ms | No-WASM wall ms | Δ (WASM−TS) |
|---:|---:|---:|---:|
| 1000 | 5774.13 | 6124.52 | −350.39 |
| 1001 | 7740.93 | 7740.34 | +0.59 |
| 1002 | 4863.01 | 4298.22 | +564.79 |
| 1003 | 8630.24 | 7988.73 | +641.51 |
| 1004 | 13549.75 | 12900.66 | +649.09 |
| 1005 | 45070.63 | 43090.07 | +1980.56 |
| 1006 | 10396.86 | 12396.12 | −1999.26 |
| 1007 | 7057.85 | 7368.97 | −311.12 |
| 1008 | 19628.36 | 21754.73 | −2126.37 |
| 1009 | 11536.43 | 11089.56 | +446.87 |
| 1010 | 32686.29 | 33342.12 | −655.83 |
| 1011 | 7530.37 | 6392.69 | +1137.68 |
| 1012 | 17130.90 | 15410.02 | +1720.88 |
| 1013 | 7791.95 | 6760.44 | +1031.51 |
| 1014 | 18588.69 | 16513.67 | +2075.02 |
| **Total** | **~217976 ms** | **~213170 ms** | **+4806 ms (WASM-on 2.3% slower)** |

Slow-tier medians: WASM-on `11536.43 ms`, no-WASM `11089.56 ms` (no-WASM is ~447 ms / 3.9% faster). Differences fall within typical seed-to-seed noise; neither mode is meaningfully faster than the other on this workload.

## Activation Counters

| Counter | Phase 4h | Phase 4i | Δ |
|---|---:|---:|---:|
| WASM production preview-drive routes | 1253 | **3125** | +149% |
| WASM production preview-drive unsupported | 2313 | **1998** | −13.6% |
| WASM production preview-drive batches | 1711 | **2648** | +55% |

Route activation increased markedly post-fix(wasm) — vc-baseline scoring is no longer being rejected by the spurious `slot_count > depth_cap` check in `preview_drive.rs:183`. Unsupported counts dropped because the two converted throws now return null and the caller's per-feature TS evaluation no longer trips the "unsupported" record path on every retry. Route activation and unsupported provenance remain distinct.

## Attribution Analysis

Source-of-truth diff between Phase 4h gate measurement and Phase 4i:

```
13fd61b96  Implemented 174.                                        (prose only — specs/tickets/reports)
843aade2b  Archived many reports as exploited.                     (file moves only)
278003969  fix(wasm): graceful preview-drive fallback restores...  (engine source change)
0e1cba4ae  Merge pull request #262 from joeloverbeck/implemented-174
```

Only one engine source change: `278003969`. Its substance, per the commit body:

1. `preview_drive.rs:183` rejected `preview_state_slot_count > depth_cap`. Slot count (named-state cells the candidates depend on) and depth cap (preview-drive recursion limit) are unrelated; the bound was incorrect. For vc-baseline (`slot_count=52` vs `depth_cap=6`), this trivially aborted scoring on every call.
2. `policy-wasm-score-routing.ts` threw `PolicyRuntimeError` for two unsupported preview-drive cases (unsupported preview ref; unsupported drive batch) while the cardEvent case at `:225` already returned `null` for graceful TS fallback. The asymmetry caused the agent to fall back to **all-zero scores** rather than the per-feature TS evaluation the caller at `:440` already implements.

Effect on agent behavior:
- Pre-fix: Many score rows were either all-zero (from the asymmetric throw) or skipped (from the vc-baseline rejection). The ARVN agent picked among effectively-tied candidates arbitrarily, leading to suboptimal strategy and longer games.
- Post-fix: Correct per-feature TS evaluation runs whenever WASM returns null. Agents play with accurate scores. Games end sooner on three of five slow-tier seeds (1005, 1008, 1011), often via a quicker decisive outcome.

The decision-count comparison in the Slow-Tier table above is the direct evidence. Wall-time-per-decision is unchanged or slightly higher; total wall-time drop is driven by halved decision counts on the seeds where the buggy scoring had been distorting play.

## Implications for the Spec 174 Thesis

Spec 174 §1 framed the work as: "Move the remaining generic deep preview-drive work for `continuedDeepening` / `deep1024` from TypeScript-only execution into a deterministic WASM route". §9 Outcome documented seven measured Phase 4 attempts (4c–4h) trying to deliver a 25% slow-tier improvement via WASM-coverage extension.

The Phase 4i reference baseline (WASM-on vs no-WASM equivalent within ±2.3% on total wall time) is empirical evidence that **WASM coverage extension was not the load-bearing perf lever the spec assumed.** On this workload:

- Per-call WASM execution does not measurably beat per-call TS execution.
- The 1998 unsupported preview-drive rows that fall back to TS today cost no measurable extra wall time.
- The 3125 routed WASM rows save no measurable wall time vs the equivalent TS evaluation.

This does not invalidate spec 174's correctness work — the ABI extensions, parity oracle, unsupported-class taxonomy, and counters are all sound. It does suggest that any future spec planning further WASM-coverage extension should establish a perf hypothesis with a like-for-like WASM-on vs WASM-off witness *before* committing to extension tickets. Correctness extension (eliminating fallback) remains architecturally meaningful for Foundation #14 / #15 reasons, but is no longer justified by perf alone.

## Remaining Unsupported Reasons

Top reasons from the Phase 4i witness (full table in the witness report, §"WASM Preview-Drive Unsupported Reasons"):

| Unsupported owner | Reason | Count |
|---|---|---:|
| `production-deep-choosenstep-continuation.projectedState` | deep preview-drive reached a terminal boundary before materializing a WASM projected state | 632 |
| `production-preview-drive.cardEventAction` | production preview-drive does not route card event action candidates | 512 |
| `production-preview-drive.actionBatch` | production preview-drive requires deterministic shared scalar runtime bindings | 711 |
| `production-preview-drive.chooseN` | only origin-seat greedy chooseN publication is supported | 17 |
| `production-preview-drive.effect.popInterruptPhase` | unsupported production preview-drive effect popInterruptPhase | 6 |

All are known fail-closed paths designed in spec 174; all currently fall back to TS with no measurable wall-time cost vs the WASM path. Completing them would buy Architectural Completeness (Foundation #15) and unblock A/B-routing deletion (Foundation #14) but is not a perf prerequisite.

## Decision

Phase 4 gate now **passes** by margin of `8872.38 ms` (57.6% improvement vs the 25% threshold). Per spec 174 §9 Outcome line 162, a new default-flip ticket can now be drafted from this evidence rather than reopening archived `174WASMDEEPPRV-010`. No such ticket is created in this report — the Pass is recorded; downstream decisions are deferred to the follow-ups below.

### Follow-up options (opt-in, not committed by this report)

1. **Foundation #14 cleanup ticket** — Delete temporary A/B routing scaffolding now that a measured Pass exists. Lower-risk; small follow-up. Should be preceded by a code inspection confirming what A/B scaffolding still exists today.
2. **WASM perf-yield investigation spec** — The reference baseline raises a strategic question the spec 174 narrative did not anticipate: WASM is correctness-equivalent and perf-neutral on this workload. A follow-up should either (a) identify and eliminate FFI / marshaling overhead that may be cancelling WASM's per-call speedup, (b) reroute more hot-path work (zobrist, token state index, eval queries) into WASM, or (c) confirm WASM is genuinely perf-neutral here and inform a strategic decision on keeping vs retiring the path.

Option 2 is the more strategic question; option 1 is the more mechanical cleanup.

## Files NOT touched

- `archive/specs/174-wasm-preview-drive-coverage-extension.md` — archived; not modified per `docs/archival-workflow.md`. Forward navigation lives in this report.
- `archive/tickets/174WASMDEEPPRV-010.md` — archived rejected; remains rejected. Per spec 174 §9 (line 162), any future default-flip work creates a new ticket from this report's evidence.
- `archive/reports/174-phase-4h-post-4g-gate-decision.md` — archived historical Fail record; preserved unchanged.
- All engine source files — this is a measurement-only report; no source changes are warranted by the data presented.
