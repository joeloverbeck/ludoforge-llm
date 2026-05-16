# 174WASMDEEPPRV-008: Phase 3a — Production route activation counters (broad + deep unsupported classification)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `policy-wasm-score-routing.ts`, `policy-preview-inner-deepening.ts`
**Deps**: `archive/tickets/174WASMDEEPPRV-007.md`

## Problem

Phase 1 ABI extensions (002–006) and the Phase 2 parity oracle (007) prove that supported preview-drive rows can route through WASM with byte-equivalent row output and F#20 signal preservation. Live reassessment on 2026-05-16 found that the current WASM preview-drive API returns row/value/status metadata but does not return the materialized projected `GameState` required by `runDeepPass` and `projectedStateByOptionKey`. Counting deep-phase WASM while still consuming TypeScript state would make fallback success look like route activation, violating Foundations #9, #16, and #20.

This narrowed Phase 3a ticket activates the truthful production telemetry that the current API can support:
- **Broad-phase**: supported preview-drive rows reached from `policy-wasm-score-routing.ts` increment `recordProductionPolicyWasmPreviewDrive('supported')`; unsupported/fallback broad classes increment `recordProductionPolicyWasmPreviewDrive('unsupported')`.
- **Deep-phase**: `runDeepPass` continues to use `continueChooseNStepInnerPreviewDrive` for the materialized projected state and increments `recordProductionPolicyWasmPreviewDrive('unsupported')` for each deferred deep option.

The missing deep materialized-state ABI and real deep-phase WASM state consumption are split across `archive/tickets/174WASMDEEPPRV-013.md` and `archive/tickets/174WASMDEEPPRV-011.md`: 013 owns the generic `chooseNStep` continuation materialization prerequisite, and 011 owns production deep consumption after that prerequisite lands.

## Assumption Reassessment (2026-05-16)

1. Confirmed `policy-wasm-score-routing.ts:246` already calls `evaluateProductionPreviewDriveBatchWithWasm` from the broad phase but fails closed for `continuedDeepening` / `deep1024`; after 002–006 the fail-closed branches narrow.
2. Confirmed `runDeepPass` at `policy-preview-inner-deepening.ts:165` calls `continueChooseNStepInnerPreviewDrive` at line 191 per option; this remains the only live path that returns the `GameState` needed by deep-phase consumers.
3. Confirmed `runDeepPass` is invoked from `policy-agent-inner-preview.ts:486`; no outer dispatch shape change is required for the narrowed counter/fallback boundary.
4. The parity oracle (007) is green for supported row output, but it does not prove materialized deep projected-state output.
5. User approved the Foundation-aligned Option 1 reset on 2026-05-16: land broad activation counters now, record deep unsupported fallback, and split the missing ABI/state work to `archive/tickets/174WASMDEEPPRV-011.md`. Later 011 reassessment split the missing generic `chooseNStep` continuation prerequisite to `archive/tickets/174WASMDEEPPRV-013.md`.

## Architecture Check

1. Activation gated on parity (007) — the broad route only records supported activation when the WASM call returns supported row output. F#16 (Testing as proof) is upheld.
2. Engine-agnostic (F#1): activation predicates inspect generic ABI-supported shapes, not FITL identifiers.
3. F#20: unsupported shapes remain explicit through unsupported counters and existing fail-closed reason strings; deep fallback is not counted as supported activation.
4. Foundation 5 (One rules protocol): legality / publication remain kernel-owned; WASM only evaluates preview-drive rows.
5. No backwards-compatibility shim (F#14): this ticket adds telemetry to the existing production route and defers the missing state-return contract rather than adding a compatibility alias.

## What to Change

### 1. Broad-phase activation counter recording

In `policy-wasm-score-routing.ts`:
- Keep the existing `evaluateProductionPreviewDriveBatchWithWasm` broad route.
- Call `recordProductionPolicyWasmPreviewDrive('supported')` when a broad preview-drive batch returns `kind: 'supported'`.
- Call `recordProductionPolicyWasmPreviewDrive('unsupported')` when the broad route falls back or fails closed for unsupported preview-drive inputs.

### 2. Deep-phase unsupported classification

In `policy-preview-inner-deepening.ts:165` (`runDeepPass`) and the per-option loop at line 191:
- Keep `continueChooseNStepInnerPreviewDrive` as the deep-phase implementation because it returns the required projected `GameState`.
- Call `recordProductionPolicyWasmPreviewDrive('unsupported')` for each deep option that reaches the deferred deep route boundary.
- Do not call `recordProductionPolicyWasmPreviewDrive('supported')` from deep phase until `archive/tickets/174WASMDEEPPRV-013.md` lands the generic `chooseNStep` continuation materialization prerequisite and `archive/tickets/174WASMDEEPPRV-011.md` returns a WASM-produced materialized projected state.

### 3. Successor handoff

Add `archive/tickets/174WASMDEEPPRV-011.md` for true deep-phase WASM consumption and, after later reassessment, `archive/tickets/174WASMDEEPPRV-013.md` for the missing generic `chooseNStep` continuation materialization prerequisite. Update adjacent Phase 4 ticket dependencies so measurement/default-flip work does not proceed as if full deep activation already landed.

### 4. Integration test for route activation

`packages/engine/test/integration/policy-wasm-preview-drive-production-route-activation.test.ts` (`@test-class: architectural-invariant`):
- Synthetic state that exercises a supported broad preview-drive shape → assert `getProductionPolicyWasmPreviewDriveRouteCount` increments by the expected delta.
- Synthetic state that exercises a deep `continuedDeepening` shape → assert `getProductionPolicyWasmPreviewDriveUnsupportedCount` increments and no supported deep activation is counted.
- Reset between cases.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify)
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify)
- `packages/engine/test/integration/policy-wasm-preview-drive-production-route-activation.test.ts` (new)
- `archive/tickets/174WASMDEEPPRV-011.md` (new — deep materialized-state ABI successor)
- `tickets/174WASMDEEPPRV-009.md` (modify — dependency correction)
- `tickets/174WASMDEEPPRV-010.md` (modify — default-flip prerequisite correction)
- `specs/174-wasm-preview-drive-coverage-extension.md` (modify — phase list correction)
- `reports/174-phase-0-unsupported-class-inventory.md` (modify — unsupported-class ownership correction)

