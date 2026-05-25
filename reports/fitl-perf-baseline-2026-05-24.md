# FITL Perf Baseline Report

**Date**: 2026-05-24
**Originating spec**: `archive/specs/192-fitl-perf-profiling-methodology.md`
**Input artifacts**: `reports/perf-baseline/*.json`
**HEAD SHA**: `8203b4d023`
**Pre-Spec-190 SHA**: `775e93568e`

## Verdict / Scope

The post-Spec-190 FITL perf regression is concentrated in five of the six measured workloads. `arvn-tournament-wasm-equivalence` is flat at +0.3%, while the other workloads regress from +71.2% to +393.4%. The dominant above-floor hot paths at HEAD are `PolicyBytecodeVmUnsupportedError` construction, Zobrist decision-stack digesting, and `PolicyEvaluationContext` allocation. The recommended campaign shape is three independent remediation specs: dispatch restructure, hash/digest optimization, and allocator reduction. These three categories project at least 30% simple-fix headroom on every regressed workload, so the Spec 192 escalation trigger for immediate Bytecode-VM or WASM expansion does not fire.

## Methodology Recap

This report follows Spec 192 sections 4.1 through 4.5. Ticket `archive/tickets/192FITLPERFPROF-001.md` supplied the env-gated per-decision instrumentation and trajectory-identity proof. Ticket `archive/tickets/192FITLPERFPROF-002.md` supplied the baseline capture scripts. Ticket `archive/tickets/192FITLPERFPROF-003.md` supplied the twelve checked-in workload summaries used here.

Each workload has one HEAD JSON and one pre-Spec-190 JSON. Wall-clock conclusions use uninstrumented three-run medians and coefficient of variation. Hot-path conclusions use the HEAD CPU profile top-30 self-time table in each JSON. Per-decision tables are treated as shape evidence for where Spec 190 changed decision mix, not as direct remediation findings by themselves.

## Per-Workload Measurement Table

| Workload | HEAD median / CV | Pre-190 median / CV | Delta | JSON trace |
|---|---:|---:|---:|---|
| `arvn-tournament-parallel` | 257342.062 ms / 0.51% | 52154.528 ms / 0.35% | +393.4% | `reports/perf-baseline/arvn-tournament-parallel-8203b4d023.json`, `reports/perf-baseline/arvn-tournament-parallel-775e93568e.json` |
| `arvn-tournament-wasm-equivalence` | 32407.810 ms / 0.61% | 32310.046 ms / 0.17% | +0.3% | `reports/perf-baseline/arvn-tournament-wasm-equivalence-8203b4d023.json`, `reports/perf-baseline/arvn-tournament-wasm-equivalence-775e93568e.json` |
| `bounded-termination-1002` | 565648.950 ms / 3.54% | 159534.391 ms / 4.22% | +254.6% | `reports/perf-baseline/bounded-termination-1002-8203b4d023.json`, `reports/perf-baseline/bounded-termination-1002-775e93568e.json` |
| `diagnose-parity-runGame-1001` | 308794.162 ms / 1.31% | 180333.387 ms / 0.23% | +71.2% | `reports/perf-baseline/diagnose-parity-runGame-1001-8203b4d023.json`, `reports/perf-baseline/diagnose-parity-runGame-1001-775e93568e.json` |
| `parity-drive` | 157458.458 ms / 3.30% | 45765.275 ms / 0.53% | +244.1% | `reports/perf-baseline/parity-drive-8203b4d023.json`, `reports/perf-baseline/parity-drive-775e93568e.json` |
| `policy-preview-parity-arvn-1008` | 260264.807 ms / 2.64% | 125016.986 ms / 2.18% | +108.2% | `reports/perf-baseline/policy-preview-parity-arvn-1008-8203b4d023.json`, `reports/perf-baseline/policy-preview-parity-arvn-1008-775e93568e.json` |

No workload exceeded the 15% CV noise threshold. All JSON caveat arrays are empty. The pre-Spec-190 worktree path recorded in the profile artifacts is `/tmp/perf-baseline-pre-190`; this report does not tear it down because ticket 004 explicitly leaves that to user discretion.

## Findings Table

