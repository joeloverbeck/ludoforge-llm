# ACTTOOLTIP-009: Enforce macro-origin annotation policy completeness against binder surfaces

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/cnl` policy/test guardrails
**Deps**: None

## Problem

Macro-origin annotation policy is now centralized, but tests do not yet enforce a complete relation between binder-declaring effect kinds and macro-origin annotation coverage. A binder-capable effect kind can be added and omitted from annotation policy without an explicit completeness failure.

## Assumption Reassessment (2026-02-27)

1. Binder-declaring effect kinds are derived from `EFFECT_BINDER_SURFACES` and exported as `DECLARED_BINDER_EFFECT_KINDS` — confirmed.
2. Macro-origin annotation policy kinds are currently listed in `MACRO_ORIGIN_NODE_BINDING_ANNOTATION_SPECS` with separate specialized handling for `reduce` and `removeByPriority` — confirmed.
3. Current tests verify policy entries and local parity, but do not assert full coverage relation between binder-declaring kinds and annotation policy membership — confirmed mismatch and corrected scope.

## Architecture Check

1. A derived completeness relation is cleaner than manual list maintenance because it fails immediately on policy drift.
2. This is compiler-policy validation only and stays fully game-agnostic (no GameSpecDoc/GameDef boundary changes).
3. No compatibility shims: strict failure when a binder-capable effect is unaccounted for.

## What to Change

### 1. Add coverage relation assertion

- Add a unit test that asserts:
  - `DECLARED_BINDER_EFFECT_KINDS`
  - equals `MACRO_ORIGIN_NODE_BINDING_ANNOTATION_SPECS.effectKind` union explicit specialized set (`reduce`, `removeByPriority`)

### 2. Document specialized exclusions in test intent

- Make the specialized set explicit in test code/messages so future contributors must consciously classify new binder kinds.

## Files to Touch

- `packages/engine/test/unit/binder-surface-registry.test.ts` (modify)

## Out of Scope

- Changing macro-origin runtime behavior
- Altering binder surface contracts
- Any runner/UI work

## Acceptance Criteria

### Tests That Must Pass

1. A newly added binder-declaring effect kind without classification (node policy vs specialized) fails the new completeness test.
2. Existing macro-origin annotation behavior remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Every binder-declaring effect kind is explicitly covered by macro-origin policy classification.
2. Guardrails remain engine-internal and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/binder-surface-registry.test.ts` — add derived completeness relation assertion and clear failure messaging for unclassified binder kinds.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint`
3. `pnpm turbo test`
