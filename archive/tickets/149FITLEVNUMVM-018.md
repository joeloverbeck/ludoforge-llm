# 149FITLEVNUMVM-018: Profile and optimize live FITL event-card CI lanes

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — exact files depend on measured hot path
**Deps**: `archive/tickets/149FITLEVNUMVM-015.md`

## Problem

Ticket `149FITLEVNUMVM-016` cannot execute its Phase 4 default-flip and closure-tree deletion because the Phase 4 perf gate is still red in the live checkout:

- `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase4-preflight-vm` — `elapsedMs=6785.54`, per-card `elapsedMs=6785.31`, threshold `<=250`.

At the same time, recent optimization work has materially improved several CI workflow lanes, but the remaining expensive surfaces are the FITL event-card/rules engine-test lanes that ticket 002 temporarily made non-blocking and that were restored to blocking semantics early on 2026-05-02:

- `fitl-events-shard-c` / `test:integration:fitl-events:shard-c`
- `fitl-rules` / `test:integration:fitl-rules`

This ticket owns the next Foundation-aligned optimization pass: profile the current slow CI lanes directly, identify the actual runtime hot path, and apply generic engine/runtime optimizations to that measured root cause. Do not assume the bytecode VM is the decisive bottleneck unless profiling proves it on these lanes.

## Architecture Check

1. F15 architectural completeness: optimize the measured root cause for the live blocking CI surface, not the stale one-card VM premise.
2. F16 testing as proof: the acceptance proof is lane runtime and focused correctness, not anecdotal improvement.
3. F1 engine agnosticism: no FITL-specific branches in engine code. FITL event cards may be the witness, but fixes must be generic runtime/compiler/kernel improvements.
4. F8 determinism: preserve replay identity, canonical hashes, and exact integer semantics.
5. F10 bounded computation: do not reduce coverage, caps, event-card assertions, or shard contents as the primary answer.
6. F14 no compatibility shims: remove any exploratory fallback/helper path that is not part of the accepted design before closeout.

## What to Change

### 1. Profile the live lane surface

Run the smallest bounded lane probes that preserve the real CI runner:

1. Build first: `pnpm -F @ludoforge/engine build`.
2. List the current `fitl-events-shard-c` and `fitl-rules` membership via `packages/engine/scripts/test-lane-manifest.mjs`.
3. Run `fitl-events-shard-c` with timing/profiling sufficient to identify the slowest files and dominant stacks.
4. Run `fitl-rules` only enough to confirm whether it shares the same hot path or needs separate ownership.

Use `/tmp` for CPU profiles or large raw logs unless the ticket creates a checked-in report.

### 2. Classify the root cause

Before coding, classify the dominant cost as one of:

- policy-expression / bytecode VM path;
- event-card setup/helper fixture construction;
- free-operation grant expansion or continuation publication;
- microturn publication / legality / constructibility probing;
- token-state-index, hashing, or canonicalization;
- test harness batching, dist runner, or shard composition overhead;
- another measured generic engine/runtime path.

If more than one independent root cause dominates, propose a split before stacking unrelated optimizations.

### 3. Implement one measured generic candidate at a time

For each accepted candidate:

1. Add or tighten the narrowest correctness proof first when the candidate changes runtime semantics.
2. Implement the smallest generic change that addresses the measured hot path.
3. Run focused correctness proof.
4. Rerun the smallest representative timing probe before adding another candidate.
5. Remove rejected exploratory code and record the negative evidence in this ticket's outcome.

### 4. Reconcile ticket 016 and ticket 003

When the live slow lanes are back inside their intended blocking CI budgets:

1. Update ticket `149FITLEVNUMVM-016` with the measured evidence that its Phase 4 F14 cut may resume.
2. Leave ticket `149FITLEVNUMVM-003` blocked until 016 closes for the remaining determinism-timeout unwind; the engine-test blocking semantics have already been restored.

## Current Lane Membership (2026-05-02)

