# ENGINEARCH-027: Restrict Selector-Cardinality Builder Helpers to Internal Kernel Surface

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel API surface tightening + import boundary updates + API-shape tests
**Deps**: ENGINEARCH-021

## Problem

Selector-cardinality builder helpers are currently exported on the shared eval-error module surface. These are internal construction primitives, and exposing them publicly expands API surface unnecessarily, increasing long-term coupling and migration cost.

## Assumption Reassessment (2026-02-25)

1. Builder helpers were added in `packages/engine/src/kernel/eval-error.ts` and are currently exported from that module.
2. `packages/engine/src/kernel/index.ts` and `packages/engine/src/kernel/runtime.ts` export `./eval-error.js`, so helper exports currently leak through public kernel/runtime entrypoints.
3. Existing active tickets (`ENGINEARCH-022`, `ENGINEARCH-023`, `ENGINEARCH-024`, `ENGINEARCH-025`, `ENGINEARCH-026`) do not target public API surface reduction for these helpers.

## Architecture Check

1. Keeping construction helpers internal is cleaner and more extensible than publishing low-level assembly APIs as public contracts.
2. This is infrastructure-boundary hardening and does not add game-specific logic to `GameDef`/simulation/runtime.
3. No backwards-compatibility aliases/shims are introduced; the public surface is intentionally tightened.

## What to Change

### 1. Move selector-cardinality builder helpers to an internal-only module

Relocate helpers to a kernel-internal file (or non-exported section) and ensure only internal resolver code imports them.

### 2. Keep public eval-error surface focused on stable error APIs

`eval-error` public exports should preserve error constructors, guards, and context types while excluding helper construction primitives.

### 3. Add API boundary guardrails

Add/extend tests that fail if these internal helpers reappear in public runtime/kernel barrel exports.

## Files to Touch

- `packages/engine/src/kernel/eval-error.ts` (modify)
- `packages/engine/src/kernel/resolve-selectors.ts` (modify)
- `packages/engine/src/kernel/index.ts` (modify, if needed)
- `packages/engine/src/kernel/runtime.ts` (modify, if needed)
- `packages/engine/test/unit/game-loop-api-shape.test.ts` (modify)
- `packages/engine/test/unit/smoke.test.ts` (modify)

## Out of Scope

- Selector semantics changes
- Defer-class taxonomy changes
- GameSpecDoc or visual-config schema changes

## Acceptance Criteria

### Tests That Must Pass

1. Selector-cardinality builder helpers are not available via public kernel/runtime API entrypoints.
2. Internal selector resolution continues to construct identical selector-cardinality contexts.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Public API remains minimal and stable; low-level construction details stay internal.
2. `GameDef` and simulation/runtime remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/game-loop-api-shape.test.ts` — add explicit negative assertions that selector-cardinality builder helpers are absent from kernel public API exports.
2. `packages/engine/test/unit/smoke.test.ts` — keep module-surface smoke checks aligned with tightened kernel export boundaries.
3. `packages/engine/test/unit/resolve-selectors.test.ts` — keep/verify selector-cardinality emitted context parity after internalization.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine test:unit`
