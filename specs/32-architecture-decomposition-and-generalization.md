# Spec 32: Architecture Decomposition and Generalization

**Status**: Draft
**Priority**: P0 (structural debt blocking universal game support)
**Complexity**: XL
**Dependencies**: None (all changes are refactoring of existing code)
**Estimated effort**: 16-20 days
**Source sections**: Brainstorming doc sections 0 (Constraints), 3 (Kernel DSL), 4 (Compiler contract)

## Overview

The engine's core primitives (effects, conditions, values, zones, tokens, triggers, phases) are game-agnostic and well-designed. However, FITL-specific subsystems — turn flow, operation profiles, coup plans, victory checkpoints, monsoon restrictions, event cards — are bolted directly onto `GameDef`, `GameState`, `types.ts`, `apply-move.ts`, `legal-moves.ts`, and `terminal.ts` as optional fields. Every new game system that can't be expressed through existing primitives adds another `?` field to `GameDef` and another `if (def.xxx !== undefined)` branch in the kernel.

This spec addresses eight structural problems:

1. **Six files exceed the 800-line coding guideline** (up to 2285 lines)
2. **Game-specific types mixed into core type definitions** (types.ts: 1164 lines)
3. **Action resolution has two divergent code paths** (simple inline vs OperationProfileDef)
4. **Turn order is hardcoded to roundRobin + a FITL bolt-on** (TurnFlowDef)
5. **Terminal evaluation is split across three unrelated concepts** (endConditions, victory, scoring)
6. **Compiler returns opaque null on any error** (no partial results)
7. **No cross-reference validation between subsystems** (zones, actions, profiles, phases)
8. **Event card types use opaque Record<string, unknown>** (no compile-time validation, no kernel execution path)

### Design Principles

- **No backwards compatibility**: Clean breaks, no aliases, no shims
- **Game-agnostic kernel**: All game-specific behavior encoded in GameSpecDoc/GameDef data
- **Composition over enumeration**: New game mechanics should compose from existing abstractions, not add new optional fields to GameDef
- **Many small files**: 200-400 lines typical, 800 max

## Phase 1: File Decomposition (Pure Refactoring)

No behavior changes. Every existing test must pass unmodified after each split.

### 1A: Split `types.ts` (1164 lines → 6 files)

**Current state**: Core AST types, GameDef, GameState, and all FITL-specific type definitions live in one file.

**Target files:**

| New File | Contents | Est. Lines |
|----------|----------|------------|
| `types-core.ts` | GameDef, GameState, ActionDef, TriggerDef, EndCondition, ZoneDef, TokenTypeDef, VariableDef, TurnStructure, Move, ChoiceRequest, ScoringDef, StackingConstraint, MapSpaceDef, Token, ActionUsageRecord, ApplyMoveResult, SerializedGameState, TerminalResult, PlayerScore, ExecutionOptions, Rng, RngState | ~450 |
| `types-ast.ts` | ConditionAST, ValueExpr, EffectAST (all variants), Reference, PlayerSel, ZoneSel, ZoneRef, TokenSel, TokenFilterPredicate, OptionsQuery, MoveParamValue, MoveParamScalar | ~350 |
| `types-turn-flow.ts` | TurnFlowDef, TurnFlowCardLifecycleDef, TurnFlowEligibilityDef, TurnFlowOptionMatrixRowDef, TurnFlowPassRewardDef, TurnFlowMonsoonDef, TurnFlowPivotalDef, TurnFlowInterruptResolutionDef, TurnFlowDuration, TurnFlowActionClass, TurnFlowRuntimeState, TurnFlowRuntimeCardState, TurnFlowPendingEligibilityOverride, CompoundActionState, CompoundMovePayload, CoupPlanDef, CoupPlanPhaseDef | ~180 |
| `types-operations.ts` | OperationProfileDef, OperationLegalityDef, OperationCostDef, OperationTargetingDef, OperationResolutionStageDef, OperationProfilePartialExecutionDef | ~60 |
| `types-victory.ts` | VictoryDef, VictoryCheckpointDef, VictoryMarginDef, VictoryRankingDef, VictoryTiming, VictoryTerminalResult, VictoryTerminalRankingEntry, SpaceMarkerLatticeDef | ~80 |
| `types-events.ts` | EventDeckDef, EventCardDef, EventSideDef, EventBranchDef, EventTargetDef, EventLastingEffectDef, EventTargetCardinality, ActiveLastingEffect | ~100 |

**Re-export**: `types.ts` becomes a barrel file re-exporting everything from the six files. Zero import changes needed anywhere.

### 1B: Split `compiler.ts` (2285 lines → 7 files)

**Current state**: Orchestration logic, all `lower*` functions, data-asset derivation, and diagnostic finalization in one file.

**Target files:**

| New File | Contents | Est. Lines |
|----------|----------|------------|
| `compiler-core.ts` | `compileGameSpecToGameDef`, `compileExpandedDoc`, `resolveCompileLimits`, `CompileOptions`, `CompileLimits` — the orchestration that wires sections together | ~300 |
| `compile-turn-flow.ts` | `lowerTurnFlow` and all its helpers (lines 213-378 currently) | ~170 |
| `compile-operations.ts` | `lowerOperationProfiles` and helpers (lines 681-1090) | ~420 |
| `compile-victory.ts` | `lowerVictory`, `lowerCoupPlan` and helpers (lines 379-680) | ~310 |
| `compile-event-cards.ts` | `lowerEventCards`, `lowerEventCardSide` and helpers (lines 1093-1250) | ~160 |
| `compile-data-assets.ts` | Data asset derivation logic (zone materialization from map, tokenTypes from pieceCatalog, eventCardSet selection) — lines currently inline in `compileExpandedDoc` | ~200 |
| `compile-lowering.ts` | Shared lowering utilities: `lowerConstants`, `lowerVarDefs`, `lowerTokenTypes`, `lowerTurnStructure`, `lowerActions`, `lowerTriggers`, `lowerEndConditions` | ~350 |

**Re-export**: `compiler.ts` becomes a thin barrel re-exporting `compileGameSpecToGameDef` and types.

### 1C: Split `validate-spec.ts` (1688 lines → 5 files)

**Target files:**

| New File | Contents | Est. Lines |
|----------|----------|------------|
| `validate-spec-core.ts` | `validateGameSpec`, section dispatch, unknown-key detection, suggestion engine (Levenshtein) | ~300 |
| `validate-metadata.ts` | Metadata, constants, globalVars, perPlayerVars validation | ~200 |
| `validate-zones.ts` | Zone, tokenType, setup validation | ~250 |
| `validate-actions.ts` | Action, trigger, endCondition, effectMacro validation | ~400 |
| `validate-extensions.ts` | TurnFlow, operationProfile, coupPlan, victory, eventCard, dataAsset validation | ~500 |

### 1D: Split `effects.ts` (1445 lines → 5 files)

**Target files:**

| New File | Contents | Est. Lines |
|----------|----------|------------|
| `effect-dispatch.ts` | `applyEffect`, `applyEffects`, `effectTypeOf`, budget management, the dispatch `switch` | ~120 |
| `effects-var.ts` | `handleSetVar`, `handleAddVar` | ~120 |
| `effects-token.ts` | `handleMoveToken`, `handleMoveAll`, `handleMoveTokenAdjacent`, `handleDraw`, `handleShuffle`, `handleCreateToken`, `handleDestroyToken`, `handleSetTokenProp` | ~550 |
| `effects-control.ts` | `handleIf`, `handleForEach`, `handleLet` | ~250 |
| `effects-choice.ts` | `handleChooseOne`, `handleChooseN`, `handleRollRandom`, `handleSetMarker`, `handleShiftMarker` | ~350 |

### 1E: Split `validate-gamedef.ts` (1291 lines → 4 files)

**Target files:**

