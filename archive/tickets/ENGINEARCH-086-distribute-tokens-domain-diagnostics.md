# ENGINEARCH-086: Strict Domain Diagnostics for `distributeTokens` Token/Zone Queries

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL compile-time query-domain diagnostics for `distributeTokens`
**Deps**: specs/51-cross-game-primitive-elevation.md

## Problem

`distributeTokens` currently lowers `tokens` and `destinations` via `lowerQueryNode` and only validates cardinality (`n` / `min` / `max`). It does not enforce query result domains at compile time. Invalid query domains can compile and fail later at runtime (for example `tokenZone` resolution on non-token values, or `moveToken.to` zone resolution on non-zone values).

## Assumption Reassessment (2026-02-27)

1. Confirmed: `lowerDistributeTokensEffects` validates cardinality but does not validate `tokens`/`destinations` domains.
2. Corrected: `type-inference.ts` is value-expression type inference and does not provide query-domain inference for effect options.
3. Confirmed: runtime currently catches these domain errors late (`tokenRuntimeValidationFailed` / selector resolution failures), so compile-time diagnostics are the right layer.

## Updated Scope

1. Add compile-time query-domain validation inside `distributeTokens` lowering using lowered `OptionsQuery` shape (generic, query-kind driven).
2. Require `tokens` to be token-domain only.
3. Require `destinations` to be zone-domain only.
4. Treat mixed/unknown/non-token/non-zone domains as compile-time errors for `distributeTokens` (strict mode; no fallback/aliasing).
5. Keep runtime/kernel behavior unchanged.

## Architecture Check

1. Compile-time domain contracts are cleaner than deferred runtime failures and improve authoring determinism.
2. Validation remains generic and data-driven by query kinds (engine-agnostic).
3. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Validate `tokens` query domain

Require `distributeTokens.tokens` to lower to token-domain options; emit targeted diagnostics when token domain contract is not satisfied.

### 2. Validate `destinations` query domain

Require `distributeTokens.destinations` to lower to zone-domain options; emit targeted diagnostics when zone domain contract is not satisfied.

### 3. Improve diagnostic quality

Emit explicit diagnostic codes/messages for `distributeTokens` domain mismatches rather than generic missing-capability errors.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify/add)

## Out of Scope

- Runtime coercion/fallback behavior for malformed authored specs.
- Game-specific query exceptions.
- Broad cross-effect query-domain typing beyond `distributeTokens`.

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

1. `packages/engine/test/unit/compile-effects.test.ts` — invalid token-domain and zone-domain `distributeTokens` cases with expected diagnostic codes/paths.
2. `packages/engine/test/unit/compile-effects.test.ts` — valid token/zone domain case still lowers deterministically.
3. `packages/engine/test/unit/compile-effects.test.ts` — cardinality validation still behaves as before with valid domains.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- --coverage=false`
2. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-02-27
- **What actually changed**:
  - Added strict compile-time domain validation for `distributeTokens` in `packages/engine/src/cnl/compile-effects.ts`.
  - `tokens` now requires token-domain query output; `destinations` now requires zone-domain query output.
  - Added targeted diagnostics:
    - `CNL_COMPILER_DISTRIBUTE_TOKENS_TOKEN_DOMAIN_INVALID`
    - `CNL_COMPILER_DISTRIBUTE_TOKENS_DESTINATION_DOMAIN_INVALID`
  - Added/updated unit coverage in `packages/engine/test/unit/compile-effects.test.ts`:
    - domain mismatch rejections for `tokens` and `destinations`
    - strict mixed-domain rejection (concat token+zone)
    - cardinality test updated to use valid token domain so it isolates cardinality behavior.
- **Deviations from original plan**:
  - No `type-inference.ts` changes were needed; query-domain contracts were implemented directly from lowered `OptionsQuery` kinds in `compile-effects.ts`.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test:unit -- --coverage=false` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine test` passed.
