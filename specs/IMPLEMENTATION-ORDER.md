# Implementation Order — FITL Plan-Primary Perf Recovery

**Status**: PROPOSED
**Date**: 2026-05-24
**Source report**: `reports/fitl-perf-baseline-2026-05-24.md`

This series remediates the post-Spec-190 FITL plan-primary perf regression that Spec 192's evidence-led baseline named. The three remediation specs address three independent architectural seams: bytecode-VM dispatch shape (Spec 193), Zobrist digest identity (Spec 194), and policy-evaluation allocation lifetime (Spec 195). They are **independent — no required ordering** — and can land in any order or in parallel.

## Prerequisites (already landed)

- **Spec 154** — Policy Bytecode Emitter / Evaluator Dispatch Completeness (COMPLETED): paired-contract architecture that Spec 193 must preserve.
- **Spec 80** — Incremental Zobrist Hashing (COMPLETED): incremental-hash contract that Spec 194 optimizes within without breaking.
- **Spec 189** — `PolicyEvaluationContext` Cache-Eligibility Is Structural (COMPLETED): structural `cacheBinding` contract that Spec 195 must preserve.
- **Spec 192** — FITL Perf Profiling Methodology (COMPLETED 2026-05-24): produced the evidence-led baseline at `reports/fitl-perf-baseline-2026-05-24.md` that names the three remediation specs below.

## Order

The three remediation specs are **independent and can be implemented in any order or in parallel**. The owned seams do not interact at the architectural level:

- Dispatch shape (Spec 193) — `packages/engine/src/agents/policy-vm/` + `policy-evaluation-core.ts` VM-callback surface.
- Digest identity (Spec 194) — `packages/engine/src/kernel/zobrist.ts` + decision-stack digest pipeline.
- Allocation lifetime (Spec 195) — `packages/engine/src/agents/policy-evaluation-core.ts` `PolicyEvaluationContext` constructor + inner-selector reuse path.

Each spec carries its own replay-identity proof obligation against the existing Spec 192 trajectory-identity harness and the determinism corpus.

1. **Spec 193 — Policy VM Unsupported-Feature Dispatch Restructure** (`archive/specs/193-policy-vm-unsupported-feature-dispatch-restructure.md`).
   Replace exception-based VM fallback with a typed non-throw verdict. Eliminates `Error` constructor stack-capture cost (14.3–36.2% per workload). Preserves Spec 154's paired-contract guarantee.

2. **Spec 194 — Zobrist Decision-Stack Digest Optimization** (`archive/specs/194-zobrist-decision-stack-digest-optimization.md`).
   Cache decision-stack frame encoding by frame identity; memoize per-frame digests; bind `zobristKey` dynamic-feature cache to `cacheBinding` lifetime. Eliminates redundant `JSON.stringify` and FNV-1a passes (12.7–25.2% per regressed workload). Preserves byte-identical canonical Zobrist keys.

3. **Spec 195 — Policy Evaluation Context Allocation Reduction** (`archive/specs/195-policy-evaluation-context-allocation-reduction.md`).
   Share heavy immutable substructure across nested selector evaluations. Eliminates per-inner-selector full constructor cost (3.4–5.7% per workload + adjacent GC). Preserves Spec 189's structural `cacheBinding` contract.

**Dependency direction:** none — the three specs are mutually independent. Per-spec perf witnesses are recoverable in any sequence; the Spec 192 baseline harness re-runs cleanly per spec independently.

## Why no required ordering

The Spec 192 baseline report explicitly evaluated whether these specs should be sequenced (`reports/fitl-perf-baseline-2026-05-24.md` final paragraph of §Follow-Up Specs):

> Although the report names three candidate specs, their owned seams are independent enough for separate implementation and measurement: dispatch fallback shape, Zobrist digest identity, and allocation lifetime. If Spec 193 later changes the API consumed by a bytecode expansion or WASM expansion spec, that later spec should introduce its own dependency ordering.

This index records that verdict so a future implementer does not need to re-derive it. Specs can be picked up by independent sessions, decomposed via `/spec-to-tickets` in parallel, and implemented without cross-spec coordination beyond shared CI (which the Spec 192 baseline harness already validates as deterministic).

## Aggregate gain projection (from `reports/fitl-perf-baseline-2026-05-24.md` §Aggregate Gain Projection)

| Workload | Spec 193 | Spec 194 | Spec 195 | Projected combined headroom | 50% target |
|---|---:|---:|---:|---:|---|
| `parity-drive` | 21.4% | 23.8% | 5.4% | 50.6% | Meets |
| `bounded-termination-1002` | 18.4% | 25.2% | 5.7% | 49.3% | Near |
| `diagnose-parity-runGame-1001` | 19.8% | 23.4% | 5.2% | 48.4% | Near |
| `policy-preview-parity-arvn-1008` | 22.5% | 19.7% | 4.8% | 47.0% | Near |
| `arvn-tournament-parallel` | 14.3% | 12.7% | 3.4% | 30.4% | Below — needs follow-up after these three land |
| `arvn-tournament-wasm-equivalence` | n/a | n/a | n/a | 0.0% | Flat control lane (not a recovery target) |

Per-spec individual gain targets are recorded in each spec's P3 acceptance row.

## Deferred (named follow-ups, not in this series)

- **`arvn-tournament-parallel` follow-up remediation** — projected simple-fix headroom is 30.4%, above the Spec 192 §4.5 escalation trigger but below the 50% aggregate target. After Specs 193 + 194 + 195 land and measured gains are recorded, evaluate whether a fourth remediation spec is warranted (likely a `Spec-190-tune` or `WASM expansion` category per Spec 192 §4.4) based on the residual hot-path attribution at HEAD.
- **Lane budget reversion** — the lane budgets widened during PR #280 recovery (fitl-parity-drive 700s ceiling, arvn-tournament 600s per-test, spec-140-bounded-termination 240s per-test, DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS 20min, policy-preview-parity 30min, run-tests file budget 20min) MAY be tightened back toward pre-Spec-190 values as remediation specs land and reclaim measurable wall-clock. Reversion is a per-spec acceptance criterion (P3 captures the measurement; budget tightening lands in the same PR when justified by the measurement), not a separate spec.
- **`Bytecode-VM expansion` / `WASM expansion`** — only proposed if Spec 192 §4.5's escalation trigger fires post-remediation. After Specs 193 + 194 + 195 land, if residual cost on the regressed lanes still exceeds the aggregate gain target, the next round is a separate brainstorm with a fresh trigger.
- **Sub-floor signals** — `stableStringify` and `PolicyEncodedStateCache` (1.1–1.7% per workload) remain in the Spec 192 report's appendix; not actionable until they cross the 5% per-finding floor.

## Stop criterion

Per `reports/fitl-perf-baseline-2026-05-24.md` §Stop-Criterion: the campaign closes when the named specs recover the aggregate target on the regressed lanes OR when two consecutive remediation specs land with less than 10% individual measured gain. The flat `arvn-tournament-wasm-equivalence` lane remains a guardrail, not a recovery target.
