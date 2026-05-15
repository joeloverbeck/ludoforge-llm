# 174WASMDEEPPRV-002: Phase 1a — Serialize Foundation-20 preview-signal carriers across WASM FFI

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — Rust `policy-vm` ABI + TS bridge
**Deps**: `archive/tickets/174WASMDEEPPRV-001.md`

## Problem

Foundation #20 (Preview Signal Integrity) requires that preview statuses, fallback paths, and unavailable outcomes remain explicit across every boundary. The TS side already preserves `previewStatus`, `previewBranch`, `tiebreakAfterPreviewNoSignal`, and the `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory (see `policy-wasm-score-routing.ts:296-314`), but the WASM ABI today returns only integer outcomes (`OUTCOME_COMPLETED`, `OUTCOME_DEPTH_CAP`, etc. — see `preview_drive.rs:31-100`) plus preview-state values. None of the F#20 signal carriers survive the FFI boundary. Without ABI-level signal preservation, Phase 3 activation (ticket 008) would silently coerce non-`ready` rows into scalar contributions, violating the explicit-outcome contract.

## Assumption Reassessment (2026-05-15)

1. Confirmed Rust `evaluate_preview_drive_batch` (`preview_drive.rs:69`) outputs `out_outcomes_ptr` (i32 array) and `out_preview_state_ptr` (i32 array) only — no signal-carrier channel exists.
2. Confirmed TS-side `previewOutcome`, `previewFailureReason`, and `unknownPreviewRefs` are populated from outcome integers at `policy-wasm-score-routing.ts:296-314`; no F#20-equivalent serialization currently leaves WASM.
3. The 174 Phase 0 inventory (ticket 001) names which unsupported classes today are caused by missing signal-carrier ABI — this ticket closes that subset.

## Architecture Check