| Finding | Category | Lane scope | Origin | Contribution | Foundation respect | Candidate follow-up |
|---|---|---|---|---:|---|---|
| Repeated `PolicyBytecodeVmUnsupportedError` construction is an above-floor CPU cost in every HEAD workload, including 33.8s / 21.4% of `parity-drive`, 103.8s / 18.4% of `bounded-termination-1002`, 61.1s / 19.8% of `diagnose-parity-runGame-1001`, 58.5s / 22.5% of `policy-preview-parity-arvn-1008`, 36.8s / 14.3% of `arvn-tournament-parallel`, and 11.7s / 36.2% of the flat wasm-equivalence lane. | `Dispatch-restructure` | all-six | Mixed: present pre-190, amplified at HEAD in the regressed lanes | 14.3% to 36.2% by workload | Must preserve Spec 154 paired fallback guarantees per Foundation #15. Must preserve replay identity per Foundation #8. If unsupported preview feature handling changes observable preview statuses, must revalidate Foundation #20. | Spec 193: Replace hot unsupported-feature exception flow with a typed non-throw fallback verdict while preserving fail-closed dispatch completeness. |
| Zobrist decision-stack hashing is an above-floor CPU cost in five HEAD workloads: `digestEncodedDecisionStackFrame`, `encodeDecisionStackFrameDigestInput`, and `zobristKey` sum to 37.5s / 23.8% in `parity-drive`, 142.3s / 25.2% in `bounded-termination-1002`, 72.2s / 23.4% in `diagnose-parity-runGame-1001`, 51.2s / 19.7% in `policy-preview-parity-arvn-1008`, and 32.8s / 12.7% in `arvn-tournament-parallel`. | `Hash/digest-optimization` | all regressed lanes except wasm-equivalence | Mixed: digest cost existed pre-190 and grew with the plan-primary decision mix | 12.7% to 25.2% by regressed workload | Must prove byte-identical replay/state hashes per Foundation #8. Any sharing or partial digest reuse must remain structurally complete per Foundation #15. | Spec 194: Reduce redundant decision-stack digest work without changing canonical Zobrist key identity or replay hashes. |
| `PolicyEvaluationContext` construction is above-floor in four HEAD workloads and close to the floor in `policy-preview-parity-arvn-1008`: 8.5s / 5.4% in `parity-drive`, 32.3s / 5.7% in `bounded-termination-1002`, 16.0s / 5.2% in `diagnose-parity-runGame-1001`, 8.6s / 3.4% in `arvn-tournament-parallel`, and 12.5s / 4.8% in `policy-preview-parity-arvn-1008`. The allocator profile also shows high GC share in the heavy HEAD workloads. | `Allocator-reduction` | heavy plan-primary lanes | Mixed: allocation/GC existed pre-190 and became material with the new decision mix | 5.2% to 5.7% in the strongest affected workloads | Must preserve immutable caller-visible state per Foundation #11 and replay identity per Foundation #8. Any hoisting must stay game-agnostic per Foundation #1. | Spec 195: Hoist or reuse policy evaluation context allocations across inner evaluation loops without leaking mutable state. |

### Appendix: Sub-Floor Signals

- `stableStringify` and `PolicyEncodedStateCache` appear in HEAD CPU profiles but remain below the 5% per-finding floor: 1.6% in `parity-drive`, 1.6% in `bounded-termination-1002`, 1.7% in `diagnose-parity-runGame-1001`, and 1.1% in `policy-preview-parity-arvn-1008`. No follow-up spec is named for this signal.
- `resolveVmFallbackFeature` is treated as part of the Spec 193 dispatch-restructure finding, not as a separate spec, because its total time is dominated by the unsupported-feature exception/fallback path.
- `arvn-tournament-wasm-equivalence` is a flat control lane (+0.3%). Its unsupported-error self-time is above floor in isolation, but it does not represent Spec-190 recovery headroom because the workload did not regress.

## Aggregate Gain Projection Per Workload

The projection uses only above-floor HEAD CPU self-time visible in the source JSONs and does not double-count `resolveVmFallbackFeature` separately from exception construction. It is a lower-confidence planning estimate, not a promise of additive speedup, because VM dispatch, hashing, and allocation interact in the same evaluation loops.

