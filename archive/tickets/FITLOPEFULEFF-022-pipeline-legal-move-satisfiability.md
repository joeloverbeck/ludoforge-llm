# FITLOPEFULEFF-022: Pipeline Legal Move Satisfiability

**Status**: ✅ COMPLETED
**Priority**: P0
**Estimated effort**: Medium (3-5 hours)
**Spec reference**: Spec 25b (decision sequence model), Spec 26 LimOp/profile legality behavior
**Depends on**: FITLOPEFULEFF-020

## Summary

Fix a kernel-level legality gap: `legalMoves()` can emit action-pipeline template moves that are top-level legal but cannot be completed via `legalChoices()` because required choices have no valid options.

This must be solved in the game-agnostic kernel, not in FITL-specific tests or profile workarounds.

## Problem

Current behavior allows "legal but unplayable" moves:
- `legalMoves()` emits `{ actionId, params: {} }` for pipeline actions after top-level legality/cost checks.
- `applyMove()` later rejects move completion with incomplete params or `legalChoices` cardinality errors.

This breaks agent/runtime assumptions and leaks invalid actions into deterministic simulation loops.

## Assumption Reassessment (2026-02-13)

Validated against current code and tests:
- `src/kernel/legal-moves.ts` still emits pipeline template moves after top-level legality/cost checks without probing decision-sequence satisfiability.
- `test/integration/fitl-card-flow-determinism.test.ts` already contains workaround logic that drops unsatisfiable scripted actions (`completeProfileMoveDeterministically` can return `null` and caller `continue`s).
- `test/unit/kernel/legal-moves.test.ts` currently covers template emission, legality, and cost gating, but does not cover required-choice unsatisfiability filtering.

Scope corrections:
- This ticket is a prerequisite for FITLOPEFULEFF-021 verification, not a dependent of it. Dependency corrected to avoid circular chain.
- Determinism integration cleanup is required now (not conditional "if introduced").

## Proposed Architecture

In `legalMoves()`, when an action resolves to a pipeline profile:
1. Run a cheap satisfiability probe through `legalChoices(def, state, templateMove)`.
2. If completion requires a choice whose domain cannot satisfy minimum cardinality (`options.length < min`), exclude this move from legal actions.
3. If `legalChoices` throws a choice-domain/cardinality exception, treat move as illegal and exclude it.
4. Keep existing top-level legality/cost validation semantics unchanged.

No FITL-specific branches, aliases, or exception paths.

## Files to Touch

- `src/kernel/legal-moves.ts` — add pipeline decision satisfiability filtering
- `src/kernel/legal-choices.ts` — only if needed for a typed/inspectable unsatisfiable signal (prefer no behavior change)
- `test/unit/kernel/legal-moves.test.ts` — add kernel-level regression coverage
- `test/integration/fitl-card-flow-determinism.test.ts` — remove current workaround logic that skips unsatisfiable scripted actions

## Out of Scope

- Changing profile YAML in `data/games/fire-in-the-lake.md`
- Action-pipeline cost semantics redesign
- Agent policy/heuristics

## Acceptance Criteria

### Tests That Must Pass
1. Pipeline moves with unsatisfiable required choices are absent from `legalMoves()`.
2. Pipeline moves with satisfiable choices remain present.
3. `applyMove()` is not needed to discover this illegality for unsatisfiable pipeline templates.
4. Determinism integration (`fitl-card-flow-determinism`) runs without workaround-based skips for unsatisfiable templates.
5. FITL action scripts in determinism tests must either be legal by construction or fail with explicit assertions; silent skip paths are disallowed.

### Invariants
- Game-agnostic kernel behavior only (no FITL special cases)
- No backward-compatibility aliases
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)

## Outcome

- Completion date: 2026-02-13
- What changed:
  - Added kernel-level satisfiability filtering for profiled/template pipeline actions in `legalMoves()` by probing `legalChoices()` before emitting `{ actionId, params: {} }`.
  - Excluded template moves when required `chooseOne`/`chooseN` steps are unsatisfiable or decision-sequence probing fails.
  - Added unit regressions in `test/unit/kernel/legal-moves.test.ts` for unsatisfiable `chooseN` and `chooseOne` templates.
  - Removed silent skip workaround from `test/integration/fitl-card-flow-determinism.test.ts`; scripted actions now fail explicitly when illegal/unsatisfiable.
- Deviations from original plan:
  - No changes were needed in `src/kernel/legal-choices.ts`.
  - Determinism coin scenario action was updated from `assault` to `sweep` so the scripted sequence is legal by construction under the new satisfiability guard.
- Verification:
  - `npm run build` passed.
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed.