| New File | Contents | Est. Lines |
|----------|----------|------------|
| `validate-gamedef-core.ts` | `validateGameDef`, section dispatch | ~150 |
| `validate-gamedef-structure.ts` | Metadata, zones, tokenTypes, turnStructure, vars validation | ~350 |
| `validate-gamedef-behavior.ts` | Actions, triggers, endConditions, effects, conditions validation | ~450 |
| `validate-gamedef-extensions.ts` | TurnFlow, operationProfiles, coupPlan, victory, eventCards validation | ~350 |

### 1F: Split `schemas.ts` (1397 lines → 4 files)

**Target files:**

| New File | Contents | Est. Lines |
|----------|----------|------------|
| `schemas-core.ts` | GameDef, GameState, core section schemas | ~350 |
| `schemas-ast.ts` | EffectAST, ConditionAST, ValueExpr, query schemas | ~400 |
| `schemas-extensions.ts` | TurnFlow, operationProfile, coupPlan, victory, eventCard schemas | ~350 |
| `schemas-gamespec.ts` | GameSpecDoc validation schemas (if any — currently may be in validate-spec) | ~300 |

### 1G: Split `legal-moves.ts` and `apply-move.ts`

**legal-moves.ts (330 lines → 2 files):**

| New File | Contents | Est. Lines |
|----------|----------|------------|
| `legal-moves.ts` | `legalMoves`, `makeEvalContext`, `withinActionLimits`, `enumerateParams` — core enumeration | ~160 |
| `legal-moves-turn-order.ts` | `isMoveAllowedByTurnFlowOptionMatrix`, `applyTurnFlowWindowFilters`, `isLookaheadCardCoup`, `compareFactionByInterruptPrecedence`, `resolveInterruptWinnerFaction`, `hasOverrideToken`, `containsToken` | ~170 |

**apply-move.ts (366 lines → 2 files):**

| New File | Contents | Est. Lines |
|----------|----------|------------|
| `apply-move.ts` | `applyMove`, `validateMove`, `findAction`, `isSameMove`, `areMoveParamsEqual` — orchestration | ~210 |
| `apply-move-pipeline.ts` | `resolveOperationProfile`, `toOperationExecutionProfile`, pipeline stage execution | ~160 |

**Note**: `resolveOperationProfile` is duplicated between `legal-moves.ts` and `apply-move.ts` today. Consolidate into `apply-move-pipeline.ts`, import from both consumers.

### Phase 1 Invariants

1. **All 1078 existing tests pass** after each file split with zero changes to test code
2. **All public exports remain identical** — barrel re-exports preserve the API surface
3. **No file exceeds 600 lines** after decomposition
4. **`npm run typecheck` passes** after each split
5. **`npm run lint` passes** after each split
6. **No circular dependencies** introduced between split files (verify with `madge --circular`)

### Phase 1 Tests

No new tests needed — this is pure refactoring. Existing test suite is the verification.

---

## Phase 2: Structured Compile Results

### 2A: Add `CompileSectionResults` to compiler output

**What changes:**

The return type of `compileGameSpecToGameDef` changes from:

```typescript
{ readonly gameDef: GameDef | null; readonly diagnostics: readonly Diagnostic[] }
```

To:

```typescript
interface CompileResult {
  readonly gameDef: GameDef | null;
  readonly sections: CompileSectionResults;
  readonly diagnostics: readonly Diagnostic[];
}
```

Where `CompileSectionResults` captures each section's compile output independently:

```typescript
interface CompileSectionResults {
  readonly metadata: GameDef['metadata'] | null;
  readonly constants: GameDef['constants'] | null;
  readonly globalVars: readonly VariableDef[] | null;
  readonly perPlayerVars: readonly VariableDef[] | null;
  readonly zones: readonly ZoneDef[] | null;
  readonly tokenTypes: readonly TokenTypeDef[] | null;
  readonly setup: readonly EffectAST[] | null;
  readonly turnStructure: TurnStructure | null;
  readonly actions: readonly ActionDef[] | null;
  readonly triggers: readonly TriggerDef[] | null;
  readonly endConditions: readonly EndCondition[] | null;
  readonly turnOrder: TurnOrderStrategy | null;
  readonly actionPipelines: readonly ActionPipelineDef[] | null;
  readonly victory: VictoryDef | null;
  readonly eventDecks: readonly EventDeckDef[] | null;
  readonly scoring: ScoringDef | null;
}
```

**Files to touch:**

| File | Change |
|------|--------|
| `src/cnl/compiler-core.ts` (post-Phase 1) | Add `CompileResult` and `CompileSectionResults` types. `compileExpandedDoc` builds `sections` incrementally as each `lower*` succeeds. `gameDef` is assembled from `sections` only when all required sections succeeded. |
| `src/cnl/index.ts` | Export new types |
| All callers of `compileGameSpecToGameDef` | Access `result.gameDef` as before (no break). Tests that want section-level inspection use `result.sections`. |

**Implementation rule**: Each `lower*` function is wrapped in a try-catch. On success, the section result is populated. On failure, the section is `null` and a diagnostic is emitted. `gameDef` is `null` whenever any required section is `null`.

### Phase 2 Invariants

1. **`result.gameDef` is non-null if and only if `result.diagnostics` contains zero error-severity entries** — same rule as today
2. **For a valid spec, every field in `result.sections` is non-null** and matches the corresponding field in `result.gameDef`
3. **For a spec with errors in only one section, all other sections compile to non-null values**
4. **`result.gameDef === null` does NOT imply all sections are null** — only the failing section(s) are null
5. **Backward compatibility**: Any code that only reads `result.gameDef` and `result.diagnostics` works identically

### Phase 2 Tests

**File**: `test/unit/compiler-structured-results.test.ts`

```
Test 1: "valid spec produces non-null gameDef and fully populated sections"
  - Compile `compile-valid.md` fixture
  - Assert gameDef !== null
  - Assert every field in sections is non-null
  - Assert sections.zones deep-equals gameDef.zones (and so on for each field)

Test 2: "spec with broken actions still compiles zones and metadata"
  - Construct a spec with valid metadata + zones + turnStructure + endConditions but malformed actions
  - Assert gameDef === null
  - Assert sections.metadata !== null
  - Assert sections.zones !== null
  - Assert sections.actions === null
  - Assert diagnostics contain error referencing actions

Test 3: "spec with broken metadata nulls gameDef but compiles zones"
  - Construct a spec with invalid metadata (empty id) but valid zones
  - Assert gameDef === null
  - Assert sections.metadata === null (metadata lowering failed)
  - Assert sections.zones !== null (zones compiled independently)

Test 4: "sections match gameDef fields exactly for production FITL spec"
  - compileProductionSpec()
  - For each non-null field in sections, assert deep equality with corresponding gameDef field

Test 5: "CompileSectionResults type has a key for every GameDef field"
  - Static type test: ensure CompileSectionResults covers all GameDef fields
  - This is enforced at the type level via mapped types or explicit exhaustiveness check
```

### 2B: Data Asset Failure Cascade Semantics

When a data asset fails to compile, sections that depend on it are affected. Define explicit cascade rules:

| Failed Asset | Nulled Sections | Cascade |
|---|---|---|
| `map` | `zones` (when no explicit YAML zones) | setup may emit broken zone refs; cross-ref catches |
| `pieceCatalog` | `tokenTypes` (when no explicit YAML) | setup may reference unknown types; cross-ref catches |
| `eventCardSet` | `eventDecks` | No cascade (optional) |

**New diagnostic codes:**
- `CNL_DATA_ASSET_CASCADE_ZONES_MISSING` — map data asset failed and no explicit zones defined; zone-dependent sections may produce cross-ref errors
- `CNL_DATA_ASSET_CASCADE_TOKEN_TYPES_MISSING` — pieceCatalog data asset failed and no explicit tokenTypes defined; token-type-dependent sections may produce cross-ref errors

