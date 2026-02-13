# ARCDECANDGEN-001: Split `types.ts` into 6 focused files

**Phase**: 1A (File Decomposition — Pure Refactoring)
**Priority**: P0 — prerequisite for all subsequent tickets
**Complexity**: M
**Dependencies**: None

## Goal

Split `src/kernel/types.ts` (1164 lines) into 6 cohesive files. `types.ts` becomes a barrel re-export file. Zero behavior changes.

## File List (files to touch)

### New files to create
- `src/kernel/types-core.ts` (~450 lines) — GameDef, GameState, ActionDef, TriggerDef, EndCondition, ZoneDef, TokenTypeDef, VariableDef, TurnStructure, Move, ChoiceRequest, ScoringDef, StackingConstraint, MapSpaceDef, Token, ActionUsageRecord, ApplyMoveResult, SerializedGameState, TerminalResult, PlayerScore, ExecutionOptions, Rng, RngState
- `src/kernel/types-ast.ts` (~350 lines) — ConditionAST, ValueExpr, EffectAST (all variants), Reference, PlayerSel, ZoneSel, ZoneRef, TokenSel, TokenFilterPredicate, OptionsQuery, MoveParamValue, MoveParamScalar
- `src/kernel/types-turn-flow.ts` (~180 lines) — TurnFlowDef, TurnFlowCardLifecycleDef, TurnFlowEligibilityDef, TurnFlowOptionMatrixRowDef, TurnFlowPassRewardDef, TurnFlowMonsoonDef, TurnFlowPivotalDef, TurnFlowInterruptResolutionDef, TurnFlowDuration, TurnFlowActionClass, TurnFlowRuntimeState, TurnFlowRuntimeCardState, TurnFlowPendingEligibilityOverride, CompoundActionState, CompoundMovePayload, CoupPlanDef, CoupPlanPhaseDef
- `src/kernel/types-operations.ts` (~60 lines) — OperationProfileDef, OperationLegalityDef, OperationCostDef, OperationTargetingDef, OperationResolutionStageDef, OperationProfilePartialExecutionDef
- `src/kernel/types-victory.ts` (~80 lines) — VictoryDef, VictoryCheckpointDef, VictoryMarginDef, VictoryRankingDef, VictoryTiming, VictoryTerminalResult, VictoryTerminalRankingEntry, SpaceMarkerLatticeDef
- `src/kernel/types-events.ts` (~100 lines) — EventDeckDef, EventCardDef, EventSideDef, EventBranchDef, EventTargetDef, EventLastingEffectDef, EventTargetCardinality, ActiveLastingEffect

### Files to modify
- `src/kernel/types.ts` — gut contents, replace with barrel `export * from './types-core'` etc.
- `src/kernel/index.ts` — may need adjustment if it re-exports from types directly

## Out of Scope

- **No behavior changes** — this is a pure move-and-re-export refactoring
- **No renaming** of any type, field, or export
- **No import changes** in any consumer file (barrel re-export preserves the API surface)
- **No test changes** — all 1078 tests must pass unmodified
- **No changes to** `src/cnl/`, `src/agents/`, `src/sim/`, `test/`, `schemas/`, `data/`

## Acceptance Criteria

### Tests that must pass
- `npm test` — all 1078 existing tests pass with zero modifications to test code
- `npm run typecheck` — passes cleanly
- `npm run lint` — passes cleanly

### Invariants that must remain true
- All public exports from `src/kernel/types.ts` remain identical (barrel re-export)
- No file in the new split exceeds 600 lines
- No circular dependencies between split files (verify: `npx madge --circular src/kernel/types*.ts`)
- The `src/kernel/index.ts` export surface is unchanged
- `import { ... } from '../kernel/types'` works identically everywhere
