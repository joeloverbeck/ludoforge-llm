# Spec 173 — Deep-Preview-Drive Per-Decision Cost Reduction

**Status**: PROPOSED
**Priority**: High — the post-spec-172 `fitl-arvn-agent-evolution` 15-seed harness completes in ~5:17 wall-clock, but per-seed wall-time spread across the tier is ~6.5× per decision (seed `1000`: ~66 ms/decision vs seed `1005`: ~444 ms/decision). The outliers (`1005`: 185.6 s; `1011`: 83.7 s; `1008`: 69.4 s) dominate the tournament-loop budget at `concurrency=8` and throttle every campaign experiment that reuses this harness. Halving the outlier seeds roughly halves the steady-state experimental-loop latency.
**Complexity**: M — Phase 0 perf witness is XS, Phase 1 is an open-ended witness-driven hot-path closure pass authored as ticket slices, Phase N escalation gate is an XL follow-up spec only if triggered. No new types, no schema changes, no kernel-surface changes, no agent-profile changes.
**Date**: 2026-05-15
**Predecessors**:
- `archive/specs/167-arvn-evolution-harness-performance.md` — WASM bootstrap, worker-pool concurrency, GameDef disk cache, incremental build (May 12-13). Reduced ~15 min → ~5:17.
- `archive/specs/172-policy-eval-static-structure-caching.md` — Runtime-owned caches for `encodedStateLayout`, `featureTable`, compiled bytecode, and `encodedState` (May 14-15). Unblocked the cube-heavy ARVN deep-preview regime that previously timed out at >15 min on a single seed.
- `archive/specs/150-fitl-policy-vm-wasm-port.md` — Same-seam Rust/WASM policy VM (terminal at `<=1800 ms` after 34 tickets; original `<=250 ms` retired as infeasible without changing per-candidate work).
- `archive/specs/168-engine-per-decision-hot-path-optimizations.md` — Per-decision kernel hot-path optimizations follow-up; closed.
**Trigger report**: `reports/fitl-arvn-15-seed-harness-wall-times-2026-05-15.md` — measurement only, no profiling. Establishes the post-spec-172 baseline, the per-seed wall-time table, and the outlier ranking. Explicitly defers root-cause analysis to this spec.
**Reassessment basis**: Authored from session-internal investigation against the trigger report; not derived from an external proposal. No per-recommendation disposition table is required (see §11).

---

## 1. Goal

Drop the wall-time of `campaigns/fitl-arvn-agent-evolution/harness.sh` at the 15-seed tier from ~5:17 to ≤4 min by closing the per-decision cost spread on the deep-preview hot path, without altering tournament aggregate parity, the kernel surface, the `arvn-evolved` profile, the `compositeScore` formula, or the regression-gate scope.

After this spec lands:

- A reusable per-seed × per-microturn-class perf witness exists under `packages/engine/scripts/` (extending the existing `profile-fitl-preview-drive*.mjs` family) so future campaigns can reproduce the decomposition without ad hoc `/tmp` scripts.
- The pre-fix witness against seeds `1005`, `1011`, `1008` (slow) and `1000`, `1010` (fast control) is reproducible, and the dominant per-decision-class hot-path axes are named explicitly in the witness output and in this spec's ticket decomposition.
- The Phase 1 ticket sweep closes those axes one at a time, each ticket independently determinism-gated against `policy-bytecode-equivalence*`, replay-identity, Zobrist-parity, and forked-vs-fresh-runtime parity.
- The 15-seed harness's *slowest seed* drops from 185.6 s to ≤60 s and the full harness wall-time drops to ≤4 min on the development box (per the trigger report's `/usr/bin/time -v` measurement methodology).
- A Phase-N escalation gate names the precise condition under which a separate WASM preview-drive coverage extension spec spawns: if Phase 1's exhausted axis closure leaves the slowest seed above 60 s, escalate.