1. Without signal carriers on the ABI, Phase 3 activation cannot honour F#20 — activation would coerce hidden / stochastic / unresolved / failed rows into completed scalar contributions, violating the explicit-outcome contract.
2. Engine-agnostic (F#1): signal carriers are generic enums plus a boolean advisory; no game-specific data crosses the boundary.
3. No backwards-compatibility shim (F#14): the new ABI fields ship as a versioned extension. The ABI version constant is bumped; older callers are rejected explicitly. No alias path.

## What to Change

### 1. Rust ABI extension

In `packages/engine-wasm/policy-vm/src/preview_drive.rs` and `packages/engine-wasm/policy-vm/src/lib.rs`:
- Add output channels for: `preview_status` (enum mirroring TS `previewStatus`), `preview_branch` (enum), `tiebreak_after_preview_no_signal` (bool flag), and a `policy_preview_signal_unavailable` advisory flag.
- Bump the ABI version constant; reject inputs targeting older versions deterministically.
- For rows that cannot populate these carriers under the current Phase 1 subset, emit a stable `unsupportedClass` reason consumed by the TS bridge.

### 2. TS bridge reconstruction

In `policy-wasm-production-preview-drive.ts`, `policy-wasm-production-preview-drive-types.ts`, `policy-wasm-production-preview-drive-lowering.ts`:
- Add type definitions for the new output fields.
- Read the new fields from the WASM response and reconstruct the F#20 carriers on the TS side (mirroring `policy-wasm-score-routing.ts:296-314`).
- Surface `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` through the existing TS advisory pipeline.

### 3. Round-trip parity test

`packages/engine/test/unit/agents/policy-wasm-preview-signal-carriers.test.ts` (`@test-class: architectural-invariant`): for each F#20 `previewStatus` × `previewBranch` combination, encode a synthetic preview-drive input, evaluate via WASM, decode, and assert byte-equivalence with the TS-side carrier representation.

## Files to Touch

- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify)
- `packages/engine-wasm/policy-vm/src/lib.rs` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-lowering.ts` (modify)
- `packages/engine/test/unit/agents/policy-wasm-preview-signal-carriers.test.ts` (new)

## Out of Scope

- No production route activation (Phase 3, ticket 008) — this ticket only adds ABI capability.
- No decision-stack publication, preview-state slot, candidate grouping, or completion-semantics ABI work (tickets 003–006).
- No FITL-specific identifiers in Rust or TS.

## Acceptance Criteria

### Tests That Must Pass

1. New round-trip test passes.
2. Existing engine suite green: `pnpm turbo build && pnpm turbo test`.
3. Determinism gates green:
   - `packages/engine/test/determinism/spec-140-replay-identity.test.ts`
   - `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts`
   - `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts`

### Invariants

1. F#20 signal carriers reach the TS caller for every Phase-1a-supported preview-drive row — no silent coercion to scalar.
2. Rust ABI version bump rejects older callers explicitly (no silent compatibility shim).
3. New test file carries `@test-class: architectural-invariant` marker.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-wasm-preview-signal-carriers.test.ts` — round-trip parity for each F#20 `previewStatus` × `previewBranch` combination.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-signal-carriers.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-05-15

Implemented the Phase 1a ABI carrier substrate:

- ABI identity: `ABI_VERSION` bumped from `10` to `11` in Rust and TS host mirrors; `ABI_MAGIC` and preview-drive layout id are unchanged.
- Rust preview-drive FFI now writes four per-row output channels: preview status, preview branch, `tiebreakAfterPreviewNoSignal`, and `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` flag.
- TS preview-drive host codec now encodes optional synthetic carrier fixtures, decodes the four output channels into `previewSignalCarrier`, and preserves caller-supplied production preview branch metadata independently from derived row status.
- Production preview-drive lowering now threads `previewBranch` through the caller-known branch (`greedy` or `continuedDeepening`) while leaving production route activation to `tickets/174WASMDEEPPRV-008.md`.
- `policy-wasm-score-routing.ts` now consumes decoded `previewStatus` when populating candidate preview metadata, so non-ready WASM rows feed the existing `unknownPreviewRefs` / advisory pipeline instead of being inferred only from the older integer outcome.
- Added `packages/engine/test/unit/agents/policy-wasm-preview-signal-carriers.test.ts` with `@test-class: architectural-invariant`.

Ticket corrections applied:

- Entry correction: requested namespace `174WASMDEPPPRV-002` resolved to the live `174WASMDEEPPRV-002` namespace from `specs/174-wasm-preview-drive-coverage-extension.md`.
- Touched-file scope correction: the live generic host codec and runtime ABI mirrors are `packages/engine/src/agents/policy-wasm-preview-drive.ts`, `packages/engine/src/agents/policy-wasm-runtime.ts`, and `packages/engine/src/agents/policy-wasm-score-routing.ts` in addition to the ticket-named production lowering/types and Rust files. `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` stayed verified-no-edit because the carrier reconstruction belongs to the runtime codec and lowering boundary; the production wrapper's caller-known branch is carried through its typed input/lowering seam.

Generated fallout:

- No schema, GameDef, trace-schema, or golden artifact changes expected. The Rust `ludoforge_policy_vm.wasm` build artifact was regenerated under ignored `target/` output by `pnpm -F @ludoforge/engine-wasm build`.

Source-size ledger:

- `packages/engine-wasm/policy-vm/src/preview_drive.rs | before 379 | after 470 | crossed cap? no | active growth yes | extraction/defer rationale: ABI codec state/output expansion is local to the existing preview-drive guest module and remains below cap | successor if any: none`
- `packages/engine-wasm/policy-vm/src/lib.rs | before 1307 | after 1307 | crossed cap? no, preexisting oversize | active growth no net growth | extraction/defer rationale: version mirror only; extracting the existing Rust VM hub would widen this ABI ticket | successor if any: none`
- `packages/engine/src/agents/policy-wasm-runtime.ts | before 1333 | after 1353 | crossed cap? no, preexisting oversize plus active growth | extraction/defer rationale: output-pointer allocation/decode mirror stays beside existing WASM runtime calls; extracting the existing runtime bridge would widen this ticket | successor if any: none`
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts | before 779 | after 779 | crossed cap? no, near cap | active growth no | extraction/defer rationale: verified-no-edit | successor if any: none`

Verification so far:

- RED: `pnpm -F @ludoforge/engine build` failed before implementation on missing carrier exports/row field in the new test.
- `cargo fmt --manifest-path packages/engine-wasm/policy-vm/Cargo.toml` - passed.
- `pnpm -F @ludoforge/engine-wasm build` - passed.
- `pnpm -F @ludoforge/engine build` - passed.
- `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-signal-carriers.test.js` - passed; 2 tests passed.
- `node --test packages/engine/dist/test/unit/agents/policy-preview-driver.test.js` - passed; 12 tests passed.
- `node --test packages/engine/dist/test/unit/agents/policy-wasm-runtime.test.js` - passed; 15 tests passed.
- `node --test packages/engine/dist/test/determinism/spec-140-replay-identity.test.js packages/engine/dist/test/determinism/forked-vs-fresh-runtime-parity.test.js packages/engine/dist/test/integration/policy-bytecode-equivalence.test.js packages/engine/dist/test/integration/policy-bytecode-equivalence-partial-visibility.test.js` - passed; 24 tests passed.
- `pnpm -F @ludoforge/engine lint` - passed.

Final verification:

- `pnpm turbo build` - passed; `@ludoforge/engine-wasm`, `@ludoforge/engine`, and `@ludoforge/runner` built. Runner emitted the existing Vite large-chunk advisory, which is non-ticket-owned.
- `pnpm turbo test` - passed; engine default lane reported `81/81 files passed`; runner tests passed with known jsdom canvas and crash-recovery stderr advisories, which are non-ticket-owned.
- `pnpm turbo lint` - passed; runner lint replayed from cache as supplemental, engine lint ran.
- `pnpm turbo typecheck` - passed; engine build replayed from cache from the just-run broad build, engine and runner typechecks ran.
- `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-signal-carriers.test.js` - rerun after broad lanes; passed; 2 tests passed.
- `pnpm run check:ticket-deps` - passed for 9 active tickets and 2352 archived tickets after repairing the noncanonical typo reference in this outcome ledger.

Late-edit proof validity: the terminal status, final verification transcription, and typo-reference repair above record only the just-run proof results and keep the already-approved scope, command semantics, touched-file ownership, dependency ownership, and acceptance criteria unchanged. No code proof rerun is required for this closeout edit. The dependency-check transcription is result-only and does not change graph edges, so no second dependency-check rerun is required.
