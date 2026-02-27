# ACTTOOLTIP-008: Type-safe macro-origin annotation registry for bind-bearing effects

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/cnl/expand-effect-macros.ts`, binder-surface integration, tests
**Deps**: ACTTOOLTIP-007

## Problem

Macro-origin annotation dispatch in `expand-effect-macros.ts` still relies on local string-key tables (`BINDING_ORIGIN_EFFECT_SPECS`, `EVALUATE_SUBSET_BIND_FIELDS`, `REDUCE_BIND_ORIGIN_FIELDS`). Binder surface metadata is centralized, but annotation policy is not yet centralized and type-checked against that contract. This can desynchronize annotation behavior from canonical binder definitions when effect surfaces evolve.

## Assumption Reassessment (2026-02-27)

1. `expand-effect-macros.ts` currently dispatches annotation through string effect keys and string bind-field names — confirmed.
2. Binder metadata is already centralized in binder surface contracts/registry (`binder-surface-contract.ts`, `binder-surface-registry.ts`) — confirmed.
3. Binder-surface registry already has strong drift tests (`binder-surface-registry.test.ts`) for binder-capable effect coverage — confirmed discrepancy with prior scope.
4. `expand-effect-macros.test.ts` already covers many bind-bearing variants (`bindValue`, `chooseN`, `rollRandom`, `transferVar`, `evaluateSubset`, `removeByPriority`) — confirmed discrepancy with prior "missing coverage" framing.
5. There is still no centralized typed macro-origin annotation policy registry validated against binder-surface contracts — confirmed gap.

## Architecture Check

1. Driving annotation from a centralized typed policy registry validated against binder-surface contracts is cleaner and more extensible than local ad hoc string tables.
2. This is engine-internal compiler architecture, fully game-agnostic; no game-specific data paths are introduced.
3. No backwards-compatibility layers: remove ad hoc annotation-key tables in `expand-effect-macros.ts` in favor of contract-backed dispatch.

## What to Change

### 1. Replace ad hoc annotation tables with centralized typed annotation policy

- Introduce a macro-origin annotation policy registry in binder-surface infrastructure (`binder-surface-registry.ts`) typed by `SupportedEffectKind`.
- Encode:
  - node-level annotation bind fields (for `forEach`, `let`, `bindValue`, `chooseOne`, `chooseN`, `rollRandom`, `transferVar`)
  - `evaluateSubset` bind fields (node-level, multi-field)
  - `reduce` bind-field to macro-origin field mapping (`itemBind` -> `itemMacroOrigin`, etc.)
  - explicit `removeByPriority` handling metadata (group bind path + parent resolution stays specialized in expander logic)
- `expand-effect-macros.ts` must consume this registry and delete local string-table duplicates.

### 2. Add coverage that enforces annotation-policy completeness

- Add/extend unit tests to assert macro-origin annotation policy coverage stays synchronized with binder-surface contracts.
- Keep `removeByPriority`/`reduce` specialized semantics explicit, but test that their policy entries are still anchored to canonical bind fields.

## Files to Touch

- `packages/engine/src/cnl/expand-effect-macros.ts` (modify)
- `packages/engine/src/cnl/binder-surface-registry.ts` (modify)
- `packages/engine/test/unit/expand-effect-macros.test.ts` (modify)
- `packages/engine/test/unit/binder-surface-registry.test.ts` (modify)

## Out of Scope

- provenance semantics redesign for specific effects (covered separately, e.g. ACTTOOLTIP-007)
- runtime execution semantics changes
- runner/UI behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Annotation policy completeness test fails when macro-origin-annotated bind fields drift from binder-surface contracts.
2. Existing macro-origin annotation behavior remains correct for current effect inventory.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Macro-origin annotation policy is centralized and synchronized with binder-surface contracts by construction and tests.
2. Annotation logic remains generic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/binder-surface-registry.test.ts` — add assertions for centralized macro-origin annotation policy shape and contract parity.
2. `packages/engine/test/unit/expand-effect-macros.test.ts` — keep regression coverage for node-level and specialized (`reduce`/`removeByPriority`/`evaluateSubset`) annotation behavior while routing through policy registry.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint`
4. `pnpm turbo test`

## Outcome

- **Completion date**: 2026-02-27
- **What actually changed**:
  - Reassessed assumptions and narrowed scope to the real architectural gap: macro-origin annotation policy drift, not binder-surface registry coverage (already present).
  - Added centralized macro-origin annotation policy exports in `binder-surface-registry.ts`:
    - `MACRO_ORIGIN_NODE_BINDING_ANNOTATION_SPECS`
    - `REDUCE_MACRO_ORIGIN_BINDING_ANNOTATION_SPECS`
    - `REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS`
  - Removed local ad hoc annotation tables from `expand-effect-macros.ts` and routed annotation logic through the centralized registry exports.
  - Added binder-surface registry tests that enforce macro-origin policy parity with declared binder paths.
- **Deviations from original plan**:
  - Did not modify `binder-surface-contract.ts`; existing contract was sufficient.
  - No additional `expand-effect-macros.test.ts` cases were needed because coverage for bind-bearing variants already existed and remained green.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo test` passed.
