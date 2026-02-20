# VISFIX-007: Runner Layout Guardrail — Root-Chain Screen Sizing

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: VISFIX-001 (completed)

## Problem

Runner top-level screens have historically mixed viewport-unit sizing (`100vw`/`100vh`) with document/root sizing. This creates fragile overflow behavior, especially on mobile/dynamic browser UI, and causes repeated regressions in visual shell layout.

We need one explicit architecture rule for shell-level sizing: root-chain `%` sizing for top-level screens, with no viewport-unit sizing at the shell boundary.

## Assumption Reassessment (2026-02-20)

1. `packages/runner/src/ui/tokens.css` now provides the root chain (`html, body, #root`) reset and sizing contract.
2. `GameContainer.module.css` and `ReplayScreen.module.css` were recently migrated to `%`-based top-level sizing.
3. The remaining risk is architectural drift: new or edited top-level screen CSS can reintroduce `100vw`/`100vh` unless we add explicit guardrails/tests.

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
2. known top-level screen CSS modules do not use `100vw`/`100vh` for shell sizing
3. top-level screen containers use `%`/root-chain-compatible sizing

### 3. Sweep top-level screen modules for compliance

Review and update any remaining top-level screen shell modules that still use viewport units for base container sizing.

## Files to Touch

- `packages/runner/src/ui/tokens.css` (modify if needed)
- `packages/runner/src/ui/*.module.css` for top-level screens (modify as needed)
- `packages/runner/test/ui/tokens.test.ts` (modify)
- `packages/runner/src/bootstrap/README.md` or closest runner UI architecture note (modify; choose canonical location)

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

1. `packages/runner/test/ui/tokens.test.ts` — expand into a persistent shell-layout contract test suite guarding root reset and top-level screen sizing invariants.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`
