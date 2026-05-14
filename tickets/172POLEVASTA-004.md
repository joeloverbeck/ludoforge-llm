# 172POLEVASTA-004: Phase 3 — runtime-owned policyBytecodeCache (sharedStructural GameDefRuntime field)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/gamedef-runtime.ts` (new `sharedStructural` field); `packages/engine/src/agents/policy-evaluation-core.ts` (bytecode resolution path)
**Deps**: `archive/tickets/172POLEVASTA-001.md`

## Problem

`PolicyEvaluationContext.compiledExprBytecodeCache` (`packages/engine/src/agents/policy-evaluation-core.ts:354`) is a per-**instance** `WeakMap<CompiledPolicyExpr, …>` — so it is empty on every construction, and every consideration's bytecode is recompiled per microturn-option evaluation (`evaluateCompiledExprWithVm`, `:932-935`). For D microturn-option evaluations × C considerations, `compilePolicyBytecode` runs D×C times, identically each time (spec §2.3, §4.3).

Compiled per-consideration bytecode is a pure function of `(CompiledPolicyExpr, GameDef, EncodedStateLayout)` — a `sharedStructural` artifact exactly like the existing `compiledQueryPlanCache`. This is spec 172 §4.3: move the cache to a runtime-owned `sharedStructural` field on `GameDefRuntime`, removing the prior Spec 172's "implementer chooses" ambiguity.

## Assumption Reassessment (2026-05-14)

1. `GameDefRuntime` (`gamedef-runtime.ts:43-84`) declares its caches with explicit ownership-class doc comments. `compiledQueryPlanCache` (`:71-76`) is the `sharedStructural` precedent: "lazily populated … keyed by compiled AST object identity … remains shared structural across forks" — `forkGameDefRuntimeForRun` (`:143-157`) does **not** reset it. Confirmed.
2. `createGameDefRuntime` (`:106-126`) constructs every field in a returned object literal; `forkGameDefRuntimeForRun` (`:143-157`) spreads `...runtime` then overrides only the `runLocal` members. A new `sharedStructural` field needs construction in `createGameDefRuntime` and **no** override in `forkGameDefRuntimeForRun` (the spread carries it).
3. `CreatePolicyEvaluationContextInput` already declares `readonly runtime?: GameDefRuntime` (`policy-evaluation-core.ts:169`); `microturn-option-eval.ts:113` already passes `runtime` (`:134`, `...(runtime === undefined ? {} : { runtime })`). The plumbing exists — only `evaluateCompiledExprWithVm` must consult it.
4. `evaluateCompiledExprWithVm` at `:932-935` does `this.compiledExprBytecodeCache.get(expr)` → on miss `compilePolicyBytecode(expr, this.input.def, this.encodedStateLayout)` → `set`. Confirmed.
5. `packages/engine/src/kernel/eval-runtime-resources-contract.ts` validates an `EvalRuntimeResources` **subset** (`EVAL_RUNTIME_RESOURCE_KEYS_SET` = `collector`, `resolveRefCache`, `tokenStateIndexCache`, `compiledQueryPlanCache`) — not the full `GameDefRuntime`. The new `policyBytecodeCache` is accessed directly off `input.runtime` inside `PolicyEvaluationContext`, not threaded through `EvalRuntimeResources`. **During implementation, confirm** the new field does not flow into an `EvalRuntimeResources` object; if it does not (expected), no contract change is needed; if it does, add the key to `EVAL_RUNTIME_RESOURCE_KEYS_SET`.
6. Mismatch + correction: none material. Spec §8 anchors verify.

## Architecture Check

