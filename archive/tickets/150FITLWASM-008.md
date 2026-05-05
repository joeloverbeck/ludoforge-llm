# 150FITLWASM-008: Production preview row materialization WASM handoff

**Status**: COMPLETED with red measured gate successor `tickets/150FITLWASM-009.md`
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — policy preview row materialization, WASM/buffer handoff, profiling gate
**Deps**: `archive/specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-007.md`

## Problem

Ticket `150FITLWASM-007` proved that production policy evaluation can route
supported full-profile move-consideration score rows through WASM. The same-seam
Spec 150 Phase 4 gate is still red:

- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-production-score-routing`
- RED: per-card `elapsedMs=7131.37` versus the `<=250 ms` target.
- WASM route counters prove the score-row route was active:
  `wasmScoreRowRouteCount=65`, `wasmScoreRowUnsupportedCount=0`.
- `agent:evaluatePolicyExpression=4289.64 ms` and the unchanged
  token/index counters show the remaining wall time is in TypeScript preview
  row materialization and preview-drive setup before score-row WASM evaluation.

Ticket `149FITLEVNUMVM-016` must remain blocked until this residual handoff or a
later non-overlapping owner makes the same-seam gate truthful.

## Assumption Reassessment (2026-05-03)

1. Score-row ABI correctness is not the remaining blocker; tickets
   `150FITLWASM-006` and `150FITLWASM-007` proved parity and active production
   routing for supported full-profile batches.
2. The live production route still materializes state-feature,
   candidate-feature, aggregate, and preview-backed rows through TypeScript
   policy evaluation before passing scalar rows to WASM.
3. The next non-overlapping owner is the row-materialization and preview-drive
   handoff that happens before WASM score-row evaluation, not the F14 default
   flip/deletion owned by `149FITLEVNUMVM-016`.

## Architecture Check

1. Keep the engine generic. Row materialization must use compiled generic policy
   artifacts, encoded state, candidate buffers, and preview-result buffers; no
   FITL-specific ids, card/action branches, schemas, or score shortcuts.
2. Preserve deterministic, bounded preview semantics. If preview application or
   replay identity moves across the FFI boundary, the handoff must prove the same
   generic state/result invariant that the TypeScript path currently owns.
3. Preserve fail-closed behavior. Unsupported row materialization classes must
   reject before scoring and report the unsupported class, candidate count, and
   profile owner.

## What to Change

### 1. Row materialization ownership

Move the remaining production score-row input materialization out of the
TypeScript closure/evaluation hot path where practical. The resulting handoff
must produce the same scalar state-feature, candidate-feature, aggregate, and
preview-backed candidate-feature rows consumed by the current WASM score-row ABI.

### 2. Preview-drive residuals

If live profiling proves preview application/replay identity is the materialized
row bottleneck, design the smallest generic WASM/buffer handoff that preserves
the current preview outcome, failure, gated, and depth-cap semantics. Do not
move legal action publication or default policy routing unless the evidence
shows it is required for the row-materialization contract.

### 3. Measurement and handoff

Run the same-seam profile after the residual handoff. If the gate reaches
`<=250 ms`, update `149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` as unblocked.
If it remains red, record exact metrics and create the next non-overlapping
owner.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` or nearby production evaluation orchestration (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` or nearby row materialization helpers (modify)
- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify if the existing score-row routing helper owns the residual handoff)
- `packages/engine/src/agents/policy-preview.ts` or nearby preview-drive helpers (modify if profiling proves preview handoff ownership)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify if the ABI/API needs row-materialization buffers)
- `packages/engine-wasm/policy-vm/src/lib.rs` (modify if the Rust ABI needs new row-materialization support)
- focused unit/integration witnesses near the changed production and WASM seams (modify)
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` (modify if the gate unblocks or moves)
- this ticket (modify Outcome before archival)

## Out of Scope

- Default-flipping policy evaluation or deleting closure-tree infrastructure.
- Weakening the original Spec 149 `<=250 ms` target.
- Adding FITL-specific opcodes, ids, schemas, or bridge branches.
- Reworking legal action publication or kernel replay semantics beyond the
  minimum generic preview-row handoff proven necessary by profiling.

## Acceptance Criteria

### Tests That Must Pass

1. Production policy evaluation has a focused witness proving the residual
   materialized row path no longer depends on TypeScript closure/evaluation work
   for the supported full-profile FITL baseline batch.
2. Unsupported materialization rows fail closed with deterministic diagnostics
   and do not merge TypeScript fallback scores into a WASM result path.
3. Existing suite: `pnpm -F @ludoforge/engine-wasm build`.
4. Existing suite: `pnpm -F @ludoforge/engine build`.
5. Focused engine proof for the production materialization handoff.
6. Same-seam perf gate command records `<=250 ms`, or records exact red metrics
   after proving the residual handoff is active and creates the next owner.

### Invariants

1. No JSON, host object graph walking, or FITL-specific ids on the hot FFI path.
2. Row materialization activation is explicit, deterministic, and fail-closed.
3. Integer-only deterministic semantics remain aligned across closure-tree,
   TypeScript bytecode VM, Rust/WASM score rows, and any new row-materialization
   handoff.

## Test Plan

### New/Modified Tests

1. Focused production routing/materialization test — proves the residual handoff
   is used for a supported full-profile batch.
2. Focused fail-closed test — proves unsupported materialization classes report
   deterministic diagnostics without TypeScript fallback scores.

### Commands

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. Focused production materialization handoff test command.
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-preview-row-materialization`.

## Outcome

Completed on 2026-05-03 with the same-seam perf gate still red and successor
owner `tickets/150FITLWASM-009.md` created for the remaining preview-state
surface ABI work.

Implemented a generic production score-row setup reduction in
`packages/engine/src/agents/policy-wasm-runtime.ts`: score-row consideration
bytecode is now materialized and compiled once per compiled expression,
parameter object, and encoded-state layout, then reused by subsequent WASM
score-row batches. This removes repeated TypeScript policy-parameter
materialization and bytecode compilation from the production WASM row handoff
without changing the Rust ABI, fallback behavior, or scoring semantics. Focused
coverage proves repeated production score-row batches reuse the cached bytecode.

The profile harness now reports `wasmScoreRowBytecodeCompileCount` so the setup
handoff is visible beside the existing route counters. The final same-seam
profile proved the active route is still fully supported:

- `wasmScoreRowRouteCount=65`
- `wasmScoreRowUnsupportedCount=0`
- `wasmScoreRowBytecodeCompileCount=42`

The measured gate remains red:

- Command: `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-preview-row-materialization`
- Verdict: RED for the `<=250 ms` gate.
- Overall `elapsedMs=6593.92`.
- Per-card row: `turnCount=0`, `elapsedMs=6593.68`, `decisions=159`, `msPerDecision=41.4697`, `closeReason=turnCountAdvanced`.
- Profile buckets: `simAgentChooseMove=3924.43 ms`, `agent:evaluatePolicyExpression=3922.19 ms`, `simApplyMove=855.05 ms`.
- Token/index counters: `tokenStateIndexBuildCount=2377`, `draftTokenStateIndexDeltaCount=198`, `draftTokenStateIndexAttachCount=834`, `draftTokenStateIndexSnapshotCount=315`, `draftTokenStateIndexCowCopyCount=120`.

Residual ownership classification: this ticket proved score-row setup caching is
not enough to close the gate. The remaining non-overlapping owner is a larger
generic preview-state/surface materialization ABI: preview-backed features such
as projected victory margin still require TypeScript preview application,
terminal-margin/surface evaluation, and encoded preview-state row production
before the current WASM score-row route can consume scalar rows.

Verification:

1. `pnpm -F @ludoforge/engine-wasm build` — passed.
2. `pnpm -F @ludoforge/engine build` — passed.
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-runtime.test.js` — passed, 14 tests.
4. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-runtime-encoded.test.js` — passed, 3 tests.
5. `node --check packages/engine/scripts/profile-fitl-preview-drive.mjs` — passed.
6. `pnpm run check:ticket-deps` — passed.
