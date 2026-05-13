# Spec 168 — Engine Per-Decision Hot-Path Optimizations

**Status**: COMPLETED
**Priority**: Medium-High — with Spec 167 closed, the per-card cost in `fitl-arvn-agent-evolution` is `2051 ms` at `12.82 ms/decision` (160 decisions/card). Recovering ~250–450 ms/card cuts another 12–22% off every tournament-loop seed and compounds over the unbounded campaign horizon. Lower priority than 167 because the harness is already inside its acceptable wall-time band; higher than the deferred Spec 168 sketch in 167 §10 indicated, because turnperf-002 has now profile-validated the targets.
**Complexity**: M
**Date**: 2026-05-13
**Predecessors**:
- Spec 167 (`archive/specs/167-arvn-evolution-harness-performance.md` — closes the harness-layer phase; this spec covers the per-decision kernel layer 167 explicitly deferred in §10).
- Spec 143 (run-local memory ownership, `forkGameDefRuntimeForRun` contract — load-bearing for safe persistent token-state-index reuse across runs).
**Dependencies**: Spec 167 (closed), Spec 143 (closed).
**Trigger reports**:
- `reports/turnperf-002-spec-167-baseline.md` — profile-validated per-bucket cost decomposition with explicit "Prioritized Targets for Spec 168" section. The acceptance gates and phase ordering in this spec map 1:1 to that report's evidence.
- `archive/reports/turnperf-001-investigation-2026-04-28.md` — pre-167 baseline (`8710 ms` per card), retained for delta comparison.

---

## 1. Goal

Reduce the per-card kernel time of the `fitl-arvn-agent-evolution` `--seed 42 --maxTurns 1` profiling probe from `2051 ms` (`12.82 ms/decision` over 160 decisions) to **≤ 1700 ms (≤ 10.6 ms/decision)** while:

- preserving determinism of every individual `runGame` invocation (canonical state-hash identity vs. baseline);
- preserving the WASM↔TS bytecode equivalence contract (`policy-bytecode-equivalence.test.ts` remains green);
- preserving the `compositeScore` of a `SEED_COUNT=15` `harness.sh` invocation at fixed seed and profile.

After this spec lands:

- Token-state-index build/refresh count for the one-card probe drops materially (specific deltas captured in per-phase turnperf reports).
- Generic query/filter evaluation reuses compiled query plans across per-token iteration; per-token binding-record reconstruction is eliminated on the hot path.
- Decision-stack zobrist digest building reuses parent-frame digests instead of recomputing from scratch on preview-inner frames.
- Encoded WASM input rows are cached by stable preview-state shape + feature-table identity so the `encodeBytecodeInput` cost no longer scales linearly with decision count when state shape is stable.
- A profile-validated escalation gate (Phase 5) decides whether a follow-up spec for bytecode-IR/WASM expansion is warranted; the gate is a published criterion, not an implicit "do it later" handoff.

## 2. Context (verified against codebase)

### 2.1 Profile-validated cost decomposition

`reports/turnperf-002-spec-167-baseline.md` records the post-167 per-decision profile. Bucket timings reproduced here for traceability (one card, seed 42, four FITL profiles, `verifyIncrementalHash=true`):

| Bucket | Per-card ms | Share of elapsed |
|---|---:|---:|
| `simAgentChooseMove` | `913.64` | `44.5%` |
| `agent:evaluatePolicyExpression` (nested in chooseMove) | `912.06` | `44.5%` |
| `simApplyMove` | `187.41` | `9.1%` |
| `evalQuery:countMatchingTokens` | `91.33` | `4.5%` |
| `zobrist:digestDecisionStackFrame` | `89.57` | `4.4%` |
| `tokenStateIndex:build` (×2903 calls) | `87.91` | `4.3%` |
| `tokenStateIndex:refreshCachedEntries` (×10568 calls) | `64.93` | `3.2%` |
| `policyWasmRuntime:encodeBytecodeInput` | `38.28` | `1.9%` |
| `zobrist:encodeDecisionStackFrame` | `36.88` | `1.8%` |

