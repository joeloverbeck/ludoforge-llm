# 155PERGAMCOM-004: FITL lane cumulative startup cost measurement script

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — measurement script only
**Deps**: `archive/tickets/155PERGAMCOM-001.md`

## Problem

Spec 155 §6 acceptance criterion 4 sets a budget target: cumulative startup overhead across `fitl-events-shard-{a,b,c}` + `fitl-rules` lanes should drop from a measured ~5.5 min baseline to < 30 s aggregate after the cache lands. The exact number depends on CI runner hardware and is therefore informational, not a blocking gate, but the measurement itself is the only way to confirm the structural fix actually delivers the projected speedup.

This ticket delivers the measurement and first-cause classification: a script under `packages/engine/scripts/` that runs the FITL lanes' per-test-file startup overhead twice — once with the cache cold for each measured file (cleared before each child invocation) and once with the cache hot — and emits a structured JSON summary. The script records whether hot cumulative startup time is < 30 s on the local machine, with the assertion documented as best-effort across runner variability. If the result is red, this ticket records the first-cause classification and hands residual architecture work to `tickets/155PERGAMCOM-005.md`.

## Assumption Reassessment (2026-05-05)

1. The four FITL lanes are enumerated in `packages/engine/scripts/test-lane-manifest.mjs` via `listIntegrationTestsForLane('integration:fitl-events-shard-a' | 'b' | 'c' | 'fitl-rules')`. Confirmed by `engine-tests.yml:65-69`; the live manifest currently yields 192 files, so examples must not hard-code the earlier 195-file count.
2. `node --test` startup overhead per file is the dominant component the cache eliminates. A faithful measurement runs each test file with `--test --test-name-pattern="^$"` (matches no tests) — this loads the file, executes top-level imports (which is where `compileProductionSpec` runs), but skips the test bodies. The wall-clock of that no-test invocation is the per-file startup overhead.
3. `clearGameDefCache()` from ticket 001 lets the script wipe the persistent cache before each cold child process without invoking `pnpm -F @ludoforge/engine clean` (which would force a full rebuild). Boundary reset approved 2026-05-05: clearing only once before the cold phase would measure one cold compile plus hot cache hits, not the historical cumulative per-file startup cost.
4. Spec §4 Phase 3 says the script can be wired into a non-blocking CI summary step *or* a manual measurement script. This ticket delivers the manual script. A non-blocking CI summary step is *not* in scope for this ticket; if profiling shows the manual script is high-value, a follow-up ticket can add a CI summary step.
5. Spec §6 acceptance criterion 4 is informational but not green on the live no-test startup seam; the measurement is recorded as red evidence and residual ownership moves to `tickets/155PERGAMCOM-005.md`.

## Architecture Check

1. **Cleaner than alternatives**: A more invasive alternative would be to instrument every test file with an `after` hook that emits per-file timing. That spreads measurement code across every FITL lane file. A standalone script that re-runs each file in startup-only mode is a single-file diff, leaves test files untouched, and reuses the existing lane manifest as the source of truth for which files to measure.
2. **Informational, not a gate**: The script asserts < 30 s but the spec explicitly marks the threshold informational because runner hardware varies. The script's exit code reflects script correctness (did it run end-to-end?), not the threshold pass/fail. The threshold check writes a warning to stderr and continues. This avoids creating a flaky CI signal tied to runner variability.
3. **GameSpecDoc / GameDef boundary preserved**: The script measures wall-clock of test-file startup. It does not introduce new schema types or game-specific branches.
4. **No backwards-compatibility shims**: New script only.
5. **Foundation 16 (Testing as Proof)**: The cache speedup claim is quantified here. The result is red, so this ticket records the contradiction instead of marking Spec §6 criterion 4 green.

## What to Change

### 1. New script: `packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs`

ESM script. Behavior:

1. Import lane manifest helpers: `listIntegrationTestsForLane`, `toDistTestPath` from `./test-lane-manifest.mjs`.
2. Build the file list: `[...listIntegrationTestsForLane('integration:fitl-events-shard-a'), ...shard-b, ...shard-c, ...listIntegrationTestsForLane('integration:fitl-rules')]` mapped through `toDistTestPath`.
3. Import `clearGameDefCache` from the compiled helpers (`../dist/test/helpers/gamedef-cache.js`).
4. **Cold phase**: for each test file path, call `clearGameDefCache()`, spawn `node --test --test-name-pattern="^\\$" <path>`, and record elapsed time. Sum to get `coldCumulativeMs`. (Use `--test-name-pattern="^\\$"` to skip all test bodies while still loading the file and running its top-level imports.)
5. **Hot phase**: do *not* clear the cache (cold phase populated it). Re-run the same per-file loop and record `hotCumulativeMs`.
6. Compute `speedupRatio = coldCumulativeMs / hotCumulativeMs`.
7. Emit a JSON summary on stdout:
   ```json
   {
     "fileCount": 192,
     "coldCumulativeMs": 330000,
     "hotCumulativeMs": 12000,
     "speedupRatio": 27.5,
     "hotMeetsBudget": true,
     "budgetMs": 30000
   }
   ```
8. If `hotCumulativeMs > 30000`, write a warning to stderr: `WARN: hot cumulative startup ${hotCumulativeMs} ms exceeds 30000 ms budget — measurement is informational, runner hardware varies.` Exit 0 regardless.
9. Exit non-zero only if a child `node --test` invocation exits non-zero (an unrelated test-file load failure) or if the lane manifest produces an empty file list.

### 2. README note (optional)

Add a one-liner under `packages/engine/scripts/README.md` (if it exists) describing the script's purpose. If no README exists, skip — do not create a docs file solely for this script.

## Files to Touch

- `packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs` (new)
- `packages/engine/scripts/README.md` (modify *only if* the file exists; otherwise skip)

## Out of Scope

- A blocking CI gate based on the threshold — explicitly excluded by Spec §4 Phase 3 (informational only).
- A non-blocking CI summary step that surfaces the measurement in PR checks — could be a follow-up; not in scope here.
- Per-test-suite breakdown beyond per-file startup. The cache savings are entirely in the startup component (the compile run by `compileProductionSpec` at module-load time).
- Measuring lanes other than the four FITL lanes that motivate the spec.
- The cache helper itself — owned by ticket 001.
- CI workflow integration — owned by ticket 002.
- Equivalence and invalidation tests — owned by ticket 003.

## Acceptance Criteria

### Tests That Must Pass

1. Script runs to completion locally on a machine with `pnpm -F @ludoforge/engine build` already done. Both cold and hot phases complete; JSON summary is well-formed.
2. `speedupRatio` and `hotMeetsBudget` are emitted as raw measured values. If the target ≥ 10× or `hotMeetsBudget: true` expectation is red, the ticket records the first-cause classification and successor owner rather than treating the gate as green.
3. Script exits 0 on a healthy run, non-zero only on a real lane manifest or child-process failure.
4. Threshold warning surfaces on stderr when the hot cumulative time exceeds 30 s; script exit code is unchanged.

### Invariants

1. The script does not modify any test files, source files, or workflow files. Its only side effects are spawning child processes and reading/clearing the cache directory.
2. The script's correctness is independent of absolute wall-clock numbers — it measures *ratios* and emits *raw values* but does not gate on thresholds in its exit code.
3. Lane membership is sourced from `test-lane-manifest.mjs`, not duplicated in the script. If a lane manifest changes, the script picks up the change automatically.

## Measurement Result (2026-05-05)

Command:

```bash
node packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs
```

Result:

```json
{
  "fileCount": 192,
  "coldCumulativeMs": 1632333,
  "hotCumulativeMs": 1597210,
  "speedupRatio": 1.0219902204469042,
  "hotMeetsBudget": false,
  "budgetMs": 30000
}
```

The script exited 0 and emitted the informational threshold warning as designed:

```text
WARN: hot cumulative startup 1597210 ms exceeds 30000 ms budget - measurement is informational, runner hardware varies.
```

