# ENGINEARCH-155: Restore Action-Selector Diagnostic Rendering Boundary (Kernel Contract, CNL Rendering)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel/cnl ownership boundary refactor for selector diagnostics
**Deps**: archive/tickets/ENGINEARCH-154-domain-scoped-diagnostic-code-registries-and-typed-factories.md

## Problem

Action-selector diagnostics are now rendered in `packages/engine/src/kernel/action-selector-contract-registry.ts` with CNL-surface-specific messaging (`compileLowering` vs `crossValidate`). This couples kernel to compiler/validation presentation concerns and weakens clean layer ownership.

## Assumption Reassessment (2026-02-28)

1. `buildActionSelectorContractViolationDiagnostic` currently lives in kernel and returns fully rendered `Diagnostic` objects with CNL-specific message variants.
2. Compiler call sites (`compile-lowering.ts`, `cross-validate.ts`) now depend on kernel rendering behavior, not only kernel contract/violations.
3. Unit tests currently encode this coupling: `packages/engine/test/unit/kernel/action-selector-contract-registry.test.ts` asserts compile/xref message rendering via kernel factory.
4. Mismatch: kernel should own agnostic selector contract + typed code ownership, while CNL should own diagnostic rendering. Corrected scope is to move rendering to CNL and keep kernel contract-only.

## Scope Corrections (2026-02-28)

1. Kernel keeps contract evaluation and typed diagnostic code ownership (`ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES`, `getActionSelectorContract`, `evaluateActionSelectorContracts`).
2. Kernel exports must drop CNL surface/rendering types and helpers (`ActionSelectorDiagnosticSurface`, `BuildActionSelectorContractViolationDiagnosticInput`, `buildActionSelectorContractViolationDiagnostic`).
3. CNL introduces a dedicated renderer helper for selector-contract violations and becomes the only layer that branches by compile surface (`compileLowering` vs `crossValidate`).
4. Test ownership shifts accordingly: kernel tests validate contract/typed-code behavior only; CNL tests validate rendered diagnostics.

## Architecture Check

1. Keeping kernel contract-only (violations + typed code mapping) and moving rendered diagnostics to CNL is cleaner and more extensible than cross-layer message branching in kernel.
2. This preserves architecture boundaries: GameSpecDoc/CNL concerns stay in compiler layer; GameDef/kernel/simulator remain agnostic.
3. No compatibility shims/alias paths; call sites migrate directly to CNL-rendered helper(s).

## What to Change

### 1. Keep selector contract typing in kernel, remove surface rendering from kernel

Refactor kernel API to expose only typed violation data and canonical code ownership needed by callers.

### 2. Add CNL-owned action-selector diagnostic rendering helper

Create CNL helper module to render compile/cross-validate diagnostics from kernel violations and typed codes.

### 3. Migrate call sites and tests

Update `compile-lowering.ts` and `cross-validate.ts` to consume CNL helper; update tests to enforce boundary ownership and preserve message/code behavior.

## Files to Touch

- `packages/engine/src/kernel/action-selector-contract-registry.ts` (modify)
- `packages/engine/src/cnl/` (new helper module, modify call sites)
- `packages/engine/src/cnl/compile-lowering.ts` (modify)
- `packages/engine/src/cnl/cross-validate.ts` (modify)
- `packages/engine/test/unit/kernel/action-selector-contract-registry.test.ts` (modify)
- `packages/engine/test/unit/cnl/` (new helper test module)
- `packages/engine/test/unit/compile-actions.test.ts` (modify only if needed)
- `packages/engine/test/unit/cross-validate.test.ts` (modify only if needed)

## Out of Scope

- Game content changes (`data/games/**`).
- Visual presentation config changes (`**/visual-config.yaml`).
- Runtime/simulation behavior changes unrelated to diagnostic ownership boundaries.

## Acceptance Criteria

### Tests That Must Pass

1. Kernel no longer renders CNL surface diagnostics; CNL layer owns rendering.
2. Existing action-selector emitted codes/messages remain unchanged at compile/xref call sites.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Kernel contract remains game-agnostic and does not encode CNL-layer surface branching.
2. GameSpecDoc vs GameDef/runtime boundaries remain intact (no game-specific branching in kernel/runtime).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/action-selector-contract-registry.test.ts` — assert kernel exports contract/typed codes without CNL-rendering responsibilities.
2. `packages/engine/test/unit/cnl/action-selector-contract-diagnostics.test.ts` — assert CNL-owned rendering across compile/xref surfaces and null-on-unsupported-role behavior.
3. `packages/engine/test/unit/compile-actions.test.ts` — ensure compile path still emits canonical selector diagnostics.
4. `packages/engine/test/unit/cross-validate.test.ts` — ensure cross-validate path still emits canonical selector diagnostics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test "packages/engine/dist/test/unit/kernel/action-selector-contract-registry.test.js" "packages/engine/dist/test/unit/cnl/action-selector-contract-diagnostics.test.js" "packages/engine/dist/test/unit/compile-actions.test.js" "packages/engine/dist/test/unit/cross-validate.test.js"`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm run check:ticket-deps`

## Outcome

- **Completion Date**: 2026-02-28
- **What Changed**:
  - Removed CNL-surface diagnostic rendering from kernel by deleting `buildActionSelectorContractViolationDiagnostic` and related surface/rendering input types from `packages/engine/src/kernel/action-selector-contract-registry.ts`.
  - Added CNL-owned renderer at `packages/engine/src/cnl/action-selector-contract-diagnostics.ts`.
  - Migrated `packages/engine/src/cnl/compile-lowering.ts` and `packages/engine/src/cnl/cross-validate.ts` to use the CNL renderer while keeping kernel contract evaluation unchanged.
  - Updated kernel test ownership boundaries and added CNL renderer unit coverage.
- **Deviations from Original Plan**:
  - Added explicit standalone CNL renderer test file (`packages/engine/test/unit/cnl/action-selector-contract-diagnostics.test.ts`) rather than relying only on compile/cross-validate integration points.
  - Corrected focused test invocation from `--test-name-pattern` passthrough to explicit `node --test` dist file targets.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - Focused tests passed:
    - `node --test "packages/engine/dist/test/unit/kernel/action-selector-contract-registry.test.js" "packages/engine/dist/test/unit/cnl/action-selector-contract-diagnostics.test.js" "packages/engine/dist/test/unit/compile-actions.test.js" "packages/engine/dist/test/unit/cross-validate.test.js"`
  - `pnpm -F @ludoforge/engine test` passed (329/329).
  - `pnpm -F @ludoforge/engine lint` passed.
