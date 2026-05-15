# 174WASMDEEPPRV-005: Phase 1d — Candidate grouping ABI

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — Rust `policy-vm` ABI + TS bridge
**Deps**: `archive/tickets/174WASMDEEPPRV-001.md`

## Problem

The `continuedDeepening` preview generates candidate groups — option subsets sharing a common decision-stack prefix that the broad pass evaluates jointly. The current ABI evaluates candidates flat; no grouping metadata crosses the FFI boundary, so the WASM route cannot honour grouping-dependent semantics (shared budget across a group, group-aware ordering). Phase 0 inventory (ticket 001) confirms which classes fail closed today because of missing candidate-grouping ABI.

## Assumption Reassessment (2026-05-15)

1. Confirmed the Rust ABI evaluates per-option without group identity (`preview_drive.rs:69-180`).
2. Confirmed TS-side candidate grouping logic exists in the broad-phase score routing; the WASM route currently strips it before the FFI call.
3. Phase 0 inventory (ticket 001) will identify which unsupported-class strings this ticket closes.

## Architecture Check

1. Without group-aware ABI, the WASM route cannot encode group-shared-budget semantics — closing this surface preserves the TS semantics under WASM evaluation.
2. Engine-agnostic (F#1): grouping is encoded as `(candidate_id, group_id)` tuples — no game-specific structure.
3. Determinism (F#8): intra-group ordering is deterministic and canonical; ABI enforces stable ordering.
4. No backwards-compatibility shim (F#14): new fields ship as a versioned ABI extension.

## What to Change

### 1. Rust ABI extension

In `packages/engine-wasm/policy-vm/src/preview_drive.rs` and `packages/engine-wasm/policy-vm/src/lib.rs`:
- Encode candidate grouping: per-candidate group id, group boundary markers, deterministic intra-group ordering.
- Validate that grouping metadata is internally consistent — invalid groupings fail closed with stable reason strings.

### 2. TS bridge encoding

In `policy-wasm-production-preview-drive.ts`, `policy-wasm-production-preview-drive-types.ts`, `policy-wasm-production-preview-drive-lowering.ts`:
- Add type definitions for grouping metadata.
- Derive grouping from the existing TS-side preview model and write it into the WASM input buffer.

### 3. Round-trip ABI test

`packages/engine/test/unit/agents/policy-wasm-preview-candidate-grouping-abi.test.ts` (`@test-class: architectural-invariant`): for each group count × group size variant within bounded budgets, encode → evaluate → decode and assert byte-equivalent grouping in output ordering.

## Files to Touch

- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify)
- `packages/engine-wasm/policy-vm/src/lib.rs` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-lowering.ts` (modify)
- `packages/engine/test/unit/agents/policy-wasm-preview-candidate-grouping-abi.test.ts` (new)

## Out of Scope

- No production route activation (ticket 008).
- No signal-carrier work (002), decision-stack publication (003), preview-state slots (004), or completion semantics (006).

## Acceptance Criteria

### Tests That Must Pass

1. New round-trip ABI test passes.
2. Engine suite green.
3. Determinism gates green (same list as ticket 002).

### Invariants

1. Intra-group ordering is deterministic and stable across encode → evaluate → decode.
2. Invalid grouping metadata fails closed with stable reason strings.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-wasm-preview-candidate-grouping-abi.test.ts` — grouping round-trip parity.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-candidate-grouping-abi.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
