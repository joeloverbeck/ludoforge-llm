# TEXHOLKERPRIGAMTOU-022: Explicit Phase Transition Semantics (Exact Jump vs Stepwise Advance)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-019
**Blocks**: TEXHOLKERPRIGAMTOU-024

## 0) Assumption Reassessment (2026-02-16)

Current code already has `gotoPhase`, but its runtime behavior is **stepwise phase advancement** via repeated `advancePhase` calls. That means intermediate phase lifecycle effects (`phaseExit`/`phaseEnter`, `onEnter` handlers) execute while moving toward the target phase.

This differs from the original ticket assumption that explicit primitives are entirely missing.

Concrete baseline in the repo:
1. Runtime turn-flow effects live in `src/kernel/effects-turn-flow.ts` (not `apply-effects.ts`).
2. `gotoPhase` enforces same-turn forward-only movement and rejects backward/cross-boundary movement at runtime.
3. Compile-time validation currently checks only phase existence for `gotoPhase`; boundary/lifecycle intent is not encoded in the effect type.
4. Texas Hold'em currently uses `gotoPhase` in `data/games/texas-holdem/20-macros.md` and `data/games/texas-holdem/30-rules-actions.md`, which can trigger unintended intermediate street/showdown side effects when hand termination needs a direct jump.

## 1) Updated scope (corrected)

1. Split phase-transition intent into two explicit, game-agnostic primitives:
- `gotoPhaseExact`: jump directly to a turn phase in the same turn without traversing intermediate phases.
- `advancePhase`: explicitly perform stepwise progression using lifecycle semantics (the behavior currently encoded by `gotoPhase`).
2. Remove `gotoPhase` from compiler/runtime schemas and dispatch (no alias/back-compat shim).
3. Add validation and runtime diagnostics for the new primitives:
- unknown phase ids fail fast with precise diagnostics
- `gotoPhaseExact` rejects cross-turn (backward) targets
4. Refactor Texas YAML to use `gotoPhaseExact` for hand-end jumps that must skip intermediate streets/showdown side effects.
5. Keep all behavior game-agnostic in kernel/compiler; no Texas-specific branches.

## 2) Invariants that should pass

1. Phase transitions are deterministic and semantically explicit by effect type.
2. Exact jumps cannot execute unintended intermediate lifecycle effects.
3. Stepwise advancement remains available explicitly through `advancePhase`.
4. Invalid transition usage fails with actionable diagnostics.
5. Texas hand termination logic does not rely on implicit intermediate traversal.

## 3) Tests that should pass

1. Unit: effect lowering/schema/exhaustiveness coverage for `gotoPhaseExact` + `advancePhase` (and removal of `gotoPhase`).
2. Unit: runtime semantics
- `gotoPhaseExact` jumps without intermediate lifecycle dispatch
- `advancePhase` preserves stepwise lifecycle behavior
- `gotoPhaseExact` rejects backward/cross-turn targets
3. Unit: validation tests for unknown/invalid phase transition payloads.
4. Integration: Texas runtime flow regression proving early hand termination reaches cleanup without traversing unintended intermediate phase side effects.
5. Regression: `npm run build`, `npm test`, `npm run lint`.

## 4) Architecture rationale

Separating exact-jump and stepwise-advance semantics at the AST/effect level is cleaner and more extensible than overloading one primitive:
1. It eliminates hidden lifecycle coupling and makes intent reviewable in YAML.
2. It avoids game-specific workarounds for phase control.
3. It creates a stable base for future explicit boundary primitives (for example dedicated turn/round termination) without ambiguous legacy semantics.

## Outcome

- Completion date: 2026-02-16
- Implemented:
  - Replaced legacy `gotoPhase` with two explicit primitives: `gotoPhaseExact` and `advancePhase` across AST types, schemas, compiler lowering, runtime dispatch, and behavior validation.
  - Updated Texas Hold'em YAML flow to use `gotoPhaseExact`, including explicit single-player-left jump to `showdown` and guarded street advancement.
  - Added/updated unit and integration coverage for exact-jump vs stepwise semantics and Texas early-termination regression.
  - Regenerated schema artifacts (`schemas/GameDef.schema.json`, `schemas/Trace.schema.json`, `schemas/EvalReport.schema.json`).
- Deviation from original wording:
  - Early single-player-left branch now jumps to `showdown` (not directly to `hand-cleanup`) so side-pot/pot-award logic remains centralized and no chip-conservation behavior regresses.
- Verification:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
