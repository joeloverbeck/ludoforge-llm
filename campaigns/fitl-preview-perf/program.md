# Campaign: fitl-preview-perf

## Objective

Minimize the wall-clock cost of the post-spec-145 bounded synthetic-completion
preview pipeline on a deterministic FITL ARVN action-selection corpus. Recent
ticket series `145PREVCOMP-001..006` (commits `1dde48e5`..`1ad19e07`) restored
candidate-level preview discrimination but currently regresses the same
50-sample ARVN corpus from ~12.06s (preview disabled) to ~87.26s (preview
enabled, `agentGuided` completion, default `topK=4`, default `depthCap=8`) — a
7.23× slowdown. That cost is incompatible with both routine simulator runs and
agent-evolution campaigns.

**Lower is better.** Reduce `previewOn_totalMs_ms` while keeping the
preview-disabled path measurably unchanged (Goodhart guard).

The preview-enabled path is the production path that the engine must run on
every action-selection microturn for any FITL profile that lists
`preferProjectedSelfMargin` in its considerations (us-baseline, arvn-baseline,
arvn-evolved, nva-baseline) — so the cost reduction directly enables faction
agent evolution and tractable simulator runs going forward.

## Primary Metric

`previewOn_totalMs_ms` — wall time to drive `runGame` until 50 ARVN
action-selection microturns have been sampled, with `arvn-evolved`'s preview
configured for the production target (`mode: exactWorld`, `completion:
agentGuided`, `topK=4`, `completionDepthCap=8`). Lower is better.
Measurements within `NOISE_TOLERANCE` (1%) are equal.

The corpus is the spec-145 perf harness corpus (seed=1000, maxTurns=200,
playerCount=4, evolvedSeat=arvn, sampleSize=50; seatProfiles us-baseline /
arvn-evolved / nva-baseline / vc-baseline). Same fixture as
`packages/engine/test/perf/agents/preview-pipeline.perf.test.ts`.

### Targets

- **Hard target (campaign success)**: `previewOn_totalMs_ms` ≤ `25600`
  (spec-145 stated budget = `baseline.totalMs * 1.05 + 30 * baseline.candidateBudget`
  = `11486.28 * 1.05 + 30 * 433` = `25,050.6 + 12,060.6` ≈ `25,610`). When this
  threshold is reached the campaign halts cleanly.
- **Soft target (overhead acceptable)**: `previewOn_totalMs_ms` ≤
  `1.5 × previewOff_totalMs_ms` (≈18s). Recorded in musings when first hit; not
  a halting condition.
- **Floor (theoretical lower bound)**: `previewOff_totalMs_ms` (~12s) — preview
  cost cannot be negative; experiments approaching this floor will plateau.

## Goodhart Guard (Watchdog)

`previewOff_totalMs_ms` — wall time over the same corpus with `arvn-evolved`'s
preview reconfigured to `mode: disabled` in-memory by the benchmark runner.
The static disabled baseline `BASELINE_OFF_MS = 12060` is sourced from
`packages/engine/test/perf/agents/preview-pipeline.baseline.json` (`totalMs`
adjusted upward to a per-environment safety band — see WATCHDOG_OFF_MAX_MS
below) and Codex's reported preview-disabled measurement.

An experiment that improves `previewOn_totalMs_ms` only by silently slowing
`previewOff_totalMs_ms` is not a real win. The watchdog **REJECTS** any
experiment whose `previewOff_totalMs_ms > WATCHDOG_OFF_MAX_MS`
(default `12660` = `BASELINE_OFF_MS * 1.05`).

## Secondary Metrics (diagnostic, not for accept/reject)

- `previewOn_state_hash` / `previewOff_state_hash` — determinism witnesses
- `candidateBudget` / `sampledActionSelectionCount` — corpus shape (must equal
  the baseline corpus shape; structural deviation aborts the harness)
- `previewOn_perCandidate_ms` / `previewOff_perCandidate_ms` — derived
- `previewOn_mad_ms` / `previewOn_mad_pct` — measurement noise
- `previewDriveDepth_p50` / `previewDriveDepth_p95` / `previewDriveDepth_max`
- `previewGatedCount_total` / `previewGatedCount_per_microturn_p50`
- `previewFailureReason_top3` — top three driver-failure reasons by count
- `previewOutcomeKind_counts` — distribution over {ready, stochastic, unknown}
- `previewUnknownReason_counts` — distribution over {gated, depthCap, failed,
  random, unresolved}
