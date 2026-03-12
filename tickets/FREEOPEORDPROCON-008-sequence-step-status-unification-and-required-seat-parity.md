# FREEOPEORDPROCON-008: Sequence Step Status Unification and Required-Seat Parity

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel free-operation sequencing + tests
**Deps**: archive/tickets/FREEOP/FREEOPEORDPROCON-004-sequence-readiness-engine.md, archive/tickets/FREEOPEORDPROCON-005-emission-time-skip-evaluation.md, tickets/FREEOPEORDPROCON-007-regression-matrix.md

## Problem

The recent `implementWhatCanInOrder` fix corrected readiness for consumed earlier steps, but sequence progression semantics are still split across multiple helpers and call sites. Readiness, blocker explanation, and required-seat candidate derivation all reason about earlier steps separately. That architecture is fragile: one surface can be fixed while another silently drifts.

## Assumption Reassessment (2026-03-12)

1. `isPendingFreeOperationGrantSequenceReady()` in `packages/engine/src/kernel/free-operation-grant-authorization.ts` now correctly treats consumed earlier steps as non-blocking for `implementWhatCanInOrder`.
2. `isPendingFreeOperationGrantSequenceReady()` is consumed not only by move authorization, but also by discovery analysis, legal move enumeration, and required-seat resolution in `packages/engine/src/kernel/turn-flow-eligibility.ts`.
3. Current tests prove move-surface behavior for the MACV skip path, but they do not explicitly assert `currentCard.firstEligible` / `secondEligible` parity when an earlier required step is skipped and a later required step becomes the active obligation.
4. `packages/engine/src/kernel/free-operation-discovery-analysis.ts` still derives sequence blockers independently instead of through a canonical sequence-step-status helper. That is not broken today, but it is an avoidable drift vector.

## Architecture Check

1. The clean architecture is one generic sequence-step-status contract shared by readiness checks, discovery denial reporting, and turn-flow eligibility. That removes duplicated policy logic and makes ordered grant semantics auditable in one place.
2. This remains fully game-agnostic. No FITL branching belongs in the kernel; the work is purely about generic free-operation batch semantics.
3. No backwards-compatibility shims or aliases are needed. Replace duplicated logic with a single canonical helper and update tests to lock the behavior.

## What to Change

### 1. Canonicalize sequence-step-status logic

Introduce or extend a generic helper in the free-operation sequence subsystem that answers, for a given pending grant and runtime sequence context:

- whether the grant is ready now,
- which earlier steps still block it,
- which earlier steps are already consumed or skipped.

Update readiness/discovery callers to consume this helper instead of encoding partial rules inline.

### 2. Add explicit required-seat parity coverage

Add regression coverage proving that when an earlier `implementWhatCanInOrder` required step is skipped:

- the later required step becomes the only ready grant,
- forced free-operation windows point `currentCard.firstEligible` / `secondEligible` at the correct seat(s),
- regular non-free moves remain suppressed until the ready required grant resolves.

### 3. Keep diagnostics aligned

Ensure `sequenceLocked` denial details report blocker grant IDs through the same canonical status helper used by readiness, so denial surfaces cannot diverge from legality surfaces.

## Files to Touch

- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/src/kernel/free-operation-sequence-progression.ts` or a new adjacent helper file (modify or new)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify if helper integration requires it)
- `packages/engine/test/integration/fitl-events-macv.test.ts` (modify)
- `packages/engine/test/integration/free-operation-progression-contract.test.ts` or `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-grant-sequence-readiness.test.ts` (modify)

## Out of Scope

- FITL-specific rule interpretation for `Advise` or any other special activity.
- Reworking event card data.
- New progression policies beyond `strictInOrder` and `implementWhatCanInOrder`.

## Acceptance Criteria

### Tests That Must Pass

1. A skipped earlier `implementWhatCanInOrder` required step leaves the later step ready on all legality surfaces: discovery, legal move enumeration, and apply.
2. Required-seat resolution after a skip points the turn-flow window at the later seat and suppresses ordinary moves until that required free operation resolves.
3. `sequenceLocked` blocker diagnostics are derived by the same canonical helper used for readiness.
4. Existing suite: `pnpm turbo test` passes.

### Invariants

1. Ordered free-operation batch status is computed from one canonical helper path, not duplicated policy fragments.
2. Kernel sequencing remains game-agnostic and does not inspect FITL-specific action IDs, factions, or cards.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-macv.test.ts` — assert required-seat window state for the skip path, not just pending grants and legal moves.
2. `packages/engine/test/integration/free-operation-progression-contract.test.ts` or `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — lock discovery/apply/eligibility parity for skipped required steps in a generic fixture.
3. `packages/engine/test/unit/kernel/free-operation-grant-sequence-readiness.test.ts` — cover canonical blocker derivation in addition to simple ready/not-ready cases.

### Commands

1. `pnpm -F @ludoforge/engine test -- fitl-events-macv.test.ts fitl-event-free-operation-grants.test.ts free-operation-grant-sequence-readiness.test.ts`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo test`