The Phase 1 wall-time target is a *budget*, not a goal; the witness is the load-bearing decision tool. If Phase 0 reveals that the spread is dominated by an axis no Phase 1 cache or constant-factor pass can close (e.g., the deep-preview drive itself is the irreducible work), the escalation gate fires immediately.

## 2. Context (verified against codebase)

### 2.1 The 15-seed harness baseline is post-spec-172 and post-spec-167

The trigger report's measurement was taken on `dd79c500f` + the merged spec-172 PR (`b1f95ca8f`). Confirmed harness output:

```text
compositeScore=-3.1333  avgMargin=-5.8  winRate=0.2667  wins=4
completed=15  truncated=0  errors=0  concurrency=8
WASM policy runtime: enabled
GameDef cache: hit
```

So the relevant optimizations from spec 167 (WASM bootstrap, GameDef cache, worker pool) and spec 172 (four runtime-owned static/state caches) are *all active* in the baseline. The remaining cost is not a regression of either spec — it is the irreducible work of the post-spec-172 deep-preview path plus whatever new dominant axes the witness will expose.

### 2.2 The per-decision spread cannot be explained by decision count

Per-decision cost (wall-time / decisions) computed from the trigger report's §4.2 table:

| Seed | Wall | Decisions | ms/decision | Class |
|---:|---:|---:|---:|---|
| 1000 | 10.4 s | 157 | 66 | fast |
| 1010 | 30.1 s | 325 | 93 | fast-mid |
| 1014 | 26.4 s | 214 | 123 | mid |
| 1006 | 16.8 s | 230 | 73 | fast |
| 1007 | 14.4 s | 219 | 66 | fast |
| 1004 | 56.4 s | 340 | 166 | mid-slow |
| 1003 | 44.8 s | 226 | 198 | mid-slow |
| 1009 | 61.2 s | 306 | 200 | mid-slow |
| 1011 | 83.7 s | 213 | **393** | slow |
| 1008 | 69.4 s | 166 | **418** | slow |
| 1005 | 185.6 s | 418 | **444** | outlier |

The fast-tier average (~80 ms/decision) and the slow-tier average (~410 ms/decision) differ by ~5×. Seed `1010` is the most direct counter-example to "decisions cause cost": 325 decisions at 93 ms vs `1008`'s 166 decisions at 418 ms. So the dominant axis is *decision class composition*, not raw count. Phase 0 must measure this directly (§4.1).

### 2.3 The deep `continuedDeepening`/`deep1024` preview drive runs entirely in TS

