# 150FITLWASM-004: Candidate-dependent WASM batch scoring integration

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine-wasm/policy-vm`, `packages/engine/src/agents/policy-wasm-runtime.ts`, policy evaluation integration, perf gate wiring
**Deps**: `archive/specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-003.md`

## Problem

Ticket `150FITLWASM-003` added the deterministic encoded-state/action batch ABI and proved supported bytecode rows over the existing corpus. It intentionally kept candidate-dependent and dynamic policy surfaces fail-closed, and it did not default the profile evaluator to the WASM batch path.

Spec 150 still needs the next non-overlapping slice before the same-seam `<=250 ms` performance gate can be truthfully run as a successor runtime: candidate-dependent scoring rows must be represented across the compact ABI and wired into the profile-driving evaluation path without TypeScript fallback inside the WASM result path.

## Assumption Reassessment (2026-05-03)

1. The Rust/WASM VM has supported generic bytecode value parity and a batch entrypoint that validates ABI magic, version, layout identity, buffer length, and action identity words.
2. The current batch bridge transports candidate/action identity but does not yet consume candidate-specific params, intrinsic action ids, tags, preview refs, or candidate feature refs in WASM.
3. Active tickets `149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` remain blocked until this successor path can run the original same-seam profile gate truthfully.

## Architecture Check

1. Keep the engine generic: candidate/action data must be encoded as generic ids, hashes, numeric params, tags, and feature rows; no FITL-specific action/card/faction ids in Rust or bridge code.
2. Preserve the deterministic compact ABI from ticket 003. Unsupported value domains must reject deterministically rather than falling back to TypeScript inside the WASM result path.
3. Preserve F14 staging: TypeScript remains the reference path until a later default-flip ticket, but this ticket must make the WASM batch path executable enough for the Phase 4 perf gate precondition.

## What to Change

### 1. Candidate/action feature encoding

Extend the batch ABI and bridge to encode the candidate-dependent policy surface currently exercised by the profile-driving corpus: numeric candidate params, supported candidate intrinsics, action/tag membership where deterministic, and any supported candidate feature rows that can be represented without host object walking.

### 2. Batch score integration

Add a TypeScript integration path that asks the WASM batch bridge for supported move-consideration score rows. Unsupported rows must fail closed and be reported as unsupported; do not silently merge TypeScript fallback results into a WASM result.

### 3. Corpus parity and unsupported matrix

Extend the corpus parity test so it compares candidate-dependent WASM batch scores against the TypeScript VM/reference path for supported rows and records the residual unsupported surface. The test must prove no unsupported row is approximated as a numeric score.

### 4. Perf-gate handoff

If the supported candidate-dependent batch path is sufficient, run the Spec 150 Phase 4 same-seam profile command and update the dependent active tickets with the result. If the gate remains red or unsupported surfaces still block execution, create the next non-overlapping owner before final proof.

## Files to Touch

- `packages/engine-wasm/policy-vm/src/lib.rs` (modify)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` or nearby policy-evaluation integration module (modify)
- `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` or nearby batch scoring parity test (modify or new)
- `packages/engine/test/unit/agents/policy-wasm-runtime.test.ts` (modify)
- `archive/specs/150-fitl-policy-vm-wasm-port.md` (modify if the live handoff changes)
- this ticket (modify Outcome before archival)

## Out of Scope

- Default-flipping policy evaluation or deleting closure-tree infrastructure; ticket `149FITLEVNUMVM-016` owns that after the WASM path is green.
- Weakening the original Spec 149 `<=250 ms` target.
- Adding FITL-specific opcodes, ids, schemas, or bridge branches.

## Acceptance Criteria

### Tests That Must Pass

1. WASM candidate-dependent batch scores match the TypeScript reference for supported corpus rows.
2. Unsupported candidate/dynamic rows fail closed with deterministic errors and do not silently fall back inside the WASM result path.
3. Existing suite: `pnpm -F @ludoforge/engine-wasm build`.
4. Existing suite: `pnpm -F @ludoforge/engine build`.
5. Existing suite: focused engine test command for the new or updated candidate-dependent batch parity test.

### Invariants

1. No JSON, host object graph walking, or FITL-specific ids on the hot FFI path.
2. ABI magic, version, layout identity, candidate/action buffer lengths, and value domains are validated before execution.
3. Integer-only deterministic semantics remain aligned with the TypeScript reference for supported values and scores.

## Test Plan

### New/Modified Tests

1. Candidate-dependent batch parity coverage in `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` or a nearby integration test.
2. Unit coverage in `packages/engine/test/unit/agents/policy-wasm-runtime.test.ts` for candidate/action buffer validation and unsupported candidate-surface rejection.

### Commands

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. `pnpm -F @ludoforge/engine exec node --test <dist path for the focused candidate-dependent batch parity test>`.

## Outcome

Completed on 2026-05-03. Implemented generic candidate-dependent WASM batch
score support for the currently supported scalar subset. The compact batch ABI
now carries candidate action/stable-key intrinsic codes, scalar candidate params,
and deterministic action tag membership. The Rust VM consumes those candidate
records per batch row, while unsupported candidate tag-list, dynamic, aggregate,
and preview-backed surfaces still fail closed instead of falling back to
TypeScript inside the WASM result path.

The TypeScript bridge now exposes `evaluateWasmMoveConsiderationScoreRows`,
which asks the WASM batch runtime for supported move-consideration score rows,
materializes profile parameters into deterministic literals, applies the
existing `when`/`weight`/`value`/`unknownAs`/`clamp` contribution rules, and
returns `unsupported` when any row cannot be represented. The bytecode compiler
was also tightened so an expression's own candidate refs are included in the
compiled feature table even when a synthetic test `GameDef` does not already
catalog that ref globally.

Residual handoff: the full FITL baseline profile-driving score path still has
unsupported rows for library candidate-feature refs, candidate aggregates,
preview-backed features, and related dynamic surfaces. The Spec 150 Phase 4
same-seam `<=250 ms` profile gate was not run as final acceptance because the
full WASM score path is not yet a truthful gate precondition. Created successor
`tickets/150FITLWASM-005.md` for full policy score-row WASM handoff and perf
gate preflight, and rewired dependent active tickets `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` to that active owner.

Ticket corrections applied:

- `Candidate/action feature encoding`: implemented the live supported scalar
  subset, including candidate tags and scalar params; deferred full candidate
  feature/aggregate/preview row support to ticket 005.
- `Post-review candidate param domain`: preserved unsupported non-scalar
  candidate params as deterministic `undefined` entries in the batch table
  instead of dropping them, so supported expressions can still batch unrelated
  candidates while `candidateParamCount` remains truthful.
- `Perf-gate handoff`: classified the Phase 4 gate as still blocked by
  unsupported full-profile rows instead of running a misleading same-seam perf
  gate.
- `File-size note`: `packages/engine-wasm/policy-vm/src/lib.rs` was already
  above the repo's nominal 800-line guidance before this ticket series. This
  ticket extended the existing Rust VM ABI seam; splitting the crate during this
  candidate-row slice would have widened the ticket beyond the live boundary.

Final proof:

1. `pnpm -F @ludoforge/engine-wasm build` — passed.
2. `pnpm -F @ludoforge/engine build` — passed.
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-runtime.test.js` — passed, 10 tests.
4. `timeout 180 pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` — passed in about 50 seconds.
5. `pnpm run check:ticket-deps` — passed.
