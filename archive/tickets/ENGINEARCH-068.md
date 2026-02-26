# ENGINEARCH-068: Tighten scoped-var runtime-access public API/type surface

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel scoped-var API surface + architecture contract tests
**Deps**: none

## Problem

After the scoped write-surface narrowing, `scoped-var-runtime-access.ts` still exports internal branch-shape type `ScopedVarStateBranches`. This leaks implementation detail from the staging layer and weakens the intended single-write-surface boundary. The current guard verifies helper export usage patterns, but does not assert an explicit module-level public export contract.

## Assumption Reassessment (2026-02-26)

1. `writeScopedVarsToBranches` is module-private and effect modules write through `writeScopedVarsToState`.
2. `writeScopedVarToBranches` is already removed (it does not exist in current source) and should remain absent.
3. `ScopedVarStateBranches` remains exported despite no current external usage.
4. Existing guard tests assert canonical helper usage and branch-helper privacy, but do not enforce a full module export contract for `scoped-var-runtime-access.ts`.
5. **Mismatch + correction**: internal branch staging types should be private unless they are intentional external contracts, and public surface should be guarded explicitly with a stable allowlist.

## Architecture Check

1. Keeping internal staging types private reduces accidental coupling and improves long-term extensibility of the kernel module.
2. Explicit public export-contract tests provide stronger architectural guarantees than indirect source-shape checks.
3. This remains game-agnostic kernel architecture hardening; no game-specific behavior enters GameDef/runtime/simulator and no compatibility aliases are introduced.

## What to Change

### 1. Remove internal branch-shape type export

Make `ScopedVarStateBranches` module-private in `scoped-var-runtime-access.ts` unless a concrete external contract requires it.

### 2. Add scoped-var module export contract guard

Add a guard test that enforces intended public exports for `scoped-var-runtime-access.ts` (allowlist) and fails on reintroduction of internal branch-surface exports.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/test/unit/kernel/` (new or modify guard test)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify only if imports/type assertions require updates)

## Out of Scope

- Runtime semantics of scoped variable reads/writes
- Selector normalization policy work (covered by `ENGINEARCH-064`/`ENGINEARCH-065`)
- Zone numeric invariant enforcement (covered by `ENGINEARCH-066`)
- GameSpecDoc/GameDef schema changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. `ScopedVarStateBranches` is no longer publicly exported unless explicitly justified and contract-tested.
2. Guard fails if internal branch-surface exports reappear in `scoped-var-runtime-access.ts`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped var mutation API remains centered on canonical state-level writer entry.
2. Kernel module public surface excludes internal staging implementation details.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/scoped-var-write-surface-guard.test.ts` (or sibling guard) — enforce module export allowlist for scoped-var runtime-access public API and block internal branch/staging exports.
2. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — adjust only if type-level/public-surface assertions need alignment.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/scoped-var-write-surface-guard.test.js packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Made `ScopedVarStateBranches` module-private in `scoped-var-runtime-access.ts`.
  - Expanded `scoped-var-write-surface-guard.test.ts` with a strict export allowlist for `scoped-var-runtime-access.ts`.
  - Corrected this ticket's assumptions to reflect that `writeScopedVarToBranches` is already removed.
- Deviations from original plan:
  - The implementation did not add a separate sibling guard file; it strengthened the existing guard test file to keep the architecture contract centralized.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/scoped-var-write-surface-guard.test.js packages/engine/dist/test/unit/scoped-var-runtime-access.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
