# TOKFILAST-024: Normalize Condition-Surface Contract Taxonomy for Extensibility

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — contract API shape cleanup (no behavior change)
**Deps**: tickets/TOKFILAST-023-condition-surface-contract-guardrail-policy.md

## Problem

The condition-surface contract currently encodes distinct semantic surfaces that share identical suffix strings (for example two separate `if.when` keys). This is valid but increases API ambiguity and makes future contract growth harder to reason about.

## Assumption Reassessment (2026-03-06)

1. `CONDITION_SURFACE_SUFFIX` currently includes multiple semantically distinct entries that map to identical string values.
2. Existing callsites rely on string output only; no runtime behavior depends on specific constant key names.
3. No active ticket currently scopes a taxonomy/API cleanup for this contract.

## Architecture Check

1. A normalized taxonomy (for example grouped surface namespaces or canonical shared suffix constants with semantic wrappers) is cleaner and easier to extend safely.
2. This is pure contract-API hygiene in agnostic engine infrastructure; no game-specific branching is introduced.
3. No backwards-compatibility aliases/shims are introduced; callers are migrated directly.

## What to Change

### 1. Normalize condition-surface suffix taxonomy

Refactor contract exports so semantic ownership is explicit while avoiding duplicated literal keys.

### 2. Migrate callsites/tests to normalized API

Update validator and test callsites to the normalized contract API shape.

### 3. Preserve exact diagnostic path outputs

Ensure emitted path strings remain unchanged from current behavior.

## Files to Touch

- `packages/engine/src/contracts/condition-surface-contract.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify, if callsite API changes)
- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify, if callsite API changes)
- `packages/engine/src/kernel/validate-gamedef-core.ts` (modify, if callsite API changes)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- New validator/runtime semantics.
- Any game-specific logic additions.

## Acceptance Criteria

### Tests That Must Pass

1. Contract API no longer relies on ambiguous duplicated semantic keys.
2. Diagnostic path strings for all existing covered condition surfaces remain exactly stable.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Condition-surface path ownership remains centralized and explicit.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — retain/extend condition-surface path assertions to confirm no path-output drift through contract normalization.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

