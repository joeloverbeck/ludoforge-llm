# TEXHOLKERPRIGAMTOU-022: Generic Phase Transition Semantics (No Implicit Intermediate Side Effects)

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-019
**Blocks**: none

## 1) What needs to change / be added

1. Add explicit, game-agnostic turn-flow primitives for deterministic phase control that do not rely on implicit stepping side effects.
2. Define and implement one canonical runtime behavior for each primitive, for example:
- `gotoPhaseExact` (jump directly to a target phase in the same turn, without traversing intermediate phases)
- `endTurn` / `endRound` style primitive (advance across boundary intentionally, with explicit lifecycle semantics)
3. Keep existing `gotoPhase` semantics explicit and documented, or replace it entirely with stricter primitives.
4. Update compiler/runtime validation so invalid cross-boundary transitions fail fast with precise diagnostics.
5. Refactor Texas Hold'em YAML to use the new canonical primitive(s) instead of encoding hand-end semantics through fragile chained `gotoPhase` transitions.
6. Keep behavior fully game-agnostic in kernel/GameDef runtime; no Texas-specific branches.

## 2) Invariants that should pass

1. Phase transitions are deterministic and unambiguous for all games.
2. No transition can accidentally execute unintended intermediate phase lifecycle effects.
3. Cross-turn boundary behavior is explicit (never inferred by index math alone).
4. Invalid phase control usage is rejected at compile/runtime with actionable diagnostics.
5. Texas hand termination logic is explicit and does not depend on implicit phase traversal behavior.

## 3) Tests that should pass

1. Unit: turn-flow effect tests for exact jump semantics and explicit boundary-advance semantics.
2. Unit: validation tests for illegal transition requests (unknown phase, forbidden boundary crossing, malformed effect payloads).
3. Integration: Texas runtime flow test proving single-player-left hand termination reaches cleanup/end-hand semantics without traversing unintended intermediate streets/showdown effects.
4. Integration: regression on phase lifecycle ordering to ensure expected `phaseExit`/`phaseEnter` dispatch remains deterministic.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
