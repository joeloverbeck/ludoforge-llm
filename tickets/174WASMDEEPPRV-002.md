# 174WASMDEEPPRV-002: Phase 1a — Serialize Foundation-20 preview-signal carriers across WASM FFI

**Status**: PENDING
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
