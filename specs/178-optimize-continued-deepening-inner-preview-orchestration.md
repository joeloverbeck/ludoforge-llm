# Spec 178 — Optimize Continued-Deepening Inner-Preview Orchestration

**Status**: PROPOSED
**Priority**: High — survives the post-Spec-177 elimination chain as the only material owner that clears the 5% slow-tier wall-time bar on the FITL ARVN witness workload.
**Complexity**: M — phased measure-then-optimize spec. Phase 0 is measurement-only; Phases 1–2 land a targeted optimization plus its wall-time witness.
**Date**: 2026-05-17
**Dependencies**:
- `archive/specs/176-policy-wasm-perf-yield-investigation.md` (Phase 6 Accelerate decision)
- `archive/specs/177-policy-wasm-batched-call-overhead-reduction.md` (Spec 177 rejected transfer-overhead as the next owner)
- `archive/tickets/178POLWASMPERF-001.md` → `archive/tickets/178POLWASMPERF-005.md` (the four-ticket attribution chain that narrowed the owner)
**Trigger report**: `reports/178-phase-4-continued-deepening-orchestration-residual.md`
**Ticket namespace**: `178CONTDEEPINNER` (proposal — finalized by `/spec-to-tickets`)

## 1. Goal

Reduce slow-tier FITL ARVN wall time on `coupArvnRedeployPolice:chooseOne | continuedDeepening` and `coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening` by attacking the unattributed work inside the generic `runChooseOneInnerPreview` orchestration, which the Phase 4 same-run attribution chain identified as the only post-Spec-177 owner that clears the 5% slow-tier wall-time gate.

## 2. Non-Goals

- No WASM route extension. The target axis has zero route counters; pulling more work into WASM is out of scope.
- No replay of Spec 177's transfer-reduction / batched-call shape. That direction was measured and rejected.
- No FITL-specific kernel, GameSpecDoc, agent profile, or visual-config change. The witness workload is FITL ARVN; the implementation must be generic to the policy-agent inner-preview seam.
- No reopening of the terminal-boundary projected-state classification. Phase 3 measured the `production-deep-choosenstep-continuation.projectedState` rows as expected `seat-or-turn-boundary` exits; that residual is not an implementation candidate in this spec.
- No `chooseNStep` continued-deepening deep-pass orchestration optimization. The deep-pass axes (`govern:chooseNStep:*`, `train:chooseNStep:*`) are a separate owner family with their own WASM route and unsupported counters; only `chooseOne | continuedDeepening` orchestration is in scope.
- No global agent-behavior tuning, policy-profile parameter change, or completion-policy reshape. Optimization must preserve observable selection outcomes.

## 3. Context

### 3.1 Why this owner survives

The post-Spec-177 attribution chain ruled out every other candidate with measured evidence:

| Eliminated candidate | Phase | Verdict |
|---|---|---|
| WASM transfer / batching overhead | Spec 177 | Slow-tier ceiling `608.7484 ms`, well below the 5% bar (`~3,901 ms`). Rejected. |
| Terminal-boundary projected-state support | 178 Phase 3 | All 241 unsupported rows classified as expected `seat-or-turn-boundary` exits. Not an implementation owner. |
| Same-run hot-path families (`tokenStateIndex:*`, `evalQuery:*`, `zobrist:*`) | 178 Phase 3 | None individually clears 5%; subtotal `1,655.11 ms` (2.09%). Not a spec-ready single owner. |
| Bytecode cache / compile cost | Spec 176 Phase 4 | Hit rate 95.07%; compile/execution 5.57%. Not material. |

### 3.2 Phase 4 measured owner

The decisive Phase 4 slow-tier run measured `77,224.1179 ms` across seeds `1005,1011,1008,1013,1009`. The 5% materiality bar is `3,861.2059 ms`.

| Owner (target axis) | Count | Wall ms | Share of same-run slow-tier wall | Verdict |
|---|---:|---:|---:|---|
| `continued-deepening-orchestration-inclusive` on `coupArvnRedeployPolice:chooseOne | continuedDeepening` | 116 | 7,581.42 | 9.8174% | Clears the 5% bar. Concrete generic owner. |
| Same classifier on `coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening` | 168 | 1,671.70 | 2.165% | Below the bar alone but shares the same generic owner; in-scope under §2 acceptance. |
| `existing-hot-path-bucket-nested` (within the inclusive bucket, primary axis) | 14,385,302 | 1,619.58 | 2.0972% | Nested evidence; not additive with the inclusive bucket. |
| `policy-search-candidate-scoring-nested` (within the inclusive bucket, primary axis) | 61,724 | 1,537.43 | 1.991% | Nested evidence; not additive with the inclusive bucket. |
| `unattributed-after-top-level-orchestration` (primary axis) | n/a | 54.45 | 0.0705% | The renderer's residual row; tiny. |

