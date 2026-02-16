# TEXHOLKERPRIGAMTOU-012: Declarative Betting-Round Closure Model

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: archive/tickets/TEXHOLKERPRIGAMTOU-010.md, archive/tickets/TEXHOLKERPRIGAMTOU-011.md
**Blocks**: TEXHOLKERPRIGAMTOU-013

## Assumption Reassessment (Current Code/Test Reality)

1. Texas closure is already expressed declaratively in YAML (`betting-round-completion`, `advance-after-betting`, `mark-preflop-big-blind-acted`) under `data/games/texas-holdem/20-macros.md` and action wiring in `data/games/texas-holdem/30-rules-actions.md`; there is no hardcoded Texas closure branch in kernel code.
2. After TEXHOLKERPRIGAMTOU-011, seat traversal is already generic (`nextPlayerByCondition`), which reduced prior macro duplication; this ticket should not re-open that solved concern.
3. Existing tests cover BB option and all-in auto-runout (`test/integration/texas-holdem-hand.test.ts`) but did not explicitly assert:
- full-raise reopen semantics for prior actors, and
- short all-in non-reopen constraints on previously acted players.
4. Architectural direction correction: introducing a wagering-specific closure contract in `GameDef`/kernel would overfit the engine domain. The engine should stay generic; betting closure policy should remain in game YAML using existing generic primitives.

## Problem

Texas betting closure and reopen semantics are declarative but still split across several toggles and were under-tested for key edge cases (especially short all-in non-reopen behavior for previously acted players).

## 1) Updated Scope (Ticket-Corrected)

1. Do not add wagering-specific kernel/runtime closure primitives.
2. Keep closure semantics in Texas YAML, but tighten the model so reopen behavior matches poker rules:
- full raises reopen action,
- short all-in raises do not reopen action for players who already acted.
3. Reduce redundant closure/reopen toggles only where behavior remains equivalent and deterministic.
4. Strengthen Texas tests to lock the above invariants and prevent regressions.

## 2) Invariants that must pass

1. Round closes iff no eligible responder remains unresolved.
2. Preflop BB option stays open until BB acts when no raise reopens beyond that requirement.
3. Full raises reopen action for previously acted, still-eligible players.
4. Short all-in increases to current bet without reopening raise rights for players who already acted.
5. Closure logic is phase-aware and deterministic.

## 3) Tests that must pass

1. New integration tests for closure semantics:
- BB option path
- raise-reopen path
- short all-in non-reopen path
- all-in auto-runout path
2. Additional multi-seed deterministic coverage for closure/reopen invariants (integration-level).
3. Existing Texas suites:
- `test/integration/texas-runtime-bootstrap.test.ts`
- `test/integration/texas-holdem-hand.test.ts`
4. Full repository gates:
- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- **Completion date**: 2026-02-16
- **Pattern reference**: `docs/gamespec-wagering-reopen-pattern.md`
- **What was actually changed**:
- Re-scoped the ticket away from adding wagering-specific kernel/runtime closure primitives.
- Added Texas-spec-local reopen-state modeling via `actedSinceLastFullRaise` in `data/games/texas-holdem/10-vocabulary.md`.
- Refined Texas action semantics in `data/games/texas-holdem/30-rules-actions.md` so full raises reopen raise rights and short all-ins do not.
- Tightened preflop BB-option closure in `data/games/texas-holdem/20-macros.md` by requiring `currentBet == bigBlind` for the special BB-option hold-open condition.
- Added integration coverage for full-raise reopen and short-all-in non-reopen in `test/integration/texas-holdem-hand.test.ts`.
- Updated structure expectations for the new per-player variable in `test/unit/texas-holdem-spec-structure.test.ts`.
- **Deviations from originally planned scope**:
- Did not introduce a new GameDef/GameSpec kernel closure contract; that direction was rejected as over-specializing engine architecture.
- Added a targeted BB-option correction discovered during hard-gate smoke testing because it was required to maintain chip-conservation invariants.
- **Verification results**:
- `npm run build` ✅
- `npm run lint` ✅
- `npm test` ✅
