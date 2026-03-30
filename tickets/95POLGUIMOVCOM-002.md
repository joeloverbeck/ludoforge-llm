# 95POLGUIMOVCOM-002: Type definitions for completion guidance and completion score terms

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types-core, cnl game-spec-doc
**Deps**: None

## Problem

The type system has no representation for `completionScoreTerms` (library-level scoring terms for inner decisions), `completionGuidance` (profile-level opt-in config), or the new reference domains (`decisionIntrinsic`, `optionIntrinsic`) needed to score options during move completion. These types must exist before validation, compilation, or evaluation can be built.

## Assumption Reassessment (2026-03-30)

1. `CompiledAgentProfile.use` currently has `pruningRules`, `scoreTerms`, `tieBreakers` — no `completionScoreTerms`. Confirmed in `types-core.ts`.
2. `CompiledAgentLibraryIndex` has `stateFeatures`, `candidateFeatures`, `candidateAggregates`, `pruningRules`, `scoreTerms`, `tieBreakers` — no `completionScoreTerms`. Confirmed.
3. `CompiledAgentPolicyRef` discriminated union has kinds: `seatIntrinsic`, `turnIntrinsic`, `candidateIntrinsic`, `candidateParam`, `globalVar`, `perPlayerVar`, `derivedMetric`, `victoryCurrentMargin`, `victoryCurrentRank`, `previewGlobalVar`, `previewPerPlayerVar`, `previewDerivedMetric`, `previewVictoryMargin`, `previewVictoryRank`. No `decisionIntrinsic` or `optionIntrinsic`. Confirmed.
4. `GameSpecAgentLibrary` has no `completionScoreTerms` field. Confirmed in `game-spec-doc.ts`.
5. `GameSpecAgentProfileDef.use` is typed as `GameSpecAgentProfileUse` — confirmed it has `pruningRules`, `scoreTerms`, `tieBreakers` arrays only.

## Architecture Check

1. Cleanest approach: `completionScoreTerms` reuse the existing `CompiledAgentScoreTerm` shape (same `when`, `weight`, `value`, `unknownAs`, `clamp`, `dependencies`). No new term type needed — just a new library slot and profile reference.
2. Engine agnosticism: `decisionIntrinsic` and `optionIntrinsic` are generic choice-metadata refs. They describe the kernel's `ChoicePendingRequest` shape — no game-specific content.
3. No backwards-compatibility shims: all new fields are optional additions to existing interfaces.

## What to Change

### 1. `types-core.ts` — extend compiled types

- Add `decisionIntrinsic` and `optionIntrinsic` to `CompiledAgentPolicyRef` discriminated union:
  ```typescript
  | { kind: 'decisionIntrinsic'; intrinsic: 'type' | 'name' | 'targetKind' | 'optionCount' }
  | { kind: 'optionIntrinsic'; intrinsic: 'value' }
  ```
- Add `readonly completionScoreTerms?: Record<string, CompiledAgentScoreTerm>` to `CompiledAgentLibraryIndex`
- Add `readonly completionScoreTerms?: readonly string[]` to `CompiledAgentProfile.use`
- Add `CompletionGuidanceConfig` interface:
  ```typescript
  interface CompletionGuidanceConfig {
    readonly enabled: boolean;
    readonly fallback: 'random' | 'first';
  }
  ```
- Add `readonly completionGuidance?: CompletionGuidanceConfig` to `CompiledAgentProfile`

### 2. `game-spec-doc.ts` — extend spec-level types

- Add `readonly completionScoreTerms?: Record<string, GameSpecScoreTermDef>` to `GameSpecAgentLibrary`
- Add `readonly completionScoreTerms?: readonly string[]` to `GameSpecAgentProfileUse`
- Add `readonly completionGuidance?: { readonly enabled?: boolean; readonly fallback?: string }` to `GameSpecAgentProfileDef`

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify)

## Out of Scope

- Validation logic (ticket 003)
- Compilation logic (ticket 006)
- Runtime evaluation of new ref kinds (ticket 005)
- `zoneTokenAgg` dynamic zone extension (ticket 004)
- PolicyAgent or evaluator changes

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` — new types compile without errors
2. `pnpm turbo test` — all existing tests pass (no runtime changes)
3. New type-level test: verify `CompiledAgentPolicyRef` discriminated union accepts `decisionIntrinsic` and `optionIntrinsic` kinds
4. New type-level test: verify `CompiledAgentProfile` accepts `completionGuidance` and `use.completionScoreTerms`

### Invariants

1. All new fields are optional — existing code that constructs these types without the new fields continues to compile.
2. `CompiledAgentScoreTerm` shape is reused as-is for `completionScoreTerms` entries — no parallel type.
3. Foundation #4 (Schema Ownership): no per-game schema files created. All types are generic.
4. Foundation #12 (Branded Types): no new branded types needed — ref kinds use string literals in the discriminated union.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/types-completion-guidance.test.ts` — type-level assertions that new interfaces satisfy expected shapes

### Commands

1. `pnpm turbo typecheck` (primary — this is a types-only ticket)
2. `pnpm turbo test` (regression)
