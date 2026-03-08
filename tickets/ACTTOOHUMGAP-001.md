# ACTTOOHUMGAP-001: Unify value humanization with LabelContext

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel tooltip pipeline
**Deps**: None (foundation ticket — must land before 002, 005)

## Problem

Multiple call-sites stringify `ValueExpr` nodes independently, producing inconsistent output. Some shapes (arithmetic, aggregate, concat, conditional) fall through to a raw `<value>` placeholder. A single authoritative humanizer with label resolution is needed.

## Assumption Reassessment (2026-03-08)

1. `tooltip-value-stringifier.ts` exists and contains `stringifyZoneRef()` and related helpers — confirmed.
2. `tooltip-modifier-humanizer.ts` exists and contains a duplicate `humanizeValue()` helper — to be verified at implementation time.
3. `tooltip-label-resolver.ts` exists and exports `LabelContext` — confirmed file exists.
4. `ValueExpr` discriminant shapes are defined in kernel types — to be verified for complete coverage.

## Architecture Check

1. A single `humanizeValueExpr` function centralizes all `ValueExpr` → human text conversion, eliminating drift between call-sites.
2. All changes are in the generic tooltip pipeline (`packages/engine/src/kernel/tooltip-*.ts`) — no game-specific logic.
3. No backwards-compatibility shims — the duplicate helper is deleted outright and all call-sites rewired.

## What to Change

### 1. Create `humanizeValueExpr` in `tooltip-value-stringifier.ts`

Add `humanizeValueExpr(expr: ValueExpr, ctx: LabelContext): string` that handles all `ValueExpr` shapes:
- `literal` — render the literal value
- `varRef` — resolve via `LabelContext`
- `arithmetic` — render `left op right` recursively
- `aggregate` — render `"total of <field>"` or similar descriptive text
- `concat` — render joined parts
- `conditional` — render `"X if Y, otherwise Z"`
- `bindingRef` — resolve label, strip `__macro_` prefix
- `count` — render `"number of <collection>"`
- `query` — render query description

Falls back to a descriptive string rather than raw `<value>`.

### 2. Remove duplicate `humanizeValue()` from `tooltip-modifier-humanizer.ts`

Delete the local `humanizeValue()` helper and rewire all call-sites to import `humanizeValueExpr` from `tooltip-value-stringifier.ts`.

### 3. Ensure `LabelContext` is importable

Verify `tooltip-label-resolver.ts` exports `LabelContext` type and any helper needed by `humanizeValueExpr`.

## Files to Touch

- `packages/engine/src/kernel/tooltip-value-stringifier.ts` (modify — add `humanizeValueExpr`)
- `packages/engine/src/kernel/tooltip-modifier-humanizer.ts` (modify — remove `humanizeValue`, rewire imports)
- `packages/engine/src/kernel/tooltip-label-resolver.ts` (modify — ensure `LabelContext` export is usable)
- `packages/engine/test/unit/kernel/tooltip-value-stringifier.test.ts` (modify — add tests for `humanizeValueExpr`)

## Out of Scope

- Changing `SelectMessage` IR shape (that is ACTTOOHUMGAP-005).
- Fixing singular/plural grammar (that is ACTTOOHUMGAP-002).
- Macro binding sanitization (that is ACTTOOHUMGAP-003).
- Dedup pass (that is ACTTOOHUMGAP-004).
- Any file outside `packages/engine/src/kernel/tooltip-*.ts` and their test counterparts.
- Changes to the compiler, runner, or game data files.

## Acceptance Criteria

### Tests That Must Pass

1. `humanizeValueExpr` returns descriptive text (no `<value>` placeholder) for every `ValueExpr` discriminant shape: `literal`, `varRef`, `arithmetic`, `aggregate`, `concat`, `conditional`, `bindingRef`, `count`, `query`.
2. Nested arithmetic expressions (e.g., `(a + b) * c`) produce readable output.
3. Aggregate over binding ref produces readable output (e.g., `"total of resources"`).
4. Concat with mixed literal/ref parts produces readable output.
5. No duplicate `humanizeValue` function remains in the codebase (grep verification).
6. Existing suite: `pnpm -F @ludoforge/engine test` — all tooltip tests pass (no regression).

### Invariants

1. All existing tooltip output that was already correct must not change (backwards compatibility).
2. No `<value>` placeholders appear in any tooltip output for supported `ValueExpr` shapes.
3. `tooltip-value-stringifier.ts` remains the single source of truth for value humanization.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-value-stringifier.test.ts` — add test cases for each `ValueExpr` shape, edge cases (nested arithmetic, aggregate over binding, concat with mixed types).

### Commands

1. `cd .claude/worktrees/spec-57 && pnpm -F @ludoforge/engine test`
2. `cd .claude/worktrees/spec-57 && pnpm turbo typecheck`
