# 95POLGUIMOVCOM-002: Type definitions for completion guidance and completion score terms

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types-core, cnl game-spec-doc
**Deps**: None

## Problem

The agent policy model still lacks a coherent representation for completion-guidance authoring and compiled catalog data:

- `completionScoreTerms` (library-level scoring terms for inner decisions)
- `completionGuidance` (profile-level opt-in config)
- the new reference domains (`decisionIntrinsic`, `optionIntrinsic`) needed to score decision options during move completion

This ticket is the foundation slice for those concepts. It must land as a coherent policy-surface change across authored types, compiled types, compiled catalog schemas, and agent lowering so later validation/evaluation tickets build on one source of truth instead of partial parallel shapes.

## Assumption Reassessment (2026-03-30)

1. `CompiledAgentProfile.use` currently has `pruningRules`, `scoreTerms`, `tieBreakers` — no `completionScoreTerms`. Confirmed in `types-core.ts`.
2. `CompiledAgentLibraryIndex` has `stateFeatures`, `candidateFeatures`, `candidateAggregates`, `pruningRules`, `scoreTerms`, `tieBreakers` — no `completionScoreTerms`. Confirmed.
3. `CompiledAgentPolicyRef` discriminated union has kinds: `seatIntrinsic`, `turnIntrinsic`, `candidateIntrinsic`, `candidateParam`, `globalVar`, `perPlayerVar`, `derivedMetric`, `victoryCurrentMargin`, `victoryCurrentRank`, `previewGlobalVar`, `previewPerPlayerVar`, `previewDerivedMetric`, `previewVictoryMargin`, `previewVictoryRank`. No `decisionIntrinsic` or `optionIntrinsic`. Confirmed.
4. `GameSpecAgentLibrary` has no `completionScoreTerms` field. Confirmed in `game-spec-doc.ts`.
5. `GameSpecAgentProfileDef.use` is typed as `GameSpecAgentProfileUse` — confirmed it has `pruningRules`, `scoreTerms`, `tieBreakers` arrays only.
6. The policy completion callback plumbing is already present in the kernel/agent pipeline:
   - `completeMoveDecisionSequence` already accepts `choose`
   - `completeTemplateMove` already accepts and uses `options.choose`
   - `evaluatePlayableMoveCandidate` and `preparePlayableMoves` already thread `choose`
   This ticket must not re-scope that existing plumbing as new work.
7. `schemas-core.ts` currently validates compiled agent catalogs and must stay in lockstep with `types-core.ts`. This ticket cannot stop at interface-only edits without updating compiled catalog schemas.
8. There is already pre-existing schema/type drift for `candidateIntrinsic.paramCount`: `types-core.ts` includes it, `schemas-core.ts` does not. This ticket should leave the policy surface more internally consistent than it found it.

## Architecture Check

1. Cleanest approach: `completionScoreTerms` reuse the existing `CompiledAgentScoreTerm` / `GameSpecScoreTermDef` shape. No parallel term type should be introduced.
2. Engine agnosticism: `decisionIntrinsic` and `optionIntrinsic` describe generic choice metadata from `ChoicePendingRequest`; they are not game-specific.
3. Architectural completeness for this slice requires synchronized updates across:
   - authored policy doc types
   - compiled policy types
   - compiled catalog zod schemas
   - agent lowering for library/profile fields
4. No backwards-compatibility shims: add the real fields and update all consumers in one pass. No aliases.

## Scope Correction

This ticket is narrower than the full move-completion feature in Spec 95.

- In scope here: policy data model surface for authoring and compiled catalogs.
- Out of scope here: runtime scoring/evaluation of `decisionIntrinsic` / `optionIntrinsic`, dynamic `zoneTokenAgg.zone`, or building the PolicyAgent completion chooser.

This means the ticket should create the durable catalog shape that later tickets consume, but it should not claim that guided completion behavior is implemented by this ticket alone.

## What to Change

### 1. `types-core.ts` — extend compiled policy types

- Add `decisionIntrinsic` and `optionIntrinsic` to `CompiledAgentPolicyRef` discriminated union:
  ```typescript
  | { kind: 'decisionIntrinsic'; intrinsic: 'type' | 'name' | 'targetKind' | 'optionCount' }
  | { kind: 'optionIntrinsic'; intrinsic: 'value' }
  ```
- Add `readonly completionScoreTerms: Readonly<Record<string, CompiledAgentScoreTerm>>` to `CompiledAgentLibraryIndex`
- Add `readonly completionScoreTerms: readonly string[]` to `CompiledAgentProfile.use`
- Add `CompletionGuidanceConfig` interface:
  ```typescript
  interface CompletionGuidanceConfig {
    readonly enabled: boolean;
    readonly fallback: 'random' | 'first';
  }
  ```