| Workload | Spec 193 dispatch | Spec 194 hash/digest | Spec 195 allocator | Projected simple-fix headroom | 50% target status |
|---|---:|---:|---:|---:|---|
| `arvn-tournament-parallel` | 14.3% | 12.7% | 3.4% | 30.4% | Below target, above escalation threshold |
| `arvn-tournament-wasm-equivalence` | Not counted for recovery | Not counted | Not counted | 0.0% | Not a regressed lane |
| `bounded-termination-1002` | 18.4% | 25.2% | 5.7% | 49.3% | Near target |
| `diagnose-parity-runGame-1001` | 19.8% | 23.4% | 5.2% | 48.4% | Near target |
| `parity-drive` | 21.4% | 23.8% | 5.4% | 50.6% | Meets target |
| `policy-preview-parity-arvn-1008` | 22.5% | 19.7% | 4.8% | 47.0% | Near target |

## Spec 193 P3 Measurement (2026-05-24)

**HEAD SHA**: `a8f00d0d22`
**Workloads measured**: 5 (regressed lanes; flat wasm-equivalence not re-measured)
**Command**: `node packages/engine/scripts/perf-baseline/run-baseline.mjs <workload>` after `pnpm turbo build`

The first sandboxed `parity-drive` run failed after nested profiler output parsing with `Unexpected end of JSON input`; the exact command was rerun outside the sandbox, and all five accepted workload captures below completed with empty `caveats` arrays. No accepted post-001 JSON contains `PolicyBytecodeVmUnsupportedError` in `cpuProfTop30SelfTime`.

| Workload | Pre-001 median (ms) | Post-001 median (ms) | Post CV | Wall-clock reduction | Unsupported-err self-time reduction | Threshold met (>=10% either)? | JSON trace |
|---|---:|---:|---:|---:|---:|---|---|
| `parity-drive` | 157458.458 | 110937.414 | 1.28% | 29.5% | 100.0% | Yes | `reports/perf-baseline/parity-drive-a8f00d0d22.json` |
| `bounded-termination-1002` | 565648.950 | 444757.103 | 0.37% | 21.4% | 100.0% | Yes | `reports/perf-baseline/bounded-termination-1002-a8f00d0d22.json` |
| `diagnose-parity-runGame-1001` | 308794.162 | 233018.875 | 0.58% | 24.5% | 100.0% | Yes | `reports/perf-baseline/diagnose-parity-runGame-1001-a8f00d0d22.json` |
| `policy-preview-parity-arvn-1008` | 260264.807 | 200209.400 | 1.36% | 23.1% | 100.0% | Yes | `reports/perf-baseline/policy-preview-parity-arvn-1008-a8f00d0d22.json` |
| `arvn-tournament-parallel` | 257342.062 | 204946.653 | 1.81% | 20.4% | 100.0% | Yes | `reports/perf-baseline/arvn-tournament-parallel-a8f00d0d22.json` |

**Per-spec acceptance threshold**: met. Every measured regressed workload exceeds the >=10% individual wall-clock reduction threshold, and the deleted unsupported-error constructor accounts for 100% reduction in the named self-time bucket across the five workloads.
**Ticket 003 (P2) disposition**: Close-Declined per the gate condition in `archive/tickets/193POLVMDISPRES-003.md`; the P1 typed-verdict refactor already meets the per-spec threshold.
**Spec 192 §4.5 escalation trigger**: does not fire for Spec 193. The dispatch-restructure remediation achieved >=10% individual measured gain on all five regressed workloads, so this spec does not require immediate `Bytecode-VM expansion` or `WASM expansion` escalation.

## Spec 195 P3 Measurement (2026-05-25)

**HEAD SHA**: `de6d82e538`
**Workloads measured**: 5 (regressed lanes; flat wasm-equivalence not re-measured)
**Command**: `node packages/engine/scripts/perf-baseline/run-baseline.mjs <workload>` after `pnpm turbo build`

