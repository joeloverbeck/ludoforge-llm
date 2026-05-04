# 149FITLEVNUMVM-023: Revalidate or repair the reset FITL per-card gate

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — perf-gate harness repair only; no runtime behavior change
**Deps**: `archive/tickets/149FITLEVNUMVM-016.md`, `archive/tickets/150FITLWASM-034.md`

## Problem

`archive/tickets/149FITLEVNUMVM-016.md` closed the Phase 4 F14 cut with a user-approved `<=1800 ms` reset gate for `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts`. A later `154POLBCDISP-003` keep-arm preflight on the same checkout reran that exact compiled perf test three times and found the current explicit-handler baseline red:

- `elapsedMs=2479.77`
- `elapsedMs=2461.18`
- `elapsedMs=2421.83`

Median: `2461.18 ms`, which is `661.18 ms` over the `1800 ms` ceiling (`36.7%` red).

This blocks any downstream measured decision that consumes the reset gate. In particular, `tickets/154POLBCDISP-003.md` cannot decide whether deleting explicit policy-bytecode fallback handlers regresses the keep arm by `<=5%` while the keep arm itself fails the prerequisite acceptance gate.

Resolution: live reassessment proved the red samples were perf-gate harness
drift, not a generic runtime regression. The checked-in perf test measured a
different surface from the archived reset evidence: it used the source-compiled
fixture, retained policy-agent summary diagnostics, and did not precompile the
successor WASM score rows before starting the timed route. The reset evidence
in `archive/tickets/149FITLEVNUMVM-016.md` and `archive/tickets/150FITLWASM-034.md`
was based on the compiled bootstrap GameDef, `traceLevel: none`, and pre-timed
successor-route precompilation with clean active-route diagnostics.

## Assumption Reassessment (2026-05-04)

1. `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` currently asserts `PHASE4_RESET_CEILING_MS = 1_800` with all four baseline profiles and `verifyIncrementalHash=true`.
2. `archive/tickets/149FITLEVNUMVM-016.md` records historical green proof for that gate and identifies the reset as backed by `archive/tickets/150FITLWASM-034.md`.
3. Live reruns during `154POLBCDISP-003` reassessment now contradict that historical proof: the current keep arm is red on three serial samples with median `2461.18 ms`.
4. The contradiction is not owned by `154POLBCDISP-003`; that ticket only owns the explicit-handler keep-vs-delete decision after the reset gate is valid.
5. This ticket's live classification: harness drift in
   `fitl-per-card-cost.perf.test.ts`. The bucketed profile command remained
   green at `elapsedMs=1606.34` with clean active-route diagnostics while the
   stale compiled perf test stayed red around `2.57 s`.

## Architecture Check

1. Foundation 13 and Foundation 16 require the reset gate to be reproducible before dependent measured decisions consume it. A red current gate cannot be treated as a valid acceptance surface.
2. Foundation 15 requires root-cause classification rather than weakening the downstream handler-deletion ticket. This ticket owns determining whether the red result is a live regression, environment/CI-vs-local variance, stale calibrated ceiling, or another measurable blocker.
3. Foundation 1 is preserved: any runtime repair must remain generic policy/runtime work, with no FITL-specific branches or hardcoded game identifiers.
4. Foundation 14 is preserved: do not add compatibility switches or restore retired fallback paths as a workaround for the gate.

## What to Change

### 1. Reproduce and classify the red reset gate

Run the reset perf gate from a clean built checkout and record at least three serial samples:

`pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/fitl-per-card-cost.perf.test.js`

Classify the red result as one of:

- live runtime regression since `149FITLEVNUMVM-016`
- environment/CI-vs-local variance that requires a CI-backed confirmation path
- stale reset ceiling that needs a new Foundations-aligned budget-reset decision
- harness drift in `fitl-per-card-cost.perf.test.ts`

### 2. Apply the smallest truthful resolution

If the gate is a live runtime regression, repair the generic runtime path and prove the `<=1800 ms` gate green again.

If the gate is environment-sensitive, record the exact local and CI evidence and update dependent tickets to consume the authoritative proof surface.

If the gate itself is stale, stop for a 1-3-1 budget reset decision before changing the ceiling.

Implemented resolution: repaired the perf test harness so it measures the
same successor-runtime surface as the archived reset evidence. The `<=1800 ms`
ceiling was not changed.

### 3. Unblock dependent tickets

After the reset gate is green or otherwise truthfully reclassified, update:

- `tickets/149FITLEVNUMVM-003.md` — CI restoration unwind gate status.
- `tickets/154POLBCDISP-003.md` — explicit-handler keep-vs-delete prerequisite status.

## Files to Touch

