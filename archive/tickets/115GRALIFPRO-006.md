# 115GRALIFPRO-006: Verification closure after lifecycle migration

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — ticket correction and verification, with test-only fallout fixes if verification exposes them
**Deps**: `archive/tickets/115GRALIFPRO-005.md`

## Problem

Tickets 001-005 already completed the required `phase` migration and lifecycle-test refactors across the repo-owned grant test surfaces. The remaining owned work is to correct this ticket's stale assumptions, run the authoritative verification lanes, and only apply additional test-only fixes if those lanes expose live regressions caused by the lifecycle refactor.

## Assumption Reassessment (2026-04-07)

1. `test/helpers/turn-order-helpers.ts` already defaults `phase` to `'ready'` in the live helper.
2. The direct pending-grant fixtures in `test/integration/fitl-event-free-operation-grants.test.ts`, `test/unit/kernel/apply-move.test.ts`, `test/unit/kernel/free-operation-grant-bindings.test.ts`, and `test/unit/phase-advance.test.ts` already include `phase`.
3. `test/unit/kernel/free-operation-grant-sequence-readiness.test.ts` is already refactored away from the removed `isPendingFreeOperationGrantSequenceReady` predicate and now verifies lifecycle-based promotion plus trace emission.
4. `test/unit/kernel/runtime-error-contracts.test.ts` does not own a broad pending-grant fixture migration surface; it only references typed runtime error context.
5. Determinism canary test exists at `test/determinism/fitl-policy-agent-canary.test.ts` — confirmed.
6. Test lanes exist: `test:determinism`, `test:integration:fitl-events` — confirmed in `package.json`.
7. Seed 1009 and Card 75 Sihanouk tests exist in `fitl-events-sihanouk.test.ts` — confirmed.
8. Ticket 001 already updated core repo-owned typed helpers and a broad set of inline fixtures to keep the required `phase` field migration atomic. This ticket should not re-advertise already-landed fixture work.
9. Ticket 005 already updated `fitl-event-free-operation-grants.test.ts` and `phase-advance.test.ts` for the lifecycle/export boundary cleanup. Any remaining work in those files must be limited to unresolved phase-fixture or verification gaps, not the already-landed wrapper-removal assertions.
10. `test/unit/kernel/free-operation-viability-export-surface-guard.test.ts` does not construct pending grant fixtures in the live codebase and should not remain in the file list for this ticket.
11. `packages/engine/src/sim/simulator.ts` no longer contains the old grant-specific recovery path; this ticket verifies that invariant rather than removing it.

## Architecture Check

1. Ticket text must reflect the live repo state; stale migration claims should be corrected before treating the ticket as an implementation brief.
2. The remaining owned proof is architectural: the lifecycle refactor must remain deterministic, simulator-agnostic, and green across the named verification lanes.
3. If verification reveals a live regression, fix it through the smallest Foundation-compliant test or production change that restores the already-confirmed lifecycle design.

## What to Change

### 1. Correct the stale ticket boundary in-place

Update this ticket so it no longer claims broad pending-grant fixture migration work that is already complete in the live codebase.

### 2. Audit named verification surfaces before broader runs

Reconfirm that the named helper/test surfaces and `simulator.ts` still match the lifecycle end state from tickets 001-005. Leave already-correct files unchanged.

### 3. Run the authoritative verification lanes

Execute the package and root commands named in this ticket. If a lane fails because of live fallout from the lifecycle refactor, fix that failure in the same turn.

### 4. Apply only live fallout fixes if verification fails

Do not add churn to already-correct fixtures. Only modify tests or production code if an authoritative verification lane exposes a real current failure.

## Files to Touch

- `tickets/115GRALIFPRO-006.md` (modify)
- `packages/engine/test/helpers/turn-order-helpers.ts` (inspect; modify only if verification exposes live fallout)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (inspect; modify only if verification exposes live fallout)
- `packages/engine/test/integration/fitl-events-sihanouk.test.ts` (inspect; modify only if verification exposes live fallout)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (inspect; modify only if verification exposes live fallout)
- `packages/engine/test/unit/kernel/free-operation-grant-bindings.test.ts` (inspect; modify only if verification exposes live fallout)
- `packages/engine/test/unit/kernel/free-operation-grant-sequence-readiness.test.ts` (inspect; modify only if verification exposes live fallout)
- `packages/engine/test/unit/phase-advance.test.ts` (inspect; modify only if verification exposes live fallout)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (inspect; modify only if verification exposes live fallout)
- `packages/engine/src/sim/simulator.ts` (inspect only; verify invariant remains true)

## Out of Scope

- Further refactoring of production code — all production changes are complete in tickets 001-005
- Adding new test coverage beyond what's needed for the lifecycle refactoring
- Performance benchmarking of the new lifecycle approach

## Acceptance Criteria

### Tests That Must Pass

1. Determinism canary: seeds 1001-1004 produce identical PolicyAgent outcomes.
2. Seed 1009: Card 75 shaded March grant is skipped without deadlock.
3. Sihanouk integration: all 5 Card 75 tests pass.
4. Full default engine suite passes.
5. `pnpm turbo typecheck` passes.
6. `pnpm turbo lint` passes.

### Invariants

1. Grant phase remains the ONLY source of truth for grant state in the audited lifecycle surfaces.
2. Every phase transition still produces a trace entry (Foundation 9).
3. The simulator has no grant-specific logic (Foundation 5) — verified by code inspection.
4. All transitions remain deterministic (Foundation 8) — verified by the determinism lane.

## Test Plan

### Audited Test Surfaces

1. `packages/engine/test/helpers/turn-order-helpers.ts`
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`
3. `packages/engine/test/integration/fitl-events-sihanouk.test.ts`
4. `packages/engine/test/unit/kernel/apply-move.test.ts`
5. `packages/engine/test/unit/kernel/free-operation-grant-bindings.test.ts`
6. `packages/engine/test/unit/kernel/free-operation-grant-sequence-readiness.test.ts`
7. `packages/engine/test/unit/phase-advance.test.ts`
8. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts`

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:determinism`
3. `pnpm -F @ludoforge/engine test:integration:fitl-events`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo typecheck`
6. `pnpm turbo lint`

## Outcome

- Completed: 2026-04-07
- What changed:
  - Rewrote this ticket to match live repo state after confirming the broad `phase` fixture migration had already landed in tickets 001-005.
  - Fixed a live regression surfaced by the ticket's authoritative verification: guided template completion in `packages/engine/src/agents/prepare-playable-moves.ts` now retries unguided before rejecting a move, which restored the seed-1009 Sihanouk path and kept the simulator free of grant-specific recovery.
- Deviations from original plan:
  - The ticket did not end up doing the advertised fixture migration because that premise was stale in the live codebase.
  - A production agent-preparation fix was required after verification exposed a current runtime failure in the rewritten ticket boundary.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine test:determinism`
  - `pnpm -F @ludoforge/engine test:integration:fitl-events`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
