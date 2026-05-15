# 173DEEPPRVCOST-001: Phase 0 — Per-seed × per-microturn-class perf witness

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — scripts/ + reports/ only
**Deps**: `specs/173-deep-preview-drive-cost-reduction.md`

## Problem

The post-spec-172 / post-spec-167 15-seed `fitl-arvn-agent-evolution` harness baseline (`reports/fitl-arvn-15-seed-harness-wall-times-2026-05-15.md`) measures a ~6.5× per-decision spread across the seed tier — seed `1000` runs at ~66 ms/decision while seed `1005` runs at ~444 ms/decision (185.6 s wall over 418 decisions). Decision count alone does not explain the spread: seed `1010` produces 325 decisions at ~93 ms/decision while seed `1008` produces only 166 decisions at ~418 ms/decision.

The dominant axis must be *decision class composition*, not raw count, but no per-microturn-class profile exists on the post-spec-172 baseline. Spec 172's trigger report (`reports/fitl-arvn-policy-eval-context-rebuild-scaling-2026-05-14.md`) was captured *pre*-fix; the four cache seams it identified are now closed, but the residual hot axes have not been measured. Without that evidence, Phase 1 (witness-driven hot-path closure pass per spec §4.2) cannot scope ticket slices — every slice MUST cite a Phase 0 witness axis it closes, and there is no rollup to cite.

This ticket adds the missing measurement. It produces a per-seed × per-microturn-class perf rollup against the 15-seed corpus that names the dominant hot self-time axes on the current baseline, gating the Phase 1 ticket set's scope decisions.

## Assumption Reassessment (2026-05-15)

1. **Spec 172 caches are active in the baseline.** Confirmed — `git log --oneline -5` shows `b1f95ca8f Merge pull request #260 from joeloverbeck/implemented-spec-172` followed by `dd79c500f Implemented 172POLEVASTA-006`. The `reports/fitl-arvn-15-seed-harness-wall-times-2026-05-15.md` measurement was taken on this commit. `WeakMap<GameDef, EncodedStateLayout>` (spec 172 §4.1), `getFeatureTable` (§4.2), `policyBytecodeCache` on `GameDefRuntime` (§4.3), and `policyEncodedStateCache` on `GameDefRuntime` (§4.4) are all in place per `packages/engine/src/agents/policy-evaluation-core.ts`, `packages/engine/src/cnl/policy-bytecode/feature-table.ts`, `packages/engine/src/kernel/gamedef-runtime.ts`, and the new `packages/engine/src/agents/policy-encoded-state-cache.ts`.
2. **Spec 167 worker pool + WASM bootstrap + GameDef cache are active.** Confirmed — the trigger report records `WASM policy runtime: enabled`, `GameDef cache: hit`, `Seed concurrency: 8`. `concurrency=8` is the default in `harness.sh` per spec 167 §3.4.
3. **Existing perf-witness scripts exist as extension points.** Confirmed — `ls packages/engine/scripts/` shows `profile-fitl-preview-drive.mjs`, `profile-fitl-preview-drive-metrics.mjs`, and `campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs`. Either the existing same-seam profiler can be extended for multi-seed × per-class telemetry, or a sibling script can be added under the same `packages/engine/scripts/` directory.
4. **The deep `continuedDeepening` / `deep1024` route is TS-only.** Confirmed via inspection of `packages/engine/src/agents/policy-wasm-score-routing.ts:1-80` and `packages/engine/src/agents/policy-wasm-production-preview-drive.js`. The WASM route covers production score rows and partial preview-drive batches, but fails-closed (`unsupported`) for complex preview configs used by `arvn-evolved`. This means the witness's slow-tier seeds will profile predominantly through the TS `driveSyntheticCompletion` path, which is exactly the regime Phase 1 must measure.
5. **Determinism gates exist and pass on the current baseline.** Confirmed via the spec 167 / 172 archived ticket Outcomes — `spec-140-replay-identity`, `forked-vs-fresh-runtime-parity`, `zobrist-incremental-parity-fitl-seed-42`/`-seed-123`, and `policy-bytecode-equivalence*` are the load-bearing invariants. The witness MUST NOT perturb them (it is a measurement-only script, no engine code changes).

