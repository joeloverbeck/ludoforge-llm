# KERQUERY-031: Enforce query-runtime-cache index immutability at write boundary

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — query-runtime-cache write-path robustness for immutable cache semantics
**Deps**: archive/tickets/KERQUERY/KERQUERY-022-tighten-query-runtime-cache-public-surface-to-domain-accessors.md, packages/engine/src/kernel/query-runtime-cache.ts, packages/engine/test/unit/eval-context.test.ts, packages/engine/test/unit/eval-query.test.ts

## Problem

`createQueryRuntimeCache().setTokenZoneByTokenIdIndex` stores the provided map reference as-is. If any caller mutates the map after storing it, cached semantics can drift unexpectedly, weakening deterministic and side-effect-safe behavior expectations.

## Assumption Reassessment (2026-03-05)

1. QueryRuntimeCache currently stores `ReadonlyMap` references directly in a WeakMap keyed by `GameState`.
2. Current internal producer paths appear safe, but the interface does not enforce immutability against external reference mutation.
3. No existing active ticket in `tickets/*` tracks write-boundary immutability hardening for QueryRuntimeCache.

## Architecture Check

1. Defensively snapshotting/freezing cached indexes at write time is cleaner and more robust than relying on caller discipline.
2. This is pure runtime-infrastructure hardening and remains game-agnostic (no game-specific behavior, GameDef untouched).
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Harden write boundary against mutable aliasing

1. In `setTokenZoneByTokenIdIndex`, persist an immutable snapshot (`new Map(value)`), not the caller reference.
2. Keep read path returning a readonly view/shape.

### 2. Lock behavior with regression tests

1. Add/extend tests to prove post-write mutations of original map do not alter cached value.
2. Keep existing per-state isolation behavior assertions.

## Files to Touch

- `packages/engine/src/kernel/query-runtime-cache.ts` (modify)
- `packages/engine/test/unit/eval-context.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify only if needed)

## Out of Scope

- QueryRuntimeCache API surface redesign beyond immutability hardening
- New cache domains/indexes
- Game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Mutating a map after `setTokenZoneByTokenIdIndex` does not mutate the cached index.
2. Existing per-state cache isolation behavior remains correct.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Query runtime cache values are deterministic snapshots at write time, not externally mutable aliases.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-context.test.ts` — add regression asserting cached index is immutable against post-write source-map mutation.
2. `packages/engine/test/unit/eval-query.test.ts` — update only if behavior assertions need alignment with snapshot semantics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-context.test.js packages/engine/dist/test/unit/eval-query.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