The first sandboxed `parity-drive` run failed after nested profiler output parsing with `Unexpected end of JSON input`; the exact command was rerun outside the sandbox, and all five accepted workload captures below completed with empty `caveats` arrays. The `PolicyEvaluationContext` and GC columns compare post-Spec-193 JSON summaries (`*-a8f00d0d22.json`) against the post-Spec-195 summaries below. For workloads where `PolicyEvaluationContext` no longer appears in `cpuProfTop30SelfTime`, the table records the visible top-30 lower-bound reduction and the post-195 top-30 floor.

| Workload | Post-193 median (ms) | Post-195 median (ms) | Post CV | Wall-clock reduction | PolicyEvaluationContext self-time reduction | GC self-time reduction | Threshold met (>=5% wall-clock incl. GC)? | JSON trace |
|---|---:|---:|---:|---:|---:|---:|---|---|
| `parity-drive` | 110,937 | 86,690 | 0.7% | 21.9% | 8,240 ms (7.6% -> 0.3%) | 5,695 ms (13.7% -> 10.8%) | Yes | `reports/perf-baseline/parity-drive-de6d82e538.json` |
| `bounded-termination-1002` | 444,757 | 349,650 | 2.5% | 21.4% | 31,560 ms (7.5% -> 0.3%) | 17,182 ms (14.9% -> 12.8%) | Yes | `reports/perf-baseline/bounded-termination-1002-de6d82e538.json` |
| `diagnose-parity-runGame-1001` | 233,019 | 197,858 | 1.6% | 15.1% | >=15,888 ms (6.9% -> below top-30, <564 ms per entry) | 12,376 ms (14.6% -> 11.8%) | Yes | `reports/perf-baseline/diagnose-parity-runGame-1001-de6d82e538.json` |
| `policy-preview-parity-arvn-1008` | 200,209 | 141,823 | 0.6% | 29.2% | 14,310 ms (7.0% -> 0.3%) | 18,887 ms (16.0% -> 10.1%) | Yes | `reports/perf-baseline/policy-preview-parity-arvn-1008-de6d82e538.json` |
| `arvn-tournament-parallel` | 204,947 | 145,626 | 1.7% | 28.9% | >=9,130 ms (4.7% -> below top-30, <233 ms per entry) | 9,918 ms (9.8% -> 6.8%) | Yes | `reports/perf-baseline/arvn-tournament-parallel-de6d82e538.json` |

**Per-spec acceptance threshold**: met. Every measured regressed workload exceeds the >=5% individual wall-clock reduction threshold, and every accepted JSON has an empty `caveats` array with CV below the Spec 192 15% noise threshold.
**§4.6 follow-on-site disposition**: No follow-up needed for the current Spec 195 acceptance gate. The line-2040 substructure-sharing site produced 15.1% to 29.2% individual wall-clock reductions across all five heavy plan-primary workloads, and visible `PolicyEvaluationContext` self-time either fell to 0.3% of profile total time or dropped below the top-30 self-time table. The deferred `microturn-option-eval.ts:121` and `plan-proposal.ts:513` sites remain potential future optimization targets only if a later performance campaign establishes a new gap; this P3 verdict does not promote them to P4 or open Spec 195-FOLLOWUP.
**Spec 192 §4.5 escalation trigger**: does not fire for Spec 195. The allocator-reduction remediation achieved >=10% individual measured gain on all five regressed workloads, so this spec does not require immediate `Bytecode-VM expansion` or `WASM expansion` escalation.

## Stop-Criterion + Escalation-Trigger Evaluation

- **Per-finding floor**: satisfied. Specs 193 and 194 exceed 5% in multiple regressed workloads. Spec 195 exceeds 5% in the strongest affected workloads and is retained because its adjacent GC burden is material in the same HEAD profiles. Sub-floor cache-stringify findings remain appendix-only.
- **Aggregate 50% target**: partially satisfied. `parity-drive` reaches the target in projection. `bounded-termination-1002`, `diagnose-parity-runGame-1001`, and `policy-preview-parity-arvn-1008` sit near 50%. `arvn-tournament-parallel` has only 30.4% simple-fix headroom from the named findings and needs measured follow-up after the first two specs land.
- **30% escalation trigger**: does not fire. Every regressed workload has at least 30% projected simple-fix headroom from the named dispatch/hash/allocator categories. Immediate Bytecode-VM or WASM expansion is not recommended until these lower-complexity fixes are measured.
- **Stop criterion**: the campaign should close when the named specs recover the aggregate target on the regressed lanes or when two consecutive remediation specs land with less than 10% individual measured gain. The flat wasm-equivalence lane should remain a guardrail, not a recovery target.