**Implementation rule**: When a data asset fails, set the derived section to `null` in `CompileSectionResults` and emit a cascade diagnostic at severity `warning`. The cascade diagnostic helps users understand why downstream cross-ref errors appear.

---

## Phase 3: Cross-Reference Validation

### 3A: Add a cross-reference validation pass

**What changes:**

A new function `crossValidateSpec` runs after individual section validation but before final assembly. It checks references between sections:

```typescript
function crossValidateSpec(sections: CompileSectionResults): readonly Diagnostic[]
```

**Cross-references to validate:**

| Source | References | Target | Diagnostic Code |
|--------|-----------|--------|-----------------|
| `actions[].phase` | phase ID | `turnStructure.phases[].id` | `CNL_XREF_ACTION_PHASE_MISSING` |
| `operationProfiles[].actionId` | action ID | `actions[].id` | `CNL_XREF_PROFILE_ACTION_MISSING` |
| `operationProfiles[].linkedSpecialActivityWindows[]` | window ID | `turnFlow.eligibility.overrideWindows[].id` | `CNL_XREF_PROFILE_WINDOW_MISSING` |
| `triggers[].event.phase` | phase ID | `turnStructure.phases[].id` | `CNL_XREF_TRIGGER_PHASE_MISSING` |
| `triggers[].event.action` | action ID | `actions[].id` | `CNL_XREF_TRIGGER_ACTION_MISSING` |
| `victory.checkpoints[].faction` | faction ID | `turnFlow.eligibility.factions[]` | `CNL_XREF_VICTORY_FACTION_MISSING` |
| `victory.margins[].faction` | faction ID | `turnFlow.eligibility.factions[]` | `CNL_XREF_MARGIN_FACTION_MISSING` |
| `setup[].createToken.zone` | zone ID | `zones[].id` | `CNL_XREF_SETUP_ZONE_MISSING` |
| `setup[].createToken.type` | token type ID | `tokenTypes[].id` | `CNL_XREF_SETUP_TOKEN_TYPE_MISSING` |
| `actions[].effects[]` (moveToken/draw refs) | zone IDs | `zones[].id` | `CNL_XREF_EFFECT_ZONE_MISSING` |
| `turnFlow.cardLifecycle.played/lookahead/leader` | zone ID | `zones[].id` | `CNL_XREF_LIFECYCLE_ZONE_MISSING` |
| `turnFlow.passRewards[].resource` | var name | `globalVars[].name` | `CNL_XREF_REWARD_VAR_MISSING` |

**Note**: `coupPlan.phases[].id` currently belongs to a coup-workflow domain, not the turn-structure phase domain. The coup cross-reference contract is specified separately as follow-up work (see ARCDECANDGEN-011).

**Files to touch:**

| File | Change |
|------|--------|
| `src/cnl/cross-validate.ts` | NEW — the `crossValidateSpec` function |
| `src/cnl/compiler-core.ts` | Call `crossValidateSpec(sections)` after all lowering, append results to diagnostics |
| `src/cnl/index.ts` | Export new function |

**Implementation rule**: Cross-validation only runs when both the source and target sections are non-null. If either is null, that section already has its own error diagnostics. Cross-ref diagnostics are severity `error`.

### Phase 3 Invariants

1. **Cross-ref diagnostics are emitted only when both referenced sections compiled successfully** — no cascading errors from already-broken sections
2. **Every cross-ref diagnostic has a `path` pointing to the source field** (e.g., `operationProfiles[3].actionId`)
3. **Every cross-ref diagnostic has a `suggestion` with the closest valid target** (using existing Levenshtein suggestion engine)
4. **Cross-ref validation is idempotent and deterministic** — same input always produces same diagnostics in same order
5. **Valid specs produce zero cross-ref diagnostics**
6. **The FITL production spec produces zero cross-ref diagnostics** (proving all its internal references are consistent)

### Phase 3 Tests

**File**: `test/unit/cross-validate.test.ts`

```
Test 1: "valid spec produces zero cross-ref diagnostics"
  - Compile compile-valid.md fixture
  - Assert crossValidateSpec(result.sections) === []

Test 2: "action referencing nonexistent phase emits CNL_XREF_ACTION_PHASE_MISSING"
  - Build sections with actions[0].phase = 'nonexistent' and turnStructure.phases = [{ id: 'main' }]
  - Assert diagnostic with code CNL_XREF_ACTION_PHASE_MISSING, path 'actions[0].phase'
  - Assert suggestion includes 'main'

Test 3: "profile referencing nonexistent action emits CNL_XREF_PROFILE_ACTION_MISSING"
  - Build sections with operationProfiles[0].actionId = 'nonexistent' and actions = [{ id: 'sweep' }]
  - Assert diagnostic with code CNL_XREF_PROFILE_ACTION_MISSING, path 'operationProfiles[0].actionId'
  - Assert suggestion includes 'sweep'

Test 4: "victory checkpoint referencing nonexistent faction emits CNL_XREF_VICTORY_FACTION_MISSING"
  - Build sections with victory.checkpoints[0].faction = 'unknown' and turnFlow.eligibility.factions = ['us', 'nva']
  - Assert diagnostic with code CNL_XREF_VICTORY_FACTION_MISSING
  - Assert suggestion includes closest faction

Test 5: "turnFlow.cardLifecycle.played referencing nonexistent zone emits CNL_XREF_LIFECYCLE_ZONE_MISSING"
  - Build sections with lifecycle.played = 'missing:none' and zones = [{ id: 'deck:none' }]
  - Assert diagnostic with code CNL_XREF_LIFECYCLE_ZONE_MISSING

Test 6: "cross-ref skips validation when target section is null"
  - Build sections with operationProfiles referencing 'sweep' but actions = null (broken section)
  - Assert zero cross-ref diagnostics (broken section already has its own errors)

Test 7: "FITL production spec produces zero cross-ref diagnostics"
  - compileProductionSpec()
  - Assert result.diagnostics contains no CNL_XREF_* codes

Test 8: "multiple cross-ref errors are sorted deterministically"
  - Build sections with 3 broken references
  - Run twice, assert identical diagnostic arrays

Test 9: "setup createToken referencing nonexistent zone emits CNL_XREF_SETUP_ZONE_MISSING"
  - Build sections with setup containing createToken to zone 'ghost:none', zones = [{ id: 'deck:none' }]
  - Assert diagnostic with code CNL_XREF_SETUP_ZONE_MISSING

Test 10: "passRewards referencing nonexistent globalVar emits CNL_XREF_REWARD_VAR_MISSING"
  - Build sections with passRewards[0].resource = 'gold' and globalVars = [{ name: 'silver' }]
  - Assert diagnostic with code CNL_XREF_REWARD_VAR_MISSING

Test 11: "setup createToken referencing nonexistent tokenType emits CNL_XREF_SETUP_TOKEN_TYPE_MISSING"
  - Build sections with setup containing createToken with type = 'phantom' and tokenTypes = [{ id: 'guerrilla' }]
  - Assert diagnostic with code CNL_XREF_SETUP_TOKEN_TYPE_MISSING
  - Assert suggestion includes 'guerrilla'

Test 12: "trigger event referencing nonexistent action emits CNL_XREF_TRIGGER_ACTION_MISSING"
  - Build sections with triggers[0].event.action = 'nonexistent' and actions = [{ id: 'sweep' }]
  - Assert diagnostic with code CNL_XREF_TRIGGER_ACTION_MISSING
  - Assert suggestion includes 'sweep'
```

---

## Phase 4: Unified Action Resolution Pipeline

### 4A: Replace `OperationProfileDef` with `ActionPipelineDef`

**What changes:**

