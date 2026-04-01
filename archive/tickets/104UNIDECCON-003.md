# 104UNIDECCON-003: Replace `scoreTerms`/`completionScoreTerms` with `considerations` in library and profile types

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `types-core.ts`, `schemas-core.ts`
**Deps**: `archive/tickets/104UNIDECCON-001.md`, `specs/104-unified-decision-context-considerations.md`

## Problem

The compiled IR has separate `scoreTerms` and `completionScoreTerms` fields in both `CompiledAgentLibraryIndex` and `CompiledAgentProfile.use`. These must be replaced with a single `considerations` field. The `completionGuidance` config on profiles must be removed (derived from completion-scoped considerations). The `plan` section must be updated.

## Assumption Reassessment (2026-04-01)

1. `CompiledAgentLibraryIndex` at `types-core.ts:682` — confirmed. Has `scoreTerms` and `completionScoreTerms` as separate `Record<string, CompiledAgentScoreTerm>`.
2. `CompiledAgentProfile.use` at `types-core.ts:708-709` — confirmed. Has `scoreTerms` and `completionScoreTerms` as separate `readonly string[]`.
3. `CompiledAgentProfile.completionGuidance` at `types-core.ts:711` — confirmed. Must be removed.
4. `CompiledAgentProfile.plan` at `types-core.ts:713` — confirmed. Has `stateFeatures`, `candidateFeatures`, `candidateAggregates`. Needs `considerations`.
5. `CompileSectionResults` exhaustiveness test at `compiler-structured-results.test.ts:1646` — may need updating if the library shape change propagates to section results.

## Architecture Check

1. Single `considerations` field replaces two separate fields — Foundation 15 (architectural completeness).
2. `completionGuidance` removal — Foundation 14 (no backwards compat); enablement derived from scope presence.
3. `plan.considerations` tracks all considerations used by the profile for execution planning.

## What to Change

### 1. Update `CompiledAgentLibraryIndex` in `types-core.ts`

Replace `scoreTerms` + `completionScoreTerms` with:
```typescript
readonly considerations: Readonly<Record<string, CompiledAgentConsideration>>;
```

### 2. Update `CompiledAgentProfile` in `types-core.ts`

- `use`: replace `scoreTerms` + `completionScoreTerms` with `considerations: readonly string[]`
- Remove `completionGuidance?: CompletionGuidanceConfig`
- `plan`: add `considerations: readonly string[]`

### 3. Remove `CompiledAgentScoreTerm` type alias

Remove the temporary alias added in ticket 001 — all consumers now use `CompiledAgentConsideration`.

### 4. Update Zod schemas in `schemas-core.ts`

Update `CompiledAgentLibraryIndexSchema`, `CompiledAgentProfileSchema` to match new types. Remove `CompletionGuidanceConfigSchema` if it becomes unused.

### 5. Regenerate `GameDef.schema.json`

Run `pnpm -F @ludoforge/engine run schema:artifacts`.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify — regenerated)

## Out of Scope

- GameSpecDoc types — ticket 004
- Compilation logic — ticket 005
- Runtime logic — ticket 006
- Game spec migration — ticket 007

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes (expect many downstream type errors in compile/runtime code — fixed in tickets 005-006)
2. `CompiledAgentLibraryIndex` has `considerations` field, no `scoreTerms`/`completionScoreTerms`
3. `CompiledAgentProfile.use` has `considerations`, no `scoreTerms`/`completionScoreTerms`
4. `CompiledAgentProfile` has no `completionGuidance` field
5. Schema artifacts updated

### Invariants

1. `CompiledAgentConsideration` is the only scored-item type (no more `CompiledAgentScoreTerm`)
2. `completionGuidance` is derived, not configured

## Test Plan

### New/Modified Tests

1. No new test files — type changes propagate through typecheck. Build may fail until tickets 005-006 update consumers.

### Commands

1. `pnpm turbo typecheck` — type correctness (may show expected downstream errors)
2. `pnpm -F @ludoforge/engine run schema:artifacts` — regenerate schemas