1. **Runtime ownership is cleaner than a per-instance or module-level cache**: the per-instance `WeakMap` is structurally guaranteed to miss on every construction — the bug. A module-level `WeakMap` would work but makes lifetime and test isolation murky; `GameDefRuntime` is the engine's mature, established owner for derived runtime artifacts with an explicit ownership-class contract. Adding one field mirrors `compiledQueryPlanCache` exactly — no new layer is invented.
2. **Agnostic boundaries preserved**: `policyBytecodeCache` keys on `CompiledPolicyExpr` object identity — a generic compiled-policy structure. The field sits alongside existing generic `GameDefRuntime` caches with no game-specific branching (Foundation #1).
3. **No backwards-compat shims**: the per-instance `compiledExprBytecodeCache` field is **replaced** by the runtime-owned resolution path, not aliased alongside it. The `input.runtime`-absent fallback (non-drive one-shot eval paths) is a single graceful-degradation lookup with a **byte-identical** cached value on both paths — per spec §4.3 and Foundation #14, this is graceful degradation, not a compat path.

## What to Change

### 1. Add the `sharedStructural` field to `GameDefRuntime`

In `gamedef-runtime.ts`, add to the `GameDefRuntime` interface (with a doc comment in the established style):

```ts
/** `sharedStructural`: lazily populated compiled policy bytecode keyed by
 *  compiled policy-expression object identity. Bytecode depends only on
 *  GameDef structure (+ the per-def layout singleton); shared across forks. */
readonly policyBytecodeCache: WeakMap<CompiledPolicyExpr, PolicyBytecode>;
```

Construct it in `createGameDefRuntime` (`new WeakMap()`). Do **not** override it in `forkGameDefRuntimeForRun` — the `...runtime` spread carries it (mirroring `compiledQueryPlanCache`). Update the `forkGameDefRuntimeForRun` doc comment's "remains shared structural across forks" list to include it. Import the `CompiledPolicyExpr` and `PolicyBytecode` (or equivalent `ReturnType<typeof compilePolicyBytecode>`) types — confirm exact type names against `compile.ts` during implementation.

### 2. Resolve bytecode through the runtime cache

In `PolicyEvaluationContext.evaluateCompiledExprWithVm` (`policy-evaluation-core.ts:932-935`), resolve bytecode through `input.runtime?.policyBytecodeCache` when a runtime is present, falling back to the existing per-instance `WeakMap` only when `input.runtime` is absent.

### 3. Replace the per-instance field

The per-instance `compiledExprBytecodeCache` (`:354`) is **replaced** by the resolution path: keep it only as the `input.runtime`-absent fallback store, or remove it entirely if the no-runtime path can use a local. Do not leave both an aliased runtime path and an always-populated instance path.

### 4. Bytecode-cache invariant test

Add a test asserting: a consideration's compiled bytecode is **reused** across two `PolicyEvaluationContext` instances sharing one `GameDefRuntime`; and is **not** reused across distinct `EncodedStateLayout`s (guards the §4.3 keying caveat — if a future change introduces multiple layouts per `GameDef`, the key must extend to include `EncodedStateLayout` identity).

## Files to Touch

- `packages/engine/src/kernel/gamedef-runtime.ts` (modify) — `policyBytecodeCache` field; construct in `createGameDefRuntime`; update `forkGameDefRuntimeForRun` doc comment
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — bytecode resolution via `input.runtime?.policyBytecodeCache`; replace the per-instance `compiledExprBytecodeCache`
- `packages/engine/src/kernel/eval-runtime-resources-contract.ts` (modify — **only if** Assumption 5's check shows the field flows into `EvalRuntimeResources`)
- `packages/engine/test/unit/agents/policy-bytecode-cache.test.ts` (new) — bytecode-cache invariant (confirm exact dir against sibling agent tests during implementation)

## Out of Scope

- The layout accessor (`172POLEVASTA-002`), the feature-table cache (`172POLEVASTA-003`), the runtime-owned encoded-state cache (`172POLEVASTA-005`), and the constructor-no-direct-build architectural invariant (`172POLEVASTA-006`).
- Extending the cache key to include `EncodedStateLayout` identity now — `CompiledPolicyExpr` identity is sound while one layout exists per `GameDef`; the invariant test guards the caveat.
- Any change to `compilePolicyBytecode`'s body or the WASM bytecode path (`policy-wasm-score-bytecode-cache.ts`).

## Acceptance Criteria

### Tests That Must Pass

1. Bytecode-cache invariant: bytecode reused across two `PolicyEvaluationContext`s sharing one `GameDefRuntime`; not reused across distinct `EncodedStateLayout`s.
2. `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts` — a forked runtime carrying the new `sharedStructural` field produces results identical to a fresh one. **Especially load-bearing for this ticket.**
3. Determinism gates byte-identical: `spec-140-replay-identity.test.ts`, `zobrist-incremental-parity-fitl-seed-42.test.ts` / `-seed-123.test.ts`.
4. `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts` pass (WASM/TS bytecode score-row equivalence).
5. The `172POLEVASTA-001` perf witness shows `compilePolicyBytecode` / `buildExpressionFeatureTable` self-time/count drop to ~0 outside first-touch.
6. Existing suite: `pnpm -F @ludoforge/engine test` and `pnpm -F @ludoforge/engine test:integration:fitl-rules`.

### Invariants

1. The cached bytecode is byte-identical to a freshly-compiled result on both the runtime-present and runtime-absent paths — cache warmth changes nothing observable (Foundation #8).
2. `policyBytecodeCache` is `sharedStructural`: carried unchanged through `forkGameDefRuntimeForRun`, never reset per run.
3. The `eval-runtime-resources-contract.ts` allowed-key set stays accurate — no `GameDefRuntime` field flows into `EvalRuntimeResources` without being in the contract.
4. No game-specific branching enters `gamedef-runtime.ts` or the resolution path (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-bytecode-cache.test.ts` (new) — bytecode reuse across contexts sharing a `GameDefRuntime`; non-reuse across distinct `EncodedStateLayout`s. `@test-class: architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine test:unit` (targeted)
2. `pnpm -F @ludoforge/engine test:integration` (bytecode-equivalence + forked-vs-fresh parity)
3. `pnpm -F @ludoforge/engine test:perf` (witness — bytecode/feature-table seams drop to first-touch-only)
4. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`
5. `pnpm -F @ludoforge/engine test && pnpm -F @ludoforge/engine test:integration:fitl-rules`