`OperationProfileDef` is renamed and generalized to `ActionPipelineDef`. The concept becomes a first-class kernel abstraction: any game can attach structured resolution pipelines to actions without needing FITL-specific types.

```typescript
// NEW: replaces OperationProfileDef
interface ActionPipelineDef {
  readonly id: string;
  readonly actionId: ActionId;
  readonly applicability?: ConditionAST;
  readonly legality?: ConditionAST;
  readonly costValidation?: ConditionAST;
  readonly costEffects: readonly EffectAST[];
  readonly targeting: ActionTargetingDef;
  readonly stages: readonly ActionResolutionStageDef[];
  readonly atomicity: 'atomic' | 'partial';
  readonly linkedWindows?: readonly string[];
}

// NEW: replaces OperationTargetingDef
interface ActionTargetingDef {
  readonly select?: 'upToN' | 'allEligible' | 'exactN';
  readonly max?: number;
  readonly filter?: ConditionAST;
  readonly order?: string;
  readonly tieBreak?: string;
}

// NEW: replaces OperationResolutionStageDef
interface ActionResolutionStageDef {
  readonly stage?: string;
  readonly effects: readonly EffectAST[];
}
```

**Changes from `OperationProfileDef`:**

| Old | New | Rationale |
|-----|-----|-----------|
| `OperationProfileDef` | `ActionPipelineDef` | "Operation" is COIN-specific terminology; "pipeline" is generic |
| `operationProfiles` field on GameDef | `actionPipelines` field on GameDef | Same rationale |
| `legality.when?: ConditionAST` | `legality?: ConditionAST` | Flatten unnecessary nesting |
| `cost.validate?: ConditionAST` | `costValidation?: ConditionAST` | Flatten |
| `cost.spend?: readonly EffectAST[]` | `costEffects: readonly EffectAST[]` | Flatten, make required (empty array = no cost) |
| `partialExecution.mode: 'forbid' \| 'allow'` | `atomicity: 'atomic' \| 'partial'` | Clearer naming. `forbid` → `atomic`, `allow` → `partial` |
| `targeting: OperationTargetingDef` | `targeting: ActionTargetingDef` | Renamed |
| `resolution: readonly OperationResolutionStageDef[]` | `stages: readonly ActionResolutionStageDef[]` | Renamed |
| `linkedSpecialActivityWindows` | `linkedWindows` | Shorter, generic |

**Files to touch:**

| File | Change |
|------|--------|
| `src/kernel/types-operations.ts` | Rename types as above |
| `src/kernel/types-core.ts` | `GameDef.operationProfiles` → `GameDef.actionPipelines` |
| `src/kernel/apply-move.ts` | `resolveOperationProfile` → `resolveActionPipeline`, `toOperationExecutionProfile` → `toExecutionPipeline`, all field references updated |
| `src/kernel/legal-moves.ts` | Update profile resolution references |
| `src/kernel/legal-choices.ts` | Update profile references |
| `src/kernel/validate-gamedef.ts` → split files | Update validation for renamed fields |
| `src/kernel/schemas.ts` → split files | Update JSON Schema for renamed fields |
| `src/cnl/compiler.ts` → split files | `lowerOperationProfiles` → `lowerActionPipelines`, output field renamed |
| `src/cnl/validate-spec.ts` → split files | Validate `actionPipelines` GameSpecDoc section |
| `src/cnl/game-spec-doc.ts` | `operationProfiles` → `actionPipelines` in GameSpecDoc |
| `data/games/fire-in-the-lake.md` | Rename YAML section `operationProfiles` → `actionPipelines`, rename fields in each profile |
| All test files referencing `operationProfiles` | Update to `actionPipelines` |

**GameSpecDoc YAML change:**

Before:
```yaml
operationProfiles:
  - id: sweep-profile
    actionId: sweep
    legality:
      when: { op: '>=', ... }
    cost:
      validate: { op: '>=', ... }
      spend: [...]
    targeting: { ... }
    resolution: [{ effects: [...] }]
    partialExecution: { mode: forbid }
    linkedSpecialActivityWindows: [us-special-window]
```

After:
```yaml
actionPipelines:
  - id: sweep-pipeline
    actionId: sweep
    legality: { op: '>=', ... }
    costValidation: { op: '>=', ... }
    costEffects: [...]
    targeting: { ... }
    stages: [{ effects: [...] }]
    atomicity: atomic
    linkedWindows: [us-special-window]
```

### Phase 4 Invariants

1. **`GameDef.actionPipelines` is functionally identical to the old `operationProfiles`** — same semantics, renamed fields
2. **Simple games without pipelines are unaffected** — `actionPipelines` is optional, defaults to `[]`
3. **Pipeline resolution follows the same precedence rules**: single candidate → use it; multiple candidates → pick first where `applicability` is true
4. **`atomicity: 'atomic'` rejects moves when cost validation fails** (same as old `partialExecution.mode: 'forbid'`)
5. **All FITL tests pass** with the renamed types and updated YAML
6. **No `operationProfile` string appears anywhere in the codebase** after migration

### Phase 4 Tests

Existing FITL operation tests serve as verification after the rename. Additionally:

**File**: `test/unit/action-pipeline.test.ts`

```
Test 1: "action without pipeline executes inline effects"
  - GameDef with one action (draw card), no pipelines
  - applyMove executes action.effects directly
  - Assert state changed correctly

Test 2: "action with pipeline executes pipeline stages instead of inline effects"
  - GameDef with action + pipeline attached via actionId
  - Pipeline has 2 stages with distinct effects
  - Assert both stages executed, action.effects NOT executed

Test 3: "pipeline costValidation blocks move when cost unaffordable"
  - Pipeline with costValidation requiring resource >= 5
  - State has resource = 3
  - Assert applyMove throws with reason 'action is not legal in current state'

Test 4: "pipeline atomicity 'atomic' rejects partial execution"
  - Pipeline with atomicity: 'atomic' and cost requiring 5
  - State has resource = 3
  - Assert move rejected

Test 5: "pipeline atomicity 'partial' allows partial execution"
  - Pipeline with atomicity: 'partial' and multi-target resolution
  - Some targets fail cost validation
  - Assert partial execution proceeds for affordable targets

Test 6: "multiple pipelines with applicability select correct one"
  - Two pipelines for same actionId, each with different applicability condition
  - Assert correct pipeline selected based on state

Test 7: "pipeline targeting.tieBreak determines ordering"
  - Pipeline with targeting.tieBreak = 'lexicographic'
  - Assert targets processed in lexicographic order
```

---

## Phase 5: Generalized Turn Order Strategy

### 5A: Replace `turnFlow` with `turnOrder` discriminated union

**What changes:**

The monolithic `TurnFlowDef` (FITL-specific) becomes one variant of a generic `TurnOrderStrategy` union. `GameDef.turnFlow` is replaced by `GameDef.turnOrder`. `GameState.turnFlow` is replaced by `GameState.turnOrderState`.

```typescript
// NEW: discriminated union for turn order
type TurnOrderStrategy =
  | { readonly type: 'roundRobin' }
  | { readonly type: 'fixedOrder'; readonly order: readonly string[] }
  | { readonly type: 'cardDriven'; readonly config: CardDrivenTurnConfig }
  | { readonly type: 'simultaneous' };

// CardDrivenTurnConfig contains what was TurnFlowDef + CoupPlan
interface CardDrivenTurnConfig {
  readonly cardLifecycle: TurnFlowCardLifecycleDef;
  readonly eligibility: TurnFlowEligibilityDef;
  readonly optionMatrix: readonly TurnFlowOptionMatrixRowDef[];
  readonly passRewards: readonly TurnFlowPassRewardDef[];
  readonly durationWindows: readonly TurnFlowDuration[];
  readonly monsoon?: TurnFlowMonsoonDef;
  readonly pivotal?: TurnFlowPivotalDef;
  readonly coupPlan?: CoupPlanDef;
}

// NEW: runtime state is also a discriminated union
type TurnOrderRuntimeState =
  | { readonly type: 'roundRobin' }
  | { readonly type: 'fixedOrder'; readonly currentIndex: number }
  | { readonly type: 'cardDriven'; readonly flow: CardDrivenRuntimeState }
  | { readonly type: 'simultaneous'; readonly submitted: Readonly<Record<string, boolean>> };

// CardDrivenRuntimeState is the old TurnFlowRuntimeState
interface CardDrivenRuntimeState {
  readonly factionOrder: readonly string[];
  readonly eligibility: Readonly<Record<string, boolean>>;
  readonly currentCard: TurnFlowRuntimeCardState;
  readonly pendingEligibilityOverrides?: readonly TurnFlowPendingEligibilityOverride[];
  readonly consecutiveCoupRounds?: number;
  readonly compoundAction?: CompoundActionState;
}
```

