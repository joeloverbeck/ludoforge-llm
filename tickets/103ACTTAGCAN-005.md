# 103ACTTAGCAN-005: Remove `isPass` intrinsic, add `candidate.tag.*` ref resolution to `compile-agents.ts`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `compile-agents.ts`, `policy-contract.ts`
**Deps**: `archive/tickets/103ACTTAGCAN-003.md`, `archive/tickets/103ACTTAGCAN-004.md`, `specs/103-action-tags-and-candidate-metadata.md`

## Problem

The `resolveRuntimeRef` method in `compile-agents.ts` must recognize `candidate.tag.<tagName>` (3-segment path) and `candidate.tags` (2-segment path) and emit the new ref kinds. The `isPass` intrinsic must be removed from `AGENT_POLICY_CANDIDATE_INTRINSICS` since `candidate.tag.pass` replaces it.

## Assumption Reassessment (2026-04-01)

1. `resolveRuntimeRef` at `compile-agents.ts:1641` handles `candidate.*` refs at lines 1671-1719 — confirmed.
2. `candidate.isPass` resolves at line 1685 via `candidateIntrinsic` kind — confirmed. Must be removed.
3. `AGENT_POLICY_CANDIDATE_INTRINSICS` at `policy-contract.ts:45-52` includes `'isPass'` — confirmed. Must be removed.
4. `AgentPolicyCandidateIntrinsic` type is derived from the const array — removing `'isPass'` from the array automatically removes it from the type.

## Architecture Check

1. Removing `isPass` intrinsic is clean — it's a special case of tag membership (`candidate.tag.pass`). The remaining intrinsics (`actionId`, `stableMoveKey`, `paramCount`) are truly structural (Foundation 15 — architectural completeness).
2. `candidate.tag.*` uses a 3-segment path, distinguishing it from 2-segment intrinsics — no ambiguity.
3. Dead-ref warning for unknown tags is a compile-time check (Foundation 12).
4. Per Foundation 14, `isPass` removal and tag-based replacement happen in the same change as the feature addition.

## What to Change

### 1. Remove `isPass` from `AGENT_POLICY_CANDIDATE_INTRINSICS`

In `policy-contract.ts`:
```typescript
export const AGENT_POLICY_CANDIDATE_INTRINSICS = [
  'actionId',
  'stableMoveKey',
  // 'isPass' REMOVED — replaced by candidate.tag.pass
  'paramCount',
] as const;
```

### 2. Remove `isPass` case from `resolveRuntimeRef`

Remove the `candidate.isPass` handling at ~line 1685 in `compile-agents.ts`.

### 3. Add `candidate.tag.<tagName>` resolution

In `resolveRuntimeRef`, after candidate intrinsic handling:
```typescript
// candidate.tag.<tagName> → candidateTag ref kind
if (segments[0] === 'candidate' && segments[1] === 'tag' && segments.length === 3) {
  const tagName = segments[2]!;
  // Optionally warn if tagName not in any action's tags (dead ref)
  return {
    valueType: 'boolean',
    costClass: 'candidate',
    ref: { kind: 'candidateTag', tagName },
  };
}
```

### 4. Add `candidate.tags` resolution

```typescript
// candidate.tags → candidateTags ref kind
if (segments[0] === 'candidate' && segments[1] === 'tags' && segments.length === 2) {
  return {
    valueType: 'idList',
    costClass: 'candidate',
    ref: { kind: 'candidateTags' },
  };
}
```

### 5. Dead-ref warning (optional but recommended)

When resolving `candidate.tag.<tagName>`, check if `tagName` appears in the compiled `ActionTagIndex.byTag`. If not, emit a warning diagnostic (not an error — the tag could be added later by evolution).

## Files to Touch

- `packages/engine/src/contracts/policy-contract.ts` (modify — remove `isPass`)
- `packages/engine/src/cnl/compile-agents.ts` (modify — remove `isPass` case, add tag ref resolution)

## Out of Scope

- Tag index compilation — ticket 003
- Ref kind type definitions — ticket 004
- Game spec migration — ticket 006

## Acceptance Criteria

### Tests That Must Pass

1. `candidate.tag.insurgent-operation` resolves to `{ kind: 'candidateTag', tagName: 'insurgent-operation' }` with type `boolean`, cost `candidate`
2. `candidate.tags` resolves to `{ kind: 'candidateTags' }` with type `idList`, cost `candidate`
3. `candidate.isPass` is no longer a valid ref — produces diagnostic
4. `candidate.tag.nonexistent` optionally produces a dead-ref warning
5. `candidate.tag` (2-segment, missing tag name) produces error diagnostic
6. Existing candidate intrinsic refs (`candidate.actionId`, `candidate.stableMoveKey`, `candidate.paramCount`) still work
7. Existing tests pass (after updating any that reference `candidate.isPass`)

### Invariants

1. `AGENT_POLICY_CANDIDATE_INTRINSICS` no longer includes `isPass`
2. Tag ref resolution is purely compile-time — no runtime dependency on tag index during compilation
3. Remaining intrinsics are unaffected

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-agents-tag-refs.test.ts` — tag ref resolution tests
2. Update existing tests that reference `candidate.isPass` intrinsic

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern compile-agents` — targeted tests
2. `pnpm -F @ludoforge/engine test` — full engine test suite
3. `pnpm turbo typecheck` — type correctness
