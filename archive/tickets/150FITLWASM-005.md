# 150FITLWASM-005: Full policy score-row WASM handoff and perf gate preflight

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine-wasm/policy-vm`, `packages/engine/src/agents/policy-wasm-runtime.ts`, policy evaluator handoff, perf gate wiring
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-004.md`

## Problem

Ticket `150FITLWASM-004` added generic candidate-dependent batch score support for
the currently supported scalar subset: candidate action/stable-key intrinsics,
scalar candidate params, action tag membership, profile-parameter materialization,
and supported move-consideration score rows. The focused parity test proves those
supported rows against the TypeScript reference and confirms unsupported rows fail
closed.

The full FITL baseline profile-driving score path still cannot run entirely
through the WASM result path. Residual score rows still depend on library
candidate-feature refs, candidate aggregates, preview-backed features, or other
dynamic surfaces that ticket 004 intentionally leaves fail-closed. The Spec 150
Phase 4 same-seam `<=250 ms` gate is therefore still not a truthful handoff
precondition for ticket `149FITLEVNUMVM-016`.

## Architecture Check

1. Keep the engine generic: residual rows must be represented through generic
   compiled policy artifacts, encoded buffers, candidate tables, and preview
   result tables. No FITL-specific ids, card/action branches, or schemas.
2. Preserve the compact ABI and deterministic fail-closed behavior from tickets
   003 and 004. Unsupported rows must not be approximated as numeric scores.
3. Preserve F14 staging: TypeScript remains the reference path until the WASM
   score path can drive the profile evaluation path and the perf gate is green.

## What to Change

### 1. Candidate feature and aggregate score rows

Represent supported library candidate-feature refs and candidate aggregates in
the WASM batch path without host object walking. The bridge must distinguish
precomputed candidate-feature rows from aggregate rows and validate row counts,
candidate counts, and value domains before evaluation.

### 2. Preview-backed row handoff

Either encode the preview-backed score inputs required by the current corpus, or
prove they remain a separate prerequisite with a narrower successor. Do not
silently substitute root-state values for preview values.

### 3. Evaluator integration

Wire the policy-driving evaluation path so the WASM score-row result is used for
supported batches without merging TypeScript fallback scores into the WASM result
path. If any full-profile row remains unsupported, the profile batch must fail
closed and report the unsupported owner.

### 4. Perf gate preflight

When the full profile-driving score path is supported, run the Spec 150 Phase 4
same-seam profile command. If it is green at `<=250 ms`, update the dependent
tickets so ticket `149FITLEVNUMVM-016` can execute its F14 default-flip/deletion
cut. If it remains red, record the exact metric and create the next
non-overlapping owner.

## Files to Touch

- `packages/engine-wasm/policy-vm/src/lib.rs` (modify)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` or nearby policy-evaluation integration module (modify)
- `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` or nearby score-row parity test (modify or new)
- `packages/engine/test/unit/agents/policy-wasm-runtime.test.ts` (modify)
- `specs/150-fitl-policy-vm-wasm-port.md` (modify if the live handoff changes)
- dependent active tickets `149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` (modify if this gate unblocks or moves)
- this ticket (modify Outcome before archival)

## Out of Scope

- Default-flipping policy evaluation or deleting closure-tree infrastructure;
  ticket `149FITLEVNUMVM-016` owns that after the WASM path is green.
- Weakening the original Spec 149 `<=250 ms` target.
- Adding FITL-specific opcodes, ids, schemas, or bridge branches.

## Acceptance Criteria

### Tests That Must Pass

1. Full-profile WASM score rows match the TypeScript reference for supported
   corpus rows.
2. Residual unsupported dynamic/preview rows fail closed with deterministic
   errors and do not silently fall back inside the WASM result path.
3. Existing suite: `pnpm -F @ludoforge/engine-wasm build`.
4. Existing suite: `pnpm -F @ludoforge/engine build`.
5. Existing suite: focused engine test command for the full-profile WASM score
   parity witness.

### Invariants

1. No JSON, host object graph walking, or FITL-specific ids on the hot FFI path.
2. ABI magic, version, layout identity, candidate/action buffer lengths, row
   counts, and value domains are validated before execution.
3. Integer-only deterministic semantics remain aligned with the TypeScript
   reference for supported scores.

## Test Plan

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. `pnpm -F @ludoforge/engine exec node --test <dist path for the focused full-profile score parity test>`.
4. If full-profile parity is green: `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-score-preflight`.

## Outcome

Completed on 2026-05-03. Implemented the generic precomputed score-row handoff
for the remaining non-preview corpus rows. The WASM batch ABI is now version 3
and carries generic precomputed state-feature, candidate-feature, and
candidate-aggregate value tables alongside the candidate action rows. The
bytecode feature table now compiles library `stateFeature`, `candidateFeature`,
and `aggregate` refs to generic WASM feature refs, and the Rust VM resolves
those refs from validated precomputed rows rather than walking host objects or
falling back to TypeScript scores inside the WASM result path.

Preview-backed considerations remain fail-closed. During full-profile parity,
allowing preview-cost rows to consume static precomputed rows produced wrong
scores for a live `vc-baseline` corpus state, proving that preview row handoff
must preserve preview materialization semantics rather than substituting root or
static values. Created successor `tickets/150FITLWASM-006.md` for preview-backed
score-row handoff and kept the Spec 150 Phase 4 `<=250 ms` perf preflight
blocked until that owner lands. No perf gate was run as final acceptance because
the full preview-backed score path is not yet a truthful gate precondition.

Final proof:

1. `pnpm -F @ludoforge/engine-wasm build` — passed.
2. `pnpm -F @ludoforge/engine build` — passed.
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-runtime.test.js` — passed, 11 tests.
4. `timeout 180 pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` — passed in about 63 seconds.
