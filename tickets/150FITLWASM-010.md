# 150FITLWASM-010: Preview-drive application WASM/runtime handoff

**Status**: BLOCKED by generic preview-drive substrate prerequisite `tickets/150FITLWASM-011.md`
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — preview-drive runtime/application hot path, WASM/buffer ABI, perf gate
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-009.md`, `tickets/150FITLWASM-011.md`

## Problem

Ticket `150FITLWASM-009` moved supported preview-state candidate-feature row
evaluation into the production WASM score-row route and proved the same-seam
profile is still red:

- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-preview-state-surface-materialization`
- RED: per-card `elapsedMs=6632.26` versus the `<=250 ms` target.
- Active route counters: `wasmScoreRowRouteCount=65`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowRouteCount=77`, and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Remaining buckets include `agent:evaluatePolicyExpression=3935.23 ms` and
  `simApplyMove=866.3 ms`.

The remaining non-overlapping owner is no longer scalar score-row evaluation or
preview candidate-feature expression materialization. The production hot path
still applies preview moves and drives bounded preview completions through the
TypeScript kernel/runtime before WASM can consume scalar preview rows.

Ticket `149FITLEVNUMVM-016` must remain blocked until this preview-drive
handoff or a later non-overlapping owner makes the same-seam gate truthful.

## Foundation-Aligned Boundary Reset

Reassessment on 2026-05-03 confirmed that this ticket cannot truthfully close
on counters, precomputed preview outcome buffers, or another wrapper around the
current TypeScript preview drive. The live WASM crate evaluates policy
bytecode/score-row buffers; it does not yet own generic encoded action/effect
application, decision publication, bounded completion drive, rollback/recovery,
or preview outcome buffer production.

Per Foundations #1, #5, #8, #10, #11, #15, and #16, the preview-drive handoff
must be generic, deterministic, bounded, externally immutable, and proven
equivalent before production routing can claim that supported preview
application/drive batches use WASM. Ticket `tickets/150FITLWASM-011.md` is now
the prerequisite owner for that generic encoded preview-drive substrate. This
ticket remains the later production routing, fail-closed diagnostics, and
same-seam perf-gate owner after that prerequisite exists.

## Architecture Check

1. Keep the engine generic. Any new ABI must consume generic compiled
   artifacts, encoded state/action buffers, preview outcome buffers, and
   generic effect/query programs. No FITL-specific ids, branches, schemas, or
   shortcuts.
2. Preserve the one-rules protocol. Legal action publication remains
   kernel-owned unless this ticket proves an equivalent generic WASM seam for
   the exact same executable decision frontier.
3. Preserve deterministic preview semantics: outcome, failure, gated,
   depth-cap, replay identity, and hidden-sampling behavior must match the
   current TypeScript path.
4. Preserve fail-closed behavior. Unsupported preview-drive classes must reject
   before scoring and report the unsupported class, candidate count, profile
   owner, and feature/drive owner.

## What to Change

### 1. Preview-drive ownership

After `tickets/150FITLWASM-011.md` lands, wire the smallest generic handoff that
removes the remaining TypeScript preview application/drive hot path for the
supported live baseline surface. This may be a WASM preview-application ABI, a
compiled generic effect program path, or another buffer-oriented runtime
handoff, but it must preserve the current preview outcome semantics.

### 2. Production routing and diagnostics

Wire production policy evaluation so supported preview-drive batches use the new
route before preview-state row materialization and score-row evaluation.
Unsupported drive batches must fail closed with deterministic diagnostics and
must not merge TypeScript fallback preview rows into a WASM result path.

### 3. Measurement and handoff

Run the same-seam profile after the handoff. If the gate reaches `<=250 ms`,
update `149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` as unblocked. If it
remains red, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` or nearby preview-drive helpers
- `packages/engine/src/agents/policy-eval.ts` or nearby production evaluation orchestration
- `packages/engine/src/agents/policy-wasm-runtime.ts` if the ABI/API needs new buffers
- `packages/engine-wasm/policy-vm/src/lib.rs` if Rust/WASM owns the new route
- focused unit/integration witnesses near the changed production and WASM seams
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the gate unblocks or moves
- this ticket (modify Outcome before closeout)

## Out of Scope

- Default-flipping policy evaluation or deleting closure-tree infrastructure.
- Weakening the original Spec 149 `<=250 ms` target.
- Adding FITL-specific opcodes, ids, schemas, or bridge branches.
- Reworking score-row or preview candidate-feature materialization already
  proved active by ticket `150FITLWASM-009`, except where the new preview-drive
  route requires a compatible buffer shape.

## Acceptance Criteria

### Tests That Must Pass

1. Production policy evaluation has a focused witness proving supported preview
   drive/application batches use the new generic route.
2. Unsupported preview-drive batches fail closed with deterministic diagnostics
   and do not merge TypeScript fallback preview rows into a WASM result path.
3. Existing suite: `pnpm -F @ludoforge/engine-wasm build`.
4. Existing suite: `pnpm -F @ludoforge/engine build`.
5. Focused engine proof for the production preview-drive handoff.
6. Same-seam perf gate command records `<=250 ms`, or records exact red metrics
   after proving the preview-drive handoff is active and creates the next owner.

### Invariants

1. No JSON, host object graph walking, or FITL-specific ids on the hot FFI path.
2. Preview-drive route activation is explicit, deterministic, and fail-closed.
3. Integer-only deterministic semantics remain aligned across TypeScript kernel
   preview application, any new compiled/WASM route, preview-state row
   materialization, and Rust/WASM score rows.

## Test Plan

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. Focused production preview-drive handoff test command.
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-preview-drive-application`.

## Outcome

Boundary reset on 2026-05-03 after live reassessment and user confirmation of
the Foundation-aligned split. No runtime code was changed under this ticket.

Current fresh same-seam baseline after rebuilding engine and engine-wasm:

- `pnpm -F @ludoforge/engine-wasm build` — passed.
- `pnpm -F @ludoforge/engine build` — passed.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-010-current-baseline` — RED for the `<=250 ms` gate.
- Overall `elapsedMs=6683.62`.
- Per-card row: `turnCount=0`, `elapsedMs=6683.38`, `decisions=159`,
  `msPerDecision=42.0339`, `closeReason=turnCountAdvanced`.
- Active route counters: `wasmScoreRowRouteCount=65`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmScoreRowBytecodeCompileCount=47`,
  `wasmPreviewCandidateFeatureRowRouteCount=77`, and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Remaining buckets: `simAgentChooseMove=3980.74 ms`,
  `agent:evaluatePolicyExpression=3978.47 ms`, and
  `simApplyMove=854.89 ms`.

Decision: this ticket is blocked until `tickets/150FITLWASM-011.md` provides a
generic encoded preview-drive application/runtime substrate. Closing this ticket
on precomputed preview rows, counters, or TypeScript-only optimization would
misstate the handoff and violate the Foundations-aligned one-rules protocol and
testing-as-proof requirements.
