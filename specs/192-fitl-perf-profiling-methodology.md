# Spec 192 — FITL Plan-Primary Performance Recovery: Profiling Methodology and Baseline

**Status**: PROPOSED
**Priority**: High — the post-Spec-190 plan-primary architecture has tripled per-turn wall-clock on the FITL parity workload (32s → 96s/turn locally; 56s → 308s CI for `fitl-parity-drive.perf.test.ts`). Continued development on FITL (event-card lanes, slow-parity shards, policy-canaries, policy-preview-parity) pays that 3× tax on every PR; lane budgets had to be doubled or tripled across PR #280 just to land green. Recovery must be evidence-led, not speculation-led.
**Complexity**: S–M (this spec is methodology only; complexity of remediation specs to follow depends on findings)
**Date**: 2026-05-23
**Dependencies**:
- `archive/specs/186-advisory-turn-plan-architecture-core.md` (COMPLETED 2026-05-20) — plan IR, role selectors, `PlanExecutionState`, proposer/evaluator, execution controller, fallback ladder, plan trace.
- `archive/specs/187-whole-turn-posture-and-ally-rival-metadata.md` (COMPLETED 2026-05-21) — posture evaluators + relationship metadata.
- `archive/specs/188-fitl-four-faction-plan-migration-and-sequencing.md` (COMPLETED 2026-05-22) — FITL `us-baseline`/`arvn-baseline`/`nva-baseline`/`vc-baseline` authored as plan structures.
- `archive/specs/190-plan-primary-root-selection.md` (COMPLETED 2026-05-23) — the proximate cause of the 3× regression. `PolicyAgent.chooseActionSelectionDecision` short-circuits `evaluatePolicyMove` when the plan returns `status: selected`; FITL trajectories shift toward chooseOne-rich states.
- `archive/specs/191-plan-role-semantic-integrity.md` (COMPLETED 2026-05-23) — landed adjacent; correctness-only, not perf-changing.

**Trigger context**: PR #280 (`implemented-spec-191` branch) recovery session, 2026-05-23. Three rounds of `/fix-pr-ci` (commits `422e951b9`, `ea9b6e4a5`, `2176d8ec9`) had to widen perf budgets (fitl-parity-drive 240s → 700s; arvn-tournament per-test 180s → 600s; spec-140-bounded-termination per-test 20s → 240s; DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS 10min → 20min; policy-preview-parity lane 15min → 30min) and re-bless trajectory-driven fixtures to land CI. The fitl-parity-drive perf gate's own calibration block now records the 3× slowdown as intrinsic to plan-primary, with a partial CPU profile captured during the round-1 diagnosis. The user's mandate: "deep profiling should go first; we shouldn't assume hot paths nor bottlenecks; simpler solutions before bytecode/WASM expansion."

**Ticket namespace**: `192FITLPERFPROF` (proposed)

---

## 1. Goal

Define the methodology that turns the post-Spec-190 FITL perf regression into an evidence-led remediation roadmap. Concretely:

