# GAMEDEFGEN-012: Introduce Shared Pipeline Viability Policy Module

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium

## 1) What Needs To Change / Be Added

1. Add a shared pipeline viability policy module that centralizes policy decisions currently spread across `legalMoves`, `legalChoices`, and `applyMove`, while reusing existing shared preflight and predicate evaluators.
2. Encode policy as explicit typed decisions (for example: include template move, mark illegal reason, throw illegal move) instead of implicit inlined branching at callsites.
3. Keep surface differences explicit and intentional:
   - `legalMoves`: template discoverability gating.
   - `legalChoices`: illegal-complete choice signaling.
   - `applyMove`: hard illegal-move enforcement and cost/partial execution semantics.
4. Remove duplicated policy branches at entry points once the shared policy interface is in place.

## 2) Invariants That Should Pass

1. Policy decisions are deterministic for equivalent `(def, state, action, move)` inputs.
2. Atomic vs partial pipeline semantics remain correct and unchanged.
3. No accidental fallback to non-pipeline action behavior when pipeline policy forbids execution.
4. Policy remains game-agnostic and driven only by GameDef data.

## 3) Tests That Should Pass

1. Unit: viability policy decision-table tests across applicability/predicate/cost scenarios.
2. Unit: entry-point adapter tests proving each surface consumes policy results correctly.
3. Regression unit: existing `legalMoves`/`legalChoices`/`applyMove` pipeline behavior tests pass unchanged.
4. Integration: relevant simulator/kernel integration flows continue passing.
