# 172POLEVASTA-003: Phase 2 — WeakMap<GameDef, FeatureTable> cache + getFeatureTable accessor

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/cnl/policy-bytecode/feature-table.ts` (new cache + accessor); `packages/engine/src/cnl/policy-bytecode/compile.ts` (caller switch)
**Deps**: `archive/tickets/172POLEVASTA-001.md`

## Problem

`buildFeatureTable(def, layout)` (`packages/engine/src/cnl/policy-bytecode/feature-table.ts:156`) is a pure function of `(GameDef, EncodedStateLayout)` that full-scans every compiled policy expression in the GameDef (`forEachCompiledPolicyExpr`, `:165` via the internal helper at `:568`) — and it has **no cache**. It is reached from `compilePolicyBytecode` (`compile.ts:37`) → `buildExpressionFeatureTable` (`compile.ts:59`) → `buildFeatureTable` (`compile.ts:64`). For D microturn-option evaluations × C considerations, the full GameDef-wide feature table is rebuilt D×C times, identically each time (spec §2.3).

This is spec 172 §4.2: memoize `buildFeatureTable` behind a module-level `WeakMap<GameDef, FeatureTable>` accessor.

## Assumption Reassessment (2026-05-14)

1. `buildFeatureTable` at `feature-table.ts:156` returns `Object.freeze`d output (`:174-176` — `refs`, `refToId`, and each `ref`/`ref.aux` frozen). A cached instance is therefore safely immutable. Confirmed.
2. `compile.ts:64` calls `buildFeatureTable(def, layout)` inside `buildExpressionFeatureTable`; `compile.ts:18` imports `buildFeatureTable`. Confirmed.
3. `buildFeatureTable` is `export`ed from `feature-table.ts`. The spec retains it as the fresh-builder under the accessor — the accessor calls it on cache miss; it stays exported for tests as a fresh-builder oracle.
4. Keying on `GameDef` is sound: `layout` is itself a pure function of `def` (`buildEncodedStateLayout(def)`), so for a fixed `def` all layouts are deep-equal and the feature table built from any of them is identical. After `172POLEVASTA-002` the layout is additionally the per-`GameDef` cached singleton, but Phase 2's correctness does not *require* `172POLEVASTA-002` to have landed — the purity of `buildEncodedStateLayout` already guarantees a stable feature table per `def`. (Value dependency on `172POLEVASTA-002`, not a hard one.)
5. Mismatch + correction: none. The spec's §4.2 anchors all verify.

## Architecture Check

1. **Module-level `WeakMap` is the right owner here, not `GameDefRuntime`**: `compilePolicyBytecode` is reached from `cnl/policy-bytecode/compile.ts`, which does **not** hold a `GameDefRuntime`. Threading a runtime down to the compiler layer would be a larger, lower-value change than a module-level `WeakMap`. This is the second member of the spec's §4.1 pure-static-internal carve-out: the feature table is invisible to replay, preview status, and perf witnesses, and its output is `Object.freeze`d so immutability is not at risk.
2. **Agnostic boundaries preserved**: the cache keys on `GameDef` — a generic engine structure. The `WeakMap` is GC-correct (entry dies with the `GameDef`). No game-specific branching.
3. **No backwards-compat shims**: callers (`buildExpressionFeatureTable` and any other) **switch** to the `getFeatureTable` accessor; `buildFeatureTable` is not aliased — it remains the on-miss fresh builder and the test oracle, called by the accessor, never bypassed by production callers.

## What to Change

### 1. Add the `getFeatureTable` accessor + module-level cache

In `packages/engine/src/cnl/policy-bytecode/feature-table.ts`, next to `buildFeatureTable`, add a module-level `const featureTableCache = new WeakMap<GameDef, FeatureTable>()` and an exported `getFeatureTable(def, layout): FeatureTable` that returns the cached instance or builds-and-caches via `buildFeatureTable(def, layout)` on miss.

### 2. Switch callers to the accessor

Change `buildExpressionFeatureTable` (`compile.ts:64`) — and any other production caller of `buildFeatureTable` — to call `getFeatureTable`. Grep the engine for all `buildFeatureTable(` call sites and confirm only the accessor and tests call it directly after this change.

### 3. Feature-table-cache invariant test

Add `packages/engine/test/.../feature-table-cache.test.ts` asserting: `getFeatureTable(def, layout)` returns a value deep-equal to a fresh `buildFeatureTable(def, layout)`, and returns the **same reference** on repeat calls for the same `def`.

## Files to Touch

- `packages/engine/src/cnl/policy-bytecode/feature-table.ts` (modify) — `featureTableCache` `WeakMap` + `getFeatureTable` accessor
- `packages/engine/src/cnl/policy-bytecode/compile.ts` (modify) — `buildExpressionFeatureTable` switches to `getFeatureTable`
- `packages/engine/test/unit/cnl/policy-bytecode/feature-table-cache.test.ts` (new) — feature-table-cache invariant (confirm exact dir against sibling `policy-bytecode` tests during implementation)

## Out of Scope

- The layout accessor (`172POLEVASTA-002`), the runtime-owned bytecode cache (`172POLEVASTA-004`), the runtime-owned encoded-state cache (`172POLEVASTA-005`), and the constructor-no-direct-build architectural invariant (`172POLEVASTA-006`).
- Any change to `buildFeatureTable`'s body, the `FeatureTable` type, or `forEachCompiledPolicyExpr`.
- Keying the cache on `EncodedStateLayout` identity — `GameDef` keying is sound (Assumption 4); the spec's §4.3 layout-identity caveat applies to the *bytecode* cache, not this one.

## Acceptance Criteria

### Tests That Must Pass

1. `getFeatureTable(def, layout)` returns a value deep-equal to `buildFeatureTable(def, layout)` and the same reference across repeat calls for one `def`.
2. Determinism gates byte-identical: `packages/engine/test/determinism/spec-140-replay-identity.test.ts`, `zobrist-incremental-parity-fitl-seed-42.test.ts` / `-seed-123.test.ts`.
3. `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts` pass (bytecode score-row equivalence unaffected).
4. The `172POLEVASTA-001` perf witness shows `buildFeatureTable` self-time/count drop to ~0 outside first-touch (it still fails overall — the layout, bytecode, and encoded-state seams may remain).
5. Existing suite: `pnpm -F @ludoforge/engine test` and `pnpm -F @ludoforge/engine test:integration:fitl-rules`.

### Invariants

1. The cached feature table is byte-identical to a freshly-built one — cache warmth changes nothing observable (Foundation #8).
2. The cached output stays `Object.freeze`d / immutable; no caller mutates it (Foundation #11).
3. No production caller bypasses the accessor; `buildFeatureTable` is reached only via `getFeatureTable` or tests.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/policy-bytecode/feature-table-cache.test.ts` (new) — `getFeatureTable` deep-equality vs the fresh builder + same-reference-on-repeat. `@test-class: architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine test:unit` (targeted)
2. `pnpm -F @ludoforge/engine test:integration` (bytecode-equivalence)
3. `pnpm -F @ludoforge/engine test:perf` (witness — `buildFeatureTable` drops to first-touch-only)
4. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`
5. `pnpm -F @ludoforge/engine test && pnpm -F @ludoforge/engine test:integration:fitl-rules`
