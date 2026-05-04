# 150FITLWASM-003: Encoded-state action batch bridge

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine-wasm/policy-vm`, `packages/engine/src/agents/policy-wasm-runtime.ts`, policy bytecode integration tests
**Deps**: `archive/specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-002.md`

## Problem

Ticket `150FITLWASM-002` landed supported generic policy bytecode execution in Rust/WASM and proved value equivalence against the TypeScript VM on the supported subset of the existing corpus. It intentionally kept unsupported dynamic/fallback semantics fail-closed and did not move profile-driving encoded state/action batches across the FFI boundary.

Spec 150 Phase 3 now needs the next non-overlapping slice: a batch-oriented encoded-state/action bridge that can evaluate the profile-driving policy surface without JSON or TypeScript object walking on the hot path. Without this bridge, the later same-seam `<=250 ms` performance gate and ticket `149FITLEVNUMVM-016` default-flip/deletion cut remain blocked.

## Assumption Reassessment (2026-05-03)

1. `150FITLWASM-002` added a generic Rust/WASM bytecode evaluator and TypeScript bridge entrypoint for supported expressions, with fail-closed rejection for unsupported bytecode.
2. The active Spec 150 Phase 3 text still requires an encoded-state/action batch bridge; no active `150FITLWASM` successor ticket existed before this review.
3. Tickets `149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` remain blocked by the broader Phase 5/WASM successor path, not by the completed Phase 2 value-equivalence slice alone.

## Architecture Check

1. Keep the engine generic: the bridge consumes `PolicyBytecode`, `EncodedStateLayout`, encoded state buffers, and legal action/candidate artifacts without FITL-specific ids, opcodes, or rule branches.
2. Preserve the F8 deterministic ABI: compact integer/binary buffers with explicit magic, version, and layout identity; no JSON on the hot FFI path.
3. Preserve the staged F14 boundary: TypeScript remains the reference/proof path until the later default flip, but unsupported value domains must be explicit fail-closed handoffs rather than silent fallback inside WASM.

## What to Change

### 1. Batch ABI shape

Extend the Rust export and TypeScript bridge from per-expression value evaluation to a batch-oriented policy bridge for encoded state and action/candidate inputs. The exact function name and buffer shape may differ from the draft spec API, but the contract must stay deterministic, versioned, layout-checked, and batch-oriented.

### 2. Value-domain and unsupported-surface matrix

Inventory the TypeScript VM value domain currently exercised by profile-driving policy evaluation. Encode supported values across the FFI boundary and keep unsupported/dynamic bytecode as deterministic fail-closed errors with tests. Do not reintroduce TypeScript fallback inside the WASM result path.

### 3. Batch parity proof

Add or extend focused integration coverage so the WASM batch bridge is compared against the TypeScript VM over the existing corpus for the supported batch surface. The test must prove both matching values/scores for supported rows and fail-closed behavior for unsupported rows.

### 4. Handoff update

Update Spec 150 and dependent active tickets with any residual unsupported subset. If Phase 3 still does not make the same-seam perf gate executable, create the next non-overlapping ticket before final proof.

## Files to Touch

- `packages/engine-wasm/policy-vm/src/lib.rs` (modify)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify)
- `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` or a nearby batch parity test (modify or new)
- `packages/engine/test/unit/agents/policy-wasm-runtime.test.ts` (modify)
- `archive/specs/150-fitl-policy-vm-wasm-port.md` (modify if the live handoff changes)
- `archive/tickets/150FITLWASM-004.md` (successor for residual candidate-dependent scoring)
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` (modify if successor deps move)
- `tickets/150FITLWASM-003.md` (modify Outcome before archival)

## Out of Scope

- Adding the final `<=250 ms` performance gate; Spec 150 Phase 4 owns that after the batch bridge is correct.
- Default-flipping policy evaluation or deleting closure-tree infrastructure; ticket `149FITLEVNUMVM-016` owns the F14 cut after the WASM path is green.
- Hardcoding FITL-specific policy, card, faction, zone, or action identifiers.
- Weakening the original Spec 149 `<=250 ms` target.

## Acceptance Criteria

### Tests That Must Pass

1. WASM batch bridge parity compares supported batch values/scores against the TypeScript VM over the existing corpus.
2. Unsupported dynamic/value-domain rows fail closed with deterministic errors and do not silently fall back to TypeScript inside the WASM result path.
3. Existing suite: `pnpm -F @ludoforge/engine-wasm build`.
4. Existing suite: `pnpm -F @ludoforge/engine build`.
5. Existing suite: focused engine test command for the new or updated batch parity test.

### Invariants

1. No JSON, host object graph walking, or FITL-specific ids on the hot FFI path.
2. ABI magic, version, layout identity, and buffer lengths are validated before execution.
3. Integer-only deterministic semantics remain aligned with the TypeScript VM for supported values.

## Test Plan

### New/Modified Tests

1. Batch parity coverage in `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` or a nearby integration test.
2. Unit coverage in `packages/engine/test/unit/agents/policy-wasm-runtime.test.ts` for ABI/version/layout/value-domain rejection.

### Commands

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. `pnpm -F @ludoforge/engine exec node --test <dist path for the focused batch parity test>`.

## Outcome

Completed on 2026-05-03. Implemented a deterministic encoded-state/action batch
bridge alongside the existing per-expression bytecode ABI. The new Rust export
`ludoforge_policy_vm_evaluate_bytecode_batch` validates ABI magic, ABI version,
layout identity, candidate count, program length, compact action identity words,
and output length before evaluating supported bytecode rows. The TypeScript
bridge now serializes candidate `actionId` and `stableMoveKey` identity hashes
into the compact batch buffer and decodes per-row tagged values without JSON or
host object walking on the FFI path.

The supported batch parity surface is intentionally limited to bytecode rows
whose value domain is already supported by the Rust VM. Dynamic and
candidate-dependent rows still fail closed instead of falling back to TypeScript
inside the WASM result path. Because that residual surface still prevents the
same-seam `<=250 ms` gate from being a truthful default-flip precondition, this
ticket created successor `archive/tickets/150FITLWASM-004.md` for candidate-dependent
WASM batch scoring integration and rewired dependent active tickets
`149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` to that active owner.

Ticket corrections applied:

- `Files to Touch`: added the required successor/dependent ticket updates caused by the live Phase 3 handoff.
- `Phase 3 handoff`: supported encoded-state/action batch rows landed; candidate-dependent scoring remains a fail-closed successor surface.
- `File-size note`: `packages/engine-wasm/policy-vm/src/lib.rs` was already above the repo's nominal 800-line guidance before this ticket. This ticket added the small batch export at the existing Rust VM ABI seam; splitting the Rust VM during Phase 3 would have widened the ABI slice beyond the ticket boundary.

Final proof:

1. `pnpm -F @ludoforge/engine-wasm build` — passed.
2. `pnpm -F @ludoforge/engine build` — passed.
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-runtime.test.js` — passed, 7 tests.
4. `timeout 180 pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` — passed in about 41 seconds.
5. `pnpm run check:ticket-deps` — passed.

The final ticket/spec/dependency edits after these commands transcribed the
already-proven boundary, moved successor ownership, and did not change the code
or acceptance command semantics. Dependency integrity was rerun after the ticket
graph edit.
