# 174WASMDEEPPRV-010: Phase 4b — Default flip and A/B wiring deletion

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `policy-wasm-score-routing.ts`, `policy-preview-inner-deepening.ts`, possibly `policy-agent-inner-preview.ts`
**Deps**: `tickets/174WASMDEEPPRV-009.md`

## Problem

If ticket 009's gate decision records a **Pass** (slow-tier median improves materially after Phase 3 activation), the WASM route is proven the production path for supported preview-drive rows. Foundation #14 (No Backwards Compatibility) requires the temporary A/B routing introduced for parity proof to be deleted once the route is defaulted — no alias paths, no deprecated fallbacks. This ticket flips the default and deletes the A/B wiring.

**Gate condition**: Close this ticket with `Declined — Phase 4 gate failed; escalation report at reports/174-phase-4-architectural-blocker.md governs next owner` recorded in the Outcome if `tickets/174WASMDEEPPRV-009.md`'s gate decision report records a **Fail** verdict. No engine code changes are made on the Fail path.

## Assumption Reassessment (2026-05-15)

1. Confirmed Spec 174 §6 Foundation #14 row mandates deletion of temporary A/B routing once the supported route is defaulted.
2. Confirmed Spec 174 §2 Non-Goals reaffirms "No compatibility alias retained after a default flip. Temporary A/B routing is proof machinery only."
3. The exact A/B routing surface is the per-class predicates inside `policy-wasm-score-routing.ts` and `policy-preview-inner-deepening.ts` introduced by ticket 008.

## Architecture Check

1. F#14 (No Backwards Compatibility): A/B routing is proof machinery; once the route is proven by Phase 2 (ticket 007) and Phase 3 measurement (ticket 009), the A/B fork is deleted, not commented out.
2. Engine-agnostic (F#1): the default-flip removes the predicate that branched on shape support — once a class is supported, the WASM route is the only path; unsupported classes still fall closed.
3. F#15 (Architectural Completeness): the default flip closes the architectural follow-up named by Spec 173 Phase N.

## What to Change

### 1. Default flip

In `packages/engine/src/agents/policy-wasm-score-routing.ts`:
- For every class supported after Phase 1 (002–006) and activated in Phase 3 (008), make WASM the default — remove the supported-vs-fallback predicate. Unsupported classes continue to fail closed with stable reason strings.

In `packages/engine/src/agents/policy-preview-inner-deepening.ts:165` (`runDeepPass`):
- Remove the route predicate added in ticket 008; supported shapes always invoke `evaluateProductionPreviewDriveBatchWithWasm`. Unsupported shapes still fall back to `continueChooseNStepInnerPreviewDrive` as the deterministic stable path.

### 2. A/B wiring deletion

Delete every conditional that previously selected between WASM and TS for now-supported shapes. Per F#14, do not comment out — delete. Update any references in:
- `packages/engine/src/agents/policy-wasm-score-routing.ts`
- `packages/engine/src/agents/policy-preview-inner-deepening.ts`
- `packages/engine/src/agents/policy-agent-inner-preview.ts` (if dispatch wiring needs trimming)

### 3. Test updates

Update existing tests that asserted the A/B fork to assert the WASM-default invariant instead. Add an architectural-invariant test:

`packages/engine/test/integration/policy-wasm-preview-drive-default-route.test.ts` (`@test-class: architectural-invariant`):
- For the supported shape set, every preview drive in a synthetic run increments `getProductionPolicyWasmPreviewDriveRouteCount`.
- `getProductionPolicyWasmPreviewDriveUnsupportedCount` increments only on the still-unsupported tail.

### 4. Post-flip witness rerun

Run the 15-seed witness one more time post-flip; capture `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>-post-174-final.md` as the durable record of the defaulted-route residual. This is AC #5's final witness artefact.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify — delete A/B predicates)
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify — delete route predicate)
- `packages/engine/src/agents/policy-agent-inner-preview.ts` (modify if dispatch wiring needs trimming)
- `packages/engine/test/integration/policy-wasm-preview-drive-default-route.test.ts` (new)
- `packages/engine/test/integration/policy-wasm-preview-drive-production-route-activation.test.ts` (modify — adjust assertions that assumed the A/B fork)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>-post-174-final.md` (new — post-flip witness)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>-post-174-final.csv` (new)

## Out of Scope

- No new ABI work — this ticket only deletes the A/B fork and re-records the witness.
- No FITL-specific identifiers introduced.
- On the Fail path: no engine code changes; the ticket closes with the documented descope rationale.

## Acceptance Criteria

### Tests That Must Pass

1. New `policy-wasm-preview-drive-default-route.test.ts` passes.
2. Updated `policy-wasm-preview-drive-production-route-activation.test.ts` passes against the WASM-default invariant.
3. Parity oracle (007) remains green.
4. Engine suite green: `pnpm turbo build && pnpm turbo test`.
5. Determinism gates green (same list as ticket 002).

### Invariants

1. F#14: No A/B routing remnant — `grep -nE "ABRoute|abRoute|legacyTSPreviewDrive"` (or any naming the A/B fork ultimately used) returns no production matches outside historical tests.
2. For the supported shape set, the WASM route is the only path — no TS fallback executes.
3. Unsupported shapes continue to fail closed deterministically.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-wasm-preview-drive-default-route.test.ts` — new architectural-invariant asserting WASM-default for supported shapes.
2. `packages/engine/test/integration/policy-wasm-preview-drive-production-route-activation.test.ts` — assertion update for the defaulted route.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/policy-wasm-preview-drive-default-route.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
3. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>-post-174-final --profile-buckets`