`integration:fitl-events-shard-c` currently contains:

- `test/integration/fitl-events-plei-mei.test.ts`
- `test/integration/fitl-events-pows.test.ts`
- `test/integration/fitl-events-rach-ba-rai.test.ts`
- `test/integration/fitl-events-roks.test.ts`
- `test/integration/fitl-events-rolling-thunder.test.ts`
- `test/integration/fitl-events-ruff-puff.test.ts`
- `test/integration/fitl-events-rural-pressure.test.ts`
- `test/integration/fitl-events-russian-arms.test.ts`
- `test/integration/fitl-events-sappers.test.ts`
- `test/integration/fitl-events-sealords.test.ts`
- `test/integration/fitl-events-senator-fulbright.test.ts`
- `test/integration/fitl-events-sihanouk.test.ts`
- `test/integration/fitl-events-son-tay.test.ts`
- `test/integration/fitl-events-tam-chau.test.ts`
- `test/integration/fitl-events-test-helpers.test.ts`
- `test/integration/fitl-events-tet-offensive.test.ts`
- `test/integration/fitl-events-text-only-behavior-backfill.test.ts`
- `test/integration/fitl-events-tf-116-riverines.test.ts`
- `test/integration/fitl-events-thanh-hoa.test.ts`
- `test/integration/fitl-events-to-quoc.test.ts`
- `test/integration/fitl-events-tri-quang.test.ts`
- `test/integration/fitl-events-tribesmen.test.ts`
- `test/integration/fitl-events-trucks.test.ts`
- `test/integration/fitl-events-tunnel-rats.test.ts`
- `test/integration/fitl-events-tutorial-cap-momentum.test.ts`
- `test/integration/fitl-events-tutorial-coup.test.ts`
- `test/integration/fitl-events-tutorial-medium.test.ts`
- `test/integration/fitl-events-tutorial-simple.test.ts`
- `test/integration/fitl-events-typhoon-kate.test.ts`
- `test/integration/fitl-events-uncle-ho.test.ts`
- `test/integration/fitl-events-us-press-corps.test.ts`
- `test/integration/fitl-events-usaid.test.ts`
- `test/integration/fitl-events-uss-new-jersey.test.ts`
- `test/integration/fitl-events-vietnamization.test.ts`
- `test/integration/fitl-events-vo-nguyen-giap.test.ts`
- `test/integration/fitl-events-walt-rostow.test.ts`
- `test/integration/fitl-events-westmoreland.test.ts`

## Files to Touch

- Profiling/report artifacts only if needed.
- Runtime/compiler/kernel files identified by profiling.
- Focused tests for the accepted generic optimization.
- `tickets/149FITLEVNUMVM-016.md` if this ticket unblocks the F14 cut.
- `specs/149-fitl-evolution-readiness-numeric-substrate-bytecode-vm.md` if the measured root cause changes the Spec 149 phase story.

## Out of Scope

- Deleting the closure-tree runtime. That remains ticket `149FITLEVNUMVM-016`.
- Remaining CI workflow restoration after the Phase 4 gate, specifically the determinism-timeout unwind. That remains ticket `149FITLEVNUMVM-003`.
- Weakening FITL event-card coverage, turning assertions into smoke tests, lowering caps, or reshuffling shards as the primary solution.
- Adding game-specific fast paths.

## Acceptance Criteria

1. The ticket outcome records exact profiling commands, slowest files or stacks, root-cause classification, and accepted/rejected candidates.
2. Any runtime change is generic, deterministic, and covered by focused correctness proof.
3. `pnpm -F @ludoforge/engine build` passes.
4. `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-c` completes inside the intended blocking CI budget or records exact red metrics and the next owner.
5. `pnpm -F @ludoforge/engine test:integration:fitl-rules` is either inside budget or explicitly classified as a separate remaining owner.
6. If this ticket claims ticket 016 is unblocked, rerun the Phase 4 VM correctness/perf preflights and update ticket 016 before final proof.