## Out of Scope

- No default flip / A/B wiring deletion (ticket 010 owns that — gated on 009's perf gate).
- No new ABI work — `archive/tickets/174WASMDEEPPRV-013.md` owns the missing generic continuation ABI prerequisite and `archive/tickets/174WASMDEEPPRV-011.md` owns production deep consumption.
- No FITL-specific identifiers introduced.

## Acceptance Criteria

### Tests That Must Pass

1. New route-activation integration test passes (counters increment as expected).
2. Parity oracle (007) remains green.
3. Engine suite green: `pnpm turbo build && pnpm turbo test`.
4. Determinism gates green (same list as ticket 002).
5. `pnpm run check:ticket-deps` passes after the same-series dependency rewrite.

### Invariants

1. Supported activation is counted only when the broad WASM preview-drive route returns supported output; TypeScript fallback cannot count as supported activation.
2. Unsupported shapes fail closed with stable reason strings — no silent scalar coercion.
3. Route counters increment monotonically; reset behaviour matches the existing record/* counter pattern.
4. Deep-phase fallback remains explicit and successor-owned until a WASM-produced materialized projected state exists.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-wasm-preview-drive-production-route-activation.test.ts` — counter-increment assertions for supported broad-route and deferred deep-route synthetic states.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/policy-wasm-preview-drive-production-route-activation.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
3. `pnpm run check:ticket-deps`

## Outcome

Phase 3a landed on 2026-05-16 with the Foundation-aligned boundary approved by the user: broad production preview-drive batches now record supported activation only when WASM returns supported output, while deep `continuedDeepening` records explicit unsupported telemetry and remains TypeScript-backed until the materialized-state ABI exists.

Historical pre-011 status: this ticket was intentionally not archive-ready until the missing deep WASM-produced projected `GameState` contract landed through `archive/tickets/174WASMDEEPPRV-013.md` and `archive/tickets/174WASMDEEPPRV-011.md`; downstream measurement/default-flip work depended on 011 instead of treating Phase 3 as fully activated.

Implemented scope:
- `policy-wasm-score-routing.ts` records supported broad-route counters and unsupported broad-route fallback/fail-closed counters.
- `policy-preview-inner-deepening.ts` records unsupported deep-route counters before the stable TypeScript deep fallback.
- `policy-wasm-preview-drive-production-route-activation.test.ts` proves broad supported activation and deep unsupported classification.
- `archive/tickets/174WASMDEEPPRV-013.md`, `archive/tickets/174WASMDEEPPRV-011.md`, `tickets/174WASMDEEPPRV-009.md`, `tickets/174WASMDEEPPRV-010.md`, `specs/174-wasm-preview-drive-coverage-extension.md`, and `reports/174-phase-0-unsupported-class-inventory.md` now describe the split Phase 3a/3b graph.

Generated fallout: none. No schema, golden, WASM ABI, or GameSpecDoc artifacts changed.

Source-size ledger: `policy-wasm-score-routing.ts` is 584 lines after the counter wiring, `policy-preview-inner-deepening.ts` is 225 lines, and the new integration test is 210 lines; no source split was required.

Verification:
- `pnpm -F @ludoforge/engine build`
- `node --test packages/engine/dist/test/integration/policy-wasm-preview-drive-production-route-activation.test.js`
- `node --test packages/engine/dist/test/integration/policy-wasm-preview-drive-equivalence.test.js`
- `pnpm -F @ludoforge/engine test:determinism`
- `pnpm turbo build`
- `pnpm turbo test`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
- `pnpm run check:ticket-deps`

Known non-ticket-owned advisory output during verification: runner Vite chunk-size warnings and runner jsdom/canvas/crash-recovery stderr emitted by existing tests.

Post-review correction (2026-05-16): `tickets/174WASMDEEPPRV-009.md` now uses post-`174WASMDEEPPRV-011` witness filenames, and `tickets/174WASMDEEPPRV-010.md` now names both Phase 3a/3b activation owners before default flip. No runtime code changed during review; at that point the ticket remained blocked by prerequisite and not archive-ready.

Post-011 unblock (2026-05-16): `archive/tickets/174WASMDEEPPRV-011.md` completed the deep materialized-state consumption prerequisite and proved supported deep activation with consumed WASM-produced projected states. This ticket's earlier Phase 3a implementation is now unblocked and archive-ready; Phase 4 measurement/default-flip work remains owned by `tickets/174WASMDEEPPRV-009.md` and `tickets/174WASMDEEPPRV-010.md`.
