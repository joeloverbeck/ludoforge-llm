# 150FITLWASM-006: Preview-backed WASM score-row handoff and perf gate preflight

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine-wasm/policy-vm`, `packages/engine/src/agents/policy-wasm-runtime.ts`, preview score-row integration
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-005.md`

## Problem

Ticket `150FITLWASM-005` added generic precomputed state-feature,
candidate-feature, and candidate-aggregate rows to the WASM batch ABI and proved
full non-preview score-row parity against the TypeScript reference. The current
FITL baseline profiles still cannot run the full preview-backed score path
through WASM. A full-profile parity attempt showed that preview-cost rows cannot
consume static root/precomputed values without changing scores; they require an
explicit preview-materialized row handoff.

The Spec 150 Phase 4 same-seam `<=250 ms` gate is still not a truthful handoff
precondition for ticket `149FITLEVNUMVM-016`.

## Architecture Check

1. Keep the engine generic: preview-backed inputs must be represented as generic
   preview result rows, encoded buffers, and candidate tables. No FITL-specific
   ids, card/action branches, or schemas.
2. Do not substitute root-state values for preview values. Preview row handoff
   must preserve the TypeScript preview materialization semantics for the
   current corpus.
3. Preserve deterministic fail-closed behavior. Unsupported preview rows must
   not be approximated as numeric scores.

## What to Change

### 1. Preview-backed row encoding

Add a generic preview-backed score-row input table to the WASM batch path for the
preview values required by the current baseline profile corpus. Validate row
counts, candidate counts, value domains, and preview outcome/status before
evaluation.

### 2. Evaluator integration

Wire the policy-driving evaluation path so preview-backed rows can participate
in the WASM score-row result only when their preview inputs have been
materialized through the same semantics as the TypeScript reference path. Do not
merge TypeScript fallback scores into the WASM result path.

### 3. Full-profile parity and perf preflight

Extend the corpus parity witness so all baseline profile score rows, including
preview-backed considerations, match the TypeScript reference. Then run the Spec
150 Phase 4 same-seam `<=250 ms` profile command. If it is green, update
dependent tickets so `149FITLEVNUMVM-016` can execute its F14 default-flip cut.
If it remains red, record the exact metric and create the next non-overlapping
owner.

## Files to Touch

- `packages/engine-wasm/policy-vm/src/lib.rs` (modify)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` or nearby policy-evaluation integration module (modify)
- `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-wasm-runtime.test.ts` (modify)
- `specs/150-fitl-policy-vm-wasm-port.md` (modify if the live handoff changes)
- dependent active tickets `149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` (modify if this gate unblocks or moves)
- this ticket (modify Outcome before archival)

## Out of Scope

- Default-flipping policy evaluation or deleting closure-tree infrastructure;
  ticket `149FITLEVNUMVM-016` owns that after the WASM path is green.
- Weakening the original Spec 149 `<=250 ms` target.
- Adding FITL-specific opcodes, ids, schemas, or bridge branches.
- Reverting ticket `150FITLWASM-005`'s non-preview precomputed row tables.

## Acceptance Criteria

### Tests That Must Pass

1. Full-profile WASM score rows, including preview-backed rows, match the
   TypeScript reference for the current FITL baseline corpus.
2. Unsupported preview/dynamic rows fail closed with deterministic errors and do
   not silently fall back inside the WASM result path.
3. Existing suite: `pnpm -F @ludoforge/engine-wasm build`.
4. Existing suite: `pnpm -F @ludoforge/engine build`.
5. Existing suite: focused engine test command for the full-profile WASM score
   parity witness.

### Invariants

1. No JSON, host object graph walking, or FITL-specific ids on the hot FFI path.
2. ABI magic, version, layout identity, candidate/action buffer lengths, row
   counts, preview outcome domains, and value domains are validated before
   execution.
3. Integer-only deterministic semantics remain aligned with the TypeScript
   reference for supported scores.

## Test Plan

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. `pnpm -F @ludoforge/engine exec node --test <dist path for the focused full-profile score parity test>`.
4. If full-profile parity is green: `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-preview-score-preflight`.