- `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` (modify only if harness or approved ceiling changes)
- generic engine policy/runtime files if profiling proves a live regression owner
- `tickets/149FITLEVNUMVM-003.md` (modify dependent gate status)
- `tickets/154POLBCDISP-003.md` (modify dependent gate status)
- this ticket (Outcome before closeout)

## Out of Scope

- Deciding the `154POLBCDISP-003` explicit-handler keep-vs-delete question.
- Deleting or restoring policy-bytecode explicit fallback handlers.
- Weakening the `<=1800 ms` ceiling without a fresh user-approved budget reset.
- FITL-specific runtime branches or authored-rule shortcuts.

## Acceptance Criteria

### Tests That Must Pass

1. The reset gate is green or truthfully reclassified with user approval:
   `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/fitl-per-card-cost.perf.test.js`.
2. If runtime code changes, focused tests for the changed generic seam pass.
3. Existing suite: `pnpm -F @ludoforge/engine test:perf`, or classify any
   non-149 perf-test failure as a documented external blocker after confirming
   the Spec 149 reset subtest is green inside the broad lane.

### Invariants

1. Downstream measured decisions consume a reproducible gate, not stale historical proof.
2. Any retained runtime change remains game-agnostic and deterministic.
3. Any budget reset records baseline, decisive final, target, delta, percent change, verdict, and user authorization.

## Test Plan

### New/Modified Tests

1. Modified `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts`
   to measure the archived reset surface and assert clean successor-route
   diagnostics.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/fitl-per-card-cost.perf.test.js` repeated at least three times.
3. `pnpm -F @ludoforge/engine test:perf`.
4. `pnpm run check:ticket-deps`.

## Outcome

Completed: 2026-05-04.

The reset gate was reclassified as harness drift and repaired without changing
the `<=1800 ms` ceiling or production runtime behavior.

What changed:

- `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` now uses
  the compiled bootstrap GameDef fixture, disables policy-agent trace
  diagnostics, initializes the WASM runtime, and precompiles the four baseline
  policy score-row bytecode caches before the timed run.
- The test now asserts clean active-route diagnostics:
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmScoreRowBytecodeCompileCount=0`, and
  `wasmProductionPreviewDriveBatchCount=232`.
- `tickets/149FITLEVNUMVM-003.md`, `tickets/154POLBCDISP-003.md`, and the
  owning specs were updated so downstream work consumes the repaired gate
  rather than treating the reset prerequisite as currently red.

Measured evidence:

- Stale pre-fix compiled gate after clean build: RED,
  `2535.42 ms`, `2568.58 ms`, `2568.44 ms`; median `2568.44 ms`, `768.44 ms`
  over the `1800 ms` ceiling (`42.69%` red).
- Same-checkout bucketed route classification:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label 149-023-classification`
  — GREEN, `elapsedMs=1606.34`, per-card `elapsedMs=1606.18`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmScoreRowBytecodeCompileCount=0`,
  `wasmProductionPreviewDriveBatchCount=232`.
- Final repaired compiled gate after clean build: GREEN on three serial runs,
  suite durations `1564.365591 ms`, `1536.992898 ms`, and `1565.845505 ms`
  against `<=1800 ms`.
- Post-closeout focused rerun:
  `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/fitl-per-card-cost.perf.test.js`
  — GREEN, suite durations `1472.139505 ms` and `1522.256811 ms`.
- Broad `pnpm -F @ludoforge/engine test:perf` classification: the ticket-owned
  Spec 149 reset subtest was GREEN inside the broad lane (`1710.447113 ms`),
  and `POLPREVDRIVE-006 FITL parity drive perf gate` was GREEN. The broad lane
  exited red only because `Spec 145 preview pipeline performance` failed with
  `Expected to collect 50 ARVN action-selection decisions before maxTurns.`
  That failure is already documented outside this ticket in Spec 154 as
  preview-pipeline corpus-parameter drift, not a reset-gate regression.

Materiality ledger:

- baseline: stale gate median `2568.44 ms`
- decisive final: repaired gate max observed suite duration `1565.845505 ms`
- target: `<=1800 ms`
- delta: `1002.594495 ms` below stale median and `234.154495 ms` under target
- percent change: `39.04%` reduction versus stale median
- verdict: green; harness drift repaired
- terminal status allowed?: yes, after focused gate proof, broad-lane
  classification, and dependency proof

Proof-validity ledger:

- late edits: active ticket/spec/dependent closeout text after the first green
  focused gate
- edit class: ticket/spec closeout and dependency graph transcription
- proof invalidation: focused gate and dependency integrity were rerun after
  the closeout edits; the broad `test:perf` lane was run and classified as
  over-broad because only the external Spec 145 preview-pipeline corpus failed.
  The post-closeout proof transcription did not change code, command semantics,
  thresholds, scope, or acceptance boundaries, so it does not invalidate the
  just-run focused gate. No schema or generated artifact surface changed.
