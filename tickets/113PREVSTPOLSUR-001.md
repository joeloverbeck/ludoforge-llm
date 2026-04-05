# 113PREVSTPOLSUR-001: Add previewStateFeature ref kind to types and schemas

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types, Zod schemas
**Deps**: `specs/113-preview-state-policy-surface.md`

## Problem

The compiled ref kind union (`CompiledAgentPolicyLibraryRefKind`) has no variant for preview-scoped state features. Before the compilation or evaluation logic can handle `preview.feature.*` refs, the type system must include `'previewStateFeature'` as a recognized ref kind.

## Assumption Reassessment (2026-04-05)

1. `CompiledAgentPolicyLibraryRefKind` at `types-core.ts:337` currently has `'stateFeature' | 'candidateFeature' | 'aggregate'` — confirmed.
2. Zod schema for library ref kinds is in `schemas-core.ts` — confirmed, mirrors the TypeScript union.
3. No `'previewStateFeature'` exists anywhere in the codebase — confirmed.

## Architecture Check

1. Pure additive type change — extends an existing union with one new variant.
2. Engine-agnostic: the new ref kind is a generic evaluation dispatch mechanism, not game-specific.
3. No backwards-compatibility shims — new variant, no migration needed.

## What to Change

### 1. Extend `CompiledAgentPolicyLibraryRefKind` (`types-core.ts`)

```typescript
export type CompiledAgentPolicyLibraryRefKind =
  | 'stateFeature'
  | 'candidateFeature'
  | 'aggregate'
  | 'previewStateFeature';
```

### 2. Update Zod schema (`schemas-core.ts`)

Add `z.literal('previewStateFeature')` to the corresponding schema union for library ref kinds.

### 3. Regenerate schema artifacts

Run `pnpm -F @ludoforge/engine run schema:artifacts`.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/schemas/` (regenerate)

## Out of Scope

- No compilation logic (`compile-agents.ts` — ticket 002)
- No evaluation logic (`policy-evaluation-core.ts` — ticket 003)
- No diagnostics or documentation

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine run schema:artifacts:check` passes
2. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Existing ref kinds (`stateFeature`, `candidateFeature`, `aggregate`) are unchanged
2. Zod schema matches TypeScript union exactly

## Test Plan

### New/Modified Tests

1. No new test files — pure type/schema change verified by compilation and schema artifact checks.

### Commands

1. `pnpm -F @ludoforge/engine run schema:artifacts`
2. `pnpm -F @ludoforge/engine run schema:artifacts:check`
3. `pnpm -F @ludoforge/engine test`