`packages/engine/src/agents/policy-wasm-score-routing.ts` fails closed (returns `unsupported`) for complex preview configs. The `arvn-evolved` profile uses the deep config (`depthCap: 16`, `maxOptions: 8`, `chooseNBeamWidth`, `capClass: deep1024` per the spec 172 trigger report's CPU profile, which recorded WASM self-time at 0.9% during deep preview).

This is the single largest *structural* perf opportunity remaining after spec 172, and the spec 150 series explicitly carved out preview-drive coverage as a "much larger separate effort" (spec 150 §9, spec 172 §2.7, spec 172 §9). The Phase-N escalation gate exists to consume that opportunity *if and only if* Phase 1's TS-side axis closure cannot meet the soft target — i.e., the F15 (Architectural Completeness) clean path: name the gap, leave the door open, do not commit XL scope on partial evidence.

### 2.4 Existing perf-witness infrastructure already exists

- `packages/engine/scripts/profile-fitl-preview-drive.mjs` — the existing same-seam preview-drive profiler used through spec 150.
- `packages/engine/scripts/profile-fitl-preview-drive-metrics.mjs` — sibling metrics helper.
- `campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs` — the campaign-local Train-choice perf driver used as the spec 172 witness driver.
- `reports/turnperf-002-spec-167-baseline.md` — the per-card cost decomposition format that Phase 0 emits in extended form.

The witness is an *extension*, not a new artifact. The trigger report's `/tmp/fitl-seed-timer.mjs` proves the wrapper shape is trivial; the value Phase 0 adds is per-microturn-class telemetry, not per-seed wall-time alone.

### 2.5 The post-spec-172 hot path is unmeasured

The May 14 trigger report cited by spec 172 captured the *pre*-fix profile: 87.7% TS-engine self-time, ~30% in `build*` functions (now cached), `buildEncodedState` as the #1 entry (now memoized via `WeakMap<GameState, EncodedState>`). The post-fix CPU profile has not been captured. This spec's Phase 0 captures it and, critically, decomposes it by microturn class so the spread documented in §2.2 has a structural explanation, not a wall-time intuition.

Plausible new dominant axes (hypotheses to validate, not commitments):

- `forEachCompiledPolicyExpr` traversal cost amortized across the new feature-table cache only on `WeakMap` hit; cold-path scoring may still scan.
- `resolveRef` residual paths not covered by the per-context `resolveRefCache` (versioned per-context cache from `150FITLWASM-029`).
- Decision-stack frame digest computation (`stableFingerprintHex` / FNV1a64) in deep-preview drive nodes — addressed in `150FITLWASM-027` for same-seam, may not extend to preview-drive depth.
- Token-state-index COW sharing (`150FITLWASM-018`) coverage in preview-drive paths.
- `tryBuildEncodedState` first-touch on novel `GameState` objects produced by the preview drive's simulated apply (the `WeakMap` is per-`GameState`-identity, and the preview drive synthesizes new states).

Phase 0 names the actual hot axes; Phase 1 closes them.

## 3. Non-goals

- **No preview-config retuning.** `depthCap`, `maxOptions`, `chooseNBeamWidth`, `capClass` for `arvn-evolved` are unchanged. Tactical option T from the brainstorm (campaign-side beam tuning) is explicitly out of scope and lives in a separate experiment spec with a restoration ticket if pursued.
- **No agent-profile mutation.** The `arvn-evolved` Markdown / YAML is not edited.
- **No regression-gate scoping.** `harness.sh:25-39` continues to run the full engine test suite per spec 167 §8.
- **No `compositeScore` change.** Determinism is preserved; aggregate parity is the load-bearing acceptance.
- **No WASM preview-drive ABI extension committed up front.** Phase-N escalation gate only.
- **No new caches without a witness-grounded justification.** Every Phase 1 cache or constant-factor change must be traceable to a Phase 0 witness axis. No speculative additions.
- **No kernel-surface changes.** `applyMove`, `legalMoves`, the publication contract, and the microturn protocol are unchanged.

## 4. Architecture

### 4.1 Phase 0 — Per-seed × per-microturn-class perf witness

Extend `packages/engine/scripts/profile-fitl-preview-drive.mjs` (or add a sibling `profile-fitl-arvn-15-seed-decomposition.mjs`) with:

- **Driver**: runs the same seeds the trigger report ran (`1000..1014`), at the same `arvn-evolved` profile, with the same `players=4`, `evolvedSeat=arvn`, `seatProfiles={us-baseline, arvn-evolved, nva-baseline, vc-baseline}`, `maxTurns=200`, `traceMode=none`. Reuses the campaign's compiled GameDef and runtime-cache infrastructure (the trigger report proved this is sound).
- **Telemetry**: per decision, capture `(seed, microturnClass, decisionIndex, elapsedNs, previewBranch?, candidateCount, encodedStateBuildCount, bytecodeCacheHit/Miss, resolveRefCacheHit/Miss, ...)`. Microturn class is the kernel-published `actionId` family (e.g., `train-operation`, `place-marker`, `event-decision`, `pass`); add the published-decision class label from the existing trace event stream.
- **Output**: a JSON rollup file under `reports/` (no new schema; mirror the format used by `reports/turnperf-002-spec-167-baseline.md`) with the per-seed-class hot-axis table and a top-N self-time entry list. Also emit a flat CSV under the same name for spreadsheet inspection.
- **Acceptance**: pre-fix, the witness runs to completion against all 15 seeds within a per-run timeout that is >2× the slowest current seed (i.e., >400 s for seed `1005`); the rollup output names at least one dominant per-decision-class axis where the slow-tier per-decision time is >3× the fast-tier per-decision time.

The witness is an executable script under `packages/engine/scripts/`, not a `.test.ts` file. Wall-time is non-deterministic and does not belong in a determinism gate (per spec 167 §6 precedent). The witness's *threshold* (the soft target) is recorded inside the script and in this spec, not asserted in CI.

The witness is the load-bearing artifact for Phase 1's scope decisions. It MUST be authored, executed, and its output committed to `reports/` before any Phase 1 ticket lands. This is the TDD/Foundation-#16 ordering that spec 172 successfully used.

### 4.2 Phase 1 — Witness-driven hot-path closure

Phase 1 is an open-ended sweep of per-axis ticket slices, each one drawing its scope from the Phase 0 witness output. This spec does **not** prescribe the specific fixes — they emerge from the witness — but it does prescribe the *shape* every Phase 1 ticket MUST take:

- **One axis per ticket.** A "axis" is a single named hot self-time entry, a single decision class with a measurable per-decision cost gap vs the fast tier, or a single cache miss class with measurable hit-rate evidence. Cross-axis bundling is rejected at ticket review.
- **Cite the witness.** Every Phase 1 ticket cites the specific Phase 0 witness output line(s) (axis name, pre-fix per-decision ms, expected post-fix per-decision ms) that justify the change.
- **Determinism gate before merge.** `policy-bytecode-equivalence*`, `spec-140-replay-identity`, `forked-vs-fresh-runtime-parity`, and `zobrist-incremental-parity-fitl-seed-{42,123}` MUST pass byte-identical before and after the change.
- **Re-run the witness after merge.** The post-merge witness output is appended to the same `reports/` rollup so the cumulative effect is visible. If the witness shows no measurable improvement or a per-decision regression on any class, the ticket reverts.
- **Cache pattern follows spec 172.** New `sharedStructural` caches go on `GameDefRuntime`, mirroring `compiledQueryPlanCache`. New `runLocal` caches go on `GameDefRuntime` and reset in `forkGameDefRuntimeForRun`, mirroring `tokenStateIndexCache`. Module-level `WeakMap<GameDef, …>` is acceptable only for pure-static internals invisible to replay (the §4.1/§4.2 carve-out from spec 172).
- **Architectural-invariant test per cache.** Every new cache earns a `feature-table-cache.test.ts`-style test asserting the cache is byte-identical-to-fresh and the constructor invariant from spec 172 §4.5 is not violated.

Phase 1 is **complete** when one of:

- (a) The slowest seed in the harness drops to ≤60 s and the full 15-seed harness drops to ≤4 min wall-clock on the development box (per `/usr/bin/time -v`).
- (b) The witness shows no remaining axis with a slow-tier vs fast-tier per-decision cost gap >2× *and* the wall-time has not yet reached the §1 target — Phase-N escalation gate fires (§4.3).
- (c) Three consecutive Phase 1 tickets show no measurable improvement on the witness — Phase-N escalation gate fires.

### 4.3 Phase N — WASM preview-drive coverage extension escalation gate

This phase **does not land code in this spec**. It is an explicit decision gate that fires under §4.2's (b) or (c) exit conditions and triggers the authoring of a separate XL follow-up spec — working title "Spec 174 — WASM Preview-Drive Coverage Extension" — that owns:

- Extending the WASM ABI in `packages/engine-wasm/policy-vm/` (or successor) to handle the `continuedDeepening` / `deep1024` preview-drive shape currently fail-closed in `policy-wasm-score-routing.ts`.
- Proving TS↔WASM equivalence of preview-drive output (per spec 150's bytecode equivalence pattern) before any default flip.
- The same incremental tournament-loop wall-clock budget gating as spec 167 Phase 2.

The escalation gate's purpose is to make the F15 (Architectural Completeness) decision *forcible*: this spec does not paper over the deep-preview-drive TS-only structural gap, but it also does not commit XL scope on partial evidence. The gate reifies the decision so it cannot silently drift.

Spec 173 closes when either Phase 1 hits §4.2(a) or Phase N triggers and the follow-up spec is authored.

### 4.4 Implementation sequencing principle

Phase 0 lands first and its output is reviewable as a `reports/` artifact before Phase 1 begins. Phase 1 tickets land sequentially, not in parallel — the post-merge witness output of ticket K informs ticket K+1's scope. This avoids the spec 150 anti-pattern where 34 tickets piled into the same axis without re-measuring the dominant cost between attempts.

## 5. Phases & acceptance criteria

| Phase | Scope | Acceptance | Effort |
|---|---|---|---|
| **0** | Per-seed × per-microturn-class perf witness extending `profile-fitl-preview-drive*.mjs`. Output to `reports/fitl-arvn-15-seed-decomposition-2026-05-XX.md` + CSV. | The witness runs against all 15 seeds within a per-run timeout >400 s; the rollup names ≥1 hot axis where slow-tier per-decision time is >3× fast-tier per-decision time. Existing determinism gates stay green. | XS |
| **1** | Witness-driven hot-path closure pass. Ticket slices authored per §4.2. Phase 1 is *complete* when §4.2(a), (b), or (c) is satisfied. | Determinism gates byte-identical for every ticket. Slowest seed ≤60 s and full harness ≤4 min on dev box (§4.2(a)). Or: §4.2(b) / (c) escalation triggers. Per-ticket: post-merge witness re-run shows measurable improvement on the cited axis. | M (open-ended; bounded by §4.2 exit conditions) |
| **N** | Escalation gate decision: author Spec 174 (WASM preview-drive coverage extension) if §4.2(b) or (c) fires. No code lands in Spec 173 from this phase. | Spec 174 authored and PROPOSED, with the §4.2 trigger evidence cited as its trigger report. Spec 173 closes. | XL (in the follow-up spec, not here) |

The headline acceptance for Spec 173 as a whole: the slowest seed in the 15-seed harness drops from 185.6 s to ≤60 s, and the full `harness.sh` wall-clock drops to ≤4 min, *with* aggregate `compositeScore` and per-seed `errors=0` parity preserved against the baseline `dd79c500f` measurement. Or: the escalation gate fires and Spec 174 is authored.

## 6. Test plan

### 6.1 Determinism gates (load-bearing — these must stay byte-identical for every Phase 1 ticket)

- `packages/engine/test/determinism/spec-140-replay-identity.test.ts`
- `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts` — load-bearing for any new `runLocal` `GameDefRuntime` field.
- `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.ts` and `-seed-123.test.ts`.
- `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts` — load-bearing for any change touching score-row or preview-drive WASM/TS routing.
- `pnpm -F @ludoforge/engine test:integration:fitl-rules` — no behavioural drift on the FITL rules surface.

### 6.2 New correctness tests (per Phase 1 ticket)

Every Phase 1 ticket that introduces a new cache earns:

- A cache-equivalence architectural-invariant test mirroring `feature-table-cache.test.ts` (the cache hit returns a value deep-equal to a freshly-built value).
- An extension to the spec-172 §4.5 constructor-no-direct-build invariant if the cache covers a constructor-resolved structure.

Every Phase 1 ticket that introduces a constant-factor reduction *without* a new cache earns at minimum a regression-guard test that the optimized path is reached on the witness's slow-tier seeds (e.g., a counter assertion).

### 6.3 Perf witness (Phase 0, lifecycle)

- Authored in Phase 0 with the pre-fix output committed to `reports/`.
- Re-run after every Phase 1 ticket merge, with the cumulative output appended to the same `reports/` rollup.
- Final post-Phase-1 output committed when the spec closes — establishes the new baseline for any future spec 174.

The witness is not a `.test.ts` file. It is an executable script. Wall-time thresholds are recorded in the script body and in `reports/`, not asserted in CI.

## 7. Foundation alignment

| Foundation | How this spec respects it |
|---|---|
| #1 Engine Agnosticism | All Phase 1 changes target generic engine paths (preview drive, score routing, encoded state, decision-stack digest). No FITL-specific branches. The witness consumes generic per-decision telemetry. |
| #8 Determinism Is Sacred | Pure-perf scope. Every Phase 1 ticket gates on `policy-bytecode-equivalence*`, replay-identity, Zobrist-parity, and forked-vs-fresh-runtime parity (§6.1). Aggregate `compositeScore` parity is the headline acceptance. |
| #10 Bounded Computation | Preview-drive bounds (`depthCap`, `maxOptions`, `chooseNBeamWidth`, `capClass`) are unchanged. This spec removes per-node and per-decision constant factors; it does not retune the bounded tree. |
| #11 Immutability | New `runLocal` caches keyed on `GameState` object identity continue to rely on Foundation #11's "previous state never modified" guarantee, exactly as spec 172 §4.4 does. No caller-visible state is mutated. |
| #14 No Backwards Compatibility | Phase 1 tickets replace existing paths; they do not alias them. The Phase-N escalation gate's eventual Spec 174 follow-up is authored as the F14-clean owner of the WASM preview-drive default flip; no parallel-path retention. |
| #15 Architectural Completeness | The Phase-N escalation gate is the F15-clean lever for the deep-preview-drive TS-only structural gap. It names the deferred work, reifies the trigger condition, and forecloses silent drift. Phase 1's witness-driven shape forecloses scope inflation: every ticket cites a measured axis. |
| #16 Testing as Proof | Phase 0 witness lands first (TDD ordering) and the failing pre-fix output is the proof that the seam exists. Per-cache architectural-invariant tests (§6.2) prove cache equivalence rather than assuming it. The witness re-run after every ticket proves the per-axis improvement. |

Spec 173 does not amend any Foundation. The Phase-N escalation gate, if it fires, is also expected to author Spec 174 without amending Foundations — extending the existing WASM preview-drive ABI is generic engine work, not a Foundation-level change.

## 8. Code anchors for implementers

- **Trigger evidence**: `reports/fitl-arvn-15-seed-harness-wall-times-2026-05-15.md` (per-seed wall-time table, outlier ranking, and the §4.2 per-decision spread evidence).
- **Existing perf witnesses (extension points)**: `packages/engine/scripts/profile-fitl-preview-drive.mjs`, `packages/engine/scripts/profile-fitl-preview-drive-metrics.mjs`, `campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs`.
- **Routing decision (Phase-N escalation gate target)**: `packages/engine/src/agents/policy-wasm-score-routing.ts` (fail-closed bailouts for complex preview configs) and `packages/engine/src/agents/policy-wasm-production-preview-drive.js` (the existing partial preview-drive WASM coverage).
- **Cache owner (spec 172 precedent)**: `packages/engine/src/kernel/gamedef-runtime.ts` — `GameDefRuntime` interface, `createGameDefRuntime`, `forkGameDefRuntimeForRun`. `compiledQueryPlanCache` is the `sharedStructural` precedent; `tokenStateIndexCache` and the new `policyEncodedStateCache` are the `runLocal` precedents.
- **Hot-path candidates (hypotheses to be validated by Phase 0, not commitments)**: `policy-preview.ts` `driveSyntheticCompletion`; `policy-evaluation-core.ts` `evaluateCompiledExprWithVm`; `microturn-option-eval.ts:113` (the construction site); `cnl/policy-bytecode/feature-table.ts` `forEachCompiledPolicyExpr`; `kernel/encoded-state/view.ts` `buildEncodedState`; the `resolveRef` and `resolveRefCache` paths.
- **Determinism precedents**: `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts`, `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts`, the Zobrist parity suite, `feature-table-cache.test.ts` (cache-equivalence invariant pattern).

## 9. Out of scope

- **WASM preview-drive coverage extension.** Phase-N escalation gate only; if triggered, becomes Spec 174.
- **Campaign-side `arvn-evolved` beam / depth tuning.** A separate experiment with a restoration ticket per Foundation #15 if pursued. Lives under `data/games/fitl/agents/`, not engine code.
- **Test-gate scoping.** The full engine regression gate at `harness.sh:25-39` stays per spec 167 §8.
- **Generalizing the witness or any Phase 1 cache to other campaigns.** Campaign-local first; extract on second consumer per spec 167 §8 precedent.
- **Changes to `compositeScore`, accept/reject logic, progressive seed protocol, or evolved-agent semantics.**
- **New ref families, new schema fields, new types beyond the additive `GameDefRuntime` cache fields Phase 1 may add.**

## 10. Tickets

Decomposed via `/spec-to-tickets` on 2026-05-15:

- [`archive/tickets/173DEEPPRVCOST-001.md`](../archive/tickets/173DEEPPRVCOST-001.md) — Phase 0 — Per-seed × per-microturn-class perf witness (covers §4.1, §5 Phase 0, §6.3; completed 2026-05-15)
- [`tickets/173DEEPPRVCOST-002.md`](../tickets/173DEEPPRVCOST-002.md) — Phase 1 — Train continuedDeepening encoded-build axis closure (covers §4.2; targets the dominant Phase 0 hot axes `train:chooseNStep:add | continuedDeepening` and `train:chooseNStep:confirm | continuedDeepening`, ~74% of slow-tier top-10 total time; blocked after post-002 witness because encoded builds dropped to `0` but elapsed train gates remain red)
- [`tickets/173DEEPPRVCOST-003.md`](../tickets/173DEEPPRVCOST-003.md) — Phase 1 — Train continuedDeepening token-state-index residual closure (covers the post-002 residual where train encoded builds are `0` but token index builds remain `33,203` for `train:chooseNStep:add` and `6,242` for `train:chooseNStep:confirm`)

Phase 1 tickets land sequentially per §4.4 (the post-merge witness output of ticket K informs ticket K+1's scope). The post-002 rollup showed a material train improvement but left the train elapsed-time gates red after encoded builds were eliminated, so ticket 003 owns the next non-overlapping train residual before the series selects secondary coup/govern/event axes. Likely later candidates if 003 does not fully close the §1 soft target: secondary slow-tier classes (`coupArvnRedeployPolice:chooseOne`, `govern:chooseN*`), event-class bytecode-cache miss rate, or any new top axis that emerges once train cost recedes. Total Phase 1 ticket count depends on what each witness reveals; expect 2–4 more slices per the spec 172 precedent.

**Phase N**: no ticket in this spec. If §4.2(b) or (c) fires (Phase 1 cannot meet the §1 soft target via TS-side closure, OR three consecutive Phase 1 tickets show no measurable improvement), the follow-up Spec 174 is authored and decomposed under its own ticket prefix.

Phase 0 landed and was reviewed before any Phase 1 fix landed, satisfying the mandatory ordering for the rest of this spec.

## 11. Reassessment of source proposal

N/A. This spec was authored from session-internal investigation against `reports/fitl-arvn-15-seed-harness-wall-times-2026-05-15.md`, not from an external proposal. The trigger report contains measurement only and explicitly defers root-cause analysis to follow-up profiling. No per-recommendation disposition table is required.

The spec does, however, build on the Phase-N escalation framing first surfaced in spec 150 §9 ("WASM preview-drive coverage extension is a much larger separate effort") and spec 172 §2.7 / §9 (same). The reassessment of *those* deferred items — turning the framing into an explicit, evidence-gated escalation gate (§4.3) — is the architectural step this spec adds to the lineage. If Spec 174 is later authored, its trigger evidence is the §4.2(b) or (c) Phase 1 exit condition recorded in the final `reports/` rollup, not new external proposal.