First-cause classification:

1. Persistent cache hits are active but too small for the original budget model. Focused helper probe:
   ```json
   {
     "coldMs": 1756,
     "hotPersistentMs": 1380,
     "ratio": 1.2730797272201364
   }
   ```
2. Representative no-test child startup remains multi-second with a hot cache:
   ```json
   [
     {
       "file": "dist/test/integration/fitl-events-1965-us.test.js",
       "coldMs": 2112,
       "hotMs": 1850
     },
     {
       "file": "dist/test/integration/fitl-events-1968-vc.test.js",
       "coldMs": 6103,
       "hotMs": 5808
     }
   ]
   ```
3. Static inventory over the four lanes found 192 files, 150 mentioning production compile helpers, and only 25 with obvious top-level production fixture/compile calls. The no-test witness skips many `compileProductionSpec()` calls inside test bodies and still pays per-file Node/module/test registration cost.

Outcome: ticket 004's corrected owned boundary is satisfied as a measurement plus first-cause classification slice. Spec 155 §6 criterion 4 remains red and is handed to `tickets/155PERGAMCOM-005.md`.

## Outcome (2026-05-05)

Landed `packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs` as the manual FITL lane startup measurement script. The script sources lane membership from `test-lane-manifest.mjs`, clears the persistent GameDef cache before each cold child invocation, runs a hot pass without clearing, emits JSON on stdout, and treats the 30 s budget as an informational warning rather than an exit-code gate.

Boundary corrections applied:

1. Cold measurement changed from "clear once before the cold phase" to "clear before each cold child invocation" by user-approved 1-3-1 reset; clearing once only measures one cold compile plus hot hits.
2. The live manifest yields 192 files, not the draft's static 195 count.
3. The no-test startup seam is red and does not prove the expected `>=10x` speedup; residual ownership moved to `tickets/155PERGAMCOM-005.md`.

Verification:

1. `node --check packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs` — passed.
2. `node packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs` — passed at script level; emitted red informational measurement `fileCount=192`, `coldCumulativeMs=1632333`, `hotCumulativeMs=1597210`, `speedupRatio=1.0219902204469042`, `hotMeetsBudget=false`.
3. Focused helper diagnostic — `compileProductionSpec()` cold `1756 ms`, persistent-hot `1380 ms`, ratio `1.2730797272201364`.
4. Focused child diagnostic — `fitl-events-1965-us` `2112 ms -> 1850 ms`; `fitl-events-1968-vc` `6103 ms -> 5808 ms`.
5. Static inventory — 192 lane files; 150 mention production compile helpers; 25 have obvious top-level production fixture/compile calls under the no-test witness.
6. `pnpm turbo lint` — passed.
7. `pnpm run check:ticket-deps` — passed for 2 active tickets and 2239 archived tickets after adding `tickets/155PERGAMCOM-005.md`.
8. `pnpm turbo test` — not run for ticket 004 final closeout. The active diff adds one manual `.mjs` measurement script plus markdown/spec graph updates; no engine TypeScript, schemas, test sources, or runtime behavior changed. The expensive ticket-owned proof was the full manual measurement command above, and residual red runtime/budget ownership is explicitly moved to `tickets/155PERGAMCOM-005.md`.

Late-edit proof validity: post-measurement edits changed ticket/spec/successor ownership and this proof ledger only. They did not change script code, command semantics, thresholds, or the recorded metric. The expensive full measurement remains valid as metric transcription evidence; dependency integrity was rerun after the graph edit and broad lint was rerun after the final proof-ledger update.

## Test Plan

### New/Modified Tests

No new automated tests. The script itself is the verification artifact. Manual run is the test.

### Commands

1. `pnpm -F @ludoforge/engine clean`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine cache:gamedef:warm` (sets up baseline)
4. `node packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs` — record JSON summary; if red, record first-cause classification and successor ownership.
5. `pnpm turbo lint`
6. `pnpm turbo test`
