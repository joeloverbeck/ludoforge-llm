# 150FITLWASM-009: Preview-state surface row materialization WASM ABI

**Status**: COMPLETED with red measured gate successor `tickets/150FITLWASM-010.md`
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — preview-state row materialization, WASM/buffer ABI, perf gate
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-008.md`

## Problem

Ticket `150FITLWASM-008` removed repeated score-row bytecode
materialization/compilation from the production WASM score-row handoff, but the
same-seam Spec 150 gate is still red:

- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-preview-row-materialization`
- RED: per-card `elapsedMs=6593.68` versus the `<=250 ms` target.
- `wasmScoreRowRouteCount=65`, `wasmScoreRowUnsupportedCount=0`, and
  `wasmScoreRowBytecodeCompileCount=42`.
- Remaining buckets include `agent:evaluatePolicyExpression=3922.19 ms` and
  `simApplyMove=855.05 ms`.

The live production route still needs TypeScript to apply preview moves, produce
preview states, evaluate preview-surface and preview-state feature rows, and
then pass scalar rows into the existing WASM score-row ABI. Preview-backed
features such as projected victory margin compile to dynamic surface refs that
the current Rust/WASM runtime cannot evaluate from encoded preview-state
buffers.

Ticket `149FITLEVNUMVM-016` must remain blocked until this preview-state
surface handoff or a later non-overlapping owner makes the same-seam gate
truthful.

## Architecture Check

1. Keep the engine generic. The ABI must carry compiled generic policy artifacts,
   encoded root/preview state buffers, candidate buffers, preview outcomes, and
   generic surface/terminal-margin programs. No FITL-specific ids, card/action
   branches, schemas, or score shortcuts.
2. Preserve deterministic, bounded preview semantics. TypeScript may still own
   legal action publication and preview application until a later ticket proves
   an equivalent generic WASM seam, but every row evaluated across the ABI must
   preserve the current outcome, failure, gated, depth-cap, and replay-identity
   semantics.
3. Preserve fail-closed behavior. Unsupported preview-state or surface row
   classes must reject before scoring and report the unsupported class,
   candidate count, profile owner, and feature owner.

## What to Change

### 1. Preview-state row ABI

Design and implement the smallest generic WASM/buffer handoff that can evaluate
preview-backed candidate-feature rows from encoded preview states and preview
outcome buffers. The route must support the live baseline preview feature
surface needed by Spec 150 without JSON or host object graph walking on the hot
FFI path.

### 2. Generic surface and terminal-margin support

Add generic Rust/WASM support, or an equivalent compiled-buffer handoff, for the
preview-surface row classes required by the current baseline corpus. At minimum,
the supported subset must cover projected victory margin and preview-state
feature rows without falling back to TypeScript closure evaluation.

### 3. Production routing and diagnostics

Wire production policy evaluation so supported preview-backed candidate-feature
rows are materialized through the new ABI before score-row evaluation. Unsupported
rows must fail closed with deterministic diagnostics and must not merge
TypeScript fallback row values into a WASM result path.

### 4. Measurement and handoff

Run the same-seam profile after the ABI handoff. If the gate reaches `<=250 ms`,
update `149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` as unblocked. If it remains
red, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` or nearby production evaluation orchestration (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` or nearby preview row helpers (modify)
- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` or nearby preview-drive helpers (modify if the ABI needs preview-state access)
- `packages/engine-wasm/policy-vm/src/lib.rs` (modify)
- focused unit/integration witnesses near the changed production and WASM seams (modify)
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` (modify if the gate unblocks or moves)
- this ticket (modify Outcome before closeout)

## Out of Scope

- Default-flipping policy evaluation or deleting closure-tree infrastructure.
- Weakening the original Spec 149 `<=250 ms` target.
- Adding FITL-specific opcodes, ids, schemas, or bridge branches.
- Moving legal action publication or full preview application into WASM unless
  evidence shows it is required for the preview-state row materialization
  contract.

## Acceptance Criteria

### Tests That Must Pass

1. Production policy evaluation has a focused witness proving supported
   preview-backed candidate-feature rows are materialized through the new WASM
   preview-state/surface route.
