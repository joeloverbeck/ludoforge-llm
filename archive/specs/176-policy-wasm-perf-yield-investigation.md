# Spec 176 — Policy WASM Perf-Yield Investigation

**Status**: COMPLETED
**Priority**: High-strategic — answers a foundational question about whether the policy WASM architecture is worth continued investment.
**Complexity**: L — investigation-style spec; deliverables are measurement experiments and a decision report, not engine code changes.
**Date**: 2026-05-17
**Dependencies**:
- `archive/specs/150-fitl-policy-vm-wasm-port.md` (original WASM port)
- `archive/specs/174-wasm-preview-drive-coverage-extension.md` (extended coverage; assumed perf yield)
- `reports/174-phase-4i-post-fix-wasm-gate-decision.md` (records the equivalence finding that motivated this spec)
**Trigger report**: `reports/174-phase-4i-post-fix-wasm-gate-decision.md`
**Ticket namespace**: `176WASMPERFYLD` (proposal — finalized by `/spec-to-tickets`)

## 1. Goal

Determine empirically why the policy WASM path provides no measurable wall-time speedup over the TypeScript path on the FITL ARVN evolution workload, and decide whether to keep, accelerate, or retire the policy WASM architecture.

## 2. Non-Goals

- No engine code optimization in this spec. Findings may trigger follow-up specs, but spec 176's deliverable is the investigation and decision, not the speedup itself.
- No spec 175 work. Correctness hardening is owned by spec 175 and is independent.
- No agent-behavior tuning. The investigation runs against the production `arvn-evolved` profile unchanged.
- No GameSpecDoc, policy bytecode, or preview-bound changes.
- No reopening of spec 174's archived rejected default-flip ticket.

## 3. Context (Strategic Thinking)

The Phase 4i measurement showed:

| Mode | Slow-tier median wall ms | Total 15-seed wall ms |
|---|---:|---:|
| WASM-on | 11536.43 | ~217,977 |
| No-WASM (TS only) | 11089.56 | ~213,170 |

The two are wall-time equivalent within ±2.3% on total, ±3.9% on slow-tier median. This empirical equivalence contradicts spec 174's load-bearing assumption that extending WASM coverage to deep `continuedDeepening` / `deep1024` work would deliver a measured perf yield. Phase 4d–g attempted seven measured optimizations (zone occurrence reuse, suspended-continuation reprobe skip, state-patch hash reuse, etc.) chasing residual costs; in hindsight, much of that residual was likely correctness-induced game-length inflation from the asymmetric-throw bug `278003969` rather than a real per-call execution ceiling.

The strategic question this spec must answer: **does the policy WASM architecture earn its complexity cost, or has the original perf premise been falsified?**

### Hypotheses

Five non-exclusive hypotheses for the WASM/TS equivalence finding. Each is testable with measurement.

**H1. FFI marshaling overhead cancels per-call WASM speedup.** Every WASM call serializes inputs (encoded state, policy bytecode context, candidate features, precomputed feature rows) into `ArrayBuffer`s, copies them into WASM linear memory, executes, then deserializes results back. For small workloads (few candidates, few features per call), the marshaling cost can exceed the WASM execution cost. The 3125 WASM preview-drive routes today × per-call marshaling overhead may equal the per-call execution savings.

**H2. Hot paths are dominated by TS-only work outside WASM's scope.** Phase 4h's hot-bucket telemetry (`archive/reports/174-phase-4h-post-4g-gate-decision.md`) shows the slow-tier hot work is concentrated in:
- `tokenStateIndex:refreshCachedEntries` — 479,298 calls, 4,707.70 ms in slow tier (pure TS)
- `evalQuery:countMatchingTokens` — 570,974 calls, 702.52 ms (pure TS)
- `zobrist:digestDecisionStackFrame` — 20,128 calls, 3,480.62 ms (pure TS)
- `zobrist:encodeDecisionStackFrame` — 20,344 calls, 1,966.49 ms (pure TS)

These TS-only paths dwarf any score-evaluation work. WASM only handles policy bytecode evaluation; the dominant runtime cost happens in TS regardless of WASM. Removing WASM doesn't reduce the dominant cost.

**H3. WASM handles only the cheap paths; the expensive paths are exactly the unsupported ones that fall back to TS.** Phase 4i's "Top Hot Axes In Slow-Tier Seeds":

| Rank | Axis | Total ms | Route count | Unsupported count |
|---:|---|---:|---:|---:|
| 1 | `govern:chooseNStep:confirm | continuedDeepening` | 16545.97 | 0 | 520 |
| 2 | `train:chooseNStep:add | continuedDeepening` | 13513.14 | 222 (some) | 13 |
| 3 | `govern:chooseNStep:add | continuedDeepening` | 11924.60 | 663 | 73 |
| 4 | `event | singlePass` | 8169.83 | 0 | 276 |
| 5 | `coupArvnRedeployPolice:chooseOne | continuedDeepening` | 7641.28 | 0 | 0 (zero-counter axis) |

