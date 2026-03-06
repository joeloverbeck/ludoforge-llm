# LEGACTTOO-014: Normalizer — Dispatch Map & getEffectKey Cleanup

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — `tooltip-normalizer.ts` (refactor, no new exports)
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-004-core-normalizer-variable-token-marker-rules.md, tickets/LEGACTTOO-005-compound-normalizer-control-flow-macros-stages.md

## Problem

The normalizer's `normalizeEffect` entry point uses an 18-line if-chain for dispatch and relies on `Object.keys(effect)[0]` (via `getEffectKey`) for the scaffolding check and unhandled fallback. As LEGACTTOO-005 adds ~10 more compound handlers, this if-chain becomes harder to maintain and review.

The `Object.keys(effect)[0]` pattern works because `EffectAST` members have exactly one key (enforced by `.strict()` schemas), but this is an implicit contract — nothing in the type system guarantees single-key objects.

## Assumption Reassessment (2026-03-06)

1. `EffectAST` is a discriminated union with ~30 members, each having exactly one key by schema `.strict()` enforcement.
2. LEGACTTOO-005 will add handlers for `chooseOne`, `chooseN`, `forEach`, `if`, `rollRandom`, `removeByPriority`, `repeat`, `reduce`, `grantFreeOperation`, `gotoPhaseExact`, `advancePhase`, `pushInterruptPhase`, `popInterruptPhase` — approximately 13 new handlers.
3. The `Extract<EffectAST, Record<K, unknown>>` type alias (`EffectOf<K>`) introduced in LEGACTTOO-004 already provides the per-handler typing foundation.
4. `isScaffoldingEffect` from `tooltip-suppression.ts` takes a string key and checks against a `Set`.

## Architecture Check

1. A keyed dispatch map is more maintainable than a linear if-chain: adding a handler = adding one map entry, not finding the right insertion point in a chain.
2. The scaffolding check can move into the map lookup: if the key matches a scaffolding entry, return suppressed; else look up the handler.
3. Eliminates `getEffectKey` entirely — the matched key from the dispatch is available for the unhandled fallback.
4. No game-specific logic introduced. Pure structural refactor.

## What to Change

### 1. Replace if-chain with dispatch map in `tooltip-normalizer.ts`

Define a `Record<string, handler>` mapping effect keys to handler functions. The `normalizeEffect` entry point: (1) gets the effect key, (2) checks scaffolding, (3) looks up the handler, (4) calls it or returns suppressed/unhandled.

### 2. Remove `getEffectKey`

The dispatch loop already identifies the key. Use `Object.keys(effect)[0]` inline once at the top of `normalizeEffect` (or iterate `Object.entries`).

### 3. Prepare extension point for LEGACTTOO-005

The map pattern makes it trivial for LEGACTTOO-005 to add compound handlers: just extend the map with new entries.

## Files to Touch

- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify — refactor dispatch)

## Out of Scope

- Adding compound handlers (LEGACTTOO-005)
- Changing handler signatures or message types
- Adding new tests (pure refactor — existing tests verify behavior)

## Acceptance Criteria

### Tests That Must Pass

1. All existing `tooltip-normalizer.test.ts` tests pass unchanged (44 tests).
2. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Every EffectAST node still produces at least one TooltipMessage.
2. Scaffolding effects are still caught before leaf handlers.
3. `normalizeEffect` export signature unchanged.

## Test Plan

### New/Modified Tests

1. No new tests required — pure refactor of dispatch mechanism. Existing 44 tests verify all rule behaviors.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo typecheck`
