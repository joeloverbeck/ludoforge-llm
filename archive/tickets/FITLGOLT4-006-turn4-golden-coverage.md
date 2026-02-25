# FITLGOLT4-006: Extend Turn 4 Golden Coverage Beyond Deferred Release

**Status**: ✅ COMPLETED
**Completion date**: 2026-02-25
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — e2e golden coverage
**Deps**: archive/tickets/FITLGOLT4-004.md
**Reference**: `reports/fire-in-the-lake-playbook-turn-4.md`

## Problem

Turn 4 golden coverage currently validates the architecture-critical deferred event release path, but it does not continue through follow-on move choreography. This leaves a regression gap for later-turn eligibility/resource/control transitions after deferred effects resolve.

## Assumption Reassessment (2026-02-25)

1. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` currently includes Turn 4 with exactly two moves: event submission and granted Air Strike resolution.
2. Ticket `archive/tickets/FITLGOLT4-004.md` intentionally scoped Turn 4 assertions to deferred-event invariants, so follow-on choreography was intentionally deferred.
3. The canonical narrative for Turn 4 in `reports/fire-in-the-lake-playbook-turn-4.md` includes an additional NVA `March + Infiltrate` move that is currently not represented by this golden test.
4. Repository discrepancy: `archive/tickets/FITLGOLT4-006.md` already exists for a different completed topic (deferred trace lifecycle). To preserve clear history, this active ticket must be archived with a non-colliding filename.
5. The report’s exact NVA Infiltrate target (Kien Giang) is not always the deterministic legal branch from this engineered deck/test harness state; ticket scope therefore targets deterministic post-Air-Strike NVA `March + Infiltrate` coverage with equivalent turn-flow/resource/board invariant checks.

## Architecture Check

1. Extending Turn 4 golden assertions to include post-event choreography is beneficial versus current architecture: it validates turn-flow outcomes at the same abstraction level as existing playbook golden tests, without introducing runtime coupling.
2. This remains engine-agnostic and data-driven: expected behavior is encoded in FITL `GameSpecDoc` and asserted in e2e snapshots, not hardcoded in kernel logic.
3. No backward-compatibility shims, aliases, or fallback code paths are allowed.

## What to Change

### 1. Add post-Air-Strike Turn 4 move coverage

Extend Turn 4 descriptor with the playbook-consistent NVA `March + Infiltrate` follow-on move and assert resulting state transitions.

### 2. Add comprehensive end-of-turn assertions

At Turn 4 end, assert at minimum:
1. Eligibility rotation state.
2. Key resources/tracks (including trail/victory-relevant values).
3. Control/opposition markers and critical token distributions in impacted spaces.

### 3. Keep architecture boundary clean

Only touch e2e golden coverage unless the ticket uncovers a genuine engine bug. If an engine bug is found, stop and open a separate ticket via 1-3-1 before changing kernel/runtime.

## Files to Touch

- `packages/engine/test/e2e/fitl-playbook-golden.test.ts` (modify)
- `tickets/FITLGOLT4-006.md` (this reassessment update)
- `reports/fire-in-the-lake-playbook-turn-4.md` (modify only if expectation source correction is required)

## Out of Scope

- Engine/kernel/runtime semantic changes
- Turn 5+ coverage
- Non-FITL playbook additions

## Acceptance Criteria

### Tests That Must Pass

1. Turn 4 replay includes post-Air-Strike move coverage and passes deterministically.
2. End-of-turn assertions validate expected eligibility/resource/board outcomes.
3. Existing suite: `pnpm -F @ludoforge/engine test:e2e`

### Invariants

1. Golden suite remains deterministic for fixed seed and deck engineering.
2. Assertions are derived from canonical playbook/report expectations, not ad-hoc outcomes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` — expand Turn 4 move list and expected snapshots.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/e2e/fitl-playbook-golden.test.js`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-25
- What changed vs originally planned:
  - Expanded Turn 4 in `fitl-playbook-golden.test.ts` from 2 moves to 3 moves by adding a post-Air-Strike NVA `March + Infiltrate` move.
  - Strengthened Turn 4 assertions to include end-of-turn eligibility rotation, card/deck progression, and impacted-space token/marker checks (including Central Laos troop build-up and preserved Opposition markers).
  - Updated assumptions/scope to document deterministic branch constraints versus narrative-only Kien Giang infiltration details in the report.
  - No engine/kernel/runtime code was changed.
- Deviations from original plan:
  - Follow-on assertions use the deterministic legal branch produced by the engineered deck/test harness state rather than forcing a non-deterministic narrative branch.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/e2e/fitl-playbook-golden.test.js` passed.
  - `pnpm -F @ludoforge/engine test:e2e` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