The top wall-time axes are predominantly TS-fallback work. The WASM routes (3125 total) are concentrated in cheaper axes where the marginal speedup is masked by FFI overhead. The expensive deep-continuation / card-event / action-batch work that would yield real speedup if WASM'd is precisely the work spec 174 found hard or impossible to bring into WASM.

**H4. Bytecode cache misses dominate compile cost.** Each unique policy bytecode shape must be compiled in WASM once and cached (`getScoreRowBytecodeCompileCount` in `policy-wasm-score-bytecode-cache.ts`). If shapes vary per-batch (e.g., different candidate counts produce different bytecode lowerings), the cache miss + compile cost can dominate the execution savings.

**H5. State serialization (encoded state, bytecode input cache) dominates the per-call cost.** The encoded state representation includes full zone-token state and decision-stack frames. Serializing this into WASM linear memory for every batch is non-trivial; the `policy-wasm-bytecode-input-cache.ts` hit/miss telemetry already partially measures this but has not been correlated with wall-time-per-axis.

### Expected interactions

H1 and H5 are partially overlapping (both involve marshaling cost), but H1 is "fixed per-call overhead" while H5 is "input-size-dependent serialization cost." H2 and H3 are complementary: H2 says the hot paths are TS-only by architecture, H3 says the hot paths are TS-fallback by configuration. H4 is the smallest and most easily-fixed if it dominates.

## 4. Architecture (Measurement Methodology)

The spec's deliverable is a series of bounded measurement experiments, each isolating one hypothesis, plus a synthesis phase that integrates findings into a decision.

The measurement substrate is the existing `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` profiler, extended where needed to surface per-hypothesis counters. The canonical comparison baseline is WASM-on vs WASM-off across the 15-seed ARVN tier; per-hypothesis experiments may use targeted sub-samples (e.g., a single slow-tier seed) for cost reasons.

All measurement scripts go under `packages/engine/scripts/`. All measurement reports go under `reports/176-phase-N-<hypothesis>-*.md`. No engine source changes are warranted by the investigation itself; any changes proposed by findings are deferred to follow-up specs.

## 5. Phases