CPU-profile self-samples (top non-policy owners): `updateFnv1a64State` (69), `resolveRef` (67), `boundToken` (48), `buildTokenStateIndex` (47), `countMatchingTokens` (42), `refreshCachedTokenStateIndexEntries` (41), `encodeDecisionStackFrameDigestInput` (37), `zobristKey` (36).

### 2.2 What WASM already covers

Verified via grep against `packages/engine/src/agents/policy-wasm-runtime*.ts` and `packages/engine-wasm/policy-vm/src/{lib.rs,preview_drive.rs}`:

- WASM is initialized at tournament startup (Spec 167 Phase 0) and is the default scoring path.
- `wasmScoreRowRouteCount=52` and `wasmPreviewCandidateFeatureRowRouteCount=60` with **zero** `unsupported` counts — the production preview-drive batch path (`wasmProductionPreviewDriveBatchCount=182`) is fully WASM-routed.
- The `agent:evaluatePolicyExpression` bucket is therefore **mostly already executed in WASM**. Its `912 ms` is dominated by the work the Rust VM is doing, not by remaining TS interpretation.
- The `encodeBytecodeInput` bucket (`38 ms`) is the **marshalling cost** of crossing the WASM boundary. It is already non-trivial; pushing more work across that boundary without batching could net negative.

### 2.3 Why the attack surface is kernel-internal, not WASM-expansion

The remaining hot paths (token binding, ref resolution, query/filter, token-state-index build/refresh, Zobrist digest) are kernel-internal and do not cross the WASM boundary today. Moving them into Rust would require:

1. Defining new opcodes/ABI calls — substantial surface, ABI version bump.
2. Marshalling kernel state shapes (token sets, occurrence maps, bind environments) across the boundary every call — likely worse than the current TS-side cost given `encodeBytecodeInput` is already a profile-visible bucket.
3. Equivalence proofs per opcode against the existing TS implementation.

Profile-first conclusion: kernel-internal TS optimization can recover most of the available headroom without crossing the boundary; WASM expansion should be conditional on a re-profiled gap that the cost-model justifies.

### 2.4 Spec 143 contract enables persistent index reuse

`packages/engine/src/kernel/gamedef-runtime.ts:84-95` and `docs/architecture.md` "Runtime Ownership" classify the structural runtime members as `sharedStructural` and `zobristTable.keyCache` as `runLocal`. `forkGameDefRuntimeForRun(...)` already isolates per-run state. Persistent token-state-index storage extends this contract with a new `runLocal` field for the per-run mutable index, validated by the same fork machinery.

### 2.5 Profiling tooling already exists

`packages/engine/scripts/profile-fitl-preview-drive.mjs` accepts `--seed`, `--maxTurns`, `--profilesAll`, `--perCard`, `--profileBuckets`, `--label`. Spec 167 Phase 2's reassessment cites it as the canonical per-decision measurement tool. This spec does not introduce a second profiling surface; it standardizes how that script's output is captured into per-phase reports.

## 3. Architecture

### 3.1 Profiling-first protocol (gates every phase)

Every phase in §4 follows this protocol:

1. Run the canonical probe **before** implementation:
   ```bash
   node packages/engine/scripts/profile-fitl-preview-drive.mjs \
     --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets \
     --label spec-168-phase-N-pre
   ```
2. Implement the phase's optimization.
3. Re-run the canonical probe with `--label spec-168-phase-N-post`.
4. Capture the pre/post deltas (top-line `elapsedMs`, `msPerDecision`, every bucket in §2.1, plus relevant counts like `tokenStateIndexBuildCount`) into `reports/turnperf-NNN-spec-168-phase-N.md`.
5. Phase land is gated on the report existing AND the per-phase numerical acceptance criterion in §4 being met.

This protocol is the operational meaning of "profiling-first": the spec MUST NOT accept any phase that lacks measured pre/post evidence in `reports/`.

