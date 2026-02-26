# ENGINEARCH-067: Harden scoped-var write-surface guard against re-export drift

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard robustness (tests only)
**Deps**: none

## Problem

The new scoped-var write-surface guard relies on source regex that catches `export const|function` for branch helpers, but it does not explicitly fail if those helpers are re-exported through export-list syntax (for example `export { writeScopedVarsToBranches }`). That leaves a real anti-drift gap in the canonical write-surface boundary.

## Assumption Reassessment (2026-02-26)

1. `packages/engine/test/unit/kernel/scoped-var-write-surface-guard.test.ts` currently blocks direct branch-helper export declarations and effect-module usage.
2. `packages/engine/src/kernel/scoped-var-runtime-access.ts` currently defines `writeScopedVarsToBranches` as a private helper and exports only `writeScopedVarsToState` as the runtime write entry point.
3. The guard does not currently assert against export-list re-exports or equivalent re-export forms.
4. **Mismatch + correction**: write-surface anti-drift checks must cover export-list and re-export-list forms that can expose branch helpers, not only direct declaration exports.

## Architecture Check

1. Guarding semantic export surface (not just one declaration style) is more robust and long-lived than brittle syntax-only checks.
2. This remains game-agnostic kernel contract enforcement and does not move any game-specific behavior into GameDef/runtime/simulator.
3. No backwards-compatibility aliases/shims are introduced; this work only strengthens anti-drift tests around canonical API boundaries.

## What to Change

### 1. Extend scoped write-surface guard for export-list and re-export-list forms

Update `scoped-var-write-surface-guard.test.ts` to fail if branch helpers appear in:
- local export lists (for example `export { writeScopedVarsToBranches }`)
- export lists with renames/default aliases (for example `export { writeScopedVarsToBranches as default }`)
- re-export lists (for example `export { writeScopedVarsToBranches } from './...'`)

### 2. Keep guard semantics explicit and maintainable

Use targeted assertions with clear failure messages so future architectural drift is easy to diagnose.

## Files to Touch

- `packages/engine/test/unit/kernel/scoped-var-write-surface-guard.test.ts` (modify)

## Out of Scope

- Runtime behavior changes in scoped write functions
- Scoped write numeric invariant hardening (covered by `ENGINEARCH-066`)
- GameSpecDoc/GameDef schema changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Guard fails if `writeScopedVarToBranches` or `writeScopedVarsToBranches` appear in any export/re-export form in `scoped-var-runtime-access.ts`.
2. Guard continues to fail when effect modules reference branch-level scoped write helpers or removed alias names.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped write architecture keeps one externally visible runtime write entry point (`writeScopedVarsToState`).
2. Architecture guard coverage is resilient to export syntax variations.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/scoped-var-write-surface-guard.test.ts` — broaden anti-drift coverage to include export-list/re-export paths for branch helpers.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/scoped-var-write-surface-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Corrected ticket assumptions/scope to match current code: `writeScopedVarsToBranches` is private, canonical export is `writeScopedVarsToState`, and export-list/re-export-list drift was the remaining guard gap.
  - Strengthened `scoped-var-write-surface-guard.test.ts` to fail when branch helper names appear in export lists or re-export lists.
- Deviations from original plan:
  - No deviations in implementation intent; only assumption wording was tightened to reflect current source reality before test edits.
- Verification:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/scoped-var-write-surface-guard.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (294/294).
  - `pnpm -F @ludoforge/engine lint` passed.