1. Build a reproducible measurement harness that captures CPU, allocation, per-decision-cost, and cache statistics across the six perf-relevant FITL workloads, with full replay-identity guarantees (Foundation #8).
2. Capture a categorized baseline at PR HEAD AND at the last-green pre-Spec-190 main worktree, separating Spec-190-intrinsic cost from inherited cost.
3. Produce `reports/fitl-perf-baseline-<date>.md` whose Findings section classifies each hot path under a structural remediation category, and whose Follow-up Specs section names the actual remediation specs with candidate numbers and Goal sentences.

This spec MUST NOT remediate. Remediation is the deliverable of the follow-up specs the report names.

## 2. Non-Goals

- **No remediation in this spec.** Per the user's "no assumptions" mandate, fix code lands only after the baseline report has surfaced what to fix. Follow-up specs created from the report's findings own the actual changes.
- **No bytecode/WASM expansion decision here.** The report classifies findings by remediation category (see §4.4); whether bytecode VM or WASM expansion is warranted for any category is a per-remediation decision left to the follow-up spec for that category.
- **No agent-decision regression on the table.** Spec 190's plan-primary trajectory is the new permanent baseline; agent decisions must replay byte-identical (Foundation #8). Approaches that change trajectory to gain perf are out of scope. See §6.
- **No cross-game extension.** Texas Hold'em and any future game's perf is out of scope; the regression is FITL-specific (plan-having profiles only — Spec 188 authored plan templates only for the four FITL baselines).
- **No edits to `packages/engine/src/` production code.** The measurement harness MAY add scripts under `packages/engine/scripts/perf-baseline/` and a fixture under `packages/engine/test/fixtures/perf/` if needed, plus a SINGLE env-gated diagnostic hook in agent or kernel decision boundary code (see §4.2, point 4). The hook is telemetry-only and zero-cost when the flag is off, matching the existing `ENGINE_OOM_TRACE` precedent in `policy-eval.ts`.

## 3. Context (verified against codebase, 2026-05-23)

### 3.1 Measured regression (this session)

- `test/perf/agents/fitl-parity-drive.perf.test.ts` CI wall-clock: **120s** (pre-Spec-190 calibration, commit `promoted-arvn-evolved`, 2026-05-22) → **308s** (PR #280 HEAD `422e951b9`). Ratio **2.57×**.
- Local 1-turn FITL parity workload (4 baselines + `verifyIncrementalHash: true`, seed 42, maxTurns=1): **32s** (last-green pre-Spec-190 main `775e93568`) → **96s** (PR #280 HEAD `422e951b9`). Ratio **3.00×**.
- Local seed-1002 FITL `spec-140-bounded-termination`: ~96s (single test under PR #280 HEAD; per-test budget formerly 20s, now 240s).
- Lanes whose budgets were widened to land green during PR #280 recovery:
  - `engine-perf` `perf` (`fitl-parity-drive`): 240s ceiling → 700s.
  - `engine-tests` `test (policy-canaries)` — `arvn-tournament-parallel-determinism`: 180s per-test → 600s.
  - `engine-tests` `test (policy-canaries)` — `arvn-tournament-wasm-equivalence`: retargeted to planless-control profile (Spec 190 short-circuit made the WASM score-row path unreachable on the production trajectory).
  - `engine-tests` `test (slow-parity-shard-a)` — `spec-140-bounded-termination`: 20s per-test → 240s.
  - `engine-tests` `test (slow-parity-shard-b)` — `diagnose-parity-runGame`: SEEDS 4→1, MAX_TURNS 200→50 to fit the 20-min file budget.
  - `engine-tests` `test (policy-preview-parity)`: lane workflow 15min → 30min; per-test 90s → 240s; 5 ARVN seed fixtures re-blessed.
  - `engine-tests` `test (slow-parity-shard-b)` — `drive-fingerprint-property`: retargeted from PolicyAgent baselines to `createSeededChoiceAgents` (Spec 190 trajectory no longer reached option-matrix-overlapping states).
  - `packages/engine/scripts/run-tests.mjs` `DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS`: 10min → 20min file budget.

### 3.2 Partial CPU profile (one workload, one turn, one run)

Captured during round-1 diagnosis of PR #280: `fitl-parity-drive`, maxTurns=1, 4 baselines, `verifyIncrementalHash: true`, PR HEAD `422e951b9`. Top self-time attributions:

| Function | File | Self-time |
|----------|------|-----------|
| `PolicyBytecodeVmUnsupportedError` (constructor) | `packages/engine/src/agents/policy-vm/vm.js:30` | ~23s combined across stacks |
| `digestEncodedDecisionStackFrame` | `packages/engine/src/kernel/zobrist.js:168` | 10.8s |
| `resolveVmFallbackFeature` | `packages/engine/src/agents/policy-evaluation-core.js:987` | 8.7s combined |
| `encodeDecisionStackFrameDigestInput` | `packages/engine/src/kernel/zobrist.js:150` | 4.4s |
| `PolicyEvaluationContext` (constructor) | `packages/engine/src/agents/policy-evaluation-core.js:212` | 4.8s combined |
| `zobristKey` | `packages/engine/src/kernel/zobrist.js:289` | 3.3s |
| `stableStringify` | `packages/engine/src/agents/policy-encoded-state-cache.js:3` | 1.2s |

The `PolicyBytecodeVmUnsupportedError` constructor self-time is the most surprising signal — an `Error` constructor that hot enough to dominate the profile means the throw rate is itself a hot path, with each throw capturing a stack trace at high frequency. Spec 154 (`policy-bytecode-emitter-evaluator-dispatch-completeness`) established the paired-contract: bytecode VM throws `PolicyBytecodeVmUnsupportedError` on unsupported feature kinds, caller's try/catch falls back to a complete-coverage TS evaluator. Under PR #280's trajectory, the throw rate appears to have grown because the plan-primary trajectory routes the agent through more chooseOne states whose preview drives hit features the bytecode VM doesn't support.

This profile is **one workload, one turn, one run**; it is NOT the baseline. It is suggestive evidence that informs methodology design, NOT findings the report will name. The baseline (§4.2) measures all six workloads, both at HEAD and at the pre-Spec-190 worktree, with 3-run medians.

### 3.3 Existing performance infrastructure (verified)

- **Bytecode VM** — `packages/engine/src/agents/policy-vm/`. Per Spec 154, currently dispatch-complete: throws `PolicyBytecodeVmUnsupportedError` on unsupported feature kinds; caller's try/catch falls back to a complete-coverage TS evaluator in `policy-evaluation-core.ts`.
- **Rust WASM policy VM** — `packages/engine-wasm/policy-vm/`. Production routes:
  - Score-row: `packages/engine/src/agents/policy-wasm-score-routing.ts` (called from `policy-eval.ts:830` inside `evaluatePolicyMoveCore`).
  - Preview-candidate-feature-row materialization (per Spec 145).
  - Preview-drive (per Spec 149 Phase 4).
- **Caches** — three relevant:
  - Preview-outcome cache — closure-bound `cache = new Map<string, PreviewOutcome>()` inside the `createPolicyPreviewRuntime` factory in `packages/engine/src/agents/policy-preview.ts` (around line 704). There is no `PolicyPreviewRuntime` class instance; remediation against this cache attacks the factory's closure scope, not a member field.
  - `PolicyEncodedStateCache` — `packages/engine/src/agents/policy-encoded-state-cache.ts`.
  - `PolicyEvalCacheBinding` — `packages/engine/src/agents/policy-evaluation-cache-binding.ts`; plumbed into `evaluatePolicyMoveCore` via `createPolicyEvalCacheBinding` (called from `policy-eval.ts:701`).
- **Zobrist incremental hashing** — `packages/engine/src/kernel/zobrist.ts` (per Spec 140 / determinism corpus).
- **Existing diagnostic scripts** — `packages/engine/scripts/profile-*.mjs` and `packages/engine/scripts/measure-*.mjs` already capture preview-drive metrics, per-card cost, 15-seed timing decompositions, and preview-pipeline hard targets (e.g., `profile-fitl-preview-drive.mjs`, `profile-fitl-arvn-15-seed-timing.mjs`, `measure-preview-pipeline-hard-target.mjs`, `measure-fitl-lane-cumulative-cost.mjs`). The new harness under `packages/engine/scripts/perf-baseline/` does NOT replace them — it adds the orchestrated multi-workload + HEAD-vs-pre-Spec-190 delta + category-driven findings surface those ad-hoc scripts don't provide. P1 deliverables MAY reuse logic from the existing scripts (output parsing, workload bootstrapping) but each new harness script is standalone.

### 3.4 Existing perf gates (workload selection corpus)

The harness's workload corpus (§4.1) is anchored on the existing perf gates and CI lanes that broke under PR #280, so the campaign measures exactly the surface the regression visibly affects:

- `test/perf/agents/fitl-parity-drive.perf.test.ts` (POLPREVDRIVE-006): 700s ceiling (post-Spec-190 recalibration).
- `Spec 145 preview pipeline performance`: non-blocking warning when current preview cost exceeds checked-in baseline.
- `172POLEVASTA-001 preview-drive static rebuild witness`: caps duplicate static rebuilds.
- `Spec 149 Phase 4 per-card reset witness`: 1800ms ceiling per card.
- `Spec 168 per-decision cost budget fixture`: structural JSON fixture for a one-card probe.

## 4. Methodology

### 4.1 Workload corpus

The measurement harness MUST exercise each of the following workloads. Each is pinned to a specific seed and maxTurns so that re-runs are replay-identical (Foundation #8):

| Workload key | Source test | Seed | maxTurns | Approx. PR-HEAD CI cost |
|--------------|-------------|------|----------|-------------------------|
| `parity-drive` | `test/perf/agents/fitl-parity-drive.perf.test.ts` | 42 | 10 | ~308s |
| `arvn-tournament-parallel` | `test/integration/arvn-tournament-parallel-determinism.test.ts` (serial half only — single-threaded for clean profile attribution) | (per-tournament seed set) | (per-tournament) | ~263s |
| `arvn-tournament-wasm-equivalence` | `test/integration/arvn-tournament-wasm-equivalence.test.ts` (post-PR-#280 planless-control retarget) | 1000 | 20 | ~217s/run × 2 |
| `policy-preview-parity-arvn-1008` | `test/architecture/policy-preview-inner-outcome-parity.test.ts`, seed 1008 (slowest of the 5 ARVN seeds) | 1008 | 1 | ~155s |
| `bounded-termination-1002` | `test/integration/spec-140-bounded-termination.test.ts`, seed 1002 | 1002 | 200 (test default; FITL games terminate earlier) | ~96s/single-test (locally measured) |
| `diagnose-parity-runGame-1001` | `test/integration/diagnose-parity-runGame.test.ts`, seed 1001 (post-PR-#280 reduction) | 1001 | 50 | ~700s projected (CI) |

These workloads collectively span:

- Bounded preview-driven parity drives (`parity-drive`).
- Tournament / worker-pool determinism (`arvn-tournament-parallel`).
- WASM-path equivalence (`arvn-tournament-wasm-equivalence`).
- chooseOne inner-preview outcome parity (`policy-preview-parity-arvn-1008`).
- Full bounded FITL games (`bounded-termination-1002`).
- Trace-wrapper diagnostic parity (`diagnose-parity-runGame-1001`).

If the baseline reveals all six workloads regress uniformly, the cost is per-decision (a per-state cost spike). If the regression is concentrated, the cost is workload-specific (a path the trajectory shift visits frequently in some lanes and rarely in others).

### 4.2 Per-workload measurement protocol

For each workload, capture:

1. **Wall-clock**: 3 runs, median + CV (coefficient of variation). This is the headline number. Uninstrumented (no profiling overhead).
2. **V8 CPU profile**: `node --cpu-prof --cpu-prof-dir=<dir> <command>`. Summary: top-30 self-time attribution by function + URL, plus top-30 total-time (self + children). One run, separate from the wall-clock measurement (cpu-prof adds 10-30% overhead).
3. **Heap allocation profile**: `node --prof <command>` produces `isolate-*.log`; `node --prof-process isolate-*.log` summarises. Top-N alloc-rate by function. One run, separate from wall-clock.
4. **Per-decision cost breakdown**: instrument the agent or kernel decision boundary to record per-microturn wall-clock. Output array of `(turnId, seatId, decisionKind, decisionKey, wallClockMs, candidateCount, sourceStateHash)`. Aggregate by `decisionKind` (actionSelection / chooseOne / chooseNStep / kernel) and report median / p50 / p95 / p99 / max.

   The instrumentation hook is env-gated: `process.env.ENGINE_PER_DECISION_PROFILE === '1'`. Pattern mirrors `policy-eval.ts`'s existing `ENGINE_OOM_TRACE` hook — zero cost when the flag is off, telemetry-only when on (no state mutation; see §6).
5. **Cache statistics**: where the engine exposes them, record hit/miss/object-hit/hash-hit rates per workload. The existing perf tests already emit lines like `SPEC149_PHASE4_PREVIEW_BATCH_COUNT_DRIFT previewDriveBatchCount=180 historicalBatchCount=232` and `172POLEVASTA_STATIC_REBUILD_WITNESS ... policyEncodedStateCacheObjectHit=929519 policyEncodedStateCacheHashHit=11467 policyEncodedStateCacheMiss=40`. Aggregate these into the per-workload summary.

Harness scripts under `packages/engine/scripts/perf-baseline/`:

- `capture-cpu-prof.mjs <workload>` — wraps `node --cpu-prof --cpu-prof-dir=<dir>`, runs workload, returns path to `.cpuprofile`.
- `summarize-cpu-prof.mjs <cpuprofile>` — reads V8 cpu-profile JSON; produces top-30 self-time table.
- `capture-alloc-prof.mjs <workload>` — wraps `node --prof` + `node --prof-process`; returns path to processed summary.
- `capture-per-decision-cost.mjs <workload>` — runs workload with `ENGINE_PER_DECISION_PROFILE=1`; collects emitted `[per-decision-profile]` lines; summarises.
- `run-baseline.mjs <workload-or-all>` — orchestrator: for each workload, runs steps 1–5; emits one summary JSON per workload at `reports/perf-baseline/<workload>-<HEAD-sha>.json`.

### 4.3 Baseline + delta capture

Each workload measured at:

- **HEAD**: current main / PR HEAD (post-Spec-190).
- **Pre-Spec-190 main**: `775e93568` (the last-green pre-Spec-190 main per PR #280's pre-existing-failure detection). Use `git worktree add /tmp/perf-baseline-pre-190 775e93568`, build the engine + engine-wasm in that worktree, and re-run each workload's capture there.

The delta separates trajectory-intrinsic cost from inherited cost per workload, categorised as:

- **Pure intrinsic**: cost rose only at HEAD; root cause is the Spec-190 trajectory shift (e.g., chooseOne states with more candidates).
- **Pure inherited**: cost was already present pre-Spec-190 and is unchanged at HEAD. Not a recovery target for this campaign, but flagged for future optimisation if the simple-fix headroom proves insufficient.
- **Mixed**: cost was present pre-Spec-190 and got *worse* at HEAD (the trajectory shift amplified an existing hot path).

Only intrinsic and mixed costs are recovery targets for this campaign. Pure-inherited costs are reported but not actioned — addressing them would benefit perf but is outside the trigger (Spec-190 recovery).

### 4.4 Categorisation rubric for findings

Each hot path identified by the baseline MUST be classified into one of these remediation categories. The rubric drives the report's per-finding follow-up-spec naming:

| Category | Description | Likely fix shape |
|----------|-------------|------------------|
| `Inline-fix` | Single function/file change; no architectural impact. Example: replace Error-throw with non-throwing return + sentinel value. | One PR change. Spec optional; may land as a ticket on an existing umbrella spec. |
| `Cache-warmup` | A side effect Spec 190 stripped (e.g., scalar-evaluator's preview-cache warmup) is reachable on the plan-selected branch with a deliberate, explicit invocation. | One spec; touches `chooseActionSelectionDecision` or equivalent. |
| `Allocator-reduction` | A hot allocation is poolable, hoistable, or eliminable. Example: hoist `PolicyEvaluationContext` construction out of an inner loop. | One spec; touches the constructor's call site or the allocation pattern. |
| `Dispatch-restructure` | A dispatch table (typed errors, paired contracts, fallback ladders) has a structural cost that benefits from restructuring. Example: negative-cache the `PolicyBytecodeVmUnsupportedError` verdict per `(decisionKey, featureKind)` so the throw fires once per pair, not once per evaluation. | One spec; constrained by Foundation #15 to keep Spec 154's paired-contract guarantees (no silent-default fallback). |
| `Hash/digest-optimization` | A Zobrist key/digest path is on a hot loop and would benefit from sharing partial state or avoiding redundant rehash. | One spec; touches `packages/engine/src/kernel/zobrist.ts`. Constrained by Foundation #8 to preserve key-stability (replay-identity). |
| `Bytecode-VM expansion` | A path the bytecode VM throws on (unsupported feature kind) accounts for material time. Expanding the bytecode VM's supported-feature set removes the throw. | One spec; touches `policy-vm/` and the emitter; extends Spec 154's dispatch-completeness inventory. |
| `WASM expansion` | A path where marshalling overhead is acceptable for the gain (already-applicable analogues: `policy-wasm-score-routing`, `policy-wasm-preview-drive`). | One spec; touches `engine-wasm/policy-vm/`. Highest implementation cost; only justified by explicit report evidence per §4.5. |
| `Spec-190-tune` | Configuration knobs in plan-primary (`previewBudget`, `chooseNBeamWidth`, `depthCap`, `strategy`) could reduce work without changing decisions. Trajectory hard-preserve is still satisfied because the *decisions* don't change — only the per-decision *budget* the preview uses to score them. | One spec; touches profile YAML in `data/games/fire-in-the-lake/92-agents.md` or `CompiledAgentPreviewConfig` defaults. Requires explicit determinism re-validation. |
| `Out-of-band-cost` | Measured cost is in non-engine code (test wrapper, dispatch instrumentation, runner). | Flagged in the report's appendix; not a recovery target for this campaign. |

### 4.5 Acceptance thresholds and stop criterion

- **Per-finding floor**: a follow-up spec is named in the report ONLY if its measured contribution to total workload wall-clock exceeds **5%** (or **2s absolute** if the workload is heavy). Findings below this threshold are noted in the report's appendix but do not name follow-up specs. This prevents spec sprawl from negligible micro-optimisations.
- **Aggregate per-workload projection**: the report SHOULD project, per workload, the expected aggregate reduction if all named follow-up specs land. The aggregate gain target is **50% reduction** (i.e., halving current wall-clock — halfway back to the pre-Spec-190 baseline). 
- **Escalation trigger**: if the projected simple-fix aggregate gain is **< 30%**, the report MUST flag this as "insufficient simple-fix headroom; bytecode/WASM expansion required" and explicitly recommend a `Bytecode-VM expansion` or `WASM expansion` remediation spec. This encodes the user's "simpler first" mandate as a numeric threshold, not a vibe.
- **Stop criterion**: the campaign closes when (a) cumulative remediation specs hit the aggregate target measured against PR HEAD, OR (b) two consecutive follow-up specs land with <10% individual gain (diminishing returns), whichever comes first. The next round of perf engineering then becomes a separate brainstorm with a fresh trigger.

## 5. Data flow / Process

```
Phase 1 (this spec): Methodology + harness implementation
    └→ scripts in packages/engine/scripts/perf-baseline/
    └→ env-gated `ENGINE_PER_DECISION_PROFILE` hook at agent/kernel decision boundary
    └→ trajectory-identity test (§6)

Phase 2 (this spec): Baseline + delta capture
    └→ harness runs on PR-HEAD and 775e93568 worktree for all 6 workloads
    └→ per-workload summary JSON written to reports/perf-baseline/

Phase 3 (this spec): Categorisation + report + follow-up spec naming
    └→ analyse per-workload summaries
    └→ produce reports/fitl-perf-baseline-YYYY-MM-DD.md with:
          • Verdict / scope / methodology recap
          • Per-workload measurement table (HEAD, pre-190, delta)
          • Findings table (hot path × category × lane scope × %-contribution × candidate follow-up spec)
          • Aggregate gain projection per workload
          • Stop-criterion evaluation
          • Follow-up specs section (names spec stubs with candidate numbers + Goal sentences)
          • Reassessment / closing section (measurement caveats, scope boundaries, verification artifact disposition)
    └→ this spec is then COMPLETED; follow-up specs are NEW work

Phase 4+ (out of scope for THIS spec): Remediation specs
    └→ created from report's Follow-up specs section
    └→ if ≥3 interdependent: write an IMPLEMENTATION-ORDER-fitl-perf-recovery-<date>.md
       index following the precedent in archive/specs/IMPLEMENTATION-ORDER-2026-05-23.md
```

## 6. Determinism and replay (Foundations #8, #16)

All measurements MUST be replay-identical from the seed. The harness MUST NOT use wall-clock for any seed-derived value; `performance.now()` is read-only telemetry that never feeds back into the state machine.

The per-decision instrumentation hook is subject to Foundation #11's scoped-internal-mutation contract: it appends to a private per-run array and emits via `process.stderr.write` at completion, never mutating caller-visible state and never observing private state before finalization.

The trajectory-hard-preserve constraint is concrete and enforceable: every workload's `trace.finalState.stateHash` at terminal MUST be identical when the instrumentation flag is on vs. off. Per Foundation #8 — if instrumentation perturbs the trajectory, the harness has bugged, and the entire baseline is invalidated until fixed. The trajectory-identity test (§9) is the proof obligation.

## 7. Edge cases

- **Workload-specific findings vs cross-workload findings**: hot paths surfacing in only one workload (e.g., `diagnose-parity-runGame`'s `traceRetention: 'full'` + per-decision hook overhead is unique to that lane's instrumentation) MUST be categorised by lane scope. The report's findings table includes a `Lane scope` column: `all-six`, one or more named workload keys, or `instrumentation-only`.
- **Profile-induced slowdown**: V8 `--cpu-prof` adds ~10–30% overhead; `--prof` adds less but skews timing. The wall-clock numbers in the harness are uninstrumented (only the workload runs); cpu-prof and alloc-prof captures are separate runs measured for attribution, not for headline wall-clock.
- **Local vs CI multipliers**: the existing `fitl-parity-drive.perf.test.ts` calibration block notes ~2.14× CI/local ratio for the preview-heavy ARVN workload. Other workloads may have different ratios. The harness reports BOTH local and CI cost per workload (CI cost via observed CI run, not recaptured locally), so the report does not project CI gains from local measurements via a blanket multiplier.
- **Measurement noise**: 3 runs, median + CV. If CV exceeds **15%** on any workload, increase to 5 runs OR flag the workload as "noisy — defer until CV stabilises" in the report. Noisy workloads do not contribute reliable %-contribution numbers to the aggregate gain projection.
- **Profile-induced cache warmth**: each cold-start run will have higher first-decision cost than steady-state. The harness reports per-decision cost both as raw and as warmed (skip the first N decisions where N = playerCount × 2). The report uses warmed numbers for steady-state attribution.
- **Worktree-build differences**: the pre-Spec-190 worktree build may produce subtly different `node_modules` if the lockfile drifted between the two SHAs. The harness verifies `pnpm-lock.yaml` parity between the two checkouts; if it differs, the report flags this as a measurement caveat.

## 8. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P1** | Measurement harness implementation + env-gated instrumentation | All `packages/engine/scripts/perf-baseline/` scripts runnable end-to-end on one workload (`parity-drive`); per-decision instrumentation env-gated; `pnpm -F @ludoforge/engine test:e2e:all` unaffected (no perf regression when flag off); trajectory-identity test (§9) passes for all six workloads. | M |
| **P2** | Baseline + delta capture | All six workloads in §4.1 captured at HEAD AND at `775e93568` worktree. Per-workload summary JSON checked into `reports/perf-baseline/`. Workloads with CV > 15% explicitly flagged. | S |
| **P3** | Findings categorisation + follow-up spec naming → `reports/fitl-perf-baseline-<date>.md` | Findings table populated with category, lane scope, %-of-workload contribution, candidate follow-up spec number + Goal sentence. Aggregate gain projection per workload. Stop-criterion + escalation-trigger evaluation. Report's Reassessment / closing section records measurement caveats and verification-artifact disposition. | M |

## 9. Test plan

- **Trajectory identity** (Foundation #8 proof): `packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts` — runs each workload with and without `ENGINE_PER_DECISION_PROFILE=1` and asserts `trace.finalState.stateHash` equality. Per Foundation #8 — the proof that telemetry-only instrumentation does not perturb determinism. Required acceptance gate for P1.
- **Harness end-to-end smoke**: `packages/engine/test/integration/perf-baseline-harness-smoke.test.ts` — runs each capture script against a trivial workload (one of the six, smallest seed and maxTurns) and asserts the output shape (JSON keys present, no errors). Per Foundation #16 — the harness's correctness is itself a proof obligation. Required acceptance gate for P1.
- **Foundation #15 compliance review**: P3's report MUST explicitly state per finding which Foundation principles it respects (especially #8, #11, #15). The report's authors check this before naming follow-up specs.
- **Replay identity**: each workload re-runnable from the seed; recorded in the harness output for reproducibility. (Foundation #8 corollary.)

## 10. Foundation alignment

| Foundation | How this spec respects it |
|---|---|
| **#1** Engine Agnosticism | The harness is FITL-scoped by workload selection (which seeds, which tests), but the instrumentation is game-agnostic — per-decision telemetry works for any GameDef. No game-specific code lands in the engine. |
| **#8** Determinism Is Sacred | All workloads pinned to seed + maxTurns; trajectory-identity test proves instrumentation is telemetry-only; the campaign's hard-preserve constraint is enforced before findings are named. |
| **#11** Immutability | Per-decision instrumentation appends to a private per-run array (scoped-internal-mutation); never mutates caller-visible state. |
| **#14** No Backwards Compatibility | The env-gated instrumentation is not a compat shim — it is a deliberate diagnostic surface paired with the `ENGINE_OOM_TRACE` pattern already in `policy-eval.ts`. |
| **#15** Architectural Completeness | Remediation is evidence-led, not speculation-led. The methodology forbids fix-without-measurement (§2 Non-Goals) and the rubric (§4.4) classifies findings into structural categories so each follow-up spec addresses a root cause, not a symptom. The escalation trigger (§4.5) prevents the campaign from quietly settling for incomplete recovery. |
| **#16** Testing as Proof | Perf gates and the harness's outputs are the test surface. The report itself is the proof of where the cost lives; the trajectory-identity test is the proof that the harness does not perturb its own measurements. |
| **#20** Preview Signal Integrity | This spec does NOT change preview-ref status semantics (`ready` / `unknown` / `hidden` / `stochastic` / `unresolved` / `failed` / `depth-capped` / `partial` outcome taxonomy is preserved). The campaign's hot paths centre on preview cache and bytecode-VM dispatch driven by preview features, but the trajectory-hard-preserve constraint (§6) precludes any change that would alter ready vs. non-ready boundaries. Remediation specs spawning from §4.4 categories that touch preview behavior (Cache-warmup, Spec-190-tune, Bytecode-VM expansion, WASM expansion) MUST re-validate F#20 compliance — specifically, that no preview ref's `status` is silently coerced and no `tiebreakAfterPreviewNoSignal` advisory boundary moves. |

## 11. Out of scope (named follow-on / sibling)

- **Remediation specs** — created from the report's Follow-up Specs section. Candidate categories (per §4.4) include Inline-fix, Cache-warmup, Allocator-reduction, Dispatch-restructure, Hash/digest-optimization, Bytecode-VM expansion, WASM expansion, Spec-190-tune. ACTUAL spec topics are determined by what the baseline finds, NOT by speculation in this spec.
- **Cross-game perf** (Texas Hold'em, future games) — out of scope for this campaign. Revisit if a non-FITL game ever lands plan-template profiles.
- **Profile-quality witnesses** — already governed by `packages/engine/test/policy-profile-quality/`; this spec does not extend that lane. The campaign's hard-preserve constraint is enforced by the trajectory-identity test, not by profile-quality regressions.
- **Bytecode VM / WASM expansion decision** — only proposed if §4.5's escalation trigger fires. The decision itself is a remediation spec, not this spec.
- **`archive/specs/IMPLEMENTATION-ORDER-fitl-perf-recovery-<date>.md`** — if the report names ≥ 3 interdependent follow-up specs, an ordering index is warranted (per the precedent in `archive/specs/IMPLEMENTATION-ORDER-2026-05-23.md`). The decision lands when the report's follow-up spec count is known; it is NOT created speculatively by this spec.
- **Lane budget reversion** — the lane budgets widened during PR #280 recovery (fitl-parity-drive 700s ceiling, arvn-tournament 600s per-test, spec-140-bounded-termination 240s per-test, DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS 20min, policy-preview-parity 30min, run-tests file budget 20min) MAY be tightened back toward pre-Spec-190 values as remediation specs land and reclaim measurable wall-clock. Reversion is naturally a per-remediation-spec acceptance criterion, not a separate spec; this spec just records the widened state as the recovery starting point.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-23:

- [`tickets/192FITLPERFPROF-001.md`](../tickets/192FITLPERFPROF-001.md) — Env-gated `ENGINE_PER_DECISION_PROFILE` hook + trajectory-identity test (covers §4.2 step 4 + §6 + §9)
- [`tickets/192FITLPERFPROF-002.md`](../tickets/192FITLPERFPROF-002.md) — Measurement harness scripts + harness-smoke test (covers §4.2 steps 1–3, 5 + §9)
- [`tickets/192FITLPERFPROF-003.md`](../tickets/192FITLPERFPROF-003.md) — Baseline + delta capture across PR-HEAD and `775e93568` worktree (covers §4.3)
- [`tickets/192FITLPERFPROF-004.md`](../tickets/192FITLPERFPROF-004.md) — Findings categorisation + follow-up spec naming → `reports/fitl-perf-baseline-<date>.md` (covers §4.4, §4.5, §5 Phase 3)

P1 (§8) is split between -001 and -002 because the instrumentation hook is a separate, smaller-scope deliverable from the harness scripts and benefits from independent review.