No mismatches against the spec. The spec's §2 codebase claims hold as of `2026-05-15`.

## Architecture Check

1. **Extend existing infrastructure rather than invent new tooling.** The `profile-fitl-preview-drive*.mjs` family is the established pattern (used through spec 150 and spec 172). Either extending the existing profiler (preferred when the changes are additive — adding per-decision telemetry capture without altering the same-seam behavior) or adding a sibling script (preferred when the multi-seed × per-class shape diverges from the same-seam profiler enough to warrant a clean separation) is acceptable. The spec §4.1 explicitly authorizes either path.
2. **Engine-agnostic boundary is preserved.** Per-decision telemetry uses kernel-published `actionId` family labels (e.g., `train-operation`, `place-marker`, `event-decision`, `pass`) drawn from the existing trace event stream — no FITL-specific identifier hardcoded in the witness mechanism. The labels happen to be FITL-specific in *content* because the spec under measurement is FITL, but the *mechanism* is generic and would work against any GameDef. Foundation #1 (Engine Agnosticism) preserved.
3. **No backwards-compatibility shims or alias paths introduced.** This is a new measurement script, not a refactor of existing infrastructure. Foundation #14 trivially preserved.
4. **No new types or schema.** Output JSON + CSV mirror the format of `reports/turnperf-002-spec-167-baseline.md` — `{ "perSeed": [...], "perDecisionClass": [...], "topNHotAxes": [...] }` is sufficient. No new ref families, no new policy surfaces, no new GameDef schema fields. Foundation #6 (Schema Ownership) preserved.
5. **Determinism is not at risk.** The witness reads `dist/` and runs the engine in measurement mode. No engine source is modified; no kernel state is mutated. Replay-identity and Zobrist-parity remain byte-identical. Foundation #8 trivially preserved.

## What to Change

### 1. Choose the extension point

Pick one of:

- **(a) Extend `packages/engine/scripts/profile-fitl-preview-drive.mjs`** — add a `--decomposition` mode flag that switches from same-seam profiling to multi-seed × per-class telemetry. Preferred when the per-decision telemetry collection logic can be cleanly factored from the existing same-seam capture.
- **(b) Add a sibling `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`** — new script reusing the engine import + WASM bootstrap + GameDef compile path from the existing profiler. Preferred when the multi-seed orchestration loop, the per-class telemetry shape, and the rollup-output format diverge enough from the same-seam profiler that sharing one file would muddle both surfaces.

The implementer chooses based on the actual code shape; the ticket does not constrain the choice. Either path satisfies §4.1.

### 2. Implement per-decision telemetry capture

For each decision in each seed run, capture:

- `seed: number`
- `decisionIndex: number` (zero-based within the seed)
- `microturnClass: string` (kernel-published `actionId` family, drawn from the trace event stream — `train-operation`, `place-marker`, `event-decision`, `pass`, etc. as the engine emits them)
- `elapsedNs: bigint` (monotonic clock around the per-decision agent call)
- `previewBranch: string | null` (which preview-drive route the decision took, when applicable: `continuedDeepening` / `greedy` / `none`)
- `candidateCount: number` (legal-move count at this decision)
- `encodedStateBuildCount: number` (counter delta over the decision)
- `bytecodeCacheHits / Misses: number`
- `resolveRefCacheHits / Misses: number`
- Other counters as the existing `profile-fitl-preview-drive-metrics.mjs` already exposes; reuse rather than duplicate

The exact counter inventory is constrained by what the engine already exposes via `getInitializedPolicyWasmRuntime`-style counters and the `policy-encoded-state-cache.ts` hit/miss surface introduced by spec 172 Phase 4. Discover the available counters at implementation time; do not invent new counter surfaces in this ticket (that would be Phase 1 scope).

### 3. Drive the 15-seed corpus

Run the same parameters as the trigger report's per-seed diagnostic (which itself mirrors the production tournament):

- `players=4`
- `evolvedSeat=arvn`
- `seatProfiles={us-baseline, arvn-evolved, nva-baseline, vc-baseline}`
- `maxTurns=200`
- `traceMode=none` (witness does not need full trace JSON; it consumes per-decision telemetry directly)
- Seeds: `1000..1014`
- Per-seed timeout: `>400000` ms (>2× the slowest current seed at 185.6 s, per spec §5 Phase 0 acceptance)

