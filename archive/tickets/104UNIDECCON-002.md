# 104UNIDECCON-002: Add `contextKind` ref kind and `context.kind` ref resolution

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `types-core.ts`, `schemas-core.ts`, `compile-agents.ts`, `policy-evaluation-core.ts`
**Deps**: `specs/104-unified-decision-context-considerations.md`

## Problem

Considerations that participate in both `move` and `completion` scopes need a way to branch on context at runtime. A new `contextKind` ref kind enables `{ ref: context.kind }` which returns `'move'` or `'completion'` depending on the evaluation context.

## Assumption Reassessment (2026-04-01)

1. `CompiledAgentPolicyRef` union at `types-core.ts:372-415` — confirmed. Currently has 12 ref kinds including `candidateTag` and `candidateTags` (from Spec 103).
2. `resolveRuntimeRef` in `compile-agents.ts` at ~line 1685 — confirmed. Handles `candidate.*`, `candidate.tag.*`, etc.
3. `policy-evaluation-core.ts` `resolveRef` switch at ~line 650 — confirmed. Handles all ref kinds.
4. `this.input.completion` in `policy-evaluation-core.ts` distinguishes move vs completion context — confirmed. Can derive `context.kind` from its presence.

## Architecture Check

1. `contextKind` is a ref kind (like `candidateTag`), not a surface — consistent with Spec 103 pattern.
2. Cost class is `'state'` — context kind doesn't depend on candidate.
3. Returns `'move'` or `'completion'` as an id-typed value.

## What to Change

### 1. Add `contextKind` to `CompiledAgentPolicyRef` union in `types-core.ts`

```typescript
| {
    readonly kind: 'contextKind';
  }
```

### 2. Add Zod schema variant in `schemas-core.ts`

```typescript
z.object({
  kind: z.literal('contextKind'),
}).strict(),
```

### 3. Add ref resolution in `compile-agents.ts`

In `resolveRuntimeRef`:
```typescript
if (refPath === 'context.kind') {
  return { type: 'id', costClass: 'state', ref: { kind: 'contextKind' } };
}
```

### 4. Add runtime evaluation in `policy-evaluation-core.ts`

In `resolveRef` switch:
```typescript
case 'contextKind':
  return this.input.completion !== undefined ? 'completion' : 'move';
```

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)

## Out of Scope

- Consideration compilation — ticket 005
- Scope filtering — ticket 006
- Game spec migration — ticket 007

## Acceptance Criteria

### Tests That Must Pass

1. `context.kind` resolves to `{ kind: 'contextKind' }` with type `id`, cost `state`
2. Runtime: returns `'move'` when no completion context, `'completion'` when completion context present
3. Existing tests pass unchanged

### Invariants

1. `context.kind` is always available regardless of scope
2. Cost class is `state` (not `candidate`)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-agents-context-kind.test.ts` — ref resolution test
2. Runtime evaluation tested via integration in ticket 006

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern context-kind` — targeted tests
2. `pnpm -F @ludoforge/engine test` — full engine test suite
3. `pnpm turbo typecheck` — type correctness
