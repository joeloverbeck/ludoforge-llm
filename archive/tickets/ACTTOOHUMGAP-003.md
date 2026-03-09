# ACTTOOHUMGAP-003: Consistent macro binding sanitization

**Status**: DONE
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel tooltip pipeline
**Deps**: ACTTOOHUMGAP-001 (relies on `humanizeValueExpr` for binding ref handling in `stringifyZoneRef`)

## Problem

`stringifyZoneRef()` in `tooltip-value-stringifier.ts` doesn't handle binding refs — it falls back to `'<expr>'`. Not all normalizer paths call `stripMacroBindingPrefix`, so `__macro_*` prefixed identifiers leak into display text.

## Assumption Reassessment (2026-03-08)

1. `tooltip-value-stringifier.ts` contains `stringifyZoneRef()` — confirmed file exists.
2. `tooltip-normalizer.ts` has code paths that can encounter macro bindings — confirmed file exists.
3. A `stripMacroBindingPrefix` utility exists somewhere in the tooltip pipeline — to be located at implementation time (may be in normalizer or value-stringifier).
4. `__macro_*` prefixes originate from macro expansion in the compiler — these are internal identifiers not meant for display.

## Architecture Check

1. Sanitization at the stringifier/normalizer level ensures no downstream consumer ever sees raw `__macro_*` strings.
2. Using `stripMacroBindingPrefix` consistently (not ad-hoc string replacement) prevents drift.
3. No game-specific logic — macro bindings are a generic compiler artifact.

## What to Change

### 1. Enhance `stringifyZoneRef()` in `tooltip-value-stringifier.ts`

Detect binding refs (refs containing `__macro_` prefix) and:
- Strip the `__macro_` prefix.
- Convert to a human-readable label (e.g., `__macro_targetZone` → `"target zone"`).
- Never return `'<expr>'` for a binding ref.

### 2. Audit normalizer paths in `tooltip-normalizer.ts`

Systematically review every code path that emits display text. For each path that can encounter a macro binding identifier:
- Ensure `stripMacroBindingPrefix` is called before the identifier is embedded in display text.
- Add the call if missing.

## Files to Touch

- `packages/engine/src/kernel/tooltip-value-stringifier.ts` (modify — handle binding refs in `stringifyZoneRef()`)
- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify — ensure all paths sanitize macro bindings)
- `packages/engine/test/unit/kernel/tooltip-value-stringifier.test.ts` (modify — add binding ref tests)
- `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` (modify — add macro binding sanitization tests)

## Out of Scope

- Creating `humanizeValueExpr` (that is ACTTOOHUMGAP-001).
- Select target enrichment (that is ACTTOOHUMGAP-002).
- Dedup pass (that is ACTTOOHUMGAP-004).
- Structured conditions (that is ACTTOOHUMGAP-005).
- Any file outside `packages/engine/src/kernel/tooltip-*.ts` and their test counterparts.
- Changes to the compiler's macro expansion logic itself.
- Changes to the runner or game data files.

## Acceptance Criteria

### Tests That Must Pass

1. `stringifyZoneRef()` with a binding ref input (e.g., `__macro_targetZone`) produces a human-readable label (e.g., `"target zone"`), never `'<expr>'`.
2. No tooltip output from the normalizer contains any string matching `__macro_*` pattern.
3. `stripMacroBindingPrefix` is called on every normalizer code path that can encounter a binding identifier (verified by code review + tests).
4. Existing suite: `pnpm -F @ludoforge/engine test` — all tooltip tests pass (no regression).

### Invariants

1. No tooltip output anywhere in the pipeline contains `__macro_` prefixed strings.
2. Non-macro identifiers are not affected by the sanitization (no false positives).
3. The `stripMacroBindingPrefix` utility remains the single point of sanitization logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-value-stringifier.test.ts` — add tests with `__macro_`-prefixed binding refs, confirming human-readable output.
2. `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` — add tests with macro-expanded inputs, confirming no `__macro_*` leaks.

### Commands

1. `cd .claude/worktrees/spec-57 && pnpm -F @ludoforge/engine test`
2. `cd .claude/worktrees/spec-57 && pnpm turbo typecheck`
