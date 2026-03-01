# TOKFILT-004: Move token-filter prop contract helper to a neutral shared boundary

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — shared contract module placement/import boundary (`kernel` + `cnl` imports)
**Deps**: archive/tickets/TOKFILT-001-kernel-token-filter-prop-validation-parity.md

## Problem

`token-filter-prop-contract.ts` is currently placed under `packages/engine/src/kernel/` but is used by both compiler (`cnl`) and kernel. This blurs ownership boundaries and increases coupling to kernel namespace for cross-layer contract code.

## Assumption Reassessment (2026-03-01)

1. The shared token-filter prop helper is imported by both `compile-conditions.ts` and `validate-gamedef-behavior.ts`.
2. The helper contains generic contract logic (intrinsic prop set, allow-check, alternatives) and does not depend on runtime kernel state.
3. No active ticket currently tracks this module-boundary cleanup.

## Architecture Check

1. Moving cross-layer contract logic into a neutral shared location improves layering clarity and long-term maintainability.
2. Logic remains fully game-agnostic and contract-oriented.
3. No behavior compatibility shim is needed; this is a pure boundary/ownership cleanup.

## What to Change

### 1. Relocate shared helper to neutral module namespace

Move token-filter prop contract utility from `kernel/` into an engine-shared contract path (for example `packages/engine/src/contracts/` or other existing neutral namespace used in this repo).

### 2. Update imports and preserve behavior

Update compiler and kernel imports to the new shared module path without changing behavior or diagnostic output.

### 3. Add/adjust boundary documentation if needed

If repository conventions document module ownership boundaries, update the relevant doc to reflect the shared contract location.

## Files to Touch

- `packages/engine/src/kernel/token-filter-prop-contract.ts` (move/delete)
- `<new shared contract path>/token-filter-prop-contract.ts` (new)
- `packages/engine/src/cnl/compile-conditions.ts` (modify import)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify import)
- `docs/*` (modify only if module-boundary docs exist and require update)

## Out of Scope

- Token-filter contract behavior changes
- New token-filter features
- Runner/UI/`visual-config.yaml`

## Acceptance Criteria

### Tests That Must Pass

1. Compiler and kernel build/test results are unchanged after module relocation.
2. All token-filter prop diagnostics/alternatives remain identical.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Cross-layer contract logic resides in a neutral shared boundary, not kernel-specific namespace.
2. `GameDef` and simulator stay game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — run existing token-filter prop assertions to confirm unchanged behavior.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — run existing token-filter prop assertions to confirm unchanged behavior.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
3. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
