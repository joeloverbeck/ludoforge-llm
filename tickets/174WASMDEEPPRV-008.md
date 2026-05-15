# 174WASMDEEPPRV-008: Phase 3 — Production route activation (broad + deep-phase wire-in)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `policy-wasm-score-routing.ts`, `policy-preview-inner-deepening.ts`, `policy-agent-inner-preview.ts`
**Deps**: `archive/tickets/174WASMDEEPPRV-007.md`

## Problem

Phase 1 ABI extensions (002–006) and the Phase 2 parity oracle (007) prove that supported preview-drive rows can route through WASM with byte-equivalent output and F#20 signal preservation. This ticket activates the production route in two layers:
- **Broad-phase**: lift the fail-closed gates in `policy-wasm-score-routing.ts:217-322` so supported `continuedDeepening` / `deep1024` rows actually traverse the WASM path.
- **Deep-phase**: wire `runDeepPass` (`policy-preview-inner-deepening.ts:165`) to invoke WASM via `evaluateProductionPreviewDriveBatchWithWasm` for supported options; fall back to `continueChooseNStepInnerPreviewDrive` for unsupported shapes.
Each activation site calls `recordProductionPolicyWasmPreviewDrive('supported' | 'unsupported')` (added in ticket 001) so route activation is observable.

## Assumption Reassessment (2026-05-15)

1. Confirmed `policy-wasm-score-routing.ts:246` already calls `evaluateProductionPreviewDriveBatchWithWasm` from the broad phase but fails closed for `continuedDeepening` / `deep1024`; after 002–006 the fail-closed branches narrow.
2. Confirmed `runDeepPass` at `policy-preview-inner-deepening.ts:165` calls `continueChooseNStepInnerPreviewDrive` at line 191 per option; this is the deep-phase wire-in point.
3. Confirmed `runDeepPass` is invoked from `policy-agent-inner-preview.ts:486` — outer dispatch wiring may need a small adjustment to surface route activation counters.
4. The parity oracle (007) is green for every supported class before this ticket activates the route.

## Architecture Check

1. Activation gated on parity (007) — the route only goes live for classes the oracle proves byte-equivalent. F#16 (Testing as proof) is upheld.
2. Engine-agnostic (F#1): activation predicates inspect generic ABI-supported shapes, not FITL identifiers.
3. F#20: unsupported shapes still fail closed with stable reason strings (no silent scalar coercion).
4. Foundation 5 (One rules protocol): legality / publication remain kernel-owned; WASM only evaluates preview-drive rows.
5. No backwards-compatibility shim (F#14): the broad-phase fail-closed branches for now-supported classes are deleted, not commented out.

## What to Change

### 1. Broad-phase fail-closed branch removal

In `policy-wasm-score-routing.ts:217-322`:
- For each unsupported class the Phase 1 work has now closed (per the 174 Phase 0 inventory and the 002–006 ABI extensions), remove the fail-closed branch.
- Route those classes through WASM via the existing `evaluateProductionPreviewDriveBatchWithWasm` call (line 246).
- Wrap the call site so `recordProductionPolicyWasmPreviewDrive('supported')` is called on success and `recordProductionPolicyWasmPreviewDrive('unsupported')` is called when the route still fails closed.

### 2. Deep-phase inner-deepening wire-in

In `policy-preview-inner-deepening.ts:165` (`runDeepPass`) and the per-option loop at line 191:
- Add a route predicate: if the option's preview config matches the Phase 1 supported shape set, invoke `evaluateProductionPreviewDriveBatchWithWasm` (importing as needed); else fall back to `continueChooseNStepInnerPreviewDrive`.
- Each branch calls `recordProductionPolicyWasmPreviewDrive(...)` accordingly.

### 3. Outer dispatch adjustment

In `policy-agent-inner-preview.ts:486`: if the outer call site needs to surface route activation counters or new return-shape fields from the deep pass, adjust the wiring minimally. No semantic change to the outer dispatch.

### 4. Integration test for route activation

`packages/engine/test/integration/policy-wasm-preview-drive-production-route-activation.test.ts` (`@test-class: architectural-invariant`):
- Synthetic state that exercises a supported `continuedDeepening` / `deep1024` shape → assert `getProductionPolicyWasmPreviewDriveRouteCount` increments by the expected delta.
- Synthetic state that exercises an unsupported shape (from the residual tail) → assert `getProductionPolicyWasmPreviewDriveUnsupportedCount` increments.
- Reset between cases.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify)
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify)
- `packages/engine/src/agents/policy-agent-inner-preview.ts` (modify if needed for dispatch wiring)
- `packages/engine/test/integration/policy-wasm-preview-drive-production-route-activation.test.ts` (new)

## Out of Scope

- No default flip / A/B wiring deletion (ticket 010 owns that — gated on 009's perf gate).
- No new ABI work — this ticket consumes 002–006.
- No FITL-specific identifiers introduced.

## Acceptance Criteria

### Tests That Must Pass

1. New route-activation integration test passes (counters increment as expected).
2. Parity oracle (007) remains green.
3. Engine suite green: `pnpm turbo build && pnpm turbo test`.
4. Determinism gates green (same list as ticket 002).

### Invariants

1. Activation only occurs for classes the parity oracle (007) proves byte-equivalent.
2. Unsupported shapes fail closed with stable reason strings — no silent scalar coercion.
3. Route counters increment monotonically; reset behaviour matches the existing record/* counter pattern.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-wasm-preview-drive-production-route-activation.test.ts` — counter-increment assertions for supported and unsupported synthetic states.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/policy-wasm-preview-drive-production-route-activation.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