2. Unsupported preview-state/surface rows fail closed with deterministic
   diagnostics and do not merge TypeScript fallback row values into a WASM result
   path.
3. Existing suite: `pnpm -F @ludoforge/engine-wasm build`.
4. Existing suite: `pnpm -F @ludoforge/engine build`.
5. Focused engine proof for the production preview-state materialization
   handoff.
6. Same-seam perf gate command records `<=250 ms`, or records exact red metrics
   after proving the preview-state handoff is active and creates the next owner.

### Invariants

1. No JSON, host object graph walking, or FITL-specific ids on the hot FFI path.
2. Preview-state row materialization activation is explicit, deterministic, and
   fail-closed.
3. Integer-only deterministic semantics remain aligned across closure-tree,
   TypeScript bytecode VM, Rust/WASM score rows, and preview-state row
   materialization.

## Test Plan

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. Focused production preview-state materialization handoff test command.
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-preview-state-surface-materialization`.

## Outcome

Completed on 2026-05-03 with the same-seam perf gate still red and successor
owner `tickets/150FITLWASM-010.md` created for the remaining preview-drive
application/runtime handoff.

Implemented a generic dynamic preview row handoff in the WASM batch ABI. The
TypeScript production route now materializes supported preview-state and
preview-surface scalar rows as deterministic dynamic candidate-feature buffers,
then evaluates the preview candidate-feature expressions through WASM before
passing the resulting preview rows into the existing WASM score-row route.
Unsupported preview candidate-feature expressions fail closed before scoring.

The route remains generic: the ABI carries layout/version identity,
candidate-ordered scalar row buffers, preview outcome tags, and dynamic ref
codes derived from compiled policy refs. It does not introduce FITL-specific ids,
schemas, or score shortcuts, and legal action publication / preview application
remain TypeScript-owned as this ticket allowed.

The profile harness now reports preview candidate-feature row counters. The
final same-seam profile proved the active route is supported:

- `wasmScoreRowRouteCount=65`
- `wasmScoreRowUnsupportedCount=0`
- `wasmScoreRowBytecodeCompileCount=47`
- `wasmPreviewCandidateFeatureRowRouteCount=77`
- `wasmPreviewCandidateFeatureRowUnsupportedCount=0`

The measured gate remains red:

- Command: `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-preview-state-surface-materialization`
- Verdict: RED for the `<=250 ms` gate.
- Overall `elapsedMs=6632.48`.
- Per-card row: `turnCount=0`, `elapsedMs=6632.26`, `decisions=159`,
  `msPerDecision=41.7123`, `closeReason=turnCountAdvanced`.
- Profile buckets: `simAgentChooseMove=3937.38 ms`,
  `agent:evaluatePolicyExpression=3935.23 ms`, `simApplyMove=866.3 ms`.
- Token/index counters: `tokenStateIndexBuildCount=2377`,
  `draftTokenStateIndexDeltaCount=198`,
  `draftTokenStateIndexAttachCount=834`,
  `draftTokenStateIndexSnapshotCount=315`,
  `draftTokenStateIndexCowCopyCount=120`.

Residual ownership classification: this ticket proved preview-state/surface row
materialization is active and fail-closed, but it is not enough to close the
gate. The remaining non-overlapping owner is generic preview-drive application
runtime work before row materialization: production still applies preview moves
and drives bounded completions through the TypeScript kernel/runtime.

File-size note: several touched authority files are already broad shared
surfaces (`policy-evaluation-core.ts`, `policy-wasm-runtime.ts`, and Rust
`lib.rs`). Further extraction of ABI encoder/parser helpers would be a
nontrivial shared-structure refactor, so this ticket keeps the implementation
local and leaves additional decomposition to the next ABI/runtime owner if it
continues expanding these files.

Verification:

1. `pnpm -F @ludoforge/engine-wasm build` — passed.
2. `pnpm -F @ludoforge/engine build` — passed.
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-runtime.test.js` — passed, 15 tests.
4. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-evaluation-topk-gate.test.js` — passed, 6 tests.
5. `node --check packages/engine/scripts/profile-fitl-preview-drive.mjs` — passed.
