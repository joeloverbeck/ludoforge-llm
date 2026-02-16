# TEXHOLKERPRIGAMTOU-012: Declarative Betting-Round Closure Model

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-010, TEXHOLKERPRIGAMTOU-011
**Blocks**: TEXHOLKERPRIGAMTOU-013

## Problem

Betting closure currently relies on distributed booleans and action-side hooks. This is fragile and hard to generalize for additional wagering games.

## 1) What should be added/changed

1. Introduce a declarative betting-round closure contract in GameSpecDoc/GameDef runtime model.
2. Model "who must still act/respond" explicitly (derived set/contract), rather than inferring closure from scattered flags.
3. Encode preflop BB-option semantics as declarative closure rules instead of bespoke ad-hoc state toggles.
4. Refactor Texas action effects/macros to use the declarative closure model.
5. Remove redundant closure toggles that become obsolete.

## 2) Invariants that must pass

1. Round closes iff no eligible responder remains unresolved.
2. Preflop BB option stays open until BB acts when no raise reopens beyond that requirement.
3. Short all-in/non-reopening behavior remains correct for players who have already acted.
4. Closure logic is phase-aware and deterministic.

## 3) Tests that must pass

1. New integration tests for closure semantics:
- BB option path
- raise-reopen path
- short all-in non-reopen path
- all-in auto-runout path
2. New property tests across random seeds asserting closure invariants per step.
3. Existing Texas suites:
- `test/integration/texas-runtime-bootstrap.test.ts`
- `test/integration/texas-holdem-hand.test.ts`
4. Full repository gates:
- `npm run build`
- `npm run lint`
- `npm test`