| Phase | Scope | Acceptance |
|---|---|---|
| 0 | Baseline reproduction. Re-run the Phase 4i witness in both WASM-on and WASM-off modes to confirm the equivalence finding persists. Add per-call timing instrumentation to the WASM glue (split into marshaling time vs WASM-execution time vs deserialization time) — feature-flagged so production runs are unaffected. | Phase 0 report records slow-tier medians for both modes within ±5% of Phase 4i (`11536.43 ms` WASM-on, `11089.56 ms` no-WASM); per-call timing instrumentation lands behind a `POLICY_WASM_TIMING_PROFILE=1` env flag or equivalent. |
| 1 | H1 test — FFI marshaling overhead. With the Phase 0 instrumentation, decompose WASM-on slow-tier per-call time into marshaling / execution / deserialization buckets. Compare to TS-equivalent per-call time. | Per-call breakdown report at `reports/176-phase-1-ffi-marshaling-decomposition.md`. Verdict: marshaling dominates / executes dominates / parity. |
| 2 | H2 test — TS-only hot paths. Profile the WASM-off slow-tier with `--profile-buckets` enabled. Confirm the hot buckets are TS-only and outside WASM's scope. Quantify what fraction of total wall time could plausibly be accelerated by WASM extension vs is structurally TS-bound. | Hot-path attribution report at `reports/176-phase-2-ts-only-hot-paths.md`. Verdict: includes a quantified ceiling on the speedup WASM extension could theoretically achieve. |
| 3 | H3 test — Cheap vs expensive path coverage. Cross-reference the witness CSV's wall-time-per-axis against the route / unsupported / batch counters. Compute weighted wall-time fraction of "WASM-handled" rows vs "TS-fallback" rows. | Cheap-vs-expensive attribution report at `reports/176-phase-3-cheap-vs-expensive-coverage.md`. Verdict: if `<X>%` of wall time is in TS-fallback paths, WASM's perf ceiling is `<1/X>` even with perfect FFI elimination. |
| 4 | H4 test — Bytecode cache amortization. Add bytecode compile / hit / miss instrumentation per axis. Measure cache effectiveness over a full 15-seed run. | Cache-effectiveness report at `reports/176-phase-4-bytecode-cache-amortization.md`. Verdict: cache amortizes / cache thrashes / cache cost is negligible relative to execution. |
| 5 | H5 test — State serialization cost. Instrument the encoded-state serialization path specifically; measure bytes-per-call and ms-per-call for each axis. Correlate with axis wall time. | Serialization-cost report at `reports/176-phase-5-state-serialization.md`. Verdict: serialization-cost is linear in axis call count / state size / not a dominant factor. |
| 6 | Synthesis and decision. Integrate Phases 1–5 into a decision tree. The decision must select exactly one of: **Keep WASM as-is** (correctness-equivalent oracle, perf-neutral acceptable), **Accelerate WASM** (specific follow-up specs to attack the dominant identified bottleneck), **Retire WASM** (drop the path entirely, simplify the architecture per Foundation #14). | Final decision report at `reports/176-phase-6-decision-and-rationale.md`. Contains: per-hypothesis verdict summary, dominant-cause attribution, decision (one of three above), and a named follow-up spec or ticket for each branch (if Keep, the follow-up may be "none — close the investigation"; if Accelerate, the follow-up names the specific optimization spec; if Retire, the follow-up names the deprecation ticket). |

## 6. Decision Tree (Phase 6 Output)

The Phase 6 synthesis must select one of three decision outcomes based on Phases 1–5 evidence:

| Dominant Cause | Recommended Decision | Rationale |
|---|---|---|
| H1 (marshaling overhead) | Accelerate — follow-up spec to batch more work per WASM call | Real speedup is recoverable by reducing per-call overhead |
| H2 (TS-only hot paths) AND H3 (expensive paths unsupported) | Retire OR Keep-as-correctness-only | If WASM can't reach the hot paths and the unsupported paths can't easily come into WASM, perf yield is structurally bounded near zero |
| H2 alone, H3 not dominant | Accelerate — follow-up spec to extend WASM to TS-only hot paths | Major architectural work but high potential yield |
| H3 alone, H2 not dominant | Spec 174-style coverage extension (now with measured perf hypothesis upfront) | Closing the unsupported gap might yield real perf if the cheap paths aren't the bottleneck |
| H4 (cache misses) | Accelerate — small follow-up ticket to fix cache amortization | Localized fix, likely cheap |
| H5 (serialization cost) | Accelerate — follow-up spec to reduce state-serialization overhead | Requires ABI / encoding work |
| H5 mixed overhead (material marshaling, positive but non-linear byte correlation) | Weigh with H1 before choosing Keep / Accelerate / Retire | Indicates serialization/marshaling is material but not proven to be solved by byte-size reduction alone |
| No single dominant cause (all contribute) | Keep-as-correctness-only OR Retire | Strong signal that WASM is structurally perf-neutral on this workload; decision is then a complexity-cost vs correctness-rationalization tradeoff |

Phase 6 MUST commit to one decision branch, MUST name the follow-up artifact, and MUST record the decision rationale in terms a future reader can audit against the Phase 1–5 reports.

## 7. Acceptance Criteria

1. Phase 0 reproduces the Phase 4i WASM-on / WASM-off equivalence finding within ±5% on slow-tier median.
2. Per-call timing instrumentation lands behind a feature flag so production runs (campaigns, CI) are unaffected.
3. Each of Phases 1–5 produces a dated measurement report under `reports/176-phase-N-<hypothesis>-*.md` with a clear verdict per hypothesis.
4. Phase 6 produces a final decision report committing to exactly one of Keep / Accelerate / Retire, with named follow-up artifact.
5. No engine source change is committed by spec 176 tickets except the Phase 0 feature-flagged instrumentation. All other code changes are deferred to the follow-up spec named by Phase 6.
6. Every new test file (if any) carries a `@test-class` marker per `.claude/rules/testing.md`.

## 8. Foundation Alignment

| Foundation | Alignment |
|---|---|
| #14 No Backwards Compatibility | A Retire outcome eliminates dual-path complexity (spec 174 §3 "delete temporary A/B wiring when the route is complete" generalized to the entire WASM path); a Keep / Accelerate outcome justifies the complexity with measured evidence. |
| #15 Architectural Completeness | The investigation forces an explicit decision on whether the WASM path is a load-bearing architectural component or vestigial. Either decision is more complete than the current ambiguity. |
| #16 Testing as Proof | Phase 6's decision must be backed by measured per-hypothesis evidence, not inferred from spec narratives. Every verdict cites a measurement report. |
| #20 Preview Signal Integrity | Any decision must preserve the existing fail-closed-with-TS-fallback contract. A Retire decision still requires TS to maintain Foundation #20 signal carriers; an Accelerate decision must preserve them across any new WASM coverage. |

## 9. Code Anchors

Existing measurement substrate (Phase 0 baseline):
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`
- `packages/engine/scripts/profile-fitl-preview-drive-metrics.mjs`
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs`

WASM glue with marshaling sites (Phase 1 instrumentation targets):
- `packages/engine/src/agents/policy-wasm-runtime.ts`
- `packages/engine/src/agents/policy-wasm-score-routing.ts`
- `packages/engine/src/agents/policy-wasm-bytecode-input-cache.ts`

Hot-path profiler (Phase 2 attribution source):
- `packages/engine/src/kernel/perf-profiler.ts` (`snapshotHotPathProfilerCounters`)

Bytecode cache (Phase 4 instrumentation target):
- `packages/engine/src/agents/policy-wasm-score-bytecode-cache.ts`

State serialization (Phase 5 instrumentation target):
- `packages/engine/src/agents/policy-wasm-bytecode-input-cache.ts`
- `packages/engine/src/agents/policy-wasm-runtime.ts` (the WASM `evaluate_*` callers)

Reference reports (informing the strategic context):
- `reports/174-phase-4i-post-fix-wasm-gate-decision.md`
- `archive/reports/174-phase-4h-post-4g-gate-decision.md` (the hot-bucket data referenced under H2)
- `archive/reports/174-phase-4-architectural-blocker.md`

## 10. Out of Scope

- Spec 175's correctness hardening work. Spec 176 assumes spec 175 lands in parallel or before; if 175 has not landed by Phase 0, Phase 0 may need to repeat after 175 lands to ensure the baseline reflects post-175 contract enforcement.
- Any engine source change beyond Phase 0's feature-flagged instrumentation. Engine changes deferred to follow-up specs named by Phase 6.
- Cross-game generalization. The investigation runs only against the FITL ARVN workload; conclusions may or may not generalize to Texas Hold'em or future games. A Phase 6 Keep / Accelerate decision should note this limitation.
- Foundation #14 A/B-routing-scaffolding deletion. That's the spec-174-§3 follow-up ticket; whether it's still warranted depends on Phase 6's outcome. If Retire, it's superseded by the broader deprecation; if Keep / Accelerate, it remains a separate small ticket.

## 11. Open Questions

- Phase 0 feature-flag mechanism — env var, build-time flag, or runtime API. Default: env var (`POLICY_WASM_TIMING_PROFILE=1`) for consistency with existing profiler conventions.
- Whether Phase 5 should also instrument bytecode-input-cache write cost separately. Default: yes, since the cache write is part of the serialization-cost path.
- Whether to formally pre-register a "no significant finding" outcome — i.e., what does Phase 6 commit to if the per-hypothesis verdicts are all "no dominant cause"? Default: Keep-as-correctness-only with a named acceptance ticket recording the perf-neutrality finding.

## 12. Tickets

Decomposed via `/spec-to-tickets` on 2026-05-17:

- [`archive/tickets/176POLWASMPERF-001.md`](../tickets/176POLWASMPERF-001.md) — Phase 0 — Baseline reproduction + feature-flagged WASM timing instrumentation (covers §5 Phase 0)
- [`archive/tickets/176POLWASMPERF-002.md`](../tickets/176POLWASMPERF-002.md) — Phase 1 — H1 FFI marshaling decomposition report (covers §5 Phase 1)
- [`archive/tickets/176POLWASMPERF-003.md`](../tickets/176POLWASMPERF-003.md) — Phase 2 — H2 TS-only hot-path attribution report (covers §5 Phase 2)
- [`archive/tickets/176POLWASMPERF-004.md`](../tickets/176POLWASMPERF-004.md) — Phase 3 — H3 cheap-vs-expensive coverage attribution report (covers §5 Phase 3)
- [`archive/tickets/176POLWASMPERF-005.md`](../tickets/176POLWASMPERF-005.md) — Phase 4 — H4 bytecode cache amortization instrumentation + report (covers §5 Phase 4)
- [`archive/tickets/176POLWASMPERF-006.md`](../tickets/176POLWASMPERF-006.md) — Phase 5 — H5 state serialization cost instrumentation + report (covers §5 Phase 5)
- [`archive/tickets/176POLWASMPERF-007.md`](../tickets/176POLWASMPERF-007.md) — Phase 6 — Synthesis, decision, and named follow-up artifact (covers §5 Phase 6)

Note: namespace `176POLWASMPERF` was chosen at decomposition time, superseding the spec's proposed `176WASMPERFYLD`.

## 13. Outcome

Completed: 2026-05-17.

Phase 6 selected **Accelerate WASM**. The decision report is `reports/176-phase-6-decision-and-rationale.md`, and the named follow-up artifact is [`specs/177-policy-wasm-batched-call-overhead-reduction.md`](../../specs/177-policy-wasm-batched-call-overhead-reduction.md). The follow-up is scoped to reducing policy-WASM per-call marshaling / serialization overhead through batched host/guest work or an equivalent transfer-reduction design; it does not claim that Spec 176 itself implemented an optimization or changed the production default.
