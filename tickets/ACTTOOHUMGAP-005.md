# ACTTOOHUMGAP-005: Structured conditions on SelectMessage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel tooltip pipeline
**Deps**: ACTTOOHUMGAP-001 (`humanizeConditionWithLabels` uses `humanizeValueExpr` from 001)

## Problem

`SelectMessage.filter` is a pre-rendered string. When the realizer needs to re-resolve condition labels with full `LabelContext` (e.g., to replace zone IDs with display names), it can't — the structure is lost.

## Assumption Reassessment (2026-03-08)

1. `tooltip-ir.ts` defines `SelectMessage` with a `filter` field that is a pre-rendered string — confirmed file exists.
2. `tooltip-normalizer-compound.ts` populates `SelectMessage` during normalization — confirmed file exists.
3. `tooltip-template-realizer.ts` renders `SelectMessage` using the `filter` string — confirmed file exists.
4. `tooltip-modifier-humanizer.ts` exists and could host `humanizeConditionWithLabels` — confirmed file exists.
5. `ConditionAST` is defined in kernel types — to be verified for importability.

## Architecture Check

1. Adding an optional `conditionAST` field to `SelectMessage` is backwards-compatible — existing consumers ignore fields they don't read.
2. The realizer uses a "prefer structured, fall back to string" strategy — no breaking change.
3. `humanizeConditionWithLabels` reuses `humanizeValueExpr` from ACTTOOHUMGAP-001, avoiding duplication.

## What to Change

### 1. Add `conditionAST` to `SelectMessage` in `tooltip-ir.ts`

Add an optional `conditionAST?: ConditionAST` field to the `SelectMessage` type. This carries the raw AST alongside the pre-rendered `filter` string.

### 2. Store raw condition AST in the normalizer

In `tooltip-normalizer-compound.ts`, when creating `SelectMessage` entries that have conditions, populate the new `conditionAST` field with the raw `ConditionAST` node.

### 3. Re-render conditions in the realizer

In `tooltip-template-realizer.ts`, when rendering a `SelectMessage`:
- If `conditionAST` is present **and** a `LabelContext` is available, call `humanizeConditionWithLabels` to re-render the condition with full label resolution.
- If `conditionAST` is absent, fall back to the pre-rendered `filter` string (backwards compatibility).

### 4. Export `humanizeConditionWithLabels` from `tooltip-modifier-humanizer.ts`

Create and export `humanizeConditionWithLabels(ast: ConditionAST, ctx: LabelContext): string` that:
- Traverses the `ConditionAST` structure.
- Uses `humanizeValueExpr` (from ACTTOOHUMGAP-001) for any embedded `ValueExpr` nodes.
- Resolves zone/player/token references via `LabelContext`.
- Produces natural English condition text.

## Files to Touch

- `packages/engine/src/kernel/tooltip-ir.ts` (modify — add `conditionAST` to `SelectMessage`)
- `packages/engine/src/kernel/tooltip-normalizer-compound.ts` (modify — populate `conditionAST`)
- `packages/engine/src/kernel/tooltip-template-realizer.ts` (modify — re-render with `LabelContext` when AST present)
- `packages/engine/src/kernel/tooltip-modifier-humanizer.ts` (modify — export `humanizeConditionWithLabels`)
- `packages/engine/test/unit/kernel/tooltip-ir.test.ts` (modify — test new field)
- `packages/engine/test/unit/kernel/tooltip-normalizer-compound.test.ts` (modify — test AST population)
- `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` (modify — test re-rendering)
- `packages/engine/test/unit/kernel/tooltip-modifier-humanizer.test.ts` (modify — test `humanizeConditionWithLabels`)

## Out of Scope

- Creating `humanizeValueExpr` (that is ACTTOOHUMGAP-001 — must be done first).
- Select target enrichment (that is ACTTOOHUMGAP-002).
- Macro binding sanitization (that is ACTTOOHUMGAP-003).
- Dedup pass (that is ACTTOOHUMGAP-004).
- Changing the pre-rendered `filter` string behavior — it must remain as a fallback.
- Any file outside `packages/engine/src/kernel/tooltip-*.ts` and their test counterparts.
- Changes to the compiler, runner, or game data files.

## Acceptance Criteria

### Tests That Must Pass

1. `SelectMessage` with `conditionAST` present: realizer uses re-rendered text (with label resolution), not the pre-rendered `filter` string.
2. `SelectMessage` without `conditionAST`: realizer falls back to the pre-rendered `filter` string (backwards compatibility).
3. `humanizeConditionWithLabels` resolves zone IDs to display names via `LabelContext`.
4. `humanizeConditionWithLabels` resolves player references to display names via `LabelContext`.
5. `humanizeConditionWithLabels` delegates embedded `ValueExpr` nodes to `humanizeValueExpr`.
6. Normalizer populates `conditionAST` for all `SelectMessage` entries that have conditions.
7. Normalizer leaves `conditionAST` undefined for `SelectMessage` entries without conditions.
8. Existing suite: `pnpm -F @ludoforge/engine test` — all tooltip tests pass (no regression).

### Invariants

1. `conditionAST` is optional — all existing `SelectMessage` consumers remain unaffected.
2. The pre-rendered `filter` string is always present (never removed), serving as fallback.
3. `humanizeConditionWithLabels` uses `humanizeValueExpr` from `tooltip-value-stringifier.ts` — no duplicate value humanization logic.
4. No game-specific logic in condition humanization.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-ir.test.ts` — test that `SelectMessage` accepts optional `conditionAST`.
2. `packages/engine/test/unit/kernel/tooltip-normalizer-compound.test.ts` — test that conditions are stored as AST.
3. `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` — test re-rendering with LabelContext vs. fallback.
4. `packages/engine/test/unit/kernel/tooltip-modifier-humanizer.test.ts` — test `humanizeConditionWithLabels` with various condition shapes.

### Commands

1. `cd .claude/worktrees/spec-57 && pnpm -F @ludoforge/engine test`
2. `cd .claude/worktrees/spec-57 && pnpm turbo typecheck`
