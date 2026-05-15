# 174WASMDEEPPRV-004: Phase 1c — Preview-state slot ABI extensions

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — Rust `policy-vm` ABI + TS bridge
**Deps**: `archive/tickets/174WASMDEEPPRV-001.md`

## Problem

The current preview-drive ABI's `preview_state` buffer (`preview_drive.rs:37-38`, `preview_drive.rs:100-104`) is fixed at a per-call slot count, and Rust uses operations like `add_to_primary_preview_state_value` / `set_primary_preview_state_value` that target a single primary slot. For `continuedDeepening` / `deep1024` configs, the deep pass requires extended preview-state slot semantics: multi-slot publication, slot lifetime across deepening iterations, and slot identity stable across rebroadcast. Without these extensions, the deep-phase route falls closed for any config whose preview-state slot count exceeds 1 or whose slots reuse across iterations.

## Assumption Reassessment (2026-05-15)

1. Confirmed `preview_drive.rs:100-118` allocates a `preview_state_slot_count`-sized vector per call and reads `cursor` for slot values; there is no multi-slot lifetime concept.
2. Confirmed TS-side preview-state slot wiring lives in `policy-wasm-production-preview-feature-slots.ts` and `policy-wasm-production-preview-values.ts` — the extension surface spans both files plus the Rust ABI.
3. Phase 0 inventory (ticket 001) names which classes fail closed today specifically because of single-slot ABI assumptions.

## Architecture Check

1. Multi-slot publication and slot-lifetime semantics are required by `continuedDeepening` / `deep1024` shape — closing this surface unblocks the deep-phase route for the relevant Phase 0 classes.
2. Engine-agnostic (F#1): slot semantics are encoded as `(slot_id, slot_kind, value, lifetime)` tuples — no game-specific structure.
3. Bounded computation (F#10): slot counts and lifetimes are bounded by the existing `capClass` (`deep1024`); ABI rejects out-of-bound inputs deterministically.
4. No backwards-compatibility shim (F#14): new fields ship as a versioned ABI extension.

## What to Change

### 1. Rust ABI extension

In `packages/engine-wasm/policy-vm/src/preview_drive.rs` and `packages/engine-wasm/policy-vm/src/lib.rs`:
- Encode multi-slot publication: per-slot id, kind, value, lifetime (single-iteration vs cross-iteration).
- Support slot identity stable across rebroadcast — slot id remains canonical across deepening iterations.
- Add ABI-level rejection for out-of-bound slot counts or invalid lifetime markers.

### 2. TS bridge encoding

In `policy-wasm-production-preview-feature-slots.ts`, `policy-wasm-production-preview-values.ts`, `policy-wasm-production-preview-drive.ts`, `policy-wasm-production-preview-drive-types.ts`:
- Add type definitions for multi-slot publication shape.
- Write extended slot metadata into the WASM input buffer.
- Read back unchanged after evaluation.

### 3. Round-trip ABI test

`packages/engine/test/unit/agents/policy-wasm-preview-state-slots-abi.test.ts` (`@test-class: architectural-invariant`): for each combination of slot count × lifetime × kind within the bounded `deep1024` budget, encode → evaluate → decode and assert byte-equivalence. Out-of-bound configurations fail closed.

## Files to Touch

- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify)
- `packages/engine-wasm/policy-vm/src/lib.rs` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-feature-slots.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-values.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts` (modify)
- `packages/engine/test/unit/agents/policy-wasm-preview-state-slots-abi.test.ts` (new)

## Out of Scope

- No production route activation (ticket 008).
- No signal-carrier work (002), decision-stack publication (003), candidate grouping (005), or completion semantics (006).
- No change to the existing `capClass` value (`deep1024`); existing bounds remain authoritative.

## Acceptance Criteria

### Tests That Must Pass

1. New round-trip ABI test passes.
2. Engine suite green.
3. Determinism gates green (same list as ticket 002).

### Invariants

1. Slot identity stable across rebroadcast — round-trip preserves slot id ordering.
2. Out-of-bound slot counts or invalid lifetime markers fail closed with stable reason strings.
3. `capClass` (`deep1024`) remains the sole authority for slot-count bounds.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-wasm-preview-state-slots-abi.test.ts` — multi-slot × lifetime × kind round-trip parity.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-state-slots-abi.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