- Add `readonly completionGuidance?: CompletionGuidanceConfig` to `CompiledAgentProfile`
- Keep compiled catalog shapes internally consistent with existing non-optional library/use buckets. Empty buckets/lists are preferred over optional compiled fields.

### 2. `game-spec-doc.ts` — extend spec-level types

- Add `readonly completionScoreTerms?: Record<string, GameSpecScoreTermDef>` to `GameSpecAgentLibrary`
- Add `readonly completionScoreTerms?: readonly string[]` to `GameSpecAgentProfileUse`
- Add `readonly completionGuidance?: { readonly enabled?: boolean; readonly fallback?: 'random' | 'first' }` to `GameSpecAgentProfileDef`

### 3. `schemas-core.ts` — extend compiled catalog schemas

- Add the new `decisionIntrinsic` / `optionIntrinsic` ref variants to `CompiledAgentPolicyRefSchema`
- Add `completionScoreTerms` to `CompiledAgentLibraryIndexSchema`
- Add `completionScoreTerms` and `completionGuidance` to `CompiledAgentProfileSchema`
- While touching this schema, eliminate the existing `candidateIntrinsic.paramCount` drift so schema and type remain aligned

### 4. `compile-agents.ts` — lower the new authored fields into the compiled catalog

- Lower `library.completionScoreTerms` with the same compilation path as regular `scoreTerms`
- Lower `profile.use.completionScoreTerms` with the same ID validation semantics as existing `use` buckets
- Lower `profile.completionGuidance` into the compiled profile with explicit normalization/default handling:
  - omit the object when absent
  - when present, normalize `enabled` to a boolean
  - validate `fallback` against `'random' | 'first'`
- Keep `buildProfilePlan` scoped to top-level move-evaluation dependencies only; `completionScoreTerms` should not be forced into the outer move plan in this ticket

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)

## Out of Scope

- Validation logic (ticket 003)
- Compilation logic (ticket 006)
- Runtime evaluation of new ref kinds (ticket 005)
- `zoneTokenAgg` dynamic zone extension (ticket 004)
- PolicyAgent chooser construction or evaluator changes
- Any additional kernel move-completion plumbing (already present)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` — new types compile without errors
2. `pnpm turbo test` — all existing tests pass (no runtime changes)
3. New/updated unit coverage proves authored agent configs containing `completionScoreTerms` and `completionGuidance` compile into the expected catalog shape
4. New/updated unit coverage proves compiled catalog schemas accept the new fields and ref kinds
5. New/updated unit coverage proves invalid `completionGuidance.fallback` values are rejected during lowering

### Invariants

1. Authored fields remain optional, but compiled catalog/library/profile bucket shapes remain explicit and total once lowered.
2. `CompiledAgentScoreTerm` / `GameSpecScoreTermDef` shapes are reused as-is for `completionScoreTerms` entries — no parallel term type.
3. Foundation #4 (Schema Ownership): no per-game schema files created. All types are generic.
4. Foundation #12 (Branded Types): no new branded types needed — ref kinds use string literals in the discriminated union.
5. `types-core.ts` and `schemas-core.ts` stay synchronized for the policy catalog surface changed by this ticket.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` — extend authoring/lowering coverage for `completionScoreTerms` and `completionGuidance`
2. `packages/engine/test/unit/agents/policy-expr.test.ts` and/or adjacent policy catalog tests — cover new ref variants where applicable to the compiler-facing expression pipeline
3. Add schema-focused unit coverage in the existing kernel schema test area if needed to prove compiled catalog acceptance

### Commands

1. Relevant focused engine unit tests for policy authoring/catalog/schema coverage
2. `pnpm turbo typecheck`
3. `pnpm turbo test`

## Outcome

- Completed: 2026-03-30
- What actually changed:
  - Added authored and compiled `completionScoreTerms` support across `game-spec-doc.ts`, `types-core.ts`, `schemas-core.ts`, and `compile-agents.ts`.
  - Added authored and compiled `completionGuidance` support, including lowering and validation for `enabled` / `fallback`.
  - Added `decisionIntrinsic` and `optionIntrinsic` policy ref variants to the compiled catalog surface and compiler resolution path.
  - Synchronized the compiled policy schema with the type surface, including fixing the pre-existing `candidateIntrinsic.paramCount` schema drift.
  - Updated validator coverage and golden fixtures so the new catalog surface is exercised end-to-end.
- Deviations from original plan:
  - `validate-agents.ts` also needed changes so authoring validation would accept the new fields; this was not explicit in the original file list but was required for a coherent authored-to-compiled pipeline.
  - Runtime completion evaluation and PolicyAgent chooser behavior were intentionally left out of scope, matching the corrected ticket scope.
- Verification results:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