The `continued-deepening-orchestration-inclusive` classification (per `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs:559-577`) wraps any `perfHotPath` key with prefix `policyInnerPreview:`. The two such keys emitted on the chooseOne path are `policyInnerPreview:chooseOneRun` and `policyInnerPreview:summarizeUsage`, which together account for the 116 invocations (= 58 decisions × 2 buckets).

### 3.3 The unattributed-within-orchestration gap

Inside the inclusive 7,581.42 ms primary-axis bucket, the named nested families sum to `1,619.58 + 1,537.43 = 3,157.01 ms`, leaving `~4,370 ms (≈5.66% of slow-tier wall)` of work that fires inside `runChooseOneInnerPreview` but is not attributed to any current named family. By inspection of `packages/engine/src/agents/policy-agent-inner-preview.ts:413-458` and `packages/engine/src/agents/policy-preview-inner.ts:511-555`, this unattributed work is concentrated in three candidate subroutines: per-option `driveOption` preview drive, per-option `resolveRefs` ref resolution against the projected state, and the per-call `surfaceContext` / `seatResolutionIndex` setup. None of these has a current `perfHotPath` bracket of its own, which is why no nested named owner clears the 5% bar individually.

Without splitting that residual, a Phase 1 optimization would still be guessing which subroutine to attack. Phase 0 closes that gap before any code change.

### 3.4 Generic engine vs. witness workload

Per Foundation #1, FITL ARVN is the witness workload; the implementation surface is generic. The relevant entry points (`createPolicyAgentChooseOneInnerPreview`, `runChooseOneInnerPreview`) have no FITL-specific branches. The optimization landed by this spec must be generic to the chooseOne inner-preview seam and must not introduce per-game branches.

## 4. Architecture

### 4.1 Code anchors

The orchestration entry point and the unbucketed subroutines that comprise the residual:

| File:line | Role |
|---|---|
| `packages/engine/src/agents/policy-agent-inner-preview.ts:413-458` | `createPolicyAgentChooseOneInnerPreview` — bracketed by `policyInnerPreview:chooseOneRun` and `policyInnerPreview:summarizeUsage`. The wrapping inclusive owner. |
| `packages/engine/src/agents/policy-preview-inner.ts:511-555` | `runChooseOneInnerPreview` — outer per-option loop. Builds `seatResolutionIndex` and `surfaceContext` once; iterates over legal chooseOne decisions calling `driveOption` + `resolveRefs` per option. The unattributed residual lives here. |
| `packages/engine/src/agents/policy-preview-inner.ts:455` | `resolveRefs` — evaluates preview-derived refs against the projected state. One of three Phase 0 subroutine candidates. |
| (within `policy-preview-inner.ts`) `driveOption` (private) | Drives one option through the completion policy chain to produce a projected state. Second Phase 0 candidate. |
| `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs:559-577` | `classifyContinuedDeepeningBucket` — maps `perfHotPath` keys to nested family names for the Phase 4 residual split. Must be extended in Phase 0 to recognize the new subroutine family. |

### 4.2 Bucket-naming contract

The classifier in `classifyContinuedDeepeningBucket` maps any key prefixed with `policyInnerPreview:` to the wrapping `continued-deepening-orchestration-inclusive` family. New per-subroutine instrumentation added inside `runChooseOneInnerPreview` MUST NOT use the `policyInnerPreview:` prefix, or the new buckets would double-count under the inclusive wrapper. Phase 0 introduces a new prefix (proposal: `policyInnerPreviewSubroutine:`, with keys such as `policyInnerPreviewSubroutine:driveOption`, `policyInnerPreviewSubroutine:resolveRefs`, `policyInnerPreviewSubroutine:surfaceSetup`) and extends `classifyContinuedDeepeningBucket` to map that prefix to a new nested family name (proposal: `inner-preview-subroutine-nested`). The final names are an Open Question (§10).

The renderer's load-bearing wording — "`continued-deepening-orchestration-inclusive` is a top-level same-run bucket; `*-nested` rows are child hot-path evidence inside that orchestration bucket and are not additive with it" — must remain true after Phase 0. Foundation #14 forbids parallel report shapes; the existing `Continued-Deepening No-Counter Residual Split` section is extended in place.

