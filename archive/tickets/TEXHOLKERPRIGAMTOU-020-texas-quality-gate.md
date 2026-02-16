# TEXHOLKERPRIGAMTOU-020: Texas Quality Gate (Compile + Runtime + Showdown Contracts)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-018, TEXHOLKERPRIGAMTOU-019
**Blocks**: TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009

## 0) Reassessed assumptions (code/tests reality)

This ticket's original assumptions were partially stale.

What already exists:
1. A Texas compile gate already exists in `test/unit/texas-holdem-spec-structure.test.ts` and asserts parse/validate/compile success with zero diagnostics.
2. A Texas runtime bootstrap smoke path already exists in `test/integration/texas-runtime-bootstrap.test.ts` and verifies playable preflop initialization, legal move availability, and actor progression/heads-up policy checks.
3. These tests already run under `npm test` (unit + integration).

Remaining gaps:
1. No explicit Texas runtime quality gate currently enforces chip conservation over a multi-step simulation window.
2. No explicit Texas runtime quality gate currently enforces "no negative stacks" over a multi-step simulation window.
3. Card conservation is only asserted at bootstrap and not continuously asserted across applied moves.

Architecture reassessment:
1. The proposed quality-gate direction is still beneficial and should proceed.
2. The cleanest architecture is to extend integration tests with a reusable smoke+invariant harness pattern (compile + deterministic move window + invariant assertions), not add Texas-specific runtime branches.
3. No backwards-compat aliases are needed; failing invariants should be fixed at source.

## 1) Updated scope: what must change / be implemented

Add mandatory tests that prevent structurally-valid but non-playable Texas specs from passing CI:

1. Keep the existing Texas compile gate and strengthen where needed only if it misses error-severity enforcement.
2. Add a Texas simulator smoke gate that compiles, initializes, and applies deterministic legal moves for a minimum step window without runtime errors/stalls.
3. Add targeted runtime invariant checks during the smoke window for:
- chip conservation
- card conservation
- no negative stacks
4. Keep these gates in standard `npm test` (not optional/manual).
5. Keep gate implementation generic in style (small reusable helpers allowed) so future games can reuse the same contract pattern.

## 2) Invariants that should pass

1. Texas spec is both parse-valid and compile-valid.
2. Texas spec is simulator-runnable beyond initialization for a deterministic minimum move window.
3. Card count is conserved throughout the smoke window.
4. Total chips are conserved throughout the smoke window.
5. No player stack becomes negative at any step.
6. CI catches contract drift early when GameSpec YAML changes.

## 3) Tests that should pass

1. Existing Texas compile gate remains green and continues failing on any compile errors.
2. New/expanded integration Texas simulator smoke test covering deterministic multi-step play.
3. New integration invariant checks (chip/card/no-negative) over deterministic seeds and player counts.
4. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-16
- What was actually changed:
  - Expanded `test/integration/texas-runtime-bootstrap.test.ts` with deterministic multi-step smoke gates that enforce:
    - card conservation across steps
    - chip conservation (`sum(chipStack) + pot`) across steps
    - non-negative `chipStack` for every player
  - Added aggregate-binder macro hygiene coverage in `test/unit/expand-effect-macros.test.ts`.
  - Fixed macro expansion hygiene in `src/cnl/expand-effect-macros.ts` so `aggregate.bind` declarations are renamed consistently with their binding references.
  - Fixed Texas YAML runtime flow defects surfaced by the new gates:
    - removed illegal turn-boundary `gotoPhase: hand-setup` from `hand-cleanup` on-enter.
    - removed explicit `gotoPhase: hand-cleanup` from `showdown` on-enter to avoid overshoot/race with `gotoPhase` runtime semantics.
    - adjusted `advance-after-betting` in `data/games/texas-holdem/20-macros.md` to avoid invalid early-shortcut phase jumps.
    - hardened showdown scoring guard in `data/games/texas-holdem/30-rules-actions.md` to only run `evaluateSubset` when at least 5 cards are present.
- Deviations from original plan:
  - Scope expanded beyond test-only work to include targeted compiler/YAML fixes because the strengthened smoke gate exposed real runtime defects and one macro-hygiene compiler defect.
- Verification results:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
