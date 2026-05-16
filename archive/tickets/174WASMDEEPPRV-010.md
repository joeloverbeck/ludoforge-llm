# 174WASMDEEPPRV-010: Phase 4b — Default flip and A/B wiring deletion

**Status**: REJECTED — Phase 4 gate failed; no code retained
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `policy-wasm-score-routing.ts`, `policy-preview-inner-deepening.ts`, possibly `policy-agent-inner-preview.ts`
**Deps**: `archive/tickets/174WASMDEEPPRV-009.md`

## Problem

If ticket 009's gate decision records a **Pass** (slow-tier median improves materially after Phase 3 activation), the WASM route is proven the production path for supported preview-drive rows. Foundation #14 (No Backwards Compatibility) requires the temporary A/B routing introduced for parity proof to be deleted once the route is defaulted — no alias paths, no deprecated fallbacks. This ticket flips the default and deletes the A/B wiring.

**Gate condition**: Close this ticket with `Declined — Phase 4 gate failed; escalation report at reports/174-phase-4-architectural-blocker.md governs next owner` recorded in the Outcome if `archive/tickets/174WASMDEEPPRV-009.md`'s gate decision report records a **Fail** verdict. No engine code changes are made on the Fail path.

## Assumption Reassessment (2026-05-15)

1. Confirmed Spec 174 §6 Foundation #14 row mandates deletion of temporary A/B routing once the supported route is defaulted.
2. Confirmed Spec 174 §2 Non-Goals reaffirms "No compatibility alias retained after a default flip. Temporary A/B routing is proof machinery only."
3. The exact A/B routing surface is split across Phase 3a/3b: ticket 008 introduces broad activation telemetry and explicit deep unsupported classification, ticket 012 owns the action-pipeline-rooted state-patch/materialization ABI, ticket 013 owns the prerequisite generic `chooseNStep` continuation materialization ABI, and ticket 011 owns the deep materialized-state route required before any deep default flip.

## Architecture Check

1. F#14 (No Backwards Compatibility): A/B routing is proof machinery; once the route is proven by Phase 2 (ticket 007) and Phase 3 measurement (ticket 009), the A/B fork is deleted, not commented out.
2. Engine-agnostic (F#1): the default-flip removes the predicate that branched on shape support — once a class is supported, the WASM route is the only path; unsupported classes still fall closed.
3. F#15 (Architectural Completeness): the default flip closes the architectural follow-up named by Spec 173 Phase N.

## What to Change

### 1. Default flip

In `packages/engine/src/agents/policy-wasm-score-routing.ts`:
- For every class supported after Phase 1 (002–006) and activated across Phase 3a/3b (`archive/tickets/174WASMDEEPPRV-008.md`, `archive/tickets/174WASMDEEPPRV-012.md`, `archive/tickets/174WASMDEEPPRV-013.md`, and `archive/tickets/174WASMDEEPPRV-011.md`), make WASM the default — remove the supported-vs-fallback predicate. Unsupported classes continue to fail closed with stable reason strings.

In `packages/engine/src/agents/policy-preview-inner-deepening.ts:165` (`runDeepPass`):
- Remove the route predicate added by ticket 011; supported shapes always invoke the deep materialized-state WASM route. Unsupported shapes still fall back to `continueChooseNStepInnerPreviewDrive` as the deterministic stable path.

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

## Outcome

Declined — Phase 4 gate failed; escalation report at `reports/174-phase-4-architectural-blocker.md` governs next owner.

No engine code changed under this ticket. The gate-decision report at `reports/174-phase-4-gate-decision.md` recorded a Fail verdict: post-008 slow-tier median `27211.75 ms`, required `<=20408.8125 ms`, post-174-011 final median `62042.20 ms`, delta `+34830.45 ms` (`+127.9978%`). The default flip and A/B deletion are therefore not authorized.

Diagnostic owner: `archive/tickets/174WASMDEEPPRV-014.md`. Completed zero-counter continuation owner: `archive/tickets/174WASMDEEPPRV-015.md`. This rejected default-flip ticket remains blocked until a later measured gate records a pass.

Continuation owner added on 2026-05-16: `archive/tickets/174WASMDEEPPRV-016.md` owned the next non-overlapping Phase 4 slice for the new dominant reason-granular unsupported `train:chooseNStep:add` and `train:chooseNStep:confirm` continued-deepening residuals.

Phase 4f update on 2026-05-16: `archive/tickets/174WASMDEEPPRV-017.md` completed generic `chooseOne` deep continuation materialization and eliminated the Phase 4e `production-deep-choosenstep-continuation.pickInnerDecision` owner in the bounded seed-1005 witness, but wall time regressed from `62297.98 ms` to `63872.98 ms`. This does not reopen the default flip; 010 remains rejected until a later measured gate records a Pass.

Phase 4g final rejection/archive update on 2026-05-16: `archive/tickets/174WASMDEEPPRV-018.md` retained generic state-patch hash reuse and improved the bounded seed-1005 witness from `63872.98 ms` to `59610.96 ms`, but it did not run or pass the broad Phase 4/default-flip gate. This ticket remains rejected without engine changes and is archived as the failed conditional default-flip attempt. If a future measured gate records a real Pass, open a new default-flip/A-B-deletion ticket from that fresh evidence instead of resurrecting this rejected ticket.