### 4.3 Witness substrate

The decisive witness command is unchanged from `178POLWASMPERF-005`:

```
pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs \
  --seeds 1005,1011,1008,1013,1009 \
  --timeout-ms 600000 \
  --date <YYYY-MM-DD>-spec-178-phase-N-<descriptor> \
  --profile-buckets
```

Slow-tier wall-time totals will drift run-to-run; per-phase acceptance criteria reference the share-of-same-run-slow-tier denominator, not raw ms.

## 5. Phases

| Phase | Scope | Acceptance | Effort |
|---|---|---|---|
| 0 | **Inner-residual split.** Add subroutine-level `perfHotPath` brackets inside `runChooseOneInnerPreview` (per-option `driveOption`, per-option `resolveRefs`, per-call `surfaceContext` / `seatResolutionIndex` setup) using a new bucket-key prefix that does not collide with `policyInnerPreview:`. Extend `classifyContinuedDeepeningBucket` to recognize the new family. Produce a witness report at `reports/178-phase-0-inner-preview-subroutine-split.md`. | New witness CSV/Markdown emit the new nested family; the report names a concrete subroutine owner whose wall ms ≥ `5%` of the same-run slow-tier denominator on `coupArvnRedeployPolice:chooseOne | continuedDeepening`. Renderer wording on inclusive-vs-nested non-additivity preserved. No production behavior change. | S–M |
| 1 | **Targeted optimization.** Implement one optimization for the Phase 0 subroutine owner. The optimization must be generic (no FITL branches), must not change selected option outcomes, and must preserve every Foundation #20 carrier (route counts, unsupported reasons, advisory status, preview unavailability classifications, hidden/stochastic/depthCap distinctions). Add an architectural-invariant test proving outcome parity on a fixed seed × profile corpus. | The named subroutine owner's wall ms drops ≥ `40%` on the witness command. Outcome-parity test passes across the existing FITL ARVN witness seeds. No new unsupported reasons, no new advisory categories. | M |
| 2 | **End-to-end witness validation.** Re-run the witness command, render the residual-split report at `reports/178-phase-2-post-optimization-wall-time.md`, and prove the wall-time delta across both target axes. | `continued-deepening-orchestration-inclusive` wall ms on `coupArvnRedeployPolice:chooseOne | continuedDeepening` drops ≥ `40%` of the named owner's Phase 0 share; sister axis `coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening` shows a directionally-consistent reduction (≥ `25%` of its share of the same owner). Route/unsupported counters unchanged within noise. Report ends with one of: `stop: post-178 follow-up not warranted`, `create-spec: <next owner>`, `create-investigation-ticket: <next gap>`. | S |

Per-phase effort is rough; `/spec-to-tickets` will reset and may split or merge phases.

## 6. Acceptance Criteria