### 3.2 Persistent mutable token-state-index

`packages/engine/src/kernel/token-state-index.ts` (408 lines) currently rebuilds the token-state-index from scratch on each invocation reachable via the eval/query path. Profile evidence: 2903 builds + 10568 refresh calls per card.

Architecture:

- Add a `runLocal` field `tokenStateIndexCache` to `GameDefRuntime` per the Spec 143 contract; the field is forked per run by `forkGameDefRuntimeForRun(...)`.
- The cache is keyed by the canonical state hash (already computed for replay) of the originating state. Cache lookup returns either a hit (reuse the persistent mutable structure, applying any deferred deltas) or a miss (build fresh and store).
- Cache eviction follows a bounded LRU policy with a finite cap (configurable via runtime constant; default chosen during implementation based on Phase 1 measured working-set size).
- Foundation #11 Scoped Internal Mutation exception is explicitly cited: the persistent mutable structure is internal to the kernel's eval-query subsystem, never exposed across the public `applyMove(state) -> newState` contract, never aliased outside the eval-scope. Caller-visible state remains immutable.

Determinism contract: cache hits MUST produce a token-state-index byte-identical to a cache miss for the same originating state. Validated by Phase 1 architectural-invariant test.

### 3.3 Compiled query/filter plans

`packages/engine/src/kernel/eval-query.ts` (1353 lines) is the largest hot-path file. CPU-profile evidence shows `boundToken` (48 samples), `resolveRef` (67), `countMatchingTokens` (42) are top contributors; the per-token iteration in `countMatchingTokens` rebuilds binding records and re-resolves refs for each token.

Architecture:

- Introduce a `compileQueryPlan(predicate, bindEnv) -> CompiledQueryPlan` step keyed on the predicate AST node identity (already stable at compile time). The compiled plan captures the resolved ref paths, the binding scaffolding, and a per-token closure that takes only the token + state slice.
- Plans are cached on the `sharedStructural` runtime (per Spec 143 — they depend only on the compiled `GameDef`, not run-local state). No per-run isolation needed.
- Per-token iteration in `countMatchingTokens`, `applyTokenFilter`, and adjacent paths invokes the compiled plan instead of re-resolving refs and re-constructing bind records per token.
- The compilation step itself is bounded: query plans are built lazily on first invocation per call site and cached forever (within the runtime lifetime).

Determinism contract: compiled-plan evaluation MUST produce identical query results to the existing per-token re-resolution path on the baseline corpus. Validated by Phase 2 architectural-invariant test.

### 3.4 Decision-stack zobrist incremental digest

`packages/engine/src/kernel/zobrist.ts` (598 lines) builds a digest of the decision stack on each preview-inner frame. Profile evidence: 300 `digestDecisionStackFrame` calls = `89.57 ms`; 305 `encodeDecisionStackFrame` calls = `36.88 ms`. The encoder rebuilds the input from scratch each call.

Architecture:

- Cache encoded decision-stack frames keyed by `(frame structure identity, parent-frame digest)`. The frame structure identity is the immutable per-frame data (decision id, scope, candidate identity); the parent-frame digest is the already-computed digest of the enclosing frame.
- On a cache hit, return the previously-computed digest directly. On a miss, compute and cache.
- Cache lives on the `runLocal` zobrist table (alongside `keyCache`), forked per run.
- Foundation #11 corollary: the cache stores digest values, not state references; it cannot leak state aliasing.

Determinism contract: cached digests MUST equal recomputed digests for the same `(frame, parent-digest)` pair. Validated by Phase 3 architectural-invariant test (zobrist key identity at frame level + replay state-hash identity).

### 3.5 Bytecode input row cache

`packages/engine/src/agents/policy-wasm-runtime.ts` and `policy-wasm-production-preview-values.ts` encode bytecode input rows on each preview-drive batch. Profile evidence: `encodeBytecodeInput` is `38.28 ms`; the file appears in CPU-profile top owners.

Architecture:

