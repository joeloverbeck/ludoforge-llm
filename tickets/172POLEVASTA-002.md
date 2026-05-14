# 172POLEVASTA-002: Phase 1 — route PolicyEvaluationContext layout resolution through getPolicyEncodedStateLayout

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-evaluation-core.ts` constructor; `packages/engine/src/agents/policy-eval.ts` accessor location
**Deps**: `archive/tickets/172POLEVASTA-001.md`

## Problem

The `PolicyEvaluationContext` constructor (`packages/engine/src/agents/policy-evaluation-core.ts:375`) resolves the encoded-state layout with a direct `buildEncodedStateLayout(input.def)` call:

```ts
this.encodedStateLayout = input.encodedStateLayout ?? buildEncodedStateLayout(input.def);
```

`buildEncodedStateLayout(def)` is a pure function of the `GameDef`, and `packages/engine/src/agents/policy-eval.ts` **already** maintains a per-`GameDef` `WeakMap` cache (`encodedStateLayoutCache`, `:68`) with the accessor `getPolicyEncodedStateLayout(def)` (`:320`) — but the constructor does not use it, and `microturn-option-eval.ts:113` does not thread a pre-built layout in. So every inner microturn-option evaluation rebuilds the layout from scratch. Under cube-heavy play this rebuild scales with board token count and dominates runtime (spec §2.2).

This is spec 172 §4.1: route the constructor's layout resolution through the existing per-`GameDef` accessor, fixing every current and future construction site at once.

## Assumption Reassessment (2026-05-14)

1. `policy-evaluation-core.ts:375` still reads `this.encodedStateLayout = input.encodedStateLayout ?? buildEncodedStateLayout(input.def)`. Confirmed.
2. `policy-eval.ts:68` declares `const encodedStateLayoutCache = new WeakMap<GameDef, …>()`; `:320` exports `getPolicyEncodedStateLayout(def)` which lazily populates it. Confirmed.
3. `CreatePolicyEvaluationContextInput` already declares `readonly encodedStateLayout?: EncodedStateLayout` (`policy-evaluation-core.ts:170`). The `input.encodedStateLayout ?? …` precedence must be preserved — a supplied layout still wins.
4. Mismatch + correction: `policy-eval.ts` currently imports `buildEncodedStateLayout` from `../kernel/encoded-state/index.js` and `policy-evaluation-core.ts` imports it directly too. `getPolicyEncodedStateLayout` lives in `policy-eval.ts`; `policy-evaluation-core.ts` must be able to import it. Confirm there is no `policy-eval.ts` → `policy-evaluation-core.ts` → `policy-eval.ts` import cycle; if importing the accessor from `policy-eval.ts` into `policy-evaluation-core.ts` would create one, move the accessor + its `WeakMap` to a shared module (e.g. a small `policy-encoded-state-layout-cache.ts`) and re-export from `policy-eval.ts`. Resolve this during implementation; the spec (§4.1) explicitly permits "moved to (or re-exported from) a location both can import".

## Architecture Check

1. **Cleaner than threading a layout through every call site**: fixing the constructor body fixes every present and future construction site in one place and keeps the existing `WeakMap` authoritative — no per-call-site plumbing, no risk of a new construction site forgetting to thread the layout.
2. **Agnostic boundaries preserved**: `getPolicyEncodedStateLayout` keys on `GameDef` — a generic engine structure. No game-specific branching. The module-level `WeakMap` is the spec's narrow §4.1 carve-out: a layout is a pure static implementation internal, invisible to replay / preview status / perf witnesses, and the `WeakMap` is already GC-correct (entry dies with the `GameDef`).
3. **No backwards-compat shims**: the direct `buildEncodedStateLayout` call in the constructor is **replaced** by the cached accessor, not aliased alongside it. `input.encodedStateLayout` precedence is unchanged behavior, not a compat path.

## What to Change

### 1. Make the accessor importable by `policy-evaluation-core.ts`

If `getPolicyEncodedStateLayout` + `encodedStateLayoutCache` can be imported into `policy-evaluation-core.ts` from `policy-eval.ts` without an import cycle, do that. Otherwise move both to a shared module and re-export from `policy-eval.ts` so existing `policy-eval.ts` callers are unaffected.

### 2. Route the constructor through the accessor

Change `policy-evaluation-core.ts:375` to:

```ts
this.encodedStateLayout = input.encodedStateLayout ?? getPolicyEncodedStateLayout(input.def);
```

Remove the now-unused direct `buildEncodedStateLayout` import from `policy-evaluation-core.ts` if no other use remains.

### 3. Layout-cache invariant test

Add (or extend an existing `policy-evaluation-core` test, per spec §6.2) an assertion that two `PolicyEvaluationContext` instances constructed for the same `def` (without an explicit `input.encodedStateLayout`) observe the **same** `encodedStateLayout` reference.

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — constructor layout resolution; import cleanup
- `packages/engine/src/agents/policy-eval.ts` (modify) — export `getPolicyEncodedStateLayout` (and possibly relocate the accessor + `WeakMap` if a cycle forces it)
- `packages/engine/src/agents/policy-encoded-state-layout-cache.ts` (new — only if step 1 requires extracting the accessor to break a cycle)
- `packages/engine/test/unit/agents/policy-evaluation-core-layout-cache.test.ts` (new, or extend an existing `policy-evaluation-core` unit test) — layout-cache invariant

## Out of Scope

- The feature-table cache (`172POLEVASTA-003`), the runtime-owned bytecode cache (`172POLEVASTA-004`), the runtime-owned encoded-state cache (`172POLEVASTA-005`), and the constructor-no-direct-build architectural invariant (`172POLEVASTA-006`).
- Any change to `buildEncodedStateLayout` itself or the `EncodedStateLayout` type.
- Threading a pre-built layout in at `microturn-option-eval.ts:113` — unnecessary once the constructor consults the cache; explicitly avoided to keep the diff to the constructor.

## Acceptance Criteria

### Tests That Must Pass

1. Layout-cache invariant: two `PolicyEvaluationContext`s built for the same `def` observe the same `encodedStateLayout` reference.
2. Determinism gates byte-identical: `packages/engine/test/determinism/spec-140-replay-identity.test.ts`, `zobrist-incremental-parity-fitl-seed-42.test.ts` / `-seed-123.test.ts`.
3. The `172POLEVASTA-001` perf witness shows `buildEncodedStateLayout` self-time/count drop to ~0 outside first-touch (it still fails overall — the other three seams remain).
4. Existing suite: `pnpm -F @ludoforge/engine test` and `pnpm -F @ludoforge/engine test:integration:fitl-rules`.

### Invariants

1. The cached/threaded layout is byte-identical to a freshly-built `buildEncodedStateLayout(def)` result — cache warmth changes nothing observable (Foundation #8).
2. `input.encodedStateLayout`, when supplied, still takes precedence over the cached accessor.
3. No game-specific branching enters `policy-evaluation-core.ts` or the accessor's host module (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-evaluation-core-layout-cache.test.ts` (new, or an extension of an existing `policy-evaluation-core` unit test) — asserts same-`def` constructions share one `encodedStateLayout` reference. `@test-class: architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine test:unit` (targeted)
2. `pnpm -F @ludoforge/engine test:perf` (witness — `buildEncodedStateLayout` drops to first-touch-only)
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`
4. `pnpm -F @ludoforge/engine test && pnpm -F @ludoforge/engine test:integration:fitl-rules`