1. Phase 0 lands a measurement-only change that emits new subroutine-level `perfHotPath` buckets under a non-`policyInnerPreview:` prefix and extends `classifyContinuedDeepeningBucket` to map them to a new nested family name without breaking the existing inclusive/nested non-additivity contract in the renderer's "Continued-Deepening No-Counter Residual Split" section.
2. Phase 0 produces a checked-in witness report (`reports/178-phase-0-inner-preview-subroutine-split.md`) that names a single concrete subroutine owner whose wall ms clears the `5%` same-run slow-tier bar on `coupArvnRedeployPolice:chooseOne | continuedDeepening`.
3. Phase 1's optimization preserves selected option outcomes — proven by a checked-in architectural-invariant test that replays a fixed seed × profile corpus and asserts identical microturn decision sequences pre- and post-change. The corpus MUST include at least the five Phase 4 witness seeds.
4. Phase 1's optimization preserves every Foundation #20 carrier: route counts, unsupported reasons, advisory status, preview unavailability classifications, hidden/stochastic/depthCap distinctions, `tiebreakAfterPreviewNoSignal` markings, and `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisories are unchanged within noise across the witness corpus.
5. Phase 2 produces a checked-in wall-time validation report (`reports/178-phase-2-post-optimization-wall-time.md`) proving the named subroutine owner's wall ms drops ≥ `40%`, the primary-axis inclusive bucket shows the same directional drop, the sister axis shows ≥ `25%` reduction of its share of the same owner, and route/unsupported counts are unchanged within noise.
6. No engine source change outside the policy-agent inner-preview seam (per §4.1 anchors) and the report-rendering script. No GameSpecDoc, visual config, kernel, schema, or WASM ABI change.
7. Every new test file declares a `@test-class` marker per `.claude/rules/testing.md`. Outcome-parity tests default to `architectural-invariant`; if a property cannot be distilled and the test is seed-specific, `convergence-witness` with a `@witness: 178-inner-preview-subroutine` tag is acceptable.
8. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm run check:ticket-deps` pass before terminal status on each phase ticket.

## 7. Foundation Alignment

| Foundation | Alignment |
|---|---|
| #1 Engine Agnosticism | FITL ARVN is the witness workload only. All changes land in generic policy-agent inner-preview code; no per-game branch is added. |
| #10 Bounded Computation | The new instrumentation does not change preview bounds or cap classes. Phase 1 optimization may not weaken any depth cap or completion-policy contract. |
| #14 No Backwards Compatibility | Profiler/report shape extended in place. No legacy alias, parallel report family, or compatibility shim for the old bucket layout. |
| #15 Architectural Completeness | Owner selection is grounded in the four-ticket attribution chain rather than a guessed sub-residual. Phase 0 closes the named-subroutine gap before Phase 1 commits to a fix. |
| #16 Testing as Proof | Outcome-parity is proven by checked-in architectural-invariant tests, not asserted in prose. Wall-time delta is proven by checked-in witness artifacts. |
| #20 Preview Signal Integrity | Route counters, unsupported reasons, advisory status, hidden/stochastic/depthCap/depth-cap-uniform distinctions, and `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisories MUST be unchanged within noise across the witness corpus pre- and post-Phase-1. The optimization must not collapse any unavailable-status carrier into a scalar. |

No Foundation amendments are needed.

## 8. Code Anchors

Implementation surface:
- `packages/engine/src/agents/policy-agent-inner-preview.ts` (Phase 0 may add brackets at the outer-call boundary; Phase 1 may modify if dictated by Phase 0 evidence)
- `packages/engine/src/agents/policy-preview-inner.ts` (`runChooseOneInnerPreview`, `driveOption`, `resolveRefs` — primary Phase 0 instrumentation site; primary Phase 1 modification site)

