# TOKFILT-004: Move token-filter prop contract helper to a neutral shared boundary

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — shared contract module placement/import boundary (`kernel` + `cnl` imports)
**Deps**: archive/tickets/TOKFILT-001-kernel-token-filter-prop-validation-parity.md

## Problem

`token-filter-prop-contract.ts` is currently placed under `packages/engine/src/kernel/` but is used by both compiler (`cnl`) and kernel. This blurs ownership boundaries and increases coupling to kernel namespace for cross-layer contract code.

## Assumption Reassessment (2026-03-01)

1. The shared token-filter prop helper is imported by both `compile-conditions.ts` and `validate-gamedef-behavior.ts`.
2. The helper contains generic contract logic (intrinsic prop set, allow-check, alternatives) and does not depend on runtime kernel state.
3. There is currently no neutral shared module namespace under `packages/engine/src/`; this ticket must introduce one explicitly.
4. Current unit coverage for touched consumers exists in:
   - `packages/engine/test/unit/compile-conditions.test.ts`
   - `packages/engine/test/unit/validate-gamedef.test.ts`
   - `packages/engine/test/unit/validate-gamedef-input.test.ts`
   - `packages/engine/test/unit/validate-gamedef.golden.test.ts`
5. No active module-boundary documentation file was found that requires an update for this move.
6. `packages/engine/test/unit/validate-gamedef.golden.test.ts` currently reads fixtures via `process.cwd()` and is brittle when invoked as a direct `node --test dist/...` command from repository root.

## Architecture Check

1. Moving cross-layer contract logic into a neutral shared location improves layering clarity and long-term maintainability.
2. Logic remains fully game-agnostic and contract-oriented.
3. No behavior compatibility shim is needed; this is a pure boundary/ownership cleanup.
4. No backwards-compatibility alias/re-export should be introduced at the old kernel path. Broken imports should be fixed at call sites.

## What to Change

### 1. Relocate shared helper to neutral module namespace

Move token-filter prop contract utility from `kernel/` into `packages/engine/src/contracts/token-filter-prop-contract.ts`.

### 2. Update imports and preserve behavior

Update compiler and kernel imports to the new shared module path without changing behavior or diagnostic output.

### 3. Add/adjust boundary documentation if needed

No documentation update is required unless a module-boundary conventions doc is added/identified during implementation.

### 4. Stabilize targeted golden-test invocation path

Harden `validate-gamedef.golden.test.ts` fixture loading so direct file-path `node --test` invocations are cwd-independent and match the repository's targeted-test command guidance.

## Files to Touch

- `packages/engine/src/kernel/token-filter-prop-contract.ts` (move/delete)
- `packages/engine/src/contracts/token-filter-prop-contract.ts` (new)
- `packages/engine/src/cnl/compile-conditions.ts` (modify import)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify import)
- `packages/engine/test/unit/token-filter-prop-contract.test.ts` (new)
- `packages/engine/test/unit/validate-gamedef.golden.test.ts` (modify fixture loading for command-shape robustness)
- `docs/*` (optional; only if a relevant module-boundary doc is identified)

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

1. `packages/engine/test/unit/token-filter-prop-contract.test.ts` — add direct contract coverage for intrinsic/declared prop checks and deterministic alternatives.
2. `packages/engine/test/unit/compile-conditions.test.ts` — run existing token-filter prop assertions to confirm unchanged compiler behavior.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — run existing token-filter prop assertions to confirm unchanged validator behavior.
4. `packages/engine/test/unit/validate-gamedef-input.test.ts` — run existing validator input-matrix coverage for regression safety.
5. `packages/engine/test/unit/validate-gamedef.golden.test.ts` — run existing validator golden-output coverage for diagnostic stability.
6. `packages/engine/test/unit/validate-gamedef.golden.test.ts` (loader hardening) — ensure targeted invocation works from both package and repo-root working directories.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/token-filter-prop-contract.test.js`
3. `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
4. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
5. `node --test packages/engine/dist/test/unit/validate-gamedef-input.test.js`
6. `node --test packages/engine/dist/test/unit/validate-gamedef.golden.test.js`
7. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-01
- **What Changed**:
  - Moved token-filter prop contract helper from `packages/engine/src/kernel/token-filter-prop-contract.ts` to `packages/engine/src/contracts/token-filter-prop-contract.ts`.
  - Updated imports in:
    - `packages/engine/src/cnl/compile-conditions.ts`
    - `packages/engine/src/kernel/validate-gamedef-behavior.ts`
  - Removed the old kernel-path helper without a compatibility alias/re-export.
  - Added `packages/engine/test/unit/token-filter-prop-contract.test.ts` for direct, deterministic contract coverage.
  - Hardened `packages/engine/test/unit/validate-gamedef.golden.test.ts` fixture loading to be cwd-independent for direct `node --test` invocation.
- **Deviations From Original Plan**:
  - Expanded scope to include golden-test loader hardening after discovering command-shape brittleness during verification.
  - No module-boundary documentation update was needed because no relevant boundary doc exists.
- **Verification Results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/token-filter-prop-contract.test.js` ✅
  - `node --test packages/engine/dist/test/unit/compile-conditions.test.js` ✅
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js` ✅
  - `node --test packages/engine/dist/test/unit/validate-gamedef-input.test.js` ✅
  - `node --test packages/engine/dist/test/unit/validate-gamedef.golden.test.js` ✅
  - `pnpm turbo test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
  - `pnpm run check:ticket-deps` ✅