## Test Plan

1. `pnpm -F @ludoforge/engine build`.
2. Focused correctness test(s) for any touched module.
3. `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-c`.
4. `pnpm -F @ludoforge/engine test:integration:fitl-rules` when the root-cause classification says the lane shares the same hot path or remains part of the restoration blocker.
5. `pnpm run check:ticket-deps`.

## Outcome

Completed: 2026-05-02

Measured verdict: no generic runtime/compiler/kernel optimization was accepted for this ticket. Live lane proof showed the current blocking CI surfaces are within their intended `engine-tests.yml` 30-minute lane budgets after repairing stale golden fallout, so there was no measured hot runtime stack to optimize in this slice.

Root-cause classification:
- `fitl-events-shard-c`: no red runtime hot path found. The lane passed with the real `run-tests.mjs` sequential CI runner; the slowest observed files were `fitl-events-rach-ba-rai` (~31.6s), `fitl-events-tri-quang` (~31.2s), `fitl-events-tunnel-rats` (~26.2s), `fitl-events-ruff-puff` (~25.6s), and `fitl-events-sihanouk` (~24.9s).
- `fitl-rules`: the initial run failed after 426.58s at `fitl-turn-flow-golden.test.js`, not because of runtime perf. Direct rerun showed stale golden drift from the already-required Spec 150 `turnOrderState.runtime.lifecycleStatus: { stalled: false }` serialized field. Re-blessing that one fixture fixed the file; the full lane then passed 79/79 files in `real 450.18s`.
- Workflow masking: `.github/workflows/engine-tests.yml` had `continue_on_error: true` for `fitl-events-shard-c` and `fitl-rules`, which could hide this class of failure in CI. Those flags and the non-blocking summary step were removed. `.github/workflows/ci.yml` also had non-blocking `node-compat`; that build compatibility job is now blocking. The only remaining `continue-on-error` in workflows is `policy-profile-quality`, which is intentionally advisory per `docs/FOUNDATIONS.md`.

Accepted candidate:
- Stale fixture repair only: regenerated `packages/engine/test/fixtures/trace/fitl-turn-flow.golden.json` through the existing `UPDATE_GOLDEN=1` path, adding the canonical `lifecycleStatus.stalled=false` fields.

Rejected / not pursued:
- No CPU profile artifact was captured and no runtime optimization candidate was stacked, because the live lane evidence did not show a red runtime perf gate after the stale golden and workflow-gating issue was corrected.
- This ticket does not claim `149FITLEVNUMVM-016` is unblocked for the Phase 4 default-flip. The one-card VM perf gate from ticket 016 remains a separate red precondition unless rerun and proven green.

Verification:
- `pnpm -F @ludoforge/engine build` — PASS.
- Live lane membership query via `packages/engine/scripts/test-lane-manifest.mjs` — confirmed `fitl-events-shard-c` and `fitl-rules` membership.
- `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-c` — PASS, 37/37 files.
- `pnpm -F @ludoforge/engine exec node dist/test/integration/fitl-turn-flow-golden.test.js` before re-bless — RED, missing `lifecycleStatus.stalled=false` in the golden fixture.
- `UPDATE_GOLDEN=1 pnpm -F @ludoforge/engine exec node dist/test/integration/fitl-turn-flow-golden.test.js` — PASS and refreshed the fixture.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-turn-flow-golden.test.js` — PASS.
- `pnpm -F @ludoforge/engine test:integration:fitl-rules` — PASS, 79/79 files, `real 450.18`.
- Workflow YAML parse check for `.github/workflows/ci.yml`, `.github/workflows/engine-tests.yml`, and `.github/workflows/engine-determinism.yml` using the repo's `yaml` package — PASS.
- `git diff --check` — PASS.
- `pnpm run check:ticket-deps` — PASS, 3 active tickets and 2187 archived tickets.
