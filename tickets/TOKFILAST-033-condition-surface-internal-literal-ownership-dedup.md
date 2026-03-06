# TOKFILAST-033: Deduplicate Internal Condition-Surface Literal Ownership for Shared Suffixes

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — contract internal maintenance hardening
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-024-condition-surface-contract-taxonomy-normalization.md

## Problem

Family-scoped suffix ownership intentionally uses the same emitted literal (`if.when`) in both `valueExpr` and `effect` families. The duplicated inline literal is valid but still allows accidental divergence if one side is edited independently.

## Assumption Reassessment (2026-03-06)

1. `CONDITION_SURFACE_SUFFIX.valueExpr.ifWhen` and `.effect.ifWhen` currently repeat `'if.when'` inline.
2. Family-scoped API is intentional and should remain explicit; this ticket concerns internal literal ownership only.
3. No active ticket currently hardens shared-literal maintenance by centralizing internal literal declaration.

## Architecture Check

1. Centralizing shared literal constants internally reduces drift risk while preserving family-scoped public API clarity.
2. This is contract hygiene in agnostic infrastructure; no game-specific behavior is introduced.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Introduce internal shared literal constant(s)

Define a private internal constant (for example `const IF_WHEN_SUFFIX = 'if.when' as const`) and reuse it in family maps.

### 2. Keep public API unchanged

Retain family-scoped external shape and helper signatures; do not reintroduce generic/legacy surfaces.

## Files to Touch

- `packages/engine/src/contracts/condition-surface-contract.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify, if assertion updates are needed)

## Out of Scope

- Contract surface renaming.
- Validator callsite changes beyond what internal constant reuse requires.

## Acceptance Criteria

### Tests That Must Pass

1. Family-scoped `ifWhen` suffix values remain exactly `if.when`.
2. Contract continues to expose family-scoped APIs only.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Family-scoped condition-surface ownership remains explicit in public API.
2. `GameDef` and simulator/runtime remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — retain/adjust canonical family suffix assertions for `ifWhen`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