- Cache encoded input rows keyed by `(preview-state shape hash, candidate feature-table identity)`. Both keys are already computed elsewhere on the path; no new hash work is introduced.
- Cache lives on the `sharedStructural` runtime if the encoding depends only on the compiled GameDef + canonical state shape; otherwise on the `runLocal` runtime per Spec 143.
- Cache size is bounded by the working set of distinct `(state-shape, feature-table)` pairs, which the Phase 4 measurement step characterizes.

Determinism contract: WASM↔TS bytecode equivalence test (`policy-bytecode-equivalence.test.ts`) remains green. Cached encoded rows MUST be byte-identical to freshly-encoded rows. Validated by Phase 4 architectural-invariant test.

### 3.6 Phase 5 escalation gate

After Phases 1–4 land, re-run the canonical probe and compute the new bucket decomposition. The escalation criterion for drafting Spec 169 (bytecode-IR / WASM expansion):

- A single non-policy bucket sustains ≥ `40 ms` per card AND
- The candidate optimization is a kernel-internal hot path that today does not cross the WASM boundary AND
- A back-of-envelope cost-model estimate (using `encodeBytecodeInput` per-call cost from the post-Phase-4 baseline as a marshalling-cost proxy) shows expected WASM execution + marshalling cost is < estimated TS-side cost.

If all three hold for at least one bucket, the Phase 5 deliverable includes a one-paragraph Spec 169 trigger memo identifying the bucket, the proposed opcode/ABI shape, and the measured cost-model estimate. If none hold, the Phase 5 deliverable records that finding and explicitly closes the optimization arc for now.

This is the published profiling-first criterion. WASM expansion is not committed by this spec; it is conditioned on measured evidence captured at Phase 5.

## 4. Phases & acceptance criteria

| Phase | Scope | Acceptance criterion (per-card, one-card probe) | Effort |
|---|---|---|---|
| **0** | Pin the canonical baseline + add `packages/engine/test/perf/per-decision-cost-budget.perf.test.ts` benchmark fixture (deterministic seed, captures structured per-bucket JSON for diff comparison). Capture baseline into `reports/turnperf-NNN-spec-168-phase-0-baseline.md`. | No perf delta. Phase lands when fixture + baseline report exist and the fixture runs cleanly under the live perf lane, `pnpm -F @ludoforge/engine test:perf`. | S |
| **1** | Persistent mutable token-state-index per §3.2. | `tokenStateIndex:build` + `tokenStateIndex:refreshCachedEntries` combined ms drops by **≥ 50 ms**; `tokenStateIndexBuildCount` decreases (specific count delta recorded in report). Determinism test green. | M |
| **1b** | Resolve the Phase 1 measured-gate miss if the persistent state-hash cache is correct but not activated by the canonical workload. | Phase 1 can proceed only after the residual owner records a green `>= 50 ms` token-index drop, or rewrites this spec with measured evidence that Phase 1 should be skipped/reordered. | M |
| **2** | Compiled query/filter plans per §3.3. | `evalQuery:countMatchingTokens` + `evalQuery:applyTokenFilter` + token-binding/ref-resolution CPU-sample share combined drops by **≥ 80 ms**. Determinism test green. | M |
| **3** | Decision-stack zobrist incremental digest per §3.4. | `zobrist:digestDecisionStackFrame` + `zobrist:encodeDecisionStackFrame` combined ms drops by **≥ 40 ms**. Determinism test green. | S–M |
| **4** | Bytecode input row cache per §3.5. | `policyWasmRuntime:encodeBytecodeInput` ms drops by **≥ 10 ms**. WASM↔TS equivalence test green. | S |
| **5** | Re-profile, evaluate Phase 5 escalation gate per §3.6, write decision memo. | Phase lands when `reports/turnperf-NNN-spec-168-final.md` exists with the new bucket decomposition AND the Spec 169 trigger memo (or explicit closure note). No code change required by this phase itself. | S |

