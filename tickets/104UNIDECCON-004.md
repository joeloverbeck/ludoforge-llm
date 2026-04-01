# 104UNIDECCON-004: Add `considerations` to GameSpecDoc types, remove `scoreTerms`/`completionScoreTerms`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `game-spec-doc.ts`
**Deps**: `tickets/104UNIDECCON-003.md`, `specs/104-unified-decision-context-considerations.md`

## Problem

The GameSpecDoc YAML types must replace `scoreTerms`/`completionScoreTerms` with `considerations` in both the library and profile `use` sections. This must happen before the compiler can reference the new fields.

## Assumption Reassessment (2026-04-01)

1. `GameSpecAgentLibrary` at `game-spec-doc.ts:628-637` — confirmed. Has `scoreTerms` and `completionScoreTerms` as `Readonly<Record<string, GameSpecScoreTermDef>>`.
2. `GameSpecAgentProfileUse` at `game-spec-doc.ts:639-644` — confirmed. Has `scoreTerms` and `completionScoreTerms` as `readonly string[]`.
3. `GameSpecScoreTermDef` — confirmed. Has `weight`, `value`, `when`, `unknownAs`, `clamp`. Needs `scopes`.

## Architecture Check

1. `GameSpecConsiderationDef` extends `GameSpecScoreTermDef` with `scopes` — clean extension.
2. `considerations` replaces two fields — consistent with compiled IR changes in ticket 003.

## What to Change

### 1. Add `GameSpecConsiderationDef` to `game-spec-doc.ts`

```typescript
export interface GameSpecConsiderationDef extends GameSpecScoreTermDef {
  readonly scopes?: readonly string[];  // validated at compile time: 'move' | 'completion'
}
```

Or inline `scopes` into a new interface if `GameSpecScoreTermDef` should be removed.

### 2. Update `GameSpecAgentLibrary`

Replace `scoreTerms` + `completionScoreTerms` with:
```typescript
readonly considerations?: Readonly<Record<string, GameSpecConsiderationDef>>;
```

### 3. Update `GameSpecAgentProfileUse`

Replace `scoreTerms` + `completionScoreTerms` with:
```typescript
readonly considerations?: readonly string[];
```

### 4. Remove `completionGuidance` from profile types if present

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)

## Out of Scope

- Compilation logic — ticket 005
- Runtime logic — ticket 006
- Game spec migration — ticket 007

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes
2. `GameSpecAgentLibrary` has `considerations`, no `scoreTerms`/`completionScoreTerms`

### Invariants

1. GameSpecDoc types mirror compiled IR types (ticket 003)

## Test Plan

### New/Modified Tests

1. No new test files — type-only change

### Commands

1. `pnpm turbo typecheck` — type correctness
