# 192FITLPERFPROF-003: Baseline + delta capture (PR HEAD + `775e93568` worktree, all 6 workloads)

**Status**: IMPLEMENTED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — prerequisite measurement-harness correctness fixes plus the requested `reports/perf-baseline/` JSON artifacts
**Deps**: `archive/tickets/192FITLPERFPROF-002.md`

## Problem

Spec 192 §4.3 requires per-workload measurement at BOTH PR HEAD (post-Spec-190) AND the pre-Spec-190 main worktree (`775e93568`) to separate trajectory-intrinsic cost (Spec-190 shift) from inherited cost. Without the pre-Spec-190 baseline, ticket -004 cannot classify hot paths as `Pure intrinsic` / `Pure inherited` / `Mixed`. This ticket runs the harness from ticket -002 in both checkouts and produces the 12 per-workload JSON summaries (6 workloads × 2 SHAs) that ticket -004 consumes.

## Assumption Reassessment (2026-05-23)

1. `775e93568` IS the correct pre-Spec-190 main commit — confirmed during reassessment despite the commit message reading "Merge pull request #279 from joeloverbeck/spec-191-plan-role-semantic-integrity". Per the IMPLEMENTATION-ORDER-2026-05-23.md ordering (Spec 191 → Spec 190), Spec 191 landed first via PR #279 (775e93568, 03:16 UTC); Spec 190 landed later in PR #280 (#421bd2ef5). The commit graph shows PR #280's branch `implemented-spec-191` (confusingly named) branched from 775e93568, so that SHA captures last-green main BEFORE Spec 190 was implemented.
2. `pnpm-lock.yaml` parity between the two checkouts may not hold — the spec acknowledges this as a measurement caveat (§7 worktree-build differences). If lockfiles differ, flag in the per-workload caveats and report at ticket -004 time; do NOT silently rebuild against the current lockfile.
3. All 6 workloads from §4.1 are runnable on both SHAs — the workloads existed pre-Spec-190 (some with different budgets, but the test files existed; verified during reassessment for `fitl-parity-drive.perf.test.ts`, `arvn-tournament-parallel-determinism.test.ts`, etc.).
4. `arvn-tournament-wasm-equivalence` was retargeted to planless-control profile during PR #280 recovery; capture both the post-retarget shape at HEAD AND the pre-retarget shape at `775e93568` — they're not strictly the same test surface, and the delta must reflect this. Document in the caveats field of the workload JSON.
5. `drive-fingerprint-property` retargeted from PolicyAgent baselines to `createSeededChoiceAgents` during PR #280 recovery — same caveat as wasm-equivalence; it's NOT in the §4.1 workload corpus, so no action needed here, but verify nothing else in the corpus was retargeted.
6. The original "measurement artifacts only" assumption did NOT hold against the live harness. The required full baseline exposed three measurement-harness defects before the 12 JSONs could be captured:
   - `capture-per-decision-cost.mjs` only scanned stderr for a raw `[per-decision-profile]` prefix, while `node --test` surfaced the diagnostic as TAP stdout lines prefixed with `# `.
   - `summarize-cpu-prof.mjs` walked parent nodes with repeated full-node scans, making large FITL CPU profiles effectively quadratic and causing the `arvn-tournament-wasm-equivalence` summary to run for more than 16 minutes without completing.
   - `runGameSteps()` only flushed per-decision telemetry on terminal generator paths, so workloads that intentionally stopped after a bounded number of yielded decisions could exit without emitting telemetry.
   These are telemetry-path fixes required to perform this ticket's capture; they are not performance remediation findings and do not change game trajectory.

## Architecture Check

1. **No performance remediation**: This ticket only fixes measurement correctness and writes JSON artifacts. The harness repairs preserve replay behavior and do not tune or optimize FITL runtime behavior.
2. **Replay identity (Foundation 8)**: Each workload's HEAD vs. pre-Spec-190 capture uses the same seed + maxTurns. Within a single SHA, 3 runs MUST produce the same `trace.finalState.stateHash` per workload (ticket -001's trajectory-identity test enforces this).
3. **Worktree isolation**: The pre-Spec-190 worktree at `/tmp/perf-baseline-pre-190` is built independently; node_modules, dist, and engine-wasm artifacts MUST be regenerated from the pre-Spec-190 lockfile and source — no leak from main's build state.
4. **Lockfile drift caveat**: Per spec §7, lockfile-drift findings are reported but do NOT block; if parity is lost, the report flags this as a measurement caveat and ticket -004 weights its categorisation accordingly.

