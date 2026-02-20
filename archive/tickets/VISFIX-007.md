# VISFIX-007: Runner Layout Guardrail — Root-Chain Screen Sizing

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: VISFIX-001 (completed)

## Problem

Runner top-level screens have historically mixed viewport-unit sizing (`100vw`/`100vh`) with document/root sizing. This creates fragile overflow behavior, especially on mobile/dynamic browser UI, and causes repeated regressions in visual shell layout.

We need one explicit architecture rule for shell-level sizing: root-chain `%` sizing for top-level screens, with no viewport-unit sizing at the shell boundary.

## Assumption Reassessment (2026-02-20)

1. `packages/runner/src/ui/tokens.css` now provides the root chain (`html, body, #root`) reset and sizing contract.
2. `GameContainer.module.css` and `ReplayScreen.module.css` are already migrated to `%`-based top-level sizing and currently avoid `100vw`/`100vh`.
3. Discrepancy: `GameSelectionScreen.module.css` and `PreGameConfigScreen.module.css` are also top-level screens in the App route graph but are not currently included in the shell sizing guardrail tests.
4. Existing `100vw` usage in dialog/panel modules (`Save/Load dialogs`, `TerminalOverlay`, `WarningsToast`, `PlayerHandPanel`) is component-level responsive behavior and is in-scope to keep, because this ticket targets shell boundaries only.
5. The remaining risk is architectural drift: new or edited top-level screen CSS can reintroduce viewport-unit shell sizing unless we enforce a broader contract test over all top-level screens.

## Architecture Check

1. Standardizing top-level shell sizing on root-chain `%` is cleaner and more robust than ad hoc viewport-unit usage.
2. This is simulator-shell architecture only; it does not encode game-specific behavior and keeps GameDef/runtime fully game-agnostic.
3. No backward-compatibility shims or alias paths: define one canonical layout contract and enforce it.

## What to Change

### 1. Codify shell sizing contract in runner UI docs/comments

Add a short architecture note in runner UI layout docs (or nearest existing UI architecture file) that top-level screens must use root-chain `%` sizing, not `100vw`/`100vh`.

### 2. Add/strengthen regression tests for shell-level CSS

Extend CSS contract tests to enforce:
1. root chain reset exists in `tokens.css`
2. all top-level screen CSS modules (`GameContainer`, `ReplayScreen`, `GameSelectionScreen`, `PreGameConfigScreen`) do not use shell-level `100vw`/`100vh`
3. top-level screen containers use `%`/root-chain-compatible sizing (`min-height: 100%` for screen roots)

### 3. Sweep top-level screen modules for compliance

Review and update top-level screen shell modules so every screen root uses root-chain-compatible sizing.

## Files to Touch

- `packages/runner/src/ui/tokens.css` (modify if needed)
- `packages/runner/src/ui/GameContainer.module.css` (verify/no-op or modify if needed)
- `packages/runner/src/ui/ReplayScreen.module.css` (verify/no-op or modify if needed)
- `packages/runner/src/ui/GameSelectionScreen.module.css` (modify as needed)
- `packages/runner/src/ui/PreGameConfigScreen.module.css` (modify as needed)
- `packages/runner/test/ui/tokens.test.ts` (modify)
- `packages/runner/src/ui/README.md` (add canonical shell layout contract note)

## Out of Scope

- Rewriting internal panel/component-level responsive rules
- Introducing CSS frameworks/reset libraries
- Engine/kernel/GameSpecDoc/GameDef changes

## Acceptance Criteria

### Tests That Must Pass

1. Top-level runner screens render without unintended viewport overflow from shell sizing.
2. CSS contract tests fail if shell-level `100vw`/`100vh` is reintroduced.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. One canonical shell sizing strategy: root-chain `%` sizing for top-level screens.
2. Runner layout architecture remains game-agnostic and independent from GameSpecDoc content.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/tokens.test.ts` — expand into a persistent shell-layout contract suite guarding root reset and all top-level screen sizing invariants.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-20
- What changed:
  - Added explicit shell root sizing on uncovered top-level screens:
    - `packages/runner/src/ui/GameSelectionScreen.module.css` (`.screen` now includes `min-height: 100%`)
    - `packages/runner/src/ui/PreGameConfigScreen.module.css` (`.screen` now includes `min-height: 100%`)
  - Strengthened shell-layout guardrail tests in `packages/runner/test/ui/tokens.test.ts` to enforce root-chain constraints across all top-level screen modules (`GameContainer`, `ReplayScreen`, `GameSelectionScreen`, `PreGameConfigScreen`) and reject `100vw`/`100vh`.
  - Added canonical UI shell contract note: `packages/runner/src/ui/README.md`.
- Deviations vs original plan:
  - `packages/runner/src/bootstrap/README.md` was not used as the architecture note location; canonicalized this rule in `packages/runner/src/ui/README.md` instead because the concern is UI shell layout, not bootstrap registry behavior.
  - `packages/runner/src/ui/tokens.css` did not require changes because the root-chain contract was already correct.
- Verification:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