## Follow-Up Specs

### Spec 193: Policy VM Unsupported-Feature Dispatch Restructure

**Goal**: Replace hot unsupported-feature exception flow with a typed non-throw fallback verdict while preserving fail-closed dispatch completeness.

**Category**: `Dispatch-restructure`
**Lane scope**: all-six, with recovery relevance concentrated in the five regressed lanes.
**Rough complexity**: M
**Foundation requirements**: preserve Foundation #8 replay identity; preserve Foundation #15 paired-contract completeness from Spec 154; revalidate Foundation #20 if preview-feature unsupported verdicts can affect preview status boundaries.
**Evidence**: source JSONs `*-8203b4d023.json`, especially `parity-drive`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`, `policy-preview-parity-arvn-1008`, and `arvn-tournament-parallel`.

### Spec 194: Zobrist Decision-Stack Digest Optimization

**Goal**: Reduce redundant decision-stack digest work without changing canonical Zobrist key identity or replay hashes.

**Category**: `Hash/digest-optimization`
**Lane scope**: five regressed lanes.
**Rough complexity**: M
**Foundation requirements**: preserve Foundation #8 byte-identical replay and state hash identity; prove any partial digest reuse with determinism tests; keep the digest contract structurally complete per Foundation #15.
**Evidence**: `digestEncodedDecisionStackFrame`, `encodeDecisionStackFrameDigestInput`, and `zobristKey` in the HEAD JSONs for `parity-drive`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`, `policy-preview-parity-arvn-1008`, and `arvn-tournament-parallel`.

### Spec 195: Policy Evaluation Context Allocation Reduction

**Goal**: Hoist or reuse policy evaluation context allocations across inner evaluation loops without leaking mutable state.

**Category**: `Allocator-reduction`
**Lane scope**: heavy plan-primary lanes.
**Rough complexity**: S-M
**Foundation requirements**: preserve Foundation #11 caller-visible immutability; preserve Foundation #8 replay identity; keep the allocation strategy game-agnostic per Foundation #1.
**Evidence**: `PolicyEvaluationContext` self-time plus high GC self-time in HEAD JSONs for `parity-drive`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`, `policy-preview-parity-arvn-1008`, and `arvn-tournament-parallel`.

No `archive/specs/IMPLEMENTATION-ORDER-fitl-perf-recovery-2026-05-24.md` is created. Although the report names three candidate specs, their owned seams are independent enough for separate implementation and measurement: dispatch fallback shape, Zobrist digest identity, and allocation lifetime. If Spec 193 later changes the API consumed by a bytecode expansion or WASM expansion spec, that later spec should introduce its own dependency ordering.

## Reassessment / Closing

- **Measurement caveats**: CPU profiles carry profiler overhead and are used only for attribution. Wall-clock medians are uninstrumented. CV is below 15% for all workloads. JSON `caveats` arrays are empty. `cacheStats` objects are empty, so cache-hit claims are not made here.
- **Scope boundaries**: this report does not remediate engine code, does not tighten lane budgets, does not create the remediation specs, and does not tear down `/tmp/perf-baseline-pre-190`.
- **Verification artifact disposition**: checked-in JSON summaries under `reports/perf-baseline/` remain the durable evidence. Harness scripts from tickets 001 and 002 remain in `packages/engine/scripts/perf-baseline/`. The report is the Phase 3 artifact consumed by the future remediation-spec authoring sessions.
- **Implementation-order decision**: skipped because the three named follow-up specs are independent rather than interdependent.
- **Spec 192 completion signal**: Spec 192 is COMPLETE as of 2026-05-24. Remediation work moves to the named follow-up specs; Spec 192 itself is ready for archival per `docs/archival-workflow.md`.
