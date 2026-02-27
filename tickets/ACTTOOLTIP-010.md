# ACTTOOLTIP-010: Strengthen type-level contracts for macro-origin annotation policy fields

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/cnl/binder-surface-registry.ts` typing and policy contracts
**Deps**: None

## Problem

Macro-origin policy registries use free-form string fields (`bindFields`, `macroOriginField`). This leaves room for typos or stale field names that are only caught at runtime/tests rather than compile time.

## Assumption Reassessment (2026-02-27)

1. `MACRO_ORIGIN_NODE_BINDING_ANNOTATION_SPECS` and `REDUCE_MACRO_ORIGIN_BINDING_ANNOTATION_SPECS` currently use `string` field types — confirmed.
2. `expand-effect-macros.ts` consumes these registries as authoritative annotation dispatch inputs — confirmed.
3. Current tests detect many drifts but do not provide compile-time exhaustiveness for field-name correctness — confirmed mismatch and corrected scope.

## Architecture Check

1. Narrow literal unions for policy fields improve robustness by turning field drift into compile-time errors.
2. This is purely engine/compiler contract typing and remains game-agnostic.
3. No compatibility aliases: policy contracts become stricter, and invalid entries fail fast.

## What to Change

### 1. Replace free-form policy field strings with strict literal unions

- Introduce type-level unions for:
  - node-level bind fields eligible for macro-origin annotation
  - reduce bind fields and corresponding reduce macro-origin output fields
- Use these unions in `MacroOriginNodeBindingAnnotationSpec` and `ReduceMacroOriginBindingAnnotationSpec`.

### 2. Keep policy registry declarations `as const` + `satisfies`

- Preserve strongly typed literal arrays and compile-time checking for every policy entry.

## Files to Touch

- `packages/engine/src/cnl/binder-surface-registry.ts` (modify)
- `packages/engine/test/unit/binder-surface-registry.test.ts` (modify if needed for updated types/imports)

## Out of Scope

- Semantics changes to macro-origin annotation
- Changes to AST/runtime payload shapes
- Game data (`GameSpecDoc`, `visual-config.yaml`) content changes

## Acceptance Criteria

### Tests That Must Pass

1. Mis-typed policy field names fail at compile time in `binder-surface-registry.ts`.
2. Existing macro-origin behavior tests remain green.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Macro-origin policy registries are no longer free-form string contracts.
2. GameDef/simulation remain game-agnostic and unchanged in behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/binder-surface-registry.test.ts` — adjust only if needed to align with stricter exported types; keep behavior assertions unchanged.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint`