**GameDef changes:**

```typescript
interface GameDef {
  // ... existing fields ...
  readonly turnOrder?: TurnOrderStrategy;  // replaces turnFlow
  // turnFlow REMOVED
}
```

**GameState changes:**

```typescript
interface GameState {
  // ... existing fields ...
  readonly turnOrderState?: TurnOrderRuntimeState;  // replaces turnFlow
  // turnFlow REMOVED
}
```

**Files to touch:**

| File | Change |
|------|--------|
| `src/kernel/types-turn-flow.ts` | Add `TurnOrderStrategy`, `TurnOrderRuntimeState`, `CardDrivenTurnConfig`, `CardDrivenRuntimeState`. Remove old `TurnFlowDef`, `TurnFlowRuntimeState`. |
| `src/kernel/types-core.ts` | `GameDef.turnFlow` → `GameDef.turnOrder`. `GameState.turnFlow` → `GameState.turnOrderState`. Remove `GameDef.coupPlan` (now in `turnOrder.config.coupPlan`). |
| `src/kernel/turn-flow-eligibility.ts` | Functions receive `CardDrivenTurnConfig` + `CardDrivenRuntimeState` instead of checking `def.turnFlow` / `state.turnFlow`. Guard dispatches on `turnOrder.type`. |
| `src/kernel/turn-flow-lifecycle.ts` | Same pattern — dispatch on `turnOrder.type === 'cardDriven'`. |
| `src/kernel/legal-moves.ts` | `isMoveAllowedByTurnFlowOptionMatrix` checks `state.turnOrderState?.type === 'cardDriven'` |
| `src/kernel/apply-move.ts` | `applyTurnFlowEligibilityAfterMove` dispatches on turn order type |
| `src/kernel/phase-advance.ts` | `advanceToDecisionPoint` dispatches on turn order type |
| `src/kernel/initial-state.ts` | Initialize `turnOrderState` based on `turnOrder.type` |
| `src/kernel/terminal.ts` | `resolveFactionPlayer` checks `turnOrderState.type === 'cardDriven'` |
| `src/kernel/zobrist.ts` | Hash `turnOrderState` discriminated union |
| `src/cnl/compiler.ts` → split files | `lowerTurnFlow` → `lowerTurnOrder`, outputs `TurnOrderStrategy`. `lowerCoupPlan` output folded into `turnOrder.config.coupPlan`. Add `resolveCoupPlanFromDef(def)` helper. |
| `src/cnl/validate-spec.ts` → split files | Validate `coupPlan` only inside `turnOrder.config` for `cardDriven` type. Reject `coupPlan` at GameSpecDoc root level. |
| `src/cnl/game-spec-doc.ts` | `turnFlow` → `turnOrder` in GameSpecDoc. Remove root `coupPlan` field. |
| `data/games/fire-in-the-lake.md` | Rename YAML section, wrap in `type: cardDriven` + `config:`. Move `coupPlan` inside `turnOrder.config`. |
| All test files | Update references |

**GameSpecDoc YAML change:**

Before:
```yaml
turnFlow:
  cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' }
  eligibility: { factions: ['us', 'arvn', 'nva', 'vc'], overrideWindows: [] }
  ...
```

After:
```yaml
turnOrder:
  type: cardDriven
  config:
    cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' }
    eligibility: { factions: ['us', 'arvn', 'nva', 'vc'], overrideWindows: [] }
    coupPlan:
      phases:
        - id: coup-resources
          effects: [...]
        - id: coup-victory
          effects: [...]
    ...
```

Simple game (no turn flow):
```yaml
turnOrder:
  type: roundRobin
```

Fixed order:
```yaml
turnOrder:
  type: fixedOrder
  order: ['player-1', 'player-2', 'player-3']
```

### 5B: `fixedOrder` Runtime Implementation

**What changes:**

The `fixedOrder` turn order strategy gets full runtime support in the kernel.

**`initialState` behavior:**
- Sets `turnOrderState = { type: 'fixedOrder', currentIndex: 0 }`
- Sets `activePlayer` from `order[0]`

**`nextActivePlayer` behavior:**
- Advances `currentIndex` modulo `order.length`
- Returns `order[currentIndex]`

**Compiler validation:**
- Non-empty `order` array required → `CNL_COMPILER_FIXED_ORDER_EMPTY` (severity: error)
- Duplicate entries produce → `CNL_COMPILER_FIXED_ORDER_DUPLICATE` (severity: warning)
- All entries must reference valid player IDs

**Files to touch:**

| File | Change |
|------|--------|
| `src/kernel/initial-state.ts` | Handle `fixedOrder` in `turnOrderState` initialization |
| `src/kernel/phase-advance.ts` | Handle `fixedOrder` in `advanceToDecisionPoint` — advance `currentIndex` |
| `src/cnl/compile-turn-flow.ts` | Validate `fixedOrder.order` non-empty, warn on duplicates |

### 5C: `simultaneous` Stub

**What changes:**

The `simultaneous` turn order strategy is defined at the type level only. No runtime implementation yet.

**Compiler behavior:**
- Emits `CNL_COMPILER_SIMULTANEOUS_NOT_IMPLEMENTED` (severity: warning) when `turnOrder.type === 'simultaneous'` is compiled
- `initialState` succeeds and produces `turnOrderState = { type: 'simultaneous', submitted: {} }`
- `legalMoves` and `applyMove` do NOT handle `simultaneous` — they fall through to the `never` exhaustiveness check, which means any attempt to play a simultaneous game will throw at runtime

**Files to touch:**

| File | Change |
|------|--------|
| `src/cnl/compile-turn-flow.ts` | Emit `CNL_COMPILER_SIMULTANEOUS_NOT_IMPLEMENTED` warning |
| `src/kernel/initial-state.ts` | Handle `simultaneous` in `turnOrderState` initialization |

### Phase 5 Invariants

