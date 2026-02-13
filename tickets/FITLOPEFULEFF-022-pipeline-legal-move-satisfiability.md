# FITLOPEFULEFF-022: Pipeline Legal Move Satisfiability

**Status**: Pending
**Priority**: P0
**Estimated effort**: Medium (3-5 hours)
**Spec reference**: Spec 25b (decision sequence model), Spec 26 LimOp/profile legality behavior
**Depends on**: FITLOPEFULEFF-021

## Summary

Fix a kernel-level legality gap: `legalMoves()` can emit action-pipeline template moves that are top-level legal but cannot be completed via `legalChoices()` because required choices have no valid options.

This must be solved in the game-agnostic kernel, not in FITL-specific tests or profile workarounds.

## Problem

Current behavior allows "legal but unplayable" moves:
- `legalMoves()` emits `{ actionId, params: {} }` for pipeline actions after top-level legality/cost checks.
- `applyMove()` later rejects move completion with incomplete params or `legalChoices` cardinality errors.

This breaks agent/runtime assumptions and leaks invalid actions into deterministic simulation loops.

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
- `test/integration/fitl-card-flow-determinism.test.ts` — remove workaround logic that skips unsatisfiable scripted actions (if introduced)

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

### Invariants
- Game-agnostic kernel behavior only (no FITL special cases)
- No backward-compatibility aliases
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)
