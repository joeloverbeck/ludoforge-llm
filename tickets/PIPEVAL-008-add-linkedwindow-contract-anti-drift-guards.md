# PIPEVAL-008: Add linkedWindow contract anti-drift guards

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Test-only — architecture guardrails for shared contract usage
**Deps**: `tickets/PIPEVAL-007-canonicalize-linkedwindow-identifiers-across-kernel-and-cnl.md`

## Problem

The linked-window reference rule has historically drifted between validation surfaces. Even after unifying helper usage, there is no dedicated guard that prevents future re-introduction of local per-surface linked-window matching behavior in kernel or CNL.

Without explicit anti-drift tests, later edits can silently re-fragment the contract.

## Assumption Reassessment (2026-03-05)

1. Kernel and CNL currently import and use the shared linked-window helper.
2. Existing tests validate behavior outcomes but do not explicitly guard architecture ownership (shared contract as the single source of truth).
3. No active ticket in `tickets/*` currently covers anti-drift source-guard policy for linked-window contract ownership.

## Architecture Check

1. A source-guard test is a low-cost, high-leverage robustness measure that keeps ownership boundaries explicit.
2. The guard is game-agnostic and enforces module architecture, not game behavior.
3. No compatibility pathing: direct contract ownership enforcement only.

## What to Change

### 1. Add linked-window source guard test

Create a small lint/unit contract test that asserts:
- `src/kernel/validate-gamedef-extensions.ts` references `findMissingTurnFlowLinkedWindows` from `../contracts/index.js`.
- `src/cnl/cross-validate.ts` references the same helper from `../contracts/index.js`.
- No local ad-hoc `linkedWindows` missing-reference comparison loop exists outside the shared contract module.

### 2. Keep guard scoped to linked-window rule

Do not broaden into general import policy duplication; keep this as a targeted anti-drift guard for this contract.

## Files to Touch

- `packages/engine/test/unit/lint/linked-window-contract-source-guard.test.ts` (new)
- `packages/engine/test/unit/contracts/contracts-public-surface-import-policy.test.ts` (verify/no-op)

## Out of Scope

- Functional behavior changes in runtime/kernel/CNL
- New diagnostics or schema changes
- Broad architectural lint framework refactors

## Acceptance Criteria

### Tests That Must Pass

1. Guard test fails when kernel or CNL reintroduces local linked-window missing-reference logic.
2. Guard test passes with shared helper usage.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Shared contract remains the only ownership point for linked-window missing-reference matching semantics.
2. GameDef/simulation remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/linked-window-contract-source-guard.test.ts` — architecture anti-drift assertion for shared helper ownership.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/lint/linked-window-contract-source-guard.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`