Report rendering / measurement substrate:
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` (`classifyContinuedDeepeningBucket` at `:559-577` — extend for new prefix)
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (witness command, no edits expected)

Profiler API:
- `packages/engine/src/kernel/perf-profiler.ts` (`perfHotPathStart`, `perfHotPathEnd`, `perfHotPathCount`, `snapshotHotPathProfilerCounters`)

Reference reports (informing the architectural decision):
- `reports/178-phase-4-continued-deepening-orchestration-residual.md` (decisive owner identification + materiality math)
- `reports/178-phase-3-same-run-attribution-counters.md` (same-run attribution substrate, terminal-boundary classification)
- `reports/178-phase-2-terminal-boundary-no-counter-split.md` (no-counter axis framing)
- `reports/178-phase-1-fallback-wall-time-attribution.md` (initial fallback decomposition)
- `reports/178-policy-agent-bottleneck-discovery.md` (overall post-Spec-177 owner inventory)

## 9. Out of Scope

- WASM route extension to cover `chooseOne | continuedDeepening` work. The target axis has zero route counters; the orchestration is TS-only by construction.
- `chooseNStep | continuedDeepening` deep-pass orchestration (`govern:chooseNStep:*`, `train:chooseNStep:*` families). Those axes have their own WASM route / unsupported counters and a different orchestration shape (`runChooseNStepInnerPreview` + `runDeepPass`); they belong in a separate spec.
- Terminal-boundary projected-state support. Phase 3 classified the existing `production-deep-choosenstep-continuation.projectedState` rows as expected boundary exits; reopening requires new contradictory same-run evidence.
- Same-run hot-path family work on `tokenStateIndex:*`, `evalQuery:*`, `zobrist:*` as standalone owners. Phase 3 measured each below the 5% bar individually. If Phase 0 attributes the new subroutine owner partially to these families, the optimization should attack the subroutine call structure, not re-litigate the hot-path-family materiality.
- Profile YAML, agent considerations, completion-policy parameters, or any policy-quality tuning. Phase 1 must preserve selection outcomes.
- A perf-quality regression CI gate. Witness reports remain manual artifacts under `reports/`; CI integration is a separate strategic question.

## 10. Open Questions

- **Bucket-key prefix and nested family name** for the Phase 0 subroutine instrumentation. Default proposal: prefix `policyInnerPreviewSubroutine:` with keys `policyInnerPreviewSubroutine:driveOption`, `policyInnerPreviewSubroutine:resolveRefs`, `policyInnerPreviewSubroutine:surfaceSetup`, classifier family name `inner-preview-subroutine-nested`. The Phase 0 ticket may finalize different identifiers if a clearer convention emerges during implementation; the contract is that the new prefix MUST NOT collide with `policyInnerPreview:`.
- **Per-call vs. per-option granularity for `resolveRefs`.** `runChooseOneInnerPreview` calls `resolveRefs` once per option in the per-option loop; bracketing per-call is straightforward, but high-volume per-call brackets can inflate `performance.now` overhead. Default: bracket per-call; revisit only if Phase 0 wall-time skew exceeds 2% of the inclusive bucket.
- **Phase 1 optimization candidate selection.** Deferred to Phase 0 evidence. Plausible candidates pre-Phase-0 include: memoizing `resolveRefs` work across options with identical projected-state hashes, short-circuiting `driveOption` for options whose completion policy is trivially determinable, or hoisting per-option work into a single batched pass. The spec deliberately does not commit to one.
- **Whether Phase 1 should also instrument the chooseNStep broad-pass equivalent** for symmetry. Default: no. The sister `chooseNStep` orchestration is out of scope per §9 and has its own owner shape; instrumentation will be added by the future spec that owns it.

## 11. Reassessment of source proposal

Per-recommendation dispositions for `reports/178-phase-4-continued-deepening-orchestration-residual.md`'s closing blocks:

| Source recommendation | Disposition | Notes |
|---|---|---|
| `create-spec: Optimize continued-deepening inner-preview orchestration` (final recommendation line) | **Adopted.** | Spec 178 is this artifact. |
| Problem statement: "`continuedDeepening` chooseOne inner-preview orchestration dominates the remaining no-counter target axis" | Adopted. | Verbatim restated in §1 and §3.2. |
| Materiality threshold: 5% of `77,224.1179 ms` slow-tier wall = `3,861.2059 ms` | Adopted. | §3.2 quotes the absolute number; Phase 0/1/2 acceptance uses *share of same-run slow-tier* (relative) per §4.3 to absorb run-to-run drift. The 5% bar is denominated relative, not absolute, so a future run with different total wall time still uses the same gate. |
| Required proof lane: "Build the engine package before compiled-test or profiler witnesses" | Adopted. | §6 acceptance #8 includes `pnpm turbo build`. |
| Required proof lane: "Keep a focused report/profiler shape test proving any new attribution or output contract" | Adopted with adjustment. | Phase 0 ticket will extend the existing `packages/engine/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.ts` rather than create a parallel test (Foundation #14). |
| Required proof lane: "Use the same slow-tier FITL ARVN decomposition command as a witness workload, with `--profile-buckets` and route/unsupported counters preserved" | Adopted. | §4.3 fixes the witness command; §6 acceptance #4 fixes counter preservation. |
| Required proof lane: "Prove any optimization through the generic inner-preview/policy-agent seam, not through game-specific FITL branches or profile-only shortcuts" | Adopted. | §2 Non-Goals + §6 acceptance #6 + §7 Foundation #1 row. |
| Required proof lane: "Preserve a no-WASM or WASM-disabled comparison only as diagnostic unless the next spec explicitly owns a route-vs-reference gate" | Adopted with adjustment. | Not adopted as a normative spec requirement (target axis has zero route counters, so WASM toggle is structurally irrelevant). Documented as Open Question §10 if Phase 1 wants no-WASM noise control. |
| Foundation #20 constraint: "do not convert unavailable preview refs or missing route counters into scalar score evidence; keep provenance fields visible" | Adopted. | §6 acceptance #4, §7 Foundation #20 row. |
| Foundation #14 constraint: "do not add a compatibility path or parallel report format; migrate the existing profiler/report contract in place" | Adopted. | §4.2 bucket-naming contract, §7 Foundation #14 row. |
| Foundation #1 constraint: "FITL ARVN is only the workload; implementation must be generic to policy-agent inner-preview orchestration" | Adopted. | §2 Non-Goals, §7 Foundation #1 row. |
| Implicit deferral: the sister axis `coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening` is described as "supports the same generic owner" but the report does not name it as an acceptance target | Adopted with adjustment. | This spec explicitly scopes both axes; §6 acceptance #5 requires the sister axis to show directionally-consistent reduction. Rationale: same generic owner means a generic fix must amortize across both, not coincidentally align to the primary axis. |
| Implicit deferral: Phase 4 declined to name a sub-subroutine owner | Adopted. | Phase 0 of this spec exists exactly to close that gap before Phase 1 commits to a fix. |

## 12. Tickets

Decomposed via `/spec-to-tickets` on 2026-05-17:

- [`archive/tickets/178CONTDEEPINNER-001.md`](../archive/tickets/178CONTDEEPINNER-001.md) — Phase 0 — Inner-preview subroutine split instrumentation + witness report (covers §5 Phase 0)
- [`archive/tickets/178CONTDEEPINNER-002.md`](../archive/tickets/178CONTDEEPINNER-002.md) — Phase 1 — Targeted optimization of named subroutine owner + outcome-parity test (covers §5 Phase 1)
- [`tickets/178CONTDEEPINNER-003.md`](../tickets/178CONTDEEPINNER-003.md) — Phase 2 — End-to-end witness validation + wall-time delta report (covers §5 Phase 2; measured gate red)
- [`archive/tickets/178CONTDEEPINNER-004.md`](../archive/tickets/178CONTDEEPINNER-004.md) — Phase 3 — Investigate residual driveOption wall time after failed Phase 2 gate
- [`tickets/178CONTDEEPINNER-005.md`](../tickets/178CONTDEEPINNER-005.md) — Phase 4 — Optimize `policyInnerPreviewDriveOption:publishMicroturn` inside `driveOption`

## 13. Outcome

Phase 2 outcome recorded on 2026-05-17:

- Report: `reports/178-phase-2-post-optimization-wall-time.md`.
- Generated witness artifacts:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-2-post-optimization-wall-time.csv`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-2-post-optimization-wall-time.md`
- Acceptance verdict:
  - Named primary-axis owner `policyInnerPreviewSubroutine:driveOption` dropped `6.19%` (`6,804.08 ms -> 6,382.68 ms`), failing the required `>= 40%` reduction.
  - Primary-axis inclusive bucket dropped directionally by `6.13%` (`7,578.43 ms -> 7,114.21 ms`), passing the directional-drop sub-criterion.
  - Sister-axis owner dropped `9.34%` (`1,453.32 ms -> 1,317.64 ms`), failing the required `>= 25%` reduction.
  - Route and unsupported counters were unchanged (`1,299` routes, `751` unsupported counts), so no carrier collapse was observed.
- Final recommendation: create-investigation-ticket: 178CONTDEEPINNER-004 residual `policyInnerPreviewSubroutine:driveOption` wall time after Phase 1 under-delivery.

Spec 178 remains open because the Phase 2 measured gate is red.

Phase 3 outcome recorded on 2026-05-17:

- Report: `reports/178-phase-3-residual-drive-option-investigation.md`.
- Generated witness artifacts:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-3-residual-drive-option-split.csv`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-3-residual-drive-option-split.md`
- Instrumentation added:
  - `policyInnerPreviewDriveOption:initialDecisionApply`
  - `policyInnerPreviewDriveOption:publishMicroturn`
  - `policyInnerPreviewDriveOption:pickInnerDecision`
  - `policyInnerPreviewDriveOption:continuationDecisionApply`
  - `policyInnerPreviewDriveOption:syncDraftTokenStateIndex`
  - `policyInnerPreviewDriveOption:canonicalizeForExit`
- Measured residual split:
  - Primary-axis `policyInnerPreviewSubroutine:driveOption` remained material at `6,494.10 ms`, or `7.1603%` of same-run wall.
  - Primary-axis `policyInnerPreviewDriveOption:publishMicroturn` was the largest child row at `3,056.07 ms`, or `47.0558%` of the `driveOption` wrapper.
  - Sister-axis `policyInnerPreviewDriveOption:publishMicroturn` was also the largest child row at `357.82 ms`, or `26.4895%` of that axis' `driveOption` wrapper.
  - Route and unsupported counters remained unchanged from Phase 2 (`1,299` routes, `751` unsupported counts), so no Foundation #20 carrier collapse was observed.
- Final recommendation: create-implementation-ticket: `tickets/178CONTDEEPINNER-005.md` optimize `policyInnerPreviewDriveOption:publishMicroturn` inside `driveOption`.

Spec 178 remains open because the Phase 4 implementation owner is active.
