# ACTTOOHUMGAP-006: Consolidate blocker-extractor value humanization into canonical humanizeValueExpr

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel tooltip pipeline
**Deps**: ACTTOOHUMGAP-001 (`humanizeValueExpr` must exist before this ticket can land)

## Problem

`tooltip-blocker-extractor.ts` contains a third local `stringifyValueExpr(expr, ctx: LabelContext)` (lines 22-46) that duplicates the label-aware value-humanization logic now canonicalized in `humanizeValueExpr` from `tooltip-value-stringifier.ts`. The local copy:

- Has different formatting choices (e.g. `count(zone)` vs `pieces in Zone`, generic `'aggregate'`/`'expression'`/`'concatenation'`/`'conditional'` fallbacks)
- Doesn't handle `__macro_` binding prefixes via `sanitizeBindingName`
- Will drift further from the canonical function as ACTTOOHUMGAP-002 through 005 land

This creates a maintenance risk: fixes and improvements to value humanization in the canonical function won't propagate to blocker output.

## Assumption Reassessment (2026-03-08)

1. `tooltip-blocker-extractor.ts` exists with a local `stringifyValueExpr` at line 22 — confirmed.
2. The local function takes `(expr: ValueExpr, ctx: LabelContext)` — same signature as `humanizeValueExpr` — confirmed.
3. The local function has intentionally different formatting for some ref types (`zoneVar` uses `zone.var` format, `zoneCount` uses `count(zone)`, `assetField` uses `table.field`) — confirmed, these are blocker-context formatting choices.
4. `humanizeValueExpr` from ACTTOOHUMGAP-001 is now the canonical source of truth — confirmed.

## Architecture Check

1. Single source of truth: consolidating into `humanizeValueExpr` ensures all value humanization evolves together. Blocker-specific formatting differences can be handled by a thin wrapper or by enriching `humanizeValueExpr` with an optional format hint, rather than maintaining a full parallel implementation.
2. All changes remain in the generic tooltip pipeline (`packages/engine/src/kernel/tooltip-*.ts`) — no game-specific logic.
3. No backwards-compatibility shims — the local function is deleted outright and replaced with the canonical import.

## What to Change

### 1. Delete local `stringifyValueExpr` from `tooltip-blocker-extractor.ts`

Remove the local function (lines 22-46) and the `stringifyZoneSel` helper (line 48-49). Replace all call-sites with `humanizeValueExpr` imported from `tooltip-value-stringifier.ts`.

### 2. Evaluate formatting differences

The local function formats some ref types differently for blocker context. Decide whether:
- (a) The canonical `humanizeValueExpr` output is acceptable for blockers (simpler, preferred), or
- (b) A thin `humanizeBlockerValue` wrapper is needed that calls `humanizeValueExpr` and post-processes specific patterns

Document the decision in the PR.

## Files to Touch

- `packages/engine/src/kernel/tooltip-blocker-extractor.ts` (modify — delete local `stringifyValueExpr`, import canonical `humanizeValueExpr`)
- `packages/engine/test/unit/kernel/tooltip-blocker-extractor.test.ts` (modify — update expected output strings if formatting changes)

## Out of Scope

- Changing `humanizeValueExpr` signature or behavior (that is ACTTOOHUMGAP-001, already landed).
- Any file outside `packages/engine/src/kernel/tooltip-blocker-extractor.ts` and its test.
- Changes to the compiler, runner, or game data files.

## Acceptance Criteria

### Tests That Must Pass

1. All existing blocker-extractor tests pass (output may change to match canonical humanization — update expected strings accordingly).
2. No local `stringifyValueExpr` function remains in `tooltip-blocker-extractor.ts` (grep verification).
3. Blocker output produces human-readable text for all `ValueExpr` shapes (no `'aggregate'`, `'expression'`, `'concatenation'`, `'conditional'` generic fallbacks).
4. Existing suite: `pnpm -F @ludoforge/engine test` — all tooltip tests pass (no regression).

### Invariants

1. `tooltip-value-stringifier.ts` remains the single source of truth for value humanization across the entire tooltip pipeline.
2. No `<value>` or generic single-word placeholders appear in blocker output for supported `ValueExpr` shapes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-blocker-extractor.test.ts` — update expected blocker strings to match canonical `humanizeValueExpr` output format.

### Commands

1. `cd .claude/worktrees/spec-57 && pnpm -F @ludoforge/engine test`
2. `cd .claude/worktrees/spec-57 && pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-08
- **What changed**: Deleted local `stringifyValueExpr` (22 lines) and `stringifyZoneSel` (2 lines) from `tooltip-blocker-extractor.ts`. Replaced all 20+ call-sites with canonical `humanizeValueExpr` imported from `tooltip-value-stringifier.ts`. Updated 1 test expectation (`count(Saigon)` → `pieces in Saigon`).
- **Design decision**: Option (a) — canonical `humanizeValueExpr` output is acceptable for blockers without a wrapper. The canonical output is strictly more readable (e.g., full arithmetic rendering vs `expression`, descriptive aggregates vs `aggregate`).
- **Deviations**: None.
- **Verification**: 35/35 blocker-extractor tests pass, 507/507 tooltip tests pass, typecheck clean.
