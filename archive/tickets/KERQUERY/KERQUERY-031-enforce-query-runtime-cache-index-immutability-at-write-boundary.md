# KERQUERY-031: Enforce query-runtime-cache index immutability at write boundary

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — query-runtime-cache write-path robustness for immutable cache semantics
**Deps**: archive/tickets/KERQUERY/KERQUERY-022-tighten-query-runtime-cache-public-surface-to-domain-accessors.md, packages/engine/src/kernel/query-runtime-cache.ts, packages/engine/test/unit/eval-context.test.ts, packages/engine/test/unit/eval-query.test.ts

## Problem

`createQueryRuntimeCache().setTokenZoneByTokenIdIndex` stores the provided map reference as-is. If any caller mutates the map after storing it, cached semantics can drift unexpectedly, weakening deterministic and side-effect-safe behavior expectations.

## Assumption Reassessment (2026-03-05)

1. Confirmed in `packages/engine/src/kernel/query-runtime-cache.ts`: `setTokenZoneByTokenIdIndex` currently stores the incoming `ReadonlyMap` reference directly in a `WeakMap<GameState, ReadonlyMap<string, string>>`.
2. Confirmed in `packages/engine/test/unit/eval-context.test.ts`: current cache test asserts referential identity (`cache.getTokenZoneByTokenIdIndex(state) === originalMap`), which encodes aliasing behavior and must be corrected to snapshot/value semantics.
3. `packages/engine/test/unit/eval-query.test.ts` currently validates query-cache reuse and state-key isolation behavior; no explicit write-boundary aliasing regression coverage exists.
4. No existing active ticket in `tickets/*` directly implements write-boundary immutability hardening for `QueryRuntimeCache`.

## Architecture Check

1. Defensively snapshotting cached indexes at write time (`new Map(value)`) is more robust than relying on caller discipline because it enforces ownership at the runtime boundary.
2. This is pure runtime-infrastructure hardening and remains game-agnostic (no game-specific behavior, `GameDef` untouched).
3. For this ticket scope, snapshot-on-write is the highest-value change; API redesign, freezing wrappers, or cache-domain expansion are not required to achieve clean ownership boundaries.
4. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Harden write boundary against mutable aliasing

1. In `setTokenZoneByTokenIdIndex`, persist a snapshot (`new Map(value)`), not the caller reference.
2. Keep read path returning a readonly view/shape.

### 2. Lock behavior with regression tests

1. Update cache contract tests to assert snapshot/value behavior, not reference identity.
2. Add regression assertions proving post-write mutations of the source map do not alter cached values.
3. Keep existing per-state isolation behavior assertions.

## Files to Touch

- `packages/engine/src/kernel/query-runtime-cache.ts` (modify)
- `packages/engine/test/unit/eval-context.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify only if needed; no assumption that change is required)

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

1. `packages/engine/test/unit/eval-context.test.ts` — replace aliasing identity assertion with snapshot/value assertions and add post-write mutation regression.
2. `packages/engine/test/unit/eval-query.test.ts` — update only if behavior assertions need alignment with snapshot semantics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-context.test.js packages/engine/dist/test/unit/eval-query.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-03-05
- **What changed**:
  - Updated `setTokenZoneByTokenIdIndex` in `packages/engine/src/kernel/query-runtime-cache.ts` to snapshot incoming maps at write time (`new Map(value)`), removing external mutable aliasing.
  - Updated `packages/engine/test/unit/eval-context.test.ts` cache contract test to assert snapshot/value semantics rather than reference identity and added regression coverage for post-write source-map mutation.
  - Reassessed ticket assumptions/scope before implementation and corrected the ticket to explicitly call out the prior aliasing assertion mismatch in tests.
- **Deviations from original plan**:
  - No `packages/engine/test/unit/eval-query.test.ts` changes were required; existing behavior tests remained valid under snapshot semantics.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/eval-context.test.js packages/engine/dist/test/unit/eval-query.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (386 passed, 0 failed)
  - `pnpm -F @ludoforge/engine lint` ✅
