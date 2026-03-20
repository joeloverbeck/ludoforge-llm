# 70ACTTOOSYN-002: Extend VerbalizationDef with actionSummaries and compile from YAML

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types + cnl compiler
**Deps**: None (independent of 70ACTTOOSYN-001)

## Problem

There is no mechanism to carry authored action-level summaries from game spec YAML through compilation into the runtime `VerbalizationDef`. The `actionSummaries` field must exist in both the raw YAML-parsed type (`GameSpecVerbalization`) and the compiled type (`VerbalizationDef`) before downstream tooltip pipeline code can consume it.

## Assumption Reassessment (2026-03-20)

1. `VerbalizationDef` is at `packages/engine/src/kernel/verbalization-types.ts:32-41` — confirmed.
2. `GameSpecVerbalization` is at `packages/engine/src/cnl/game-spec-doc.ts:640-649` — confirmed.
3. `compileVerbalization` is at `packages/engine/src/cnl/compile-verbalization.ts:13-24` — confirmed; it maps raw fields to compiled fields using `?? EMPTY_RECORD` / `?? EMPTY_ARRAY` defaults.
4. Neither type currently has an `actionSummaries` field — confirmed.

## Architecture Check

1. Adding an optional `Record<string, string>` field is the minimal generic extension. It mirrors the existing pattern (e.g., `labels`, `stages`, `macros`).
2. `actionSummaries` is game-agnostic: keys are action IDs (strings), values are human-readable summaries (strings). No game-specific types.
3. No backward compatibility needed — the field is optional, so existing GameDefs without it continue to work unchanged.

## What to Change

### 1. Add `actionSummaries` to `VerbalizationDef`

**File**: `packages/engine/src/kernel/verbalization-types.ts`

```typescript
export interface VerbalizationDef {
  // ... existing fields ...
  readonly actionSummaries?: Readonly<Record<string, string>>;
}
```

### 2. Add `actionSummaries` to `GameSpecVerbalization`

**File**: `packages/engine/src/cnl/game-spec-doc.ts`

```typescript
export interface GameSpecVerbalization {
  // ... existing fields ...
  readonly actionSummaries?: Readonly<Record<string, string>> | null;
}
```

### 3. Pass through in `compileVerbalization`

**File**: `packages/engine/src/cnl/compile-verbalization.ts`

Add to the returned object:

```typescript
...(raw.actionSummaries != null ? { actionSummaries: raw.actionSummaries } : {}),
```

This follows the existing pattern used for `modifierClassification`.

## Files to Touch

- `packages/engine/src/kernel/verbalization-types.ts` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/compile-verbalization.ts` (modify)
- `packages/engine/test/unit/compile-verbalization.test.ts` (modify or new — round-trip test)

## Out of Scope

- Consuming `actionSummaries` in the tooltip pipeline (70ACTTOOSYN-003, 70ACTTOOSYN-004)
- Adding actual YAML data to game files (70ACTTOOSYN-005, 70ACTTOOSYN-006)
- Changing JSON Schema artifacts for GameDef (actionSummaries is optional and unvalidated at the schema level, like other verbalization fields)
- Changing the tooltip normalizer, content planner, or template realizer

## Acceptance Criteria

### Tests That Must Pass

1. `compileVerbalization({ actionSummaries: { fold: 'Fold hand' } })` produces a `VerbalizationDef` with `actionSummaries.fold === 'Fold hand'`.
2. `compileVerbalization({})` produces a `VerbalizationDef` where `actionSummaries` is `undefined` (not an empty record — mirrors `modifierClassification` pattern).
3. `compileVerbalization({ actionSummaries: null })` produces `actionSummaries: undefined`.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. `pnpm turbo typecheck` passes with no errors.

### Invariants

1. `VerbalizationDef` remains a pure data interface — no methods, no side effects.
2. All existing fields of `VerbalizationDef` and `GameSpecVerbalization` are unchanged.
3. `compileVerbalization` remains a pure function.
4. Existing compiled GameDefs without `actionSummaries` continue to work (field is optional).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-verbalization.test.ts` — add tests for `actionSummaries` pass-through, null handling, and undefined default.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "compileVerbalization"`
2. `pnpm turbo typecheck && pnpm turbo test && pnpm turbo lint`
