# ENGINEARCH-086: Strict Domain Diagnostics for `distributeTokens` Token/Zone Queries

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL/type-inference diagnostics for effect query-domain contracts
**Deps**: specs/51-cross-game-primitive-elevation.md

## Problem

`distributeTokens` currently accepts any query shape for `tokens` and `destinations` during lowering. Invalid domain combinations can compile and fail later at runtime (for example non-token item selected as token, or destination set not zone-resolvable), reducing authoring reliability.

## Assumption Reassessment (2026-02-27)

1. `distributeTokens` lowering currently validates cardinality but not query result domain semantics.
2. Compiler already carries type-inference/query metadata pathways used by other diagnostics.
3. Mismatch: invalid distribution domains are not rejected early; corrected scope is compile-time domain validation with specific diagnostics.

## Architecture Check

1. Compile-time domain contracts are cleaner than deferred runtime failures and improve spec authoring determinism.
2. Validation remains generic and data-driven (query result kinds), with no FITL/game-specific branches in runtime.
3. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Validate `tokens` query domain

Require `distributeTokens.tokens` to lower to token-valued options and emit targeted diagnostics when not token domain.

### 2. Validate `destinations` query domain

Require `distributeTokens.destinations` to lower to zone-valued options (or binding templates that deterministically resolve to zones for `moveToken.to`).

### 3. Improve diagnostic quality

Emit explicit diagnostic codes/messages for domain mismatches rather than generic missing-capability errors.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/cnl/type-inference.ts` (modify if needed)
- `packages/engine/test/unit/compile-effects.test.ts` (modify/add)

## Out of Scope

- New runtime coercion/fallback behavior for malformed authored specs.
- Game-specific query exceptions.

## Acceptance Criteria

### Tests That Must Pass

1. Invalid `tokens` query domains are compile-time errors with targeted diagnostics.
2. Invalid `destinations` query domains are compile-time errors with targeted diagnostics.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Query-domain contracts are enforced at compile time for deterministic authoring.
2. GameDef/runtime stays game-agnostic and free of game-specific domain hacks.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — invalid token-domain and zone-domain `distributeTokens` cases with expected diagnostics.
2. `packages/engine/test/unit/compile-effects.test.ts` — valid domain case remains accepted and deterministic.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- --coverage=false`
2. `pnpm -F @ludoforge/engine test`