1. **`roundRobin` behavior is identical to the current default** when no `turnFlow` is declared
2. **`cardDriven` behavior is identical to the current `TurnFlowDef`** — same eligibility, option matrix, monsoon, pivotal logic
3. **`GameState.turnOrderState` is always present** (even `roundRobin` games get `{ type: 'roundRobin' }`)
4. **Discriminated union dispatch is exhaustive** — TypeScript `switch` on `turnOrder.type` with `never` default
5. **All FITL tests pass** with the renamed types
6. **No `turnFlow` string appears in type definitions** after migration (may still appear in YAML key names within `cardDriven.config` sub-fields like `TurnFlowDuration` — that's fine, those are internal type names)
7. **Zobrist hashing produces identical hashes for same state** (the hash algorithm must be updated to handle the new runtime state shape but produce equivalent results)
8. **`coupPlan` is only valid inside `cardDriven` config** — compiler rejects `coupPlan` at root or inside non-cardDriven turn order types
9. **`fixedOrder` cycles correctly** — `currentIndex` wraps modulo `order.length`, never goes out of bounds
10. **`simultaneous` emits a compiler warning** — the type is accepted but runtime usage throws

### Phase 5 Tests

**File**: `test/unit/turn-order-strategy.test.ts`

```
Test 1: "roundRobin advances player in cyclic order"
  - GameDef with turnOrder: { type: 'roundRobin' }, 3 players
  - After each move, activePlayer cycles 0 → 1 → 2 → 0

Test 2: "fixedOrder follows declared order"
  - GameDef with turnOrder: { type: 'fixedOrder', order: ['2', '0', '1'] }
  - Assert activePlayer follows 2 → 0 → 1 → 2

Test 3: "cardDriven eligibility matches FITL turnFlow behavior"
  - Reuse an existing FITL test (e.g., from fitl-card-flow-determinism or initial-state)
  - Assert identical eligibility, faction order, option matrix behavior

Test 4: "simultaneous marks all players as needing submission"
  - GameDef with turnOrder: { type: 'simultaneous' }, 4 players
  - initialState sets turnOrderState.submitted = { '0': false, '1': false, '2': false, '3': false }

Test 5: "turnOrderState is always present in initialState"
  - GameDef with no turnOrder declared → defaults to roundRobin
  - Assert state.turnOrderState === { type: 'roundRobin' }

Test 6: "Zobrist hash is deterministic for cardDriven state"
  - Two identical FITL states produce identical hashes
  - Different eligibility states produce different hashes

Test 7: "coupPlan inside cardDriven config compiles successfully"
  - GameSpecDoc with turnOrder.type = 'cardDriven' and config.coupPlan defined
  - Assert compilation succeeds, gameDef.turnOrder.config.coupPlan is populated

Test 8: "coupPlan at GameSpecDoc root is rejected"
  - GameSpecDoc with root-level coupPlan (old format)
  - Assert compilation emits error diagnostic

Test 9: "fixedOrder initialState sets activePlayer to first in order"
  - GameDef with turnOrder: { type: 'fixedOrder', order: ['player-b', 'player-a'] }
  - Assert initialState.activePlayer === 'player-b'
  - Assert initialState.turnOrderState.currentIndex === 0

Test 10: "fixedOrder cycles through all players and wraps"
  - GameDef with turnOrder: { type: 'fixedOrder', order: ['a', 'b', 'c'] }
  - After 4 moves, assert activePlayer sequence: a → b → c → a

Test 11: "fixedOrder with empty order array emits CNL_COMPILER_FIXED_ORDER_EMPTY"
  - GameSpecDoc with turnOrder.type = 'fixedOrder', order = []
  - Assert error diagnostic CNL_COMPILER_FIXED_ORDER_EMPTY

Test 12: "simultaneous compilation emits CNL_COMPILER_SIMULTANEOUS_NOT_IMPLEMENTED warning"
  - GameSpecDoc with turnOrder.type = 'simultaneous'
  - Assert warning diagnostic CNL_COMPILER_SIMULTANEOUS_NOT_IMPLEMENTED
  - Assert compilation still succeeds (warning, not error)

Test 13: "simultaneous initialState succeeds"
  - GameDef with turnOrder: { type: 'simultaneous' }
  - Assert initialState produces turnOrderState = { type: 'simultaneous', submitted: {} }
```

---

## Phase 6: Unified Terminal Evaluation

### 6A: Merge `endConditions`, `victory`, and `scoring` into `TerminalEvaluationDef`

**What changes:**

Three separate GameDef fields merge into one:

```typescript
interface TerminalEvaluationDef {
  readonly conditions: readonly EndConditionDef[];
  readonly checkpoints?: readonly VictoryCheckpointDef[];
  readonly margins?: readonly VictoryMarginDef[];
  readonly ranking?: VictoryRankingDef;
  readonly scoring?: ScoringDef;
}

interface GameDef {
  // ... existing fields ...
  readonly terminal: TerminalEvaluationDef;  // replaces endConditions + victory + scoring
  // endConditions REMOVED
  // victory REMOVED
  // scoring REMOVED
}
```

**Evaluation priority in `terminal.ts`:**

1. **Checkpoints** (timed victory checks — e.g., FITL "duringCoup"): Evaluated first. If any checkpoint fires, return its result immediately.
2. **Conditions** (simple condition → result): Evaluated next. First matching condition wins.
3. **Scoring** (score-based ranking): Fallback when no condition/checkpoint matched but a scoring rule exists.

This matches the current behavior, just unified under one type.

**Files to touch:**

| File | Change |
|------|--------|
| `src/kernel/types-core.ts` | Add `TerminalEvaluationDef`. Remove `endConditions`, `victory`, `scoring` from `GameDef`. Add `terminal: TerminalEvaluationDef`. |
| `src/kernel/types-victory.ts` | Move `VictoryDef` contents into `TerminalEvaluationDef`. Remove `VictoryDef` wrapper. |
| `src/kernel/terminal.ts` | Unify `terminalResult` to read from `def.terminal.*`. Remove separate `evaluateVictory` + `evaluateEndConditions` + `scoreRanking` dispatch. |
| `src/kernel/validate-gamedef.ts` → split files | Validate `terminal` field instead of three separate fields |
| `src/kernel/schemas.ts` → split files | Update JSON Schema |
| `src/cnl/compiler.ts` → split files | `lowerEndConditions` + `lowerVictory` + `lowerScoring` → `lowerTerminal` assembling a single `TerminalEvaluationDef` |
| `src/cnl/game-spec-doc.ts` | Can keep separate YAML sections (`endConditions`, `victory`, `scoring`) that compile into the unified `terminal` field, OR merge YAML sections. Recommend: keep separate YAML sections for authoring ergonomics, compiler merges them. |
| `data/games/fire-in-the-lake.md` | No change if YAML sections stay separate |
| All test files with `def.endConditions` / `def.victory` / `def.scoring` | Update to `def.terminal.conditions` / `def.terminal.checkpoints` / `def.terminal.scoring` |

### Phase 6 Invariants

1. **`terminal.conditions` behaves identically to the old `endConditions`**
2. **`terminal.checkpoints` + `terminal.margins` + `terminal.ranking` behave identically to the old `victory`**
3. **`terminal.scoring` behaves identically to the old `scoring`**
4. **Evaluation priority is: checkpoints → conditions → scoring** — deterministic, documented
5. **GameSpecDoc can still use separate YAML sections** — the compiler assembles them into `terminal`
6. **All FITL tests pass** with the unified type

### Phase 6 Tests

**File**: `test/unit/terminal-evaluation.test.ts`

```
Test 1: "condition-only terminal: first matching condition wins"
  - GameDef with terminal: { conditions: [cond1, cond2] }
  - State matches cond1
  - Assert terminalResult returns cond1's result

Test 2: "checkpoint-only terminal: checkpoint fires before conditions"
  - GameDef with terminal: { conditions: [...], checkpoints: [cp1] }
  - State matches both cp1 and conditions[0]
  - Assert terminalResult returns cp1's result (checkpoints have priority)

Test 3: "scoring fallback when no condition matches"
  - GameDef with terminal: { conditions: [], scoring: { method: 'highest', value: ... } }
  - Assert terminalResult returns score-based ranking

Test 4: "empty terminal returns null (game continues)"
  - GameDef with terminal: { conditions: [] }
  - Assert terminalResult returns null

Test 5: "FITL coup victory through unified terminal"
  - Reuse fitl-coup-victory.test.ts scenario
  - Assert identical results through terminal.checkpoints

Test 6: "margins and ranking produce same final-coup result as old victory field"
  - Reuse fitl-coup-victory final-coup test
  - Assert identical ranking output
```

---

## Phase 7: GameSpecDoc YAML Section Mapping

### 7A: Define canonical YAML-to-GameDef section mapping

After phases 4-6, the YAML authoring sections and their compiled targets are:

| YAML Section | Compiled To | Required? |
|-------------|-------------|-----------|
| `metadata` | `GameDef.metadata` | Yes |
| `constants` | `GameDef.constants` | No |
| `globalVars` | `GameDef.globalVars` | No |
| `perPlayerVars` | `GameDef.perPlayerVars` | No |
| `zones` | `GameDef.zones` | Yes |
| `tokenTypes` | `GameDef.tokenTypes` | No |
| `setup` | `GameDef.setup` | No |
| `turnStructure` | `GameDef.turnStructure` | Yes |
| `turnOrder` | `GameDef.turnOrder` | No (defaults to `roundRobin`) |
| `turnOrder.config.coupPlan` | `GameDef.turnOrder.config.coupPlan` | No (`cardDriven` only) |
| `actions` | `GameDef.actions` | Yes |
| `actionPipelines` | `GameDef.actionPipelines` | No |
| `triggers` | `GameDef.triggers` | No |
| `endConditions` | `GameDef.terminal.conditions` | Yes (may be empty `[]`) |
| `victory` | `GameDef.terminal.checkpoints` + `terminal.margins` + `terminal.ranking` | No |
| `scoring` | `GameDef.terminal.scoring` | No |
| `eventDecks` | `GameDef.eventDecks` | No (preferred) |
| `eventCards` (via dataAssets) | `GameDef.eventDecks` | No (deprecated — backward compat) |
| `effectMacros` | consumed during compilation, not in GameDef | No |
| `dataAssets` | consumed during compilation (derives zones, tokenTypes, eventDecks) | No |
| `stackingConstraints` | `GameDef.stackingConstraints` | No |
| `markerLattices` | `GameDef.markerLattices` | No |

**Note**: `coupPlan` is folded into `turnOrder.config` for `cardDriven` games. It is not a separate GameDef field. Event cards have two paths: the new `eventDecks` YAML section (preferred, uses proper ASTs) and the legacy `eventCardSet` data asset path (deprecated, uses `Record<string, unknown>`). Both compile to `GameDef.eventDecks`.

### 7B: Compilation Order

The compiler processes YAML sections in a defined order. Each section may depend on previously compiled sections for cross-referencing or lowering:

```
 1. metadata
 2. constants
 3. dataAssets            (derives zones, tokenTypes, eventDecks)
 4. zones                 (may come from dataAssets)
 5. tokenTypes            (may come from dataAssets)
 6. globalVars
 7. perPlayerVars
 8. effectMacros          (consumed during lowering, not in GameDef)
 9. turnStructure
10. turnOrder             (refs turnStructure phases)
11. actions               (refs turnStructure phases)
12. actionPipelines       (refs actions)
13. triggers              (refs actions, turnStructure phases)
14. setup                 (refs zones, tokenTypes)
15. endConditions         (refs globalVars, perPlayerVars)
16. victory               (refs turnOrder factions)
17. scoring
18. eventDecks            (refs zones, actions, globalVars)
19. stackingConstraints   (refs tokenTypes, zones)
20. markerLattices        (refs zones)
```

**Dependencies**: Steps 4-5 depend on step 3 (data assets may derive zones/tokenTypes). Steps 10-20 depend on steps 4-9 (core definitions must exist before referencing them). Cross-validation (Phase 3) runs after all 20 steps complete.

### Phase 7 Invariants

1. **Every GameSpecDoc YAML section maps to exactly one GameDef field** (or is consumed during compilation)
2. **Required sections produce compile errors when missing**
3. **Optional sections that are absent produce no diagnostics**
4. **The section mapping table is exhaustive** — no GameDef field lacks a YAML source
5. **Compilation order respects all forward dependencies** — no section is lowered before its dependencies

### Phase 7 Tests

No new tests — this is documentation and verification of the mapping established by Phases 4-6.

---

## Phase 8: Generic Event Deck Subsystem

### 8A: Type Definitions

**What changes:**

Replace all `Record<string, unknown>` in event card types with proper ASTs. The existing `EventCardDef`/`EventCardSideDef` types use opaque records for effects, targets, and lasting effects — these become first-class kernel types.

```typescript
interface EventDeckDef {
  readonly id: string;
  readonly cards: readonly EventCardDef[];
  readonly drawZone: string;      // zone ID
  readonly discardZone: string;   // zone ID
  readonly shuffleOnSetup?: boolean;
}

interface EventSideDef {
  readonly applicability?: ConditionAST;
  readonly effects: readonly EffectAST[];       // was Record<string, unknown>[]
  readonly branches?: readonly EventBranchDef[];
  readonly targets?: readonly EventTargetDef[];
  readonly lastingEffects?: readonly EventLastingEffectDef[];
}

interface EventTargetDef {
  readonly id: string;
  readonly selector: OptionsQuery;              // was Record<string, unknown>
  readonly filter?: ConditionAST;
  readonly cardinality: EventTargetCardinality;
}

interface EventLastingEffectDef {
  readonly id: string;
  readonly duration: string;                    // generalized (e.g., 'untilCoupRound', 'untilNextCard', custom)
  readonly setupEffects: readonly EffectAST[];  // was Record<string, unknown>
  readonly teardownEffects?: readonly EffectAST[];
}
```

**Files to touch:**

| File | Change |
|------|--------|
| `src/kernel/types-events.ts` | NEW (from Phase 1A) — define `EventDeckDef`, `EventCardDef`, `EventSideDef`, `EventBranchDef`, `EventTargetDef`, `EventLastingEffectDef`, `EventTargetCardinality`, `ActiveLastingEffect` |
| `src/kernel/types-core.ts` | Add `GameDef.eventDecks?: readonly EventDeckDef[]`. Add `GameState.activeLastingEffects?: readonly ActiveLastingEffect[]`. Remove old `GameDef.eventCards`. |

### 8B: Kernel Execution

**What changes:**

A new kernel module handles event card execution:

1. **Draw**: Draw top card from deck zone
2. **Side selection**: Choose which side to execute (based on game-specific rules or player choice)
3. **Applicability**: Check `side.applicability` condition — skip if false
4. **Branch resolution**: Evaluate branches if present (conditional sub-paths)
5. **Target resolution**: Resolve targets using `selector` + `filter`, respecting `cardinality`
6. **Effect application**: Apply `side.effects` through existing `applyEffect` pipeline
7. **Lasting effect registration**: Add to `GameState.activeLastingEffects` with duration tracking
8. **Discard**: Move card token to discard zone

**Files to touch:**

| File | Change |
|------|--------|
| `src/kernel/event-execution.ts` | NEW — `executeEventCard`, `resolveEventSide`, `applyLastingEffect`, `expireLastingEffects` |
| `src/kernel/initial-state.ts` | Initialize `activeLastingEffects: []` |
| `src/kernel/zobrist.ts` | Hash `activeLastingEffects` |

### 8C: Compiler Support

**What changes:**

- New `eventDecks` GameSpecDoc YAML section for defining event decks with proper ASTs
- Existing `eventCardSet` data asset path remains backward-compatible with deprecation warning
- Compiler lowers `Record<string, unknown>` effects from legacy path to `EffectAST[]` via existing lowering pipeline
- New `lowerEventDecks` function in `compile-event-cards.ts`

**Files to touch:**

| File | Change |
|------|--------|
| `src/cnl/compile-event-cards.ts` | Add `lowerEventDecks` for new YAML path. Update `lowerEventCards` to emit deprecation warning and convert to `EventDeckDef`. |
| `src/cnl/game-spec-doc.ts` | Add `eventDecks` section to GameSpecDoc |
| `src/cnl/validate-spec.ts` → split files | Validate `eventDecks` section structure |
| `src/cnl/cross-validate.ts` | Add cross-refs for eventDecks (zone IDs, action refs) |

### 8D: `cardDriven` Interaction

**What changes:**

For `cardDriven` games, lasting effect `duration` values map to `TurnFlowDuration` values (e.g., `'untilCoupRound'`, `'untilNextCard'`). Expiry is handled in `turn-flow-lifecycle.ts` at the appropriate lifecycle points.

**Files to touch:**

| File | Change |
|------|--------|
| `src/kernel/turn-flow-lifecycle.ts` | Call `expireLastingEffects` at card-advance and coup-round boundaries |

### Phase 8 Invariants

1. **`EventDeckDef` replaces all `Record<string, unknown>` in event types** — full compile-time type safety
2. **Legacy `eventCardSet` data asset path still works** with deprecation warning
3. **`activeLastingEffects` is always an array** (empty for games without events)
4. **Lasting effect teardown runs before removal** — no silent expiry
5. **Event deck cross-refs validated** by Phase 3 cross-validation (drawZone, discardZone, effect zone refs)
6. **Kernel execution follows the 8-step pipeline** deterministically
7. **Both YAML paths (`eventDecks` and `eventCardSet` data asset) compile to the same `GameDef.eventDecks` field**

### Phase 8 Tests

**File**: `test/unit/event-deck.test.ts`

```
Test 1: "eventDecks YAML section compiles to EventDeckDef[]"
  - GameSpecDoc with eventDecks section containing one deck with 2 cards
  - Assert gameDef.eventDecks has correct structure with EffectAST[]

Test 2: "event side applicability filters execution"
  - Event side with applicability condition that is false
  - Assert side effects are NOT applied

Test 3: "event branches select correct path"
  - Event with 2 branches, one matching current state
  - Assert only matching branch effects applied

Test 4: "event targets resolve with filter and cardinality"
  - Event target with selector matching 5 tokens, cardinality 'upTo' max 3
  - Assert at most 3 targets selected

Test 5: "event target cardinality 'all' selects everything matching"
  - Event target with cardinality 'all'
  - Assert all matching tokens selected

Test 6: "lasting effect registered in GameState.activeLastingEffects"
  - Event with lasting effect, duration = 'untilCoupRound'
  - After execution, assert activeLastingEffects contains the effect

Test 7: "lasting effect teardown runs on expiry"
  - Register lasting effect with teardownEffects
  - Trigger expiry
  - Assert teardown effects applied before removal

Test 8: "eventDecks cross-ref validates drawZone exists"
  - EventDeckDef with drawZone = 'nonexistent'
  - Assert cross-ref diagnostic emitted

Test 9: "legacy eventCardSet data asset compiles with deprecation warning"
  - GameSpecDoc using dataAssets.eventCardSet (old path)
  - Assert compilation succeeds
  - Assert deprecation warning diagnostic emitted
  - Assert gameDef.eventDecks is populated

Test 10: "both eventDecks and eventCardSet data asset produce same GameDef structure"
  - Compile same event cards via both paths
  - Assert gameDef.eventDecks deep-equals between both approaches
```

**File**: `test/integration/event-deck-integration.test.ts`

```
Test 11: "FITL event cards compile via eventDecks with proper ASTs"
  - compileProductionSpec() with eventDecks section
  - Assert all event sides have EffectAST[] (not Record<string, unknown>)
  - Assert all targets have OptionsQuery selectors

Test 12: "FITL event deck cross-refs pass validation"
  - compileProductionSpec()
  - Assert zero CNL_XREF_* diagnostics related to event decks
```

---

## Implementation Order

```
Phase 1 (file splits) ─────────────────────────────────┐
  1A: types.ts                                          │
  1B: compiler.ts                                       │
  1C: validate-spec.ts                                  │
  1D: effects.ts                                        │
  1E: validate-gamedef.ts                               │
  1F: schemas.ts                                        │
  1G: legal-moves.ts + apply-move.ts                    │
                                                        ▼
Phase 2 (structured results + cascade) ────────────────┐
  2A: CompileSectionResults                             │
  2B: Data asset failure cascade semantics              │
                                                        ▼
Phase 3 (cross-ref validation) ────────────────────────┐
  3A: crossValidateSpec                                 │
                                                        ▼
Phase 4 (action pipelines) ────────────────────────────┐
  4A: OperationProfileDef → ActionPipelineDef           │
                                                        ▼
Phase 5 (turn order strategy) ─────────────────────────┐
  5A: turnFlow → turnOrder discriminated union          │
  5B: fixedOrder runtime implementation                 │
  5C: simultaneous stub                                 │
  (5B, 5C depend on 5A)                                 │
                                                        ▼
Phase 6 (unified terminal) ────────────────────────────┐
  6A: endConditions + victory + scoring → terminal      │
                                                        ▼
Phase 7 (section mapping doc) ─────────────────────────┐
  7A: Canonical YAML-to-GameDef mapping                 │
  7B: Compilation order documentation                   │
                                                        ▼
Phase 8 (generic event deck subsystem)
  8A: Type definitions (depends on 1A types-events.ts)
  8B: Kernel execution (depends on 8A)
  8C: Compiler support (depends on 8A, 2A, 3A)
  8D: cardDriven interaction (depends on 5A, 8B)
```

Each phase can be implemented and merged independently. Phase 1 is a prerequisite for all others (makes the files manageable). Phases 2-3 are additive (no breaking changes). Phases 4-6 are breaking renames that affect tests and YAML. Phase 8 depends on Phases 1A (types-events.ts), 2A (CompileSectionResults), 3A (cross-validation), and 5A (turnOrder for cardDriven interaction).

## Out of Scope

- Adding new `TurnOrderStrategy` variants beyond `roundRobin`, `fixedOrder`, `cardDriven`, `simultaneous` — future specs
- Mechanic Bundle IR (Spec 13) — separate concern
- Evolution pipeline (Spec 14) — separate concern
- `simultaneous` turn order runtime implementation — type is defined but runtime is deferred (compiler emits warning)
- Full FITL event YAML migration to `eventDecks` format — this spec defines the types and compiler; migrating all FITL event data is a separate ticket
- Non-`cardDriven` lasting effect duration expiry — only `cardDriven` duration windows are handled; other turn order types need future work
- Event deck reshuffling mechanics — `shuffleOnSetup` is supported; mid-game reshuffle is deferred

## Risk Registry

| Risk | Impact | Mitigation |
|------|--------|------------|
| Phase 1 introduces import cycle | Build breaks | Use `madge --circular` after each split |
| Phase 1G `resolveOperationProfile` duplicate resolution causes behavioral divergence | Subtle bugs | Extract to single source of truth, add integration test comparing both call sites |
| Phase 4-6 renames break FITL tickets in progress | Merge conflicts | Coordinate with active ticket branches; merge this first |
| Production spec YAML renames cause parser confusion | Compile failure | Update parser section-identifier for new section names |
| Zobrist hash changes in Phase 5 break golden fixtures | Test failures | Regenerate golden fixtures after hash algorithm update |
| `simultaneous` turn order has no runtime yet | Dead code | Clearly document as stub; compiler emits warning if used |
| CoupPlan test migration (root → config) misses edge cases | Test failures | Grep for all `coupPlan` references, create migration checklist |
| `fixedOrder` edge cases (single-player, duplicate entries) | Runtime errors | Add boundary tests for order.length === 1 and duplicates |
| Phase 8 surface area is large (types + kernel + compiler) | Scope creep | Phase 8 can be split into sub-tickets (8A alone is a clean milestone) |
| Lasting effects add complexity to GameState | State bloat, hash instability | Cap `activeLastingEffects` array size, add Zobrist tests |
| `eventCardSet` backward compatibility may mask migration issues | Silent data loss | Emit deprecation warning with migration instructions |
| Compilation order (7B) may reveal latent dependency bugs | Compile failures | Add integration test that compiles sections out of order to verify independence claims |
