# 174WASMDEEPPRV-006: Phase 1e — continuedDeepening completion semantics ABI

**Status**: COMPLETED
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

## Outcome

Completed on 2026-05-16.

Implemented the continued-deepening completion-record ABI as a versioned preview-drive extension:

1. Bumped the policy WASM ABI from `14` to `15` and the preview-drive layout from `0x1500_0017` to `0x1500_0018`.
2. Added per-candidate completion-record metadata `(iteration_index, residual_budget, outcome)` to the TS encoder, Rust FFI input validation, Rust mirror output, TS runtime buffer plumbing, and TS decoder.
3. Added `continuedDeepeningCompletionRecords` to the generic preview-drive row/candidate carrier and forwarded it through the production preview-drive input/lowering types.
4. Added architectural-invariant ABI coverage for bounded completion-record round trips, stable iteration identity across rebroadcast, and malformed completion-record rejection.
5. Updated adjacent raw ABI tests for the new FFI argument shape and shifted header offsets.

Boundary corrections against the original draft:

1. The live TypeScript deepening driver does not currently expose a pre-existing per-iteration completion-record object; it returns `DriveResult` with `depth`, `outcome`, synthetic decisions, and fallback counts. This ticket therefore introduces the row-level generic ABI carrier consumed by later parity/activation work instead of reconstructing a non-existent TS object shape.
2. The existing WASM ABI fail-closed path reports stable numeric statuses, not reason strings. Malformed completion metadata fails closed with `STATUS_BAD_OPERAND` (`-12`), matching the established raw ABI pattern.
3. Production route activation remains explicitly deferred to `tickets/174WASMDEEPPRV-008.md`; this ticket proves raw ABI and host bridge round-trip only.
4. `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` was verified as a no-edit production activation file for this ticket because the live handoff seam is the production input type and lowering carrier; activation remains owned by ticket 008.

Source-size ledger:

1. `packages/engine-wasm/policy-vm/src/preview_drive.rs`: 694 -> 757 lines. The growth is ticket-owned ABI parsing, validation, and mirror output; still below the 800-line hard cap.
2. `packages/engine-wasm/policy-vm/src/lib.rs`: 1307 -> 1307 lines. Preexisting over-guidance export hub; only the ABI version mirror changed, with no line growth.
3. `packages/engine/src/agents/policy-wasm-preview-drive.ts`: 742 -> 768 lines. The growth is limited to shared carrier wiring after extracting the completion codec; still below the 800-line hard cap.
4. `packages/engine/src/agents/policy-wasm-preview-drive-completion.ts`: 0 -> 122 lines. New adjacent completion-record codec keeps the canonical preview-drive ABI file under the hard cap.
5. `packages/engine/src/agents/policy-wasm-runtime.ts`: 1388 -> 1404 lines. Preexisting over-guidance WASM runtime bridge; active growth is limited to the new FFI output buffer/argument plumbing. Extraction was considered, but splitting the runtime allocation/deallocation block would obscure the FFI call-shape seam for this ticket; no separate extraction successor is justified.
6. `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts`: 26 -> 27 lines. Type carrier only.
7. `packages/engine/src/agents/policy-wasm-production-preview-drive-lowering.ts`: 59 -> 60 lines. Type carrier forwarding only.

Verification:

1. `cargo fmt --manifest-path packages/engine-wasm/policy-vm/Cargo.toml` passed.
2. `pnpm -F @ludoforge/engine-wasm build` passed.
3. `pnpm -F @ludoforge/engine build` passed.
4. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-preview-signal-carriers.test.js dist/test/unit/agents/policy-wasm-preview-decision-stack-publication-abi.test.js dist/test/unit/agents/policy-wasm-preview-state-slots-abi.test.js dist/test/unit/agents/policy-wasm-preview-candidate-grouping-abi.test.js dist/test/unit/agents/policy-wasm-preview-continued-deepening-completion.test.js` passed (`12` tests, `5` suites).
5. `pnpm -F @ludoforge/engine test:determinism` passed (`23/23` files).
6. `pnpm turbo build` passed (`3/3` tasks; uncached; runner emitted the existing Vite chunk-size advisory and Turbo reported no declared output files for `@ludoforge/engine-wasm#build`).
7. `pnpm turbo lint` passed (`2/2` tasks; `1` cached runner lane, engine lint executed).
8. `pnpm turbo typecheck` passed (`3/3` tasks; `1` cached engine build prerequisite, engine and runner typechecks executed).
9. `pnpm turbo test` passed (`5/5` tasks; `3` cached build prerequisites, engine and runner tests executed; engine summary `81/81` files passed). Runner tests emitted existing jsdom canvas/recovery stderr advisories without failing the lane.
10. The focused ABI witness in step 4 was rerun after the broad build/test sequence and passed again (`12` tests, `5` suites), so no later `dist` producer invalidates the ticket-owned compiled-output proof.
