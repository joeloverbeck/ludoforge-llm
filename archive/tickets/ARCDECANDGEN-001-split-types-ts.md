# ARCDECANDGEN-001: Split `types.ts` into 6 focused files

**Status**: ✅ COMPLETED
**Phase**: 1A (File Decomposition — Pure Refactoring)
**Priority**: P0 — prerequisite for all subsequent tickets
**Complexity**: M
**Dependencies**: None

## Goal

Split `src/kernel/types.ts` (1164 lines) into 6 cohesive files. `types.ts` becomes a barrel re-export file. Zero behavior changes.

## Reassessed Assumptions (current codebase)

- `src/kernel/types.ts` currently exports additional data-asset, map/piece-catalog, trace/eval, and serialization contracts beyond the initial ticket list. The split must preserve **all** existing exports, not only the subset listed below.
- The ticket used placeholder names (`EventDeckDef`, `EventSideDef`, `EventBranchDef`, `EventTargetDef`, `EventLastingEffectDef`, `ActiveLastingEffect`) that do not match current code. The implementation must keep current names (`EventCardDef`, `EventCardSideDef`, `EventCardBranchDef`, `EventCardTargetDef`, `EventCardLastingEffectDef`, etc.) unchanged.
- `CompoundMovePayload` references `Move`; placing `CompoundMovePayload` in `types-turn-flow.ts` would create a cycle with `types-core.ts` (where `Move` lives). To satisfy the no-circular-dependency invariant, `CompoundMovePayload` remains in `types-core.ts`.
- `src/kernel/index.ts` already re-exports from `types.ts`; no index surface change is expected.
- Exact test count in repository is treated as variable; acceptance is based on all currently existing tests passing.

## File List (files to touch)

### New files to create
- `src/kernel/types-core.ts` (~450 lines) — GameDef, GameState, ActionDef, TriggerDef, EndCondition, ZoneDef, TokenTypeDef, VariableDef, TurnStructure, Move, ChoiceRequest, ScoringDef, StackingConstraint, MapSpaceDef, Token, ActionUsageRecord, ApplyMoveResult, SerializedGameState, TerminalResult, PlayerScore, ExecutionOptions, Rng, RngState
- `src/kernel/types-ast.ts` (~350 lines) — ConditionAST, ValueExpr, EffectAST (all variants), Reference, PlayerSel, ZoneSel, ZoneRef, TokenSel, TokenFilterPredicate, OptionsQuery, MoveParamValue, MoveParamScalar
- `src/kernel/types-turn-flow.ts` (~180 lines) — TurnFlowDef, TurnFlowCardLifecycleDef, TurnFlowEligibilityDef, TurnFlowOptionMatrixRowDef, TurnFlowPassRewardDef, TurnFlowMonsoonDef, TurnFlowPivotalDef, TurnFlowInterruptResolutionDef, TurnFlowDuration, TurnFlowActionClass, TurnFlowRuntimeState, TurnFlowRuntimeCardState, TurnFlowPendingEligibilityOverride, CompoundActionState, CoupPlanDef, CoupPlanPhaseDef, and turn-flow trace entry types
- `src/kernel/types-operations.ts` (~60 lines) — OperationProfileDef, OperationLegalityDef, OperationCostDef, OperationTargetingDef, OperationResolutionStageDef, OperationProfilePartialExecutionDef
- `src/kernel/types-victory.ts` (~80 lines) — VictoryDef, VictoryCheckpointDef, VictoryMarginDef, VictoryRankingDef, VictoryTiming, VictoryTerminalMetadata, VictoryTerminalRankingEntry
- `src/kernel/types-events.ts` (~100 lines) — EventCardDef, EventCardSideDef, EventCardBranchDef, EventCardTargetDef, EventCardLastingEffectDef, EventCardTargetCardinality, EventCardSetPayload

### Additional scope clarification
- Include all remaining exported types from `types.ts` in one of the six files (for example: data asset envelopes/refs, map/piece-catalog payloads, zobrist contracts, trace/eval/report/agent contracts) while preserving names and shapes.

### Files to modify
- `src/kernel/types.ts` — gut contents, replace with barrel `export * from './types-core'` etc.
- `src/kernel/index.ts` — may need adjustment if it re-exports from types directly

## Out of Scope

- **No behavior changes** — this is a pure move-and-re-export refactoring
- **No renaming** of any type, field, or export
- **No import changes** in any consumer file (barrel re-export preserves the API surface)
- **No test changes required by design** — existing tests should pass unmodified unless a hidden regression requires a focused safety test
- **No changes to** `src/cnl/`, `src/agents/`, `src/sim/`, `test/`, `schemas/`, `data/`

## Acceptance Criteria

### Tests that must pass
- `npm test` — all existing tests pass with zero modifications to test code
- `npm run typecheck` — passes cleanly
- `npm run lint` — passes cleanly

### Invariants that must remain true
- All public exports from `src/kernel/types.ts` remain identical (barrel re-export)
- No file in the new split exceeds 600 lines
- No circular dependencies between split files (verify: `npx madge --circular src/kernel/types*.ts`)
- The `src/kernel/index.ts` export surface is unchanged
- `import { ... } from '../kernel/types'` works identically everywhere

## Outcome

- **Completion date**: February 13, 2026
- **What changed**:
  - Split `src/kernel/types.ts` into:
    - `src/kernel/types-core.ts`
    - `src/kernel/types-ast.ts`
    - `src/kernel/types-turn-flow.ts`
    - `src/kernel/types-operations.ts`
    - `src/kernel/types-victory.ts`
    - `src/kernel/types-events.ts`
  - Converted `src/kernel/types.ts` into a barrel re-export file.
  - Preserved the existing exported interface/type surface from the pre-split `types.ts`.
- **Deviations from original plan**:
  - Included additional real exports that were missing from the initial ticket list (data-asset/scenario and trace/eval/serialization contracts).
  - Kept `CompoundMovePayload` in `types-core.ts` to avoid a cross-file cycle with `Move`.
  - `EventDeckDef`/`EventSideDef`/`EventBranchDef` naming in the ticket was corrected to actual code symbols (`EventCard*`).
  - `src/kernel/index.ts` did not require changes.
- **Verification**:
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed (140 test files, 0 failures).