Reuse the campaign's compiled GameDef + warm runtime cache (the trigger report's `/tmp/fitl-seed-timer.mjs` proves this works; the GameDef disk cache from spec 167 §3.3 is active).

### 4. Emit rollup

Write two files to `reports/`:

- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.md` — Markdown rollup with: (a) per-seed wall-time table (existing trigger report shape, augmented); (b) per-microturn-class table aggregated across seeds with mean / p95 / max ms-per-decision; (c) a "Top N hot axes" list ranked by total self-time contribution across the slow-tier seeds (`1005`, `1011`, `1008`, `1013`, `1009`); (d) a "fast-tier vs slow-tier per-class delta" table identifying classes where the slow-tier mean is >3× the fast-tier mean (the §5 Phase 0 acceptance criterion).
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.csv` — flat per-decision rows for spreadsheet inspection: `seed, decisionIndex, microturnClass, elapsedMs, previewBranch, candidateCount, encodedStateBuildCount, bytecodeCacheHit, ...`. Preserves analytical flexibility for Phase 1 ticket scoping without re-running the witness.

The `<YYYY-MM-DD>` placeholder is the date the witness runs (typically the implementation day). If the witness is re-run later (Phase 1 cumulative output, per spec §6.3), append the new run as an additional dated rollup rather than overwriting.

## Files to Touch

