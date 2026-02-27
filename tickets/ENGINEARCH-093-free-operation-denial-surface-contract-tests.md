# ENGINEARCH-093: Simulator-Facing Free-Operation Denial Surface Contract Coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — contract tests across legal-moves/legal-choices/apply-move denial surfaces
**Deps**: ENGINEARCH-091-typed-free-operation-denial-contract.md

## Problem

Even with improved denial observability, we do not yet enforce cross-surface parity for free-operation denial semantics. Legal discovery, decision probing, and final apply can drift unless explicitly contract-tested.

## Assumption Reassessment (2026-02-27)

1. Denial causes are now computed by a shared analyzer in turn-flow eligibility.
2. Existing tests verify several causes, but coverage is incomplete for `actionIdMismatch` and `noActiveSeatGrant` and for parity across surfaces.
3. Mismatch: shared logic exists but parity guarantees are not fully tested; corrected scope is contract-level parity coverage.

## Architecture Check

1. Cross-surface contract tests reduce drift risk between simulator-facing APIs.
2. This strengthens agnostic kernel guarantees without introducing any game-specific branching.
3. No backwards-compatibility aliases; enforce one canonical denial surface.

## What to Change

### 1. Add missing denial-cause coverage

Add tests for `actionIdMismatch` and `noActiveSeatGrant` where applicable.

### 2. Add parity assertions across surfaces

Assert that `legalMoves`, `legalChoicesDiscover` decision checkpoints, and `applyMove` agree on denial semantics for equivalent states.

### 3. Add regression guard for sequence lock explanation fields

Assert stable presence/shape of sequence lock blocker fields.

## Files to Touch

- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- New runtime features.
- Changes to denial-cause taxonomy.

## Acceptance Criteria

### Tests That Must Pass

1. All denial causes have explicit test coverage including `actionIdMismatch` and `noActiveSeatGrant`.
2. Denial semantics are parity-validated across legal discovery, decision probing, and apply-time validation.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation denial semantics remain deterministic across kernel entry points.
2. Contract tests remain game-agnostic and do not embed game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — denial-cause parity at template enumeration boundaries.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — decision-time denial parity coverage.
3. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — checkpoint denial parity coverage.
4. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — end-to-end denial cause completeness.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
5. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm turbo lint`
