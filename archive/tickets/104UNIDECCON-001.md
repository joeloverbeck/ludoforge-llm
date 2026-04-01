# 104UNIDECCON-001: Rename `CompiledAgentScoreTerm` → `CompiledAgentConsideration` and add `scopes` field

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `types-core.ts`, `schemas-core.ts`
**Deps**: `specs/104-unified-decision-context-considerations.md`

## Problem

The compiled IR type for scored items must be renamed from `CompiledAgentScoreTerm` to `CompiledAgentConsideration` and gain a `scopes` field before any compilation or runtime code can reference the unified concept.

## Assumption Reassessment (2026-04-01)

1. `CompiledAgentScoreTerm` at `types-core.ts:653` — confirmed. Has `costClass`, `when`, `weight`, `value`, `unknownAs`, `clamp`, `dependencies`.
2. `CompiledAgentScoreTerm` is used by `CompiledAgentLibraryIndex.scoreTerms` and `CompiledAgentLibraryIndex.completionScoreTerms` — confirmed.
3. Renaming the type will cause type errors at all usage sites — these are fixed in subsequent tickets (003, 005, 006).

## Architecture Check

1. Renaming preserves the same fields — no behavioral change, just semantic clarity.
2. Adding `scopes` as a required field prepares the type for context-aware filtering.
3. Existing `scoreTerms`/`completionScoreTerms` fields still reference the type (under its new name) until ticket 003 replaces them.

## What to Change

### 1. Rename `CompiledAgentScoreTerm` → `CompiledAgentConsideration` in `types-core.ts`

Add `scopes` field:

```typescript
export interface CompiledAgentConsideration {
  readonly scopes: readonly ('move' | 'completion')[];
  readonly costClass: AgentPolicyCostClass;
  readonly when?: AgentPolicyExpr;
  readonly weight: AgentPolicyExpr;
  readonly value: AgentPolicyExpr;
  readonly unknownAs?: number;
  readonly clamp?: { readonly min?: number; readonly max?: number };
  readonly dependencies: CompiledAgentDependencyRefs;
}
```

### 2. Keep `CompiledAgentScoreTerm` as a type alias temporarily

To avoid breaking all downstream consumers in this ticket:

```typescript
/** @deprecated Use CompiledAgentConsideration. Removed in ticket 003. */
export type CompiledAgentScoreTerm = CompiledAgentConsideration;
```

### 3. Update Zod schema in `schemas-core.ts`

Rename `CompiledAgentScoreTermSchema` → `CompiledAgentConsiderationSchema`, add `scopes` field.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)

## Out of Scope

- Replacing `scoreTerms`/`completionScoreTerms` in library/profile types — ticket 003
- Compilation changes — ticket 005
- Runtime changes — ticket 006
- Game spec migration — ticket 007

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes
2. `pnpm -F @ludoforge/engine test` — existing tests pass unchanged
3. `CompiledAgentConsideration` type is available with `scopes` field

### Invariants

1. `CompiledAgentScoreTerm` alias preserves backwards compatibility for this ticket only
2. No behavioral change

## Test Plan

### New/Modified Tests

1. No new test files — type-only change verified by typecheck

### Commands

1. `pnpm turbo typecheck` — type correctness
2. `pnpm -F @ludoforge/engine test` — full engine test suite