## What to Change

### 1. Create the pre-Spec-190 worktree

```bash
git worktree add /tmp/perf-baseline-pre-190 775e93568
cd /tmp/perf-baseline-pre-190
pnpm install --frozen-lockfile
pnpm turbo build
# Rebuild engine-wasm if applicable
pnpm -F @ludoforge/engine-wasm build
```

If `pnpm-lock.yaml` differs between main and this worktree (`diff /home/joeloverbeck/projects/ludoforge-llm/pnpm-lock.yaml /tmp/perf-baseline-pre-190/pnpm-lock.yaml`), record the diff path/summary; this becomes a caveat in the pre-Spec-190 captures.

### 2. Verify the worktree builds clean

Smoke-test the build by running ONE workload at the pre-Spec-190 worktree before launching the full campaign:

```bash
cd /tmp/perf-baseline-pre-190
ENGINE_PER_DECISION_PROFILE=1 node --test packages/engine/dist/test/perf/agents/fitl-parity-drive.perf.test.js
```

Expected: workload runs to completion at the pre-Spec-190 wall-clock (~32s local 1-turn per spec §3.1). If the workload doesn't run cleanly at the pre-Spec-190 SHA, STOP and surface to user — this indicates either a test that didn't exist at that SHA or a lockfile drift that prevents the build.

### 3. Run harness at HEAD (PR #280, commit `422e951b9`)

From main repo root:

```bash
node packages/engine/scripts/perf-baseline/run-baseline.mjs all
```

Produces 6 files at `reports/perf-baseline/<workload>-422e951b9.json`.

Actual capture used current HEAD short SHA `8203b4d023`, producing:

- `reports/perf-baseline/parity-drive-8203b4d023.json`
- `reports/perf-baseline/arvn-tournament-parallel-8203b4d023.json`
- `reports/perf-baseline/arvn-tournament-wasm-equivalence-8203b4d023.json`
- `reports/perf-baseline/policy-preview-parity-arvn-1008-8203b4d023.json`
- `reports/perf-baseline/bounded-termination-1002-8203b4d023.json`
- `reports/perf-baseline/diagnose-parity-runGame-1001-8203b4d023.json`

### 4. Run harness at pre-Spec-190 (`775e93568`)

```bash
cd /tmp/perf-baseline-pre-190
# Copy the harness scripts from main into the worktree if the worktree predates them
# (Ticket -002's scripts don't exist at 775e93568, so a copy-in is required.)
cp -r /home/joeloverbeck/projects/ludoforge-llm/packages/engine/scripts/perf-baseline packages/engine/scripts/
# Also copy the env-gated hook source change from ticket -001 if needed
# (or skip per-decision-cost capture at pre-Spec-190 — the hook didn't exist then;
# document the gap in caveats).
node packages/engine/scripts/perf-baseline/run-baseline.mjs all
```

Produces 6 files at `reports/perf-baseline/<workload>-775e93568.json`. Copy these back to the main repo root's `reports/perf-baseline/` before committing.

Actual pre-Spec-190 capture used worktree HEAD short SHA `775e93568e`, producing:

- `reports/perf-baseline/parity-drive-775e93568e.json`
- `reports/perf-baseline/arvn-tournament-parallel-775e93568e.json`
- `reports/perf-baseline/arvn-tournament-wasm-equivalence-775e93568e.json`
- `reports/perf-baseline/policy-preview-parity-arvn-1008-775e93568e.json`
- `reports/perf-baseline/bounded-termination-1002-775e93568e.json`
- `reports/perf-baseline/diagnose-parity-runGame-1001-775e93568e.json`

**Per-decision-cost at pre-Spec-190**: The env-gated hook from ticket -001 doesn't exist at `775e93568`. Two options:
- (a) Cherry-pick ticket -001's hook into the worktree for measurement purposes only (recommended — closer to apples-to-apples).
- (b) Skip per-decision-cost capture at the pre-Spec-190 SHA and document the gap; rely on wall-clock + cpu-prof + alloc-prof for delta attribution. The categorisation step (ticket -004) handles this gap by category — `Hash/digest-optimization` and `Inline-fix` findings only need wall-clock + cpu-prof; `Cache-warmup` and `Allocator-reduction` benefit from per-decision granularity but can be inferred from the other signals.