- `compilation_ms` — one-time spec compilation
- `build_ms` — engine TS build
- `gate_ms` — focused/full test gate
- `total_harness_ms` — end-to-end harness wall time

## Mutable System

The campaign begins in **Tier 1** (surgical) and auto-promotes to **Tier 2**
(wide) only when Tier-1 ceiling conditions are met (see Phase Transition
Rule below).

### Tier 1 — Preview/Agent surface

#### Production code

- `packages/engine/src/agents/policy-preview.ts` — driver loop, picker,
  finalizePreview, cache, runtime construction
- `packages/engine/src/agents/policy-evaluation-core.ts` — top-K gate,
  candidate scoring split, preview-augmented score path
- `packages/engine/src/agents/policy-runtime.ts` — preview config plumbing
  from compiled profile to runtime
- `packages/engine/src/agents/completion-guidance-choice.ts` —
  `selectBestCompletionChooseOneValue`, `buildCompletionChooseCallback`
  (the agentGuided picker's hot path)
- `packages/engine/src/agents/completion-guidance-eval.ts` — completion-scope
  considerations evaluation
- `packages/engine/src/agents/policy-diagnostics.ts` — trace fields invoked
  by the driver and gate (`previewDriveDepth`, `previewGatedCount`,
  `previewCompletionPolicy`, etc.)
- `packages/engine/src/agents/policy-eval.ts` — only the entrypoints called
  by the preview path; broader changes belong in Tier 2

#### Tests

- `packages/engine/test/unit/agents/**` — preview unit tests
- `packages/engine/test/integration/agents/**` — driver conformance witnesses,
  per-policy determinism witness, top-K gate witnesses, diagnostics witnesses
- `packages/engine/test/perf/agents/**` — perf test, baseline JSON,
  topK-floor derivation script

### Tier 2 — Wide engine surface (auto-promoted)

Adds, in addition to Tier 1:

- `packages/engine/src/kernel/**` — `applyPublishedDecision`, `applyMove`,
  `publishMicroturn`, runtime construction (`createGameDefRuntime`,
  `buildAdjacencyGraph`, `buildRuntimeTableIndex`), state-hash, action/effect
  evaluation, terminal/legal-moves
- `packages/engine/src/sim/**` — simulator, delta computation
- `packages/engine/src/cnl/**` — compilation pipeline (one-time cost during
  benchmark; affects `compilation_ms`)
- `packages/engine/test/**` — any test that requires updating to match a Tier-2
  production change
- `packages/engine/schemas/**` — when a Tier-2 production type change requires
  a schema update

### Profiling instrumentation policy

**Opt-in profiling instrumentation may be added at any depth.** This includes
new perf-profiler entries inside the preview driver loop (per-candidate
`publishMicroturn` cost, picker cost, `applyPublishedDecision` cost,
`derivePlayerObservation` cost, `metricCache` hit/miss). Requirements:

1. Zero overhead when `profiler` is undefined (single guard per instrumentation
   point).
2. F#11 / F#8 preserved — no determinism, state, or move-enumeration impact.
3. Permanent: profiling commits land separately from optimization experiments
   so they survive reverts. Use commit prefix `infra: profiler — <site>`.

**Never guess bottlenecks. Always profile first.** Tier-2 promotion is most
useful after profiling shows the cost lives below `policy-preview.ts` (e.g., in
`applyPublishedDecision` or `publishMicroturn`).

### Profiling tool hierarchy

1. **`perf record` / `perf report` (preferred)**: unbiased system-level CPU
   sampling. Run `perf record -g node packages/.../run-benchmark.mjs --mode on`
   then `perf report --sort=dso,symbol`.
2. **Manual `profiler` instrumentation (fallback)**: `perfStart` / `perfEnd`
   hooks for per-invocation timing inside known hot functions.

### Radical changes policy

**Radical structural changes are encouraged within the active tier** as long as:

- Aligned with `docs/FOUNDATIONS.md` (F#1, F#5, F#8, F#10, F#11, F#19 in
  particular — see "Constraints" below).
- Backed by profiling evidence (measured bottleneck, not guesswork).
- Determinism preserved — same seed + same inputs = identical
  `previewOn_state_hash` across the 3 preview-on runs.
- Watchdog preserved — `previewOff_totalMs_ms` does not degrade beyond
  `WATCHDOG_OFF_MAX_MS`.
- All gate tests pass (Tier 1: focused agents subset + perf test; Tier 2:
  full `pnpm turbo test`).

The test gate is a correctness gate, not a change-avoidance gate. Tests may be
updated to match new APIs/behavior, but never weakened, deleted without
replacement, or skipped.

## Immutable System

- **All `data/games/**` files** including `data/games/fire-in-the-lake/92-agents.md`
  (the `arvn-evolved` profile and its `preview` block). The `agentGuided`
  completion target is enforced by the campaign benchmark via an in-memory
  override constructed at agent instantiation; the YAML stays untouched.
- **`packages/engine/test/perf/agents/preview-pipeline.baseline.json`** — the
  static disabled baseline that the perf test compares against. Mutating this
  is metric gaming.
- **`packages/engine/test/perf/agents/preview-pipeline.perf.test.ts`** — the
  shipped CI perf test. Its assertions, corpus binding, and threshold formula
  are the public contract this campaign optimizes against and may not be
  weakened. (Implementation refactors that preserve every assertion verbatim
  are permitted in Tier 1; the assertions and corpus shape are immutable.)
- **`docs/FOUNDATIONS.md`** — read for guidance, never modify.
- **`package.json`, `pnpm-lock.yaml`, `tsconfig*.json`, `turbo.json`** and all
  build config.
- **Everything under `packages/runner/`** — the UI runner is out of scope.
- **`docs/agent-dsl-cookbook.md`** — documentation of preview semantics; if
  semantics change in code, the cookbook update is a separate spec-driven
  follow-up, not part of this campaign.

## Constraints

1. **Determinism (F#8)**: every preview-on run must produce identical
   `previewOn_state_hash` across the 3 harness runs; preview-off runs must
   match the disabled-path state hash. Verified by harness.
2. **Correctness**: gate tests must pass. Tests are mutable when production
   API/behavior changes, but assertions cannot be weakened.
3. **Engine agnosticism (F#1)**: no game-specific code in `policy-preview.ts`,
   `policy-evaluation-core.ts`, kernel, or sim. The driver consumes
   kernel-published microturn shapes only.
4. **Bounded computation (F#10)**: `K_PREVIEW_DEPTH` and `K_PREVIEW_TOPK`
   remain explicit, finite bounds. No general recursion or unbounded loops.
5. **Immutability (F#11)**: state transitions return new objects. Internal
   transient mutation with final freeze is acceptable if it improves
   performance and the external contract is preserved.
6. **One Rules Protocol (F#5)**: the driver invokes the same
   `applyPublishedDecision` / `publishMicroturn` the simulator uses. No
   alternate legality oracle.
7. **Atomic decision granularity (F#19)**: every microturn the driver consumes
   is atomic and kernel-published. No client-visible compound shape.
8. **No new runtime dependencies.**
9. **No `data/games/**` changes.**
10. **No weakening of the shipped perf test or its baseline JSON.**
11. **Watchdog inviolate**: `previewOff_totalMs_ms ≤ WATCHDOG_OFF_MAX_MS`.

## Accept/Reject Logic

```
IF harness fails (BUILD_FAIL, GATE_FAIL, RUNNER_FAIL,
                  CORPUS_SHAPE_FAIL, DETERMINISM_FAIL_ON,
                  DETERMINISM_FAIL_OFF, WATCHDOG_FAIL):
    REJECT (allow up to 3 trivial-fix retries per experiment;
            scope-violation, profile-coupled-test, fixture-resync rejects
            do not count against the 3-retry CRASH limit)

IF previewOn_totalMs_ms decreased by >NOISE_TOLERANCE (1%):
    IF previewOff_totalMs_ms > WATCHDOG_OFF_MAX_MS:
        REJECT (WATCHDOG_FAIL — preview-disabled path slowed; possible Goodhart)
    IF improvement >MAX_IMPROVEMENT_PCT (30%):
        FLAG as suspicious — verify determinism + watchdog + corpus shape
        IF all three preserved: ACCEPT (status SUSPICIOUS_ACCEPT)
        ELSE: REJECT
    ELSE:
        ACCEPT

IF previewOn_totalMs_ms within NOISE_TOLERANCE of best:
    IF previewOff_totalMs_ms > WATCHDOG_OFF_MAX_MS:
        REJECT
    IF lines_delta < 0 (simplification):
        ACCEPT
    ELSE:
        REJECT

IF previewOn_totalMs_ms increased by >NOISE_TOLERANCE:
    REJECT

IF previewOn_totalMs_ms ≤ 25610 (HARD TARGET):
    log target-hit in musings; halt loop after current iteration completes
```

### Hard target halt

When `previewOn_totalMs_ms ≤ HARD_TARGET_MS` (default `25610`) is reached on
an ACCEPT, append `**TARGET HIT**: previewOn=<value>ms ≤ 25610ms` to musings
and exit the loop gracefully. Treat this as MAX_ITERATIONS reached for the
"After Campaign Completes" flow.

### Soft target acknowledgment

The first time `previewOn_totalMs_ms ≤ 1.5 × previewOff_totalMs_ms` (≈18s)
is observed on an ACCEPT, append `**SOFT TARGET HIT**: previewOn / previewOff
= <ratio>` to musings. Do not halt.

## Phase Transition Rule (Tier 1 → Tier 2)

Promote from Tier 1 to Tier 2 when EITHER condition holds:

- **Condition A — strategy ceiling**: `CEILING_THRESHOLD` (10) consecutive
  non-accept experiments after exhausting `normal`, `combine`, `ablation`, and
  `radical` strategies on Tier 1.
- **Condition B — diminishing returns**: best `previewOn_totalMs_ms` is still
  more than `1.4 × HARD_TARGET_MS` (~36s) after `25` accepted experiments
  AND no accept in the last `5` experiments improved by more than `2%`.

### Tier 2 promotion procedure

1. Append to musings: `**TIER 2 PROMOTION**: <reason>. Current best
   previewOn=<value>ms, target=25610ms.`
2. Update the harness gate from focused (`node --test` on agents subset + perf
   test) to full (`pnpm turbo test`). The harness reads `seed-tier.txt` to
   decide gate scope.
3. Re-measure baseline at HEAD with the new gate scope (the metric should not
   change, but full gate may surface latent breakage). Record a `tier-2-baseline`
   row in `results.tsv` with status `BASELINE`.
4. Reset `consecutive_rejects = 0`, `strategy = "normal"`, refresh UCB1 with
   Tier-2 categories enabled.
5. Append to `seed-tier.txt`: `tier-2`.

Tier 2 cannot be demoted to Tier 1.

## Root Causes to Seed

Initial hypothesis queue, derived from spec-145 design + perf-test corpus
shape (50 ARVN action-selection samples, ~433 candidates total ⇒ ~8.7
candidates/microturn, default topK=4 ⇒ ~4 candidates × ~8 driver depth ×
50 microturns ≈ 1,600 inner microturn resolutions). **Verify with profiling
data before acting.**

1. **Per-candidate `publishMicroturn` recomputation**: the driver calls
   `publishMicroturn(def, state, runtime)` once before the candidate's
   `applyMove`, then again on every loop iteration after each
   `applyPublishedDecision`. With ~4 candidates × ~8 depth × 50 microturns,
   that's ~1,600 `publishMicroturn` calls. Each rebuilds microturn metadata
   (legal actions, decision context, viability classification). Investigate
   incremental publication / caching keyed on `(state.stateHash, seatId)`.
2. **`agentGuided` picker repeats considerations evaluation per inner
   microturn**: `selectBestCompletionChooseOneValue` and the chooseN callback
   evaluate the profile's `scopes: [completion]` considerations on every
   inner-microturn pick — same path as the live agent at `chooseFrontier`.
   No cross-pick caching exists. Investigate per-state caching of completion
   considerations within a single drive.
3. **`derivePlayerObservation` per finalized candidate**: `finalizePreview`
   calls `deps.derivePlayerObservation(input.def, result.state, input.playerId)`
   for every ready/stochastic outcome. Observation reconstruction is non-trivial
   for FITL (hidden-info zones, sampling). Investigate caching keyed on
   `(result.state.stateHash, playerId)` or skipping when `victorySurface`
   resolution doesn't need it.
4. **Top-K gate suppression vs. cost-of-suppression**: with `candidateBudget=433
   / 50 = 8.7` median candidates and `topK=4`, the gate suppresses ~54% of
   candidates. But the suppressed candidates still go through the move-only
   scoring + viability classification before being marked gated. Investigate
   whether the gate can be applied earlier (before viability classification),
   or whether `topK` should be a structural choice (e.g., dynamic per-microturn
   based on score-gap) — without changing the YAML default.
5. **Per-candidate runtime forking / `surfaceContext` rebuild**: every call to
   `createPolicyPreviewRuntime` reconstructs `seatResolutionIndex`,
   `surfaceContext`, and the closure-captured `cache`. If the policy-evaluation
   loop creates a fresh preview runtime per candidate (verify), that cost is
   amortized poorly. Investigate runtime pooling within an evaluation pass.
6. **`applyPublishedDecision` allocation pressure inside the driver inner loop**:
   each call returns a new state via immutable spread. With ~1,600 inner
   resolutions, this dominates allocator/GC. Investigate transient mutation
   inside `applyPublishedDecision` with a final freeze (Tier 2 only — kernel
   change).
7. **`metricCache` not populated across candidates that share a post-drive state
   hash**: every preview outcome carries its own `metricCache: new Map()`.
   Two candidates that complete to the same state would benefit from cross-
   candidate metric memoization. Investigate a runtime-scoped metric cache.
8. **`buildPolicyVictorySurface` cost**: lazily resolved via
   `resolveVictorySurface` in `surfaceContext`, called when
   `preview.victory.currentMargin.self` is first dereferenced. With `agentGuided`
   completion, this fires for nearly every previewed candidate. Investigate
   whether the surface can be computed incrementally as the driver advances.
9. **`scopes: [completion]` evaluation overhead in `agentGuided` mode**: the
   completion-scope considerations are AST-evaluated per inner microturn pick.
   `policy-expr.ts` AST evaluation may have hidden allocation. Investigate
   compiling the completion AST to a closed function once per profile load.
10. **`applyMove` being called with `advanceToDecisionPoint: true` then catch-
    falling-back to `applyPublishedDecision`**: the driver's first step
    structure (`policy-preview.ts:691-706`) tries `applyMove` and falls back
    on throw. The throw path is non-trivial and may be the common path for
    incomplete action headers. Investigate whether the action-selection path
    should call `applyPublishedDecision` directly (skip the `applyMove` try).

These are hypotheses. The OBSERVE phase MUST read actual profiling data
(per-function breakdown from harness output, perf-record samples) before
forming experiment hypotheses.

## Experiment Categories

### Tier 1 categories

- `preview-driver` — driver loop logic, picker logic, `driveSyntheticCompletion`
  flow, finalizePreview translation
- `preview-gating` — top-K gate, depthCap behavior, gating heuristics, early-
  exit gates inside the driver
- `agent-lookahead` — `agentGuided` picker hot path, completion-guidance
  evaluation, per-pick caching
- `caching` — runtime/observation/metric caches, surface context reuse
- `allocation` — reducing object allocation in the driver / picker path
  (object pooling, reusing buffers, reducing spread copies)
- `hot-loop` — inner loop micro-optimizations (early exits, short-circuit,
  branch ordering) inside `policy-preview.ts` / `policy-evaluation-core.ts` /
  `completion-guidance-*.ts`
- `algorithm` — better data structures / lookup strategies in the
  agent-tier surface
- `profiling-infra` — per-function instrumentation in the agent-tier surface
  (must pair with an actual production code change in the same experiment;
  infra-only commits land outside the experiment cycle as `infra:` prefix)

### Tier 2 categories (unlocked on promotion)

- `kernel` — `applyPublishedDecision`, `applyMove`, `publishMicroturn`,
  `createGameDefRuntime`, runtime structure construction
- `sim` — simulator-level changes (delta computation, profiler integration)
- `compilation` — one-time spec compilation speedups (only relevant if
  `compilation_ms` becomes a non-trivial fraction of total)
- `trigger-dispatch` — trigger matching optimization (FITL has ~100+ triggers;
  driver may invoke trigger-bearing actions inside the inner loop)
- `combined` — multi-category, multi-tier changes

### Special rules for categories

- **`profiling-infra` experiments** MUST be paired with a production code
  change that uses the new measurement capability AND show a measurable
  improvement. Pure infra commits go through the `infra:` prefix path,
  outside the experiment loop.
- All production code changes must pass the active-tier gate.
- During OBSERVE, read the per-function breakdown from the latest harness
  output AND `perf record` samples (when available) to guide hypothesis
  generation.

## Thresholds

```
NOISE_TOLERANCE = 0.01           # 1% — measurements within 1% are equal
ABORT_THRESHOLD = 0.05           # reject if 5% slower than best (mid-experiment)
PLATEAU_THRESHOLD = 5            # consecutive rejects before strategy shift
MAX_IMPROVEMENT_PCT = 30         # flag gains >30% as suspicious
REGRESSION_CHECK_INTERVAL = 5    # re-verify baseline every 5 accepts
PIVOT_CHECK_INTERVAL = 10        # PROCEED/REFINE/PIVOT every 10 experiments
ZERO_EFFECT_THRESHOLD = 3        # consecutive zero-effect → mandatory diagnostic
CEILING_THRESHOLD = 10           # consecutive non-accepts before tier promotion
HARD_TARGET_MS = 25610           # halt loop when previewOn_totalMs_ms ≤ this
WATCHDOG_OFF_MAX_MS = 12660      # REJECT if previewOff_totalMs_ms exceeds this
SOFT_TARGET_RATIO = 1.5          # soft acknowledgment threshold (on/off ratio)
```

## Configuration

```
HARNESS_RUNS = 3                 # 3 preview-on runs per experiment, take median
HARNESS_OFF_RUNS = 1             # 1 watchdog (preview-disabled) run per experiment
HARNESS_SEEDS = 1                # corpus is single-seed (1000) by spec-145 design
meta_improvement = false         # meta-loop disabled
METRIC_DIRECTION = lower-is-better
PRIMARY_METRIC_KEY = previewOn_totalMs_ms
WATCHDOG_METRIC_KEY = previewOff_totalMs_ms
MAX_ITERATIONS = 60              # graceful halt
INITIAL_SEED_TIER = tier-1
CHECKS_TIMEOUT = 180             # focused gate fits well under this; full gate may approach
```

## OBSERVE Phase Protocol (profiling-first)

During OBSERVE the agent MUST:

1. Read the latest `run.log.runner.*` JSON output for per-microturn
   distribution (`previewDriveDepth_p50/p95/max`, `previewGatedCount`,
   `previewFailureReason_top3`, `previewOutcomeKind_counts`).
2. Read `perf record` output if present (`perf.data` / `perf.report.txt`).
3. Identify the function consuming the most time. For Tier 1 the candidate
   list is: `driveSyntheticCompletion`, `pickInnerDecision` (greedy/agentGuided
   branches), `applyPublishedDecision` (called from driver),
   `publishMicroturn` (called from driver), `selectBestCompletionChooseOneValue`,
   `derivePlayerObservation`, `evaluatePolicyMove` (preview-augmented branch).
4. Read the source of that function before forming a hypothesis.
5. Formulate a hypothesis about WHY it is slow, not just THAT it is slow.
6. Propose an optimization that targets the measured bottleneck.
7. Never optimize a function that is not in the top 3 by time consumption
   unless there is a specific algorithmic insight that applies.

The agent SHOULD also:

- Check `results.tsv` and `lessons.jsonl` for patterns in what has worked
- Cross-reference `campaigns/lessons-global.jsonl` for lessons applicable to
  preview/agent paths from prior campaigns (especially `texas-perf-optimization`
  and `texas-perf-optimization-2` lessons about V8 deopt patterns,
  `applyPublishedDecision` / `legalMoves` cost, observation/runtime caching,
  and hidden-class monomorphism)
- Look for near-miss stashes (`git stash list`) that could be combined
- Consider whether the bottleneck is I/O, allocation, computation, or
  architecture — guides category selection and tier-promotion judgement

## Determinism Verification

The harness verifies `previewOn_state_hash` across the 3 preview-on runs and
verifies the single `previewOff_state_hash` matches the static disabled-path
expected hash (captured by the first benchmark run on baseline; recorded in
`expected-disabled-state-hash.txt` after Phase 1 baseline). Any divergence is
a `DETERMINISM_FAIL_ON` or `DETERMINISM_FAIL_OFF`, which REJECTs the
experiment.

The corpus shape (50 ARVN action-selection samples, ≥ 1 candidate budget) is
also verified per run; a deviation is `CORPUS_SHAPE_FAIL`. This guards
against an experiment that accidentally changes `chooseDecision` so that
fewer than 50 ARVN action-selection microturns are reachable within
`maxTurns=200`.

## Autonomy Directive

Once the loop begins, run indefinitely up to `MAX_ITERATIONS` (60) or until
`previewOn_totalMs_ms ≤ HARD_TARGET_MS` (25610). Do NOT ask for permission
to continue. Do NOT stop when easy ideas run out — re-read profiling data,
combine near-misses, try radical alternatives, consult global lessons,
promote to Tier 2 when ceiling conditions hit.

The loop runs until externally interrupted, target-hit, or MAX_ITERATIONS.
