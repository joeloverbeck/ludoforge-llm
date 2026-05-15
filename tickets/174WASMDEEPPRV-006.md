# 174WASMDEEPPRV-006: Phase 1e — continuedDeepening completion semantics ABI

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — Rust `policy-vm` ABI + TS bridge
**Deps**: `archive/tickets/174WASMDEEPPRV-001.md`

## Problem

The deep-pass completion semantics differ from the broad-pass shallow completion semantics: a deep iteration may complete normally, exhaust its residual budget at iteration K of N, or fail-soft at a deepening boundary. The current WASM ABI's outcomes (`OUTCOME_COMPLETED`, `OUTCOME_DEPTH_CAP`, etc. — `preview_drive.rs:118-160`) cover broad-pass cases but cannot express multi-iteration deepening completion. As a result the WASM route cannot represent "completed at iteration K with residual depth budget X" or "budget-capped at iteration K of N". Phase 0 inventory (ticket 001) confirms which classes are affected.

## Assumption Reassessment (2026-05-15)

1. Confirmed Rust outcomes today are scalar (single integer per option); no per-iteration completion record exists.
2. Confirmed TS-side `continueChooseNStepInnerPreviewDrive` (called from `policy-preview-inner-deepening.ts:191`) returns a richer completion structure that includes per-iteration residual budget.
3. Phase 0 inventory will name the unsupported-class strings this ticket closes.

## Architecture Check

1. Without per-iteration completion ABI, the deep-phase route (wired in by ticket 008) cannot represent the TS-side completion record — coercing it to a scalar outcome would violate F#20 (Preview Signal Integrity) by losing iteration-budget information.
2. Engine-agnostic (F#1): completion records are encoded as `(iteration_index, residual_budget, outcome)` tuples — no game-specific data.
3. Bounded computation (F#10): iteration count and residual budgets are bounded by `capClass` (`deep1024`).
4. No backwards-compatibility shim (F#14): new fields ship as a versioned ABI extension.

## What to Change

### 1. Rust ABI extension

In `packages/engine-wasm/policy-vm/src/preview_drive.rs` and `packages/engine-wasm/policy-vm/src/lib.rs`:
- Encode per-iteration completion records: iteration index, residual budget, deepening-iteration outcome.
- Surface deepening-iteration identity stable across rebroadcast.

### 2. TS bridge reconstruction

In `policy-wasm-production-preview-drive.ts`, `policy-wasm-production-preview-drive-types.ts`, `policy-wasm-production-preview-drive-lowering.ts`:
- Add type definitions for the per-iteration completion record.
- Reconstruct the TS-side completion structure from WASM output so the deep-phase caller sees the same shape as today.

### 3. Round-trip ABI test

`packages/engine/test/unit/agents/policy-wasm-preview-continued-deepening-completion.test.ts` (`@test-class: architectural-invariant`): for each iteration count × residual-budget × outcome combination within bounded budgets, encode → evaluate → decode and assert byte-equivalent completion record.

## Files to Touch

- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify)
- `packages/engine-wasm/policy-vm/src/lib.rs` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-lowering.ts` (modify)
- `packages/engine/test/unit/agents/policy-wasm-preview-continued-deepening-completion.test.ts` (new)

## Out of Scope

- No production route activation (ticket 008).
- No signal-carrier work (002), decision-stack publication (003), preview-state slots (004), or candidate grouping (005).

## Acceptance Criteria

### Tests That Must Pass

1. New round-trip ABI test passes.
2. Engine suite green.
3. Determinism gates green (same list as ticket 002).

### Invariants

1. Per-iteration completion records round-trip byte-equivalently.
2. Iteration identity remains stable across rebroadcast.
3. `capClass` (`deep1024`) remains the sole authority for iteration-count bounds.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-wasm-preview-continued-deepening-completion.test.ts` — completion-record round-trip parity.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-continued-deepening-completion.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
