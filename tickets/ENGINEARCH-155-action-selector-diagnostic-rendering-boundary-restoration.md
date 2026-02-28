# ENGINEARCH-155: Restore Action-Selector Diagnostic Rendering Boundary (Kernel Contract, CNL Rendering)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel/cnl ownership boundary refactor for selector diagnostics
**Deps**: archive/tickets/ENGINEARCH-154-domain-scoped-diagnostic-code-registries-and-typed-factories.md

## Problem

Action-selector diagnostics are now rendered in `packages/engine/src/kernel/action-selector-contract-registry.ts` with CNL-surface-specific messaging (`compileLowering` vs `crossValidate`). This couples kernel to compiler/validation presentation concerns and weakens clean layer ownership.

## Assumption Reassessment (2026-02-28)

1. `buildActionSelectorContractViolationDiagnostic` currently lives in kernel and returns fully rendered `Diagnostic` objects with CNL-specific message variants.
2. Compiler call sites (`compile-lowering.ts`, `cross-validate.ts`) now depend on kernel rendering behavior, not only kernel contract/violations.
3. Mismatch: kernel should own agnostic selector contract + typed code ownership, while CNL should own diagnostic rendering. Corrected scope is to move rendering to CNL and keep kernel contract-only.

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
2. `packages/engine/test/unit/compile-actions.test.ts` — ensure compile path still emits canonical selector diagnostics.
3. `packages/engine/test/unit/cross-validate.test.ts` — ensure cross-validate path still emits canonical selector diagnostics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern="action selector|crossValidate|compile actions"`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm run check:ticket-deps`