**Overall acceptance** (gates the spec's closure): per-card `elapsedMs` ≤ `1700 ms` AND `msPerDecision` ≤ `10.6 ms` on the canonical probe, with `errors == 0` and `compositeScore` matching the pre-spec baseline at fixed seed and profile (determinism preserved → exact match, not noise-bounded).

The 1700 ms target is a budget; realistic expectation given §2.1 evidence is `1750–1850 ms` if every phase hits its lower bound, `1600–1700 ms` if every phase hits its upper bound. The budget is set at the upper bound of the lower-bound scenario so the spec is achievable without forcing every phase into best-case territory.

## 5. Test plan

- **Per-phase architectural-invariant tests** (one per phase 1–4):
  - `packages/engine/test/integration/persistent-token-state-index-equivalence.test.ts` — Phase 1: persistent-index hits produce byte-identical token-state-index to fresh builds across the FITL canary corpus.
  - `packages/engine/test/integration/compiled-query-plan-equivalence.test.ts` — Phase 2: compiled query plans produce identical query results to per-token re-resolution on the same corpus.
  - `packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts` — Phase 3: cached frame digests equal recomputed digests; replay state-hash identity preserved.
  - `packages/engine/test/integration/bytecode-input-row-cache-equivalence.test.ts` — Phase 4: cached input rows are byte-identical to fresh encoding; piggybacks on `policy-bytecode-equivalence.test.ts` machinery.
- **Benchmark fixture** (Phase 0 deliverable):
  - `packages/engine/test/perf/per-decision-cost-budget.perf.test.ts` — emits structured per-bucket JSON for the canonical probe; no hard ms assertion in the test itself (wall-time isn't deterministic per Foundation #16), but it produces the artifact each phase report consumes.
- **Existing tests preserved**:
  - `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` — gates Phase 4.
  - `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` (Spec 167 Phase 0) — must remain green throughout.
  - `packages/engine/test/integration/arvn-tournament-parallel-determinism.test.ts` (Spec 167 Phase 2) — must remain green throughout.
- **Per-phase reports** (deliverable, not test):
  - `reports/turnperf-NNN-spec-168-phase-0-baseline.md` … `phase-4.md` … `final.md`. Naming follows the existing turnperf-NNN convention; `NNN` is allocated at implementation time.

## 6. Foundation alignment

| Foundation | Alignment |
|---|---|
| #1 Engine Agnosticism | All optimizations target generic kernel/agent code paths; no game-specific identifiers, branches, or rule handlers introduced. |
| #5 One Rules Protocol | Unchanged. Same legality/action protocol; optimizations are internal-only. WASM↔TS equivalence test gates Phase 4. |
| #8 Determinism Is Sacred | Reinforced. Every phase has an architectural-invariant equivalence test; canonical state-hash identity is the oracle, hashes/digests are accelerators. |
| #10 Bounded Computation | Unchanged. No new loops, no general recursion. Compiled query plans cache lookups are O(1); index/digest caches are bounded LRU with finite caps. |
| #11 Immutability | Reinforced via the Scoped Internal Mutation exception. Phases 1, 3, 4 explicitly cite the exception; the public `applyMove(state) -> newState` contract is preserved. The Single-source-of-truth corollary is unaffected (no new kernel-mutated structural state fields). |
| #14 No Backwards Compatibility | No compat shims. Old code paths are deleted, not deprecated. If a phase is reverted, the revert is a clean removal, not a flag. |
| #15 Architectural Completeness | The Phase 5 escalation gate is the load-bearing alignment: it converts an implicit "do WASM later" handoff into a published criterion with measurable inputs. The spec is complete on its own terms; Spec 169 is conditional, not assumed. |
| #16 Testing as Proof | Architectural-invariant tests gate every code-bearing phase. Per-card ms acceptance is captured in `reports/`, not asserted in tests (wall-time isn't deterministic). |

## 7. Reproducibility metadata

The benchmark fixture (`per-decision-cost-budget.perf.test.ts`) and the per-phase report capture:

- Kernel commit SHA at measurement time
- Node version, pnpm version, OS/CPU description
- Phase enablement state (which phases are active in `dist/` at measurement time)
- Top-line `elapsedMs`, `msPerDecision`, all buckets enumerated in §2.1, plus `tokenStateIndexBuildCount`, `draftTokenStateIndexDeltaCount`, `wasmScoreRowRouteCount`, `wasmPreviewCandidateFeatureRowRouteCount`, `wasmProductionPreviewDriveBatchCount`, `driveExitTotal`

These fields make it trivial to detect a future regression where a refactor accidentally re-disables a Phase 1–4 cache or routes back to the slow path.

## 8. Out of scope

- **Test-gate scoping**: `harness.sh` continues to run the full engine test suite (`114.10s` per turnperf-002 measurement). Scoping that gate is a campaign-protocol amendment, not an engine optimization. Out of scope here, same as Spec 167 §10.
- **Runner-side rendering performance**: PixiJS canvas, React UI, animation loop. Out of scope.
- **FITL agent profile content tuning**: changing weights, refs, or features in the policy profiles. Out of scope; this spec is engine-layer only.
- **Bytecode IR opcode additions / new WASM opcodes / new ABI calls**: deferred to Spec 169 if Phase 5 escalation gate triggers.
- **Generalizing optimizations across other campaigns**: the persistent token-state-index, compiled query plans, zobrist digest cache, and bytecode input row cache live in engine code, so they apply universally — but the design and acceptance criteria are validated on the FITL profile only. If a future campaign exhibits a different bucket decomposition, that's a separate measurement story.
- **Changes to the Spec 167 harness contract**: WASM bootstrap, concurrency flag, GameDef disk cache, build script, trace defaults. Unchanged.

## 9. Open questions

- The `tokenStateIndexCache` LRU cap (§3.2) is set during Phase 1 implementation based on measured working-set size from the canonical probe. If the working set exceeds memory budgets the implementing ticket must either tighten the cap or escalate.
- Whether the Phase 0 `per-decision-cost-budget.perf.test.ts` benchmark fixture lives under the existing `perf` lane or warrants a new `perf-budget` lane (the existing lane runs all perf tests; a budget-only lane could run faster on CI). Defer to implementation review.
- Whether the Phase 2 compiled query plans should also be reused by `effect-compiler-codegen.ts` and `first-decision-compiler.ts` (which both grep-hit the `evalQuery`/`countMatchingTokens` surface). If Phase 2 measurement shows the plan-compilation step is reusable in those compilers, extend; otherwise defer.
- Whether to add a CI canary asserting the per-card ms stays within the post-spec budget. Wall-time isn't deterministic, but a wide tolerance band (e.g., budget × 1.5) could catch order-of-magnitude regressions. Defer to post-spec retrospective.

## 10. Reassessment of source proposal

N/A. This spec was authored from a session-internal investigation grounded in `reports/turnperf-002-spec-167-baseline.md` (§ "Prioritized Targets for Spec 168") and verification against the kernel hot-path source. No external proposal informed the design; no per-recommendation disposition table is required.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-13:

- [`archive/tickets/168ENGHOTPATH-001.md`](../archive/tickets/168ENGHOTPATH-001.md) — Phase 0 — baseline pin + per-decision benchmark fixture (covers §3.1 + §4 Phase 0)
- [`archive/tickets/168ENGHOTPATH-002.md`](../archive/tickets/168ENGHOTPATH-002.md) — Phase 1 — persistent token-state-index substrate (covers §3.2 correctness substrate; measured gate resolved by `007`)
- [`archive/tickets/168ENGHOTPATH-007.md`](../archive/tickets/168ENGHOTPATH-007.md) — Phase 1b — resolved token-state-index measured-gate miss (covers the red Phase 1 metric from `reports/turnperf-004-spec-168-phase-1.md`)
- [`archive/tickets/168ENGHOTPATH-003.md`](../archive/tickets/168ENGHOTPATH-003.md) — Phase 2 — compiled query/filter plans (covers §3.3 + §4 Phase 2)
- [`archive/tickets/168ENGHOTPATH-004.md`](../archive/tickets/168ENGHOTPATH-004.md) — Phase 3 — zobrist incremental digest (covers §3.4 + §4 Phase 3)
- [`archive/tickets/168ENGHOTPATH-005.md`](../archive/tickets/168ENGHOTPATH-005.md) — Phase 4 — bytecode input row cache (covers §3.5 + §4 Phase 4)
- [`archive/tickets/168ENGHOTPATH-006.md`](../archive/tickets/168ENGHOTPATH-006.md) — Phase 5 — re-profile + Spec 169 escalation memo (covers §3.6 + §4 Phase 5)

## Outcome (2026-05-13)

Spec 168 completed through its full ticket chain. Phases 0-5 are archived under
`archive/tickets/168ENGHOTPATH-001.md` through
`archive/tickets/168ENGHOTPATH-006.md`, with Phase 1b archived separately as
`archive/tickets/168ENGHOTPATH-007.md`.

What landed:

- Phase 0 added the opt-in per-decision budget fixture and baseline report:
  `reports/turnperf-003-spec-168-phase-0-baseline.md`.
- Phase 1 plus Phase 1b landed and activated the token-state-index hot-path
  reductions recorded in `reports/turnperf-004-spec-168-phase-1.md` and
  `reports/turnperf-005-spec-168-phase-1b.md`.
- Phase 2 landed compiled query/filter plan caching and result-cache timing
  fixes, recorded in `reports/turnperf-006-spec-168-phase-2.md`.
- Phase 3 landed decision-stack frame digest caching, recorded in
  `reports/turnperf-007-spec-168-phase-3.md`.
- Phase 4 landed bytecode input row/state-word caching, recorded in
  `reports/turnperf-008-spec-168-phase-4.md`.
- Phase 5 produced the final re-profile and closure memo in
  `reports/turnperf-009-spec-168-final.md`.

Deviations from the original budget:

- The final canonical probe improved from the Phase 0 baseline
  `2145.94 ms/card` and `13.4121 ms/decision` to `1800.57 ms/card` and
  `11.2536 ms/decision`, but it did not reach the original `<=1700 ms/card`
  and `<=10.6 ms/decision` target.
- The published Phase 5 Spec 169 escalation gate did not trigger. The final
  report records that the remaining single kernel-internal bucket over `40 ms`
  is `tokenStateIndex:build`, but the measured marshalling proxy leaves only
  about `1.65 ms` of total WASM execution headroom before a WASM route would be
  slower than the current TypeScript path. `simApplyMove` remains larger, but it
  is an aggregate wrapper rather than a narrow opcode/ABI candidate.
- No Spec 169 was authored as part of this spec. If the remaining
  `<=1700 ms/card` budget still matters, the final report recommends a new
  profiling/design slice against the residual aggregate rather than a
  bytecode-IR/WASM expansion spec.

Verification summary:

- `pnpm -F @ludoforge/engine build` — passed during Phase 5 closeout.
- `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec-168-final` — passed and produced the decisive final bucket decomposition.
- `SEED_COUNT=15 /usr/bin/time -p bash campaigns/fitl-arvn-agent-evolution/harness.sh` — passed; `compositeScore=-3.4`, `errors=0`, matching the pre-Spec-168 fixed-seed baseline in `reports/turnperf-002-spec-167-baseline.md`.
- `pnpm -F @ludoforge/engine test:perf` — passed, 4/4 perf files; emitted known advisory warnings from older perf witnesses, but no failing tests.
- `pnpm turbo test` — passed from Turbo cache replay, 5/5 tasks; treated as supplemental because the direct profile, harness regression gate, and perf lane prove the measurement/report boundary.
- `pnpm run check:ticket-deps` — passed after Phase 5 archival for 0 active tickets and 2322 archived tickets.