- **One of**:
  - `packages/engine/scripts/profile-fitl-preview-drive.mjs` (modify) — if extending the existing profiler
  - `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (new) — if adding a sibling script
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.md` (new)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.csv` (new)

The "one of" reflects the §4.1 extension-point choice; the implementer commits to one path during Phase 2 reassessment.

## Out of Scope

- **No engine source code changes.** The witness is measurement-only; engine code stays untouched in Phase 0. Any cache, refactor, or hot-path closure is Phase 1 scope.
- **No campaign-side `arvn-evolved` profile retuning.** Beam-width and depth-cap tuning are explicitly out of scope per spec §3 Non-goals.
- **No new test files.** The witness is an executable script under `packages/engine/scripts/`, not a `.test.ts` (per spec §6.3 — "wall-time is non-deterministic and does not belong in a determinism gate"). Manual verification commands are listed below in the Test Plan.
- **No Phase 1 ticket authoring.** Phase 1 ticket slices are authored via a subsequent `/spec-to-tickets` invocation against the same spec, after this ticket lands and the rollup has been reviewed (per spec §10). Do NOT attempt to land a Phase 1 fix in this ticket; even if a hot axis is obvious, scope discipline keeps the witness clean and the Phase 1 evidence reviewable before any change lands.
- **No counter surface invention.** Use whatever per-decision counters the engine already exposes (post-spec-172). New counters are Phase 1 scope.

## Acceptance Criteria

### Tests That Must Pass

1. Existing determinism gates pass byte-identical: `pnpm -F @ludoforge/engine test:integration` covering `spec-140-replay-identity.test.ts`, `forked-vs-fresh-runtime-parity.test.ts`, `zobrist-incremental-parity-fitl-seed-42.test.ts`, `zobrist-incremental-parity-fitl-seed-123.test.ts`, `policy-bytecode-equivalence*.test.ts`. The witness must not perturb engine behavior.
2. `pnpm -F @ludoforge/engine test:integration:fitl-rules` passes (no behavioural drift on the FITL rules surface).
3. Existing suite: `pnpm turbo test --force` (full suite, force fresh).

### Manual Verification

The witness's success is evidenced by the `reports/` rollup, not by an automated test:

1. Run the witness against the 15-seed corpus (per the Test Plan commands below).
2. Confirm: it completes for all 15 seeds within the per-seed `>400000` ms timeout. Even seed `1005` (185.6 s historical) finishes within the budget.
3. Confirm: the rollup names ≥1 hot per-microturn-class axis where slow-tier mean ms-per-decision is >3× fast-tier mean ms-per-decision (the §5 Phase 0 acceptance criterion).
4. Confirm: the "Top N hot axes" list and the per-class delta table are populated; Phase 1 ticket scoping has actionable input.

### Invariants

1. **Engine-agnostic telemetry.** Microturn class labels are kernel-published `actionId` family names from the trace event stream, not FITL-specific identifiers hardcoded in the witness mechanism. The witness logic would work against any GameDef whose policy profile uses the deep-preview drive route.
2. **Determinism preserved.** Re-running the witness on the same engine commit produces structurally identical rollup JSON / CSV — same per-decision counter values, same per-seed decision counts, same hot-axis ranking. Wall-time numbers are observed values and may vary across runs (machine state, scheduler noise); all derived state must be deterministic.
3. **No perturbation of measured behavior.** The witness MUST NOT cause any decision to be selected differently than the production harness would. Per-decision timing instrumentation must not introduce material observable side effects (e.g., no extra cache invalidations, no rebuild triggers, no observer-state perturbation).

## Test Plan

### New/Modified Tests

None. The witness is an executable script, not a test (per spec §6.3 and the Out of Scope rationale). Manual verification commands appear under Commands below.

### Commands

1. Build the engine (the witness reads `dist/`):
   ```bash
   pnpm -F @ludoforge/engine build
   ```
2. Run the witness against the 15-seed corpus:
   ```bash
   # if path (a) — extending the existing profiler:
   node packages/engine/scripts/profile-fitl-preview-drive.mjs --decomposition --seeds 1000..1014 --timeout-ms 400000

   # if path (b) — sibling script:
   node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000
   ```
   Expected output: per-seed completion lines; final summary "rollup written to reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.md".
3. Inspect the rollup:
   ```bash
   ls -la reports/fitl-arvn-15-seed-decomposition-*.md reports/fitl-arvn-15-seed-decomposition-*.csv
   ```
   Confirm both files exist; the `.md` rollup names ≥1 hot per-class axis with slow:fast >3× ratio.
4. Determinism gates (must stay byte-identical — the witness does not edit engine code, but verify nothing slipped):
   ```bash
   pnpm -F @ludoforge/engine test
   ```
5. Targeted integration verification:
   ```bash
   pnpm -F @ludoforge/engine test:integration:fitl-rules
   ```
6. Full quality gate:
   ```bash
   pnpm turbo lint
   pnpm turbo typecheck
   pnpm turbo test
   ```

## Implementation Outcome (2026-05-15)

**Completed**: The Phase 0 witness, dated reports, and required verification lanes are green as of 2026-05-15.

### What Landed

- Added sibling script path (b): `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`.
- Wrote checked-in rollup artifacts:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-15.md`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-15.csv`
- Left `packages/engine/scripts/profile-fitl-preview-drive.mjs` unchanged; reassessment selected the sibling-script path because the 15-seed orchestration, per-seed child timeout, and rollup-output format diverge from the existing same-seam profiler.

### Boundary and Semantic Corrections

- The script groups microturn classes by the owning action family when possible (`train:chooseNStep:add`, `govern:chooseNStep:confirm`, `event`, `event-decision:chooseOne`, etc.) rather than by raw internal decision-key paths. The CSV preserves the selected stable move key for drill-down.
- Per-decision `elapsedMs` is measured around `PolicyAgent.chooseDecision`; it excludes simulator apply/delta work and report rendering.
- Per-seed timeout enforcement uses one child process per seed. Each child loads the built engine and production FITL GameSpecDoc, using the repo GameDef cache when available.
- No engine source, schema, generated schema, production profile, or FITL rule data changed.

### Phase 0 Measurement Result

- Command: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15`
- Result: all 15 seeds completed within the per-seed `400000 ms` timeout.
- CSV rows: `3741` per-decision rows plus header.
- Hot-axis acceptance: yes. The report names at least two slow-tier axes above the `>3x` threshold:
  - `train:chooseNStep:confirm`: slow mean `2863.6001 ms`, fast mean `0.0941 ms`, slow:fast `30431.457`.
  - `train:chooseNStep:add`: slow mean `5378.5904 ms`, fast mean `436.5793 ms`, slow:fast `12.3198`.
- Top slow-tier axes by total measured agent-call time:
  - `train:chooseNStep:add | continuedDeepening`: `177493.48 ms` over `33` decisions.
  - `train:chooseNStep:confirm | continuedDeepening`: `140314.59 ms` over `35` decisions.

