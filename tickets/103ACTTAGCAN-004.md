# 103ACTTAGCAN-004: Add `candidateTag` and `candidateTags` ref kinds and expression integration

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `types-core.ts`, `policy-expr.ts`
**Deps**: `tickets/103ACTTAGCAN-002.md`, `specs/103-action-tags-and-candidate-metadata.md`

## Problem

The policy expression system must understand two new ref kinds: `candidateTag` (boolean — does this action have a specific tag?) and `candidateTags` (idList — all tags on this action). These ref kinds must be defined in the compiled IR types and integrated into the expression type inference system.

## Assumption Reassessment (2026-04-01)

1. Compiled ref kinds are defined as interfaces in `types-core.ts:371-406` — confirmed. Current kinds: `library`, `currentSurface`, `previewSurface`, `candidateIntrinsic`, `candidateParam`, `decisionIntrinsic`, `optionIntrinsic`, `seatIntrinsic`, `turnIntrinsic`, `strategicCondition`.
2. `policy-expr.ts` at `packages/engine/src/agents/policy-expr.ts` handles expression analysis — confirmed. `analyzeRefExpr` dispatches to `resolveRuntimeRef`.
3. The `in` operator at `policy-expr.ts:527-562` supports `id in idList` — confirmed. `candidate.tags` (idList) will work with `in` out of the box once the ref kind resolves correctly.
4. Cost class `'candidate'` already exists (`types-core.ts:311`) — no new cost class needed.

## Architecture Check

1. New ref kinds (`candidateTag`, `candidateTags`) are distinct from intrinsics — tags are game-authored content, not structural properties (Foundation 1).
2. Type inference follows existing patterns: `candidateTag` → `boolean`, `candidateTags` → `idList`.
3. Cost class is `candidate` — same as `candidate.actionId`, correct since tag lookup depends on which candidate is being evaluated.

## What to Change

### 1. Add ref kind interfaces to `types-core.ts`

```typescript
export interface CandidateTagRef {
  readonly kind: 'candidateTag';
  readonly tagName: string;
}

export interface CandidateTagsRef {
  readonly kind: 'candidateTags';
}
```

Add these to the `CompiledAgentPolicyRef` union type.

### 2. Add type inference support in `policy-expr.ts`

When the expression analyzer encounters a resolved ref with kind `candidateTag`, infer type `boolean`. For `candidateTags`, infer type `idList`.

### 3. Add runtime evaluation support

In the policy evaluation pipeline (wherever compiled refs are evaluated at runtime), add cases for `candidateTag` and `candidateTags`:
- `candidateTag`: look up `actionTagIndex.byAction[candidateActionId]`, return whether `tagName` is in the array
- `candidateTags`: return `actionTagIndex.byAction[candidateActionId] ?? []`

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add ref kind interfaces and union members)
- `packages/engine/src/agents/policy-expr.ts` (modify — type inference for new ref kinds)
- `packages/engine/src/agents/policy-eval.ts` or equivalent (modify — runtime evaluation)

## Out of Scope

- `resolveRuntimeRef` extension in `compile-agents.ts` — ticket 005
- Game spec migration — ticket 006
- `isPass` intrinsic removal — ticket 005

## Acceptance Criteria

### Tests That Must Pass

1. `candidateTag` ref kind resolves to type `boolean`, cost class `candidate`
2. `candidateTags` ref kind resolves to type `idList`, cost class `candidate`
3. Runtime evaluation of `candidateTag` returns true/false correctly
4. Runtime evaluation of `candidateTags` returns correct tag list
5. `in` operator works with `candidateTags` ref (e.g., `in: [combat, { ref: candidate.tags }]`)
6. Existing expression tests pass unchanged

### Invariants

1. New ref kinds do not affect existing ref resolution
2. Cost class is always `candidate` for tag-related refs
3. Tag lookup is pure — same action + same tag index = same result

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-expr-tags.test.ts` — tag ref type inference tests
2. `packages/engine/test/unit/agents/policy-eval-tags.test.ts` — tag ref runtime evaluation tests (if eval is unit-testable)

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern policy-expr` — targeted tests
2. `pnpm -F @ludoforge/engine test` — full engine test suite
3. `pnpm turbo typecheck` — type correctness