Resolve choice during Phase 2 reassessment; record in the campaign's caveats.

### 5. Aggregate caveats

Each per-workload JSON's `caveats` field collects:
- CV > 15% flags per spec §7
- Lockfile drift (if any)
- Per-decision-cost absence at pre-Spec-190 (if option (b) chosen above)
- Profile variant retargets that change the surface measured between SHAs (wasm-equivalence)
- Any workload that failed to run at either SHA

### 6. Commit the JSONs

Stage all 12 per-workload JSONs under `reports/perf-baseline/`. They are the durable artifacts ticket -004 consumes.

### 7. Tear down the worktree (optional)

After ticket -004 has consumed the captures, the worktree may be removed: `git worktree remove /tmp/perf-baseline-pre-190`. This is not part of this ticket's acceptance — leave it for after ticket -004 lands.

## Files to Touch

- `reports/perf-baseline/<workload>-422e951b9.json` × 6 (new — actual SHA may differ if HEAD has moved by implementation time; use current HEAD's short SHA)
- `reports/perf-baseline/<workload>-775e93568.json` × 6 (new)
- Optionally: `reports/perf-baseline/lockfile-drift.txt` (new — if lockfile differs)
- `packages/engine/scripts/perf-baseline/capture-per-decision-cost.mjs` (measurement parser fix for TAP/stdout diagnostics)
- `packages/engine/scripts/perf-baseline/lib/run-node-test.mjs` (smoke fixture alignment with TAP diagnostic formatting)
- `packages/engine/scripts/perf-baseline/summarize-cpu-prof.mjs` (linear parent lookup for large profiles)
- `packages/engine/src/sim/run-game-steps.ts` (env-gated before-exit telemetry flush for partial generator consumers)

`<workload>` enumerates: `parity-drive`, `arvn-tournament-parallel`, `arvn-tournament-wasm-equivalence`, `policy-preview-parity-arvn-1008`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`.

## Out of Scope

- Categorisation of findings (ticket -004)
- Writing the report markdown (ticket -004)
- Any engine source change (the env-gated hook ships in ticket -001; the worktree-side hook cherry-pick is a measurement-only operation that does NOT land back on main from this ticket)
- Tuning lane budgets back toward pre-Spec-190 values (per spec §11 — reversion is a per-remediation-spec acceptance criterion)
- Adding new workloads beyond the §4.1 corpus

## Acceptance Criteria

### Tests That Must Pass

1. All 12 per-workload JSONs exist under `reports/perf-baseline/` with the field shape from ticket -002.
2. For each workload, the HEAD and pre-Spec-190 JSONs share the same `workload` key and have non-null `runs.median` (unless explicitly flagged in caveats as unrunnable at that SHA).
3. Existing engine suite at main HEAD unaffected: `pnpm -F @ludoforge/engine test` passes.
4. Lint + typecheck: `pnpm turbo lint typecheck` passes (no code changes expected, but verify no stray files leaked into source paths).
5. `pnpm run check:ticket-deps` continues to pass.

### Invariants

1. **Foundation 8 (Determinism)**: Within either SHA, each workload's `trace.finalState.stateHash` is identical across the 3 capture runs. The harness's wall-clock variance is measurement noise; the trajectory is fixed.
2. **No remediation diff**: main source/script diffs are limited to measurement-harness correctness and env-gated telemetry flushing; no runtime perf remediation or trajectory tuning lands in this ticket.
3. **Workload coverage**: All 6 workloads from §4.1 captured at BOTH SHAs OR explicitly flagged in caveats with a reason.

## Test Plan

### New/Modified Tests

None — this ticket runs existing tests (the §4.1 workloads themselves) under the harness from ticket -002. The harness-smoke test from ticket -002 is the structural proof the harness emits well-shaped JSON.

### Commands

1. Worktree creation: `git worktree add /tmp/perf-baseline-pre-190 775e93568 && cd /tmp/perf-baseline-pre-190 && pnpm install --frozen-lockfile && pnpm turbo build`
2. Worktree smoke: `cd /tmp/perf-baseline-pre-190 && node --test packages/engine/dist/test/perf/agents/fitl-parity-drive.perf.test.js`
3. HEAD capture: `node packages/engine/scripts/perf-baseline/run-baseline.mjs all`
4. Pre-Spec-190 capture: `cd /tmp/perf-baseline-pre-190 && node packages/engine/scripts/perf-baseline/run-baseline.mjs all` (after harness copy-in per §4 above)
5. Inventory: `ls -la reports/perf-baseline/*.json | wc -l` (expect 12 + optional caveats sidecars)
6. Dep check: `pnpm run check:ticket-deps`

## Implementation Evidence (2026-05-23)

- Pre-Spec-190 worktree prepared at `/tmp/perf-baseline-pre-190` from `775e93568`; `pnpm install --frozen-lockfile`, `pnpm turbo build`, `pnpm -F @ludoforge/engine-wasm build`, and `pnpm -F @ludoforge/engine build` completed.
- Worktree smoke passed: `ENGINE_PER_DECISION_PROFILE=1 node --test packages/engine/dist/test/perf/agents/fitl-parity-drive.perf.test.js`.
- HEAD capture completed outside sandbox: `node packages/engine/scripts/perf-baseline/run-baseline.mjs all`, writing all six `*-8203b4d023.json` files.
- Pre-Spec-190 capture completed outside sandbox from `/tmp/perf-baseline-pre-190`: `node packages/engine/scripts/perf-baseline/run-baseline.mjs all`, writing all six `*-775e93568e.json` files, which were copied back to the main repo.
- Raw `cpu-prof/`, `alloc-prof/`, and `per-decision/` scratch directories were not retained in main because each top-level workload JSON contains the summarized CPU, allocation, per-decision, cache, and caveat fields consumed by ticket -004.
- Verification passed:
  - `node .codex/skills/implement-spec-tickets/scripts/validate-state.mjs .codex/run-state/implement-spec-tickets.json`
  - `node packages/engine/scripts/perf-baseline/capture-per-decision-cost.mjs parity-drive --smoke`
  - artifact shape check over 12 `reports/perf-baseline/*.json` files
  - `git diff --check`
  - `pnpm run check:ticket-deps`
  - `pnpm turbo lint typecheck`
  - `pnpm -F @ludoforge/engine test` (169/169 default files passed)

## Outcome

Completed: 2026-05-23

What changed:

- Captured all 12 requested durable baseline summaries under `reports/perf-baseline/`: six current-HEAD JSONs at `8203b4d023` and six pre-Spec-190 JSONs at `775e93568e`.
- Prepared and retained the measurement worktree at `/tmp/perf-baseline-pre-190` for ticket -004 consumption.
- Fixed prerequisite measurement-harness defects so the capture could complete:
  - `capture-per-decision-cost.mjs` now accepts TAP diagnostic `# [per-decision-profile]` lines and scans both stdout and stderr.
  - `run-node-test.mjs` smoke output now mirrors the TAP diagnostic prefix.
  - `summarize-cpu-prof.mjs` now uses a precomputed parent map for linear parent lookup on large V8 profiles.
  - `runGameSteps()` now flushes env-gated per-decision telemetry at process `beforeExit` for partial generator consumers.

Deviations from original plan:

- The original ticket claimed no main source or script changes. Live proof contradicted that: the baseline could not complete until measurement-harness correctness bugs were fixed. These changes are telemetry/profiling-path fixes only, not performance remediation.
- Raw `cpu-prof/`, `alloc-prof/`, and `per-decision/` scratch directories were not retained in main because the top-level JSONs contain the durable summaries ticket -004 consumes.

Verification:

- `node .codex/skills/implement-spec-tickets/scripts/validate-state.mjs .codex/run-state/implement-spec-tickets.json` — passed.
- `node packages/engine/scripts/perf-baseline/capture-per-decision-cost.mjs parity-drive --smoke` — passed; smoke-only artifact removed afterward.
- Artifact shape check over `reports/perf-baseline/*.json` — passed with 12 non-smoke deliverable JSONs.
- `git diff --check` — passed.
- `pnpm run check:ticket-deps` — passed.
- `pnpm turbo lint typecheck` — passed.
- `pnpm -F @ludoforge/engine test` — passed, 169/169 default files.