### Invariant Proof Matrix

| Invariant | Witness / assertion | Status | Proof lane |
|---|---|---|---|
| Engine-agnostic telemetry | Microturn class is derived from runtime decision/action family; no FITL-specific branch in the witness mechanism. | proven | Source inspection + report rows |
| Determinism preserved / no behavior perturbation | No engine source, GameSpecDoc, schema, or profile changes; script uses observer-only agent-call timing and counter deltas. | proven | `pnpm -F @ludoforge/engine test`, `pnpm -F @ludoforge/engine test:integration:fitl-rules`, `pnpm turbo test --force` |
| Report completeness | Markdown and CSV exist, all 15 seeds completed, per-decision rows populated, hot-axis and delta tables populated. | proven | Full witness command + artifact inspection |

### Command Ledger

| Ticket section | Literal command / shorthand | Ran directly / substituted / pending | Final citation |
|---|---|---|---|
| Commands 1 | `pnpm -F @ludoforge/engine build` | ran directly | exit 0 |
| Commands 2 | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000` | ran directly with explicit `--date 2026-05-15` | exit 0; all 15 seeds completed |
| Commands 3 | `ls -la reports/fitl-arvn-15-seed-decomposition-*.md reports/fitl-arvn-15-seed-decomposition-*.csv` | substituted with direct artifact inspection (`sed`, `rg`, `wc -l`, CSV header) | markdown and CSV present; CSV has 3741 data rows plus header |
| Commands 4 | `pnpm -F @ludoforge/engine test` | ran directly | exit 0; `81/81 files passed` |
| Commands 5 | `pnpm -F @ludoforge/engine test:integration:fitl-rules` | ran directly | exit 0; `79/79 files passed` |
| Commands 6 | `pnpm turbo lint`, `pnpm turbo typecheck`, `pnpm turbo test` | ran `lint` and `typecheck` directly; ran stricter fresh test form `pnpm turbo test --force` | exit 0; `pnpm turbo test --force` reported `5 successful, 5 total` |
| Tests That Must Pass 1 | focused determinism/integration subset | proven by broader `pnpm -F @ludoforge/engine test` and `pnpm turbo test --force` | exit 0 |
| Tests That Must Pass 2 | `pnpm -F @ludoforge/engine test:integration:fitl-rules` | ran directly | exit 0; `79/79 files passed` |
| Tests That Must Pass 3 | `pnpm turbo test --force` | ran directly | exit 0; `5 successful, 5 total` |

### Source-Size Ledger

`path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor if any`

`packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs | 0 | 783 | no | new witness script | kept as one executable script under the 800-line cap so the repeatable measurement entrypoint is self-contained; extraction would add indirection before a second consumer exists | none`

### Late-Edit / Proof Validity

The final proof lanes ran before this terminal outcome transcription. The only post-proof script edit removed one unused constant flagged by lint; it did not change witness command semantics, report artifact semantics, metric thresholds, or acceptance boundaries. `node --check` and lint/typecheck/test proof cover the final script shape, and the expensive witness is not rerun solely for this non-semantic lint cleanup.

## Outcome

Completed: 2026-05-15

Phase 0 landed as a script/report-only measurement witness. The implementation added `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` and generated the checked-in Markdown and CSV artifacts at `reports/fitl-arvn-15-seed-decomposition-2026-05-15.md` and `reports/fitl-arvn-15-seed-decomposition-2026-05-15.csv`.

The implementation selected the sibling-script path rather than extending `profile-fitl-preview-drive.mjs`, because the 15-seed orchestration, child-process timeout behavior, and rollup format are distinct from the existing same-seam profiler. No engine source, schemas, generated schemas, production profiles, or FITL rule data changed.

Verification passed with the command ledger recorded above: engine build, full 15-seed witness run, artifact inspection, `pnpm -F @ludoforge/engine test`, `pnpm -F @ludoforge/engine test:integration:fitl-rules`, `pnpm turbo lint`, `pnpm turbo typecheck`, `pnpm turbo test --force`, `node --check` for the new script, whitespace checks, and `pnpm run check:ticket-deps`.
