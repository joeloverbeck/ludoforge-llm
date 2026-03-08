# ACTTOOHUMGAP-002: Enrich SelectMessage targets and fix grammar

**Status**: DONE
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel tooltip pipeline
**Deps**: ACTTOOHUMGAP-001 (uses `humanizeValueExpr` for value rendering in target labels)

## Problem

`classifyQueryTarget()` only handles a subset of query types. Enum, binding, and concat queries fall through to the generic `'items'` label. Additionally, "Select up to 1 items" is ungrammatical.

## Assumption Reassessment (2026-03-08)

1. `tooltip-normalizer-compound.ts` contains `classifyQueryTarget()` — confirmed file exists.
2. `tooltip-ir.ts` defines `SelectMessage` with a `target` field — confirmed file exists.
3. `tooltip-template-realizer.ts` renders the select message text — confirmed file exists.
4. The `target` union type is limited and doesn't include `'options'` or `'tokens'` — to be verified at implementation time.

## Architecture Check

1. Expanding target classification enriches the IR without changing the pipeline shape — additive change only.
2. Singular/plural fix is a localized grammar rule in the realizer — low blast radius.
3. No game-specific logic — classification is based on query structure, not game identity.

## What to Change

### 1. Expand `SelectMessage.target` union in `tooltip-ir.ts`

Add `'options'` to the `SelectMessage.target` discriminant union. Reserve `'tokens'` in the union for future use but do not remap existing token query classifications (that would be a behavioral change beyond this ticket's scope).

### 2. Expand `classifyQueryTarget()` in `tooltip-normalizer-compound.ts`

Add classification branches for:
- Enum queries → `'options'`
- Concat queries → derive label from concatenated sources (recursively classify; if all sources share a target, use that; otherwise `'items'`)
- `nextInOrderByCondition` queries → derive label from the inner `source` query

Note: The original ticket mentioned "binding queries" but no `binding` query type exists in `OptionsQuery`. All variants have a `query` discriminant. This deliverable was dropped.

### 3. Fix singular/plural grammar in `tooltip-template-realizer.ts`

- When count is 1, use singular noun form: "Select up to 1 item" (not "1 items").
- Add pluralization rules for all target labels (items, options, tokens, etc.).

## Files to Touch

- `packages/engine/src/kernel/tooltip-ir.ts` (modify — expand `SelectMessage.target` union)
- `packages/engine/src/kernel/tooltip-normalizer-compound.ts` (modify — expand `classifyQueryTarget()`)
- `packages/engine/src/kernel/tooltip-template-realizer.ts` (modify — fix singular/plural rendering)
- `packages/engine/test/unit/kernel/tooltip-normalizer-compound.test.ts` (modify — add classification tests)
- `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` (modify — add grammar tests)

## Out of Scope

- Value humanization logic (that is ACTTOOHUMGAP-001).
- Macro binding sanitization (that is ACTTOOHUMGAP-003).
- Dedup pass (that is ACTTOOHUMGAP-004).
- Structured conditions on SelectMessage (that is ACTTOOHUMGAP-005).
- Any file outside `packages/engine/src/kernel/tooltip-*.ts` and their test counterparts.
- Changes to the compiler, runner, or game data files.

## Acceptance Criteria

### Tests That Must Pass

1. Enum query input to `classifyQueryTarget()` produces `'options'` (not `'items'`).
2. Concat query input produces a descriptive target label derived from sources (not `'items'`).
3. `nextInOrderByCondition` query input produces a label derived from its source (not `'items'`).
4. "Select up to 1 ..." renders with singular noun form (e.g., "1 item", not "1 items").
5. "Select up to 3 ..." renders with plural noun form (e.g., "3 items").
6. All new target labels have corresponding singular/plural forms in the realizer.
7. Existing suite: `pnpm -F @ludoforge/engine test` — all tooltip tests pass (no regression).

### Invariants

1. Existing `SelectMessage` consumers that handle known target labels continue to work.
2. The `target` field remains a string union (not a free-form string).
3. No game-specific identifiers appear in classification logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-normalizer-compound.test.ts` — add tests for enum, concat, and nextInOrderByCondition query classification.
2. `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` — add tests for singular/plural edge cases.

### Commands

1. `cd .claude/worktrees/spec-57 && pnpm -F @ludoforge/engine test`
2. `cd .claude/worktrees/spec-57 && pnpm turbo typecheck`
