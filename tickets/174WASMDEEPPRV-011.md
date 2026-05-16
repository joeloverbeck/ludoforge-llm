# 174WASMDEEPPRV-011: Phase 3b — Deep preview-drive materialized-state ABI

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — WASM preview-drive ABI, TypeScript host bridge, deep preview dispatch
**Deps**: `tickets/174WASMDEEPPRV-008.md`

## Problem

`174WASMDEEPPRV-008` can truthfully count broad preview-drive WASM activation, but live reassessment found that `runDeepPass` cannot consume `evaluateProductionPreviewDriveBatchWithWasm` as its implementation because the WASM row output does not include the materialized projected `GameState` required by `ChooseNStepInnerPreviewResult.state` and `projectedStateByOptionKey`. Counting a WASM row while still using TypeScript to produce the state would make fallback success look like route activation and would violate Foundations #9, #16, and #20.

This ticket extends the generic preview-drive ABI/host bridge so supported deep `continuedDeepening` options can return the materialized projected state, then wires `runDeepPass` to consume that WASM-produced state.

## Assumption Reassessment (2026-05-16)

1. `evaluateProductionPreviewDriveBatchWithWasm` currently returns row/value/status metadata and preview-state slot values, not a full materialized `GameState`.
2. `runDeepPass` must return `ChooseNStepInnerPreviewResult` objects whose `state` is the projected post-preview state; downstream callers expose that state through `projectedStateByOptionKey`.
3. `174WASMDEEPPRV-008` records deep-phase unsupported counters and keeps the TypeScript fallback until this ABI/state contract exists.

## Architecture Check

1. Foundations #9 and #16 require the accelerated route to produce the consumed public result, not only an adjacent diagnostic row.
2. Foundation #20 requires preview status and unavailable/fallback provenance to remain explicit across the new state-return boundary.
3. The ABI must remain game-agnostic: serialized state materialization cannot inspect FITL identifiers or authored profile names.

## What to Change

### 1. Materialized projected-state ABI

Extend the preview-drive ABI, Rust guest, and TypeScript host decoder so a supported deep preview-drive row can return enough deterministic state data to reconstruct the projected `GameState` required by `runDeepPass`.

### 2. Deep-phase WASM consumption

Update `policy-preview-inner-deepening.ts` so supported deep options consume the WASM-produced projected state. Keep unsupported classes explicit and fail closed or fall back only under the corrected contract.

### 3. Activation and parity proof

Add tests that prove:
- deep `recordProductionPolicyWasmPreviewDrive('supported')` increments only when the WASM route produced the consumed projected state;
- unsupported deep classes increment unsupported counters and preserve explicit reason/fallback provenance;
- TypeScript and WASM deep projected states are byte-equivalent through the nearest public serialized-state oracle.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-preview-drive.ts` (modify)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts` (modify)
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify)
- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify)
- `packages/engine-wasm/policy-vm/src/lib.rs` (modify if ABI export shape changes)
- `packages/engine/test/integration/` (new/modified deep projected-state parity and activation tests)

## Out of Scope

- No FITL-specific code.
- No Phase 4 measurement or default flip; those remain in tickets 009 and 010 after this prerequisite lands.
- No policy-profile retuning or GameSpecDoc changes.

## Acceptance Criteria

### Tests That Must Pass

1. New deep projected-state parity/activation test passes.
2. Existing `policy-wasm-preview-drive-production-route-activation.test.ts` is updated so deep supported activation replaces the 008 unsupported fallback expectation.
3. Parity oracle (007) remains green.
4. Engine suite green: `pnpm turbo build && pnpm turbo test`.
5. Determinism gates green (same list as ticket 002).

### Invariants

1. Deep supported activation is counted only when WASM produced the projected state consumed by `runDeepPass`.
2. Unsupported deep classes keep explicit unsupported counters and reason/fallback provenance.
3. Serialized projected state remains deterministic and byte-equivalent to the TypeScript reference.

## Test Plan

### New/Modified Tests

1. Deep projected-state parity/activation integration test — proves WASM-produced state consumption.
2. `packages/engine/test/integration/policy-wasm-preview-drive-production-route-activation.test.ts` — update deep assertion from unsupported fallback to supported activation.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test <compiled deep projected-state parity test>`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
3. `pnpm run check:ticket-deps`
