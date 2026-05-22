# 189POLEVALCACHE-001: Make cache-eligibility structural via required PolicyEvalCacheBinding (atomic cut)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/agents/` (`PolicyEvaluationContext` constructor contract + all construction sites)
**Deps**: `archive/specs/189-policy-eval-context-cache-eligibility.md`

## Problem

`PolicyEvaluationContext`'s cache-eligibility is opt-in per call site. Three independent optional fields on `CreatePolicyEvaluationContextInput` — `runtime?`, `encodedState?`, `encodedStateLayout?` — gate whether the shared `runtime.policyEncodedStateCache` / `runtime.policyBytecodeCache` are consulted. Omitting `runtime` produces no error, no lint failure, no type error: the context returns correct values but rebuilds encoded state per construction and recompiles bytecode in a throwaway per-context `fallbackPolicyBytecodeCache`. The defect surfaces only several layers downstream as a perf-witness count regression (commit `ded6d281f`: `evaluatePlanPosture` silently bypassed the caches, breaking `172POLEVASTA-001` with `duplicateEncodedStateRebuilds` 0 → 102 once Spec 188 lit the path).

This ticket converts that opt-in into a contract a caller cannot accidentally violate (Spec 189 §4 Option A). Cache participation becomes derivable from a single **required** input, so the gating predicate cannot be half-satisfied by accident — omission becomes a compile-time type error.

Under Foundation 14 (No Backwards Compatibility), changing the required input contract forces every construction site (4 source + 26 test, across 20 test files) to migrate in this same diff — a partial migration would leave source and tests disagreeing and break the build. This is the earliest (and only) ticket where the deprecated optional-field surface is removed, so the full migration lands here per the multi-ticket atomic-cut rule.

## Assumption Reassessment (2026-05-22)

1. Verified this session via `/reassess-spec`: `CreatePolicyEvaluationContextInput` is defined at `packages/engine/src/agents/policy-evaluation-core.ts:224-266` with `runtime?: GameDefRuntime`, `encodedState?: EncodedState`, `encodedStateLayout?: EncodedStateLayout` all optional. The type is internal to that file — no external type imports (only `policy-evaluation-core.ts` references the name; the `dist/**.d.ts` hit is compiled output). Its blast radius is entirely via the constructor.
2. Constructor (`policy-evaluation-core.ts:450-477`) sets `encodedStateLayout` (line 457), `usesCanonicalEncodedStateLayout` (458), `encodedState` (459 — `input.encodedState ?? this.resolveEncodedState(input.state)`), then threads layout/encodedState/runtime into `createPolicyRuntimeProviders` (461-476). `resolveEncodedState` (1195-1200) and `resolvePolicyBytecodeCache` (1188-1193) both gate on the same predicate `this.input.runtime !== undefined && this.usesCanonicalEncodedStateLayout`. `fallbackPolicyBytecodeCache` is the per-context WeakMap at line 431.
3. The three fields gate **independently**, not exclusively: two of the four src sites (`policy-eval.ts:691`, `policy-evaluation-core.ts:2044`) pass `runtime` AND a precomputed `encodedState`+`encodedStateLayout` together — `encodedState` short-circuits encoded-state resolution at line 459 while `runtime` still selects the shared `policyBytecodeCache`. The `PolicyEvalCacheBinding` union must therefore let the `runtime` variant carry an optional `preEncoded`, NOT force a choice between `runtime` and `preEncoded` (corrected from the spec's first-draft union per the reassessment finding).
4. Construction sites confirmed via grep (2026-05-22): 4 in `src/` (`policy-eval.ts:691`, `microturn-option-eval.ts:121`, `policy-evaluation-core.ts:2044`, `plan-proposal.ts:508`); 26 in `test/` across 20 files (full list in Files to Touch). The `plan-proposal.ts` site already threads `runtime` conditionally (fixed in `ded6d281f`); this ticket makes that threading non-optional.
5. Spec 172 (`archive/specs/172-policy-eval-static-structure-caching.md`) and Spec 186 (`archive/specs/186-advisory-turn-plan-architecture-core.md`) are archived/completed — referenced here as contract context, not implementation prerequisites.

## Architecture Check

1. **Root-cause fix, not a tripwire** (Foundation 15). The silent-degradation class is eliminated at the type level: a construction site that has a runtime but forgets to pass it cannot compile. This is strictly stronger than Option C (a lint/grep guard that preserves the silent-omission failure mode).
2. **Determinism preserved** (Foundation 8). The caches are pure memoizations producing byte-identical encoded state (same `tryBuildEncodedState` builder) and identical bytecode (same `compilePolicyBytecode` inputs). This ticket changes *which cache* is consulted, never *what is computed*. No replay or hash impact.
3. **Engine-agnostic** (Foundation 1). This is a generic agent-layer construction contract; no game-specific identifiers or branches are introduced.
4. **No backwards-compatibility shims** (Foundation 14). The three optional fields are deleted, not deprecated; all 30 construction sites migrate in this diff. The migration is mechanically uniform (each site maps its current `runtime`/`encodedState`/`encodedStateLayout` arguments to the equivalent binding variant), which is why a Large diff remains reviewable.

## What to Change

### 1. Introduce the `PolicyEvalCacheBinding` discriminated union

In `packages/engine/src/agents/policy-evaluation-core.ts`, add:

```ts
export type PolicyEvalCacheBinding =
  // canonical layout, shared caches; optionally carries a precomputed encoded state
  | { readonly kind: 'runtime'; readonly runtime: GameDefRuntime; readonly preEncoded?: { readonly layout: EncodedStateLayout; readonly encoded: EncodedState } }
  | { readonly kind: 'isolated' }                                       // explicit uncached (tests/ad-hoc)
  | { readonly kind: 'preEncoded'; readonly layout: EncodedStateLayout; readonly encoded: EncodedState };
```

### 2. Replace the three optional fields with one required `cacheBinding`

On `CreatePolicyEvaluationContextInput` (lines 224-266), remove `runtime?`, `encodedState?`, `encodedStateLayout?` and add `readonly cacheBinding: PolicyEvalCacheBinding`. Omission is now a type error.

### 3. Derive internal fields from the binding in the constructor

Rework the constructor (450-477) so that `runtime`, `encodedStateLayout`, `encodedState`, and `usesCanonicalEncodedStateLayout` are derived from `input.cacheBinding`:

- `kind: 'runtime'` → runtime present, canonical layout; if `preEncoded` is set, use its `layout`/`encoded` directly (short-circuits resolution) — otherwise resolve via `resolvePolicyEncodedState(runtime, ...)`.
- `kind: 'preEncoded'` → no runtime (uncached bytecode via `fallbackPolicyBytecodeCache`), use the supplied `layout`/`encoded`.
- `kind: 'isolated'` → no runtime, no precomputed state; resolve via `tryBuildEncodedState` (uncached).

Update `resolveEncodedState` (1195-1200) and `resolvePolicyBytecodeCache` (1188-1193) to read the derived runtime/layout rather than `this.input.runtime`/`this.input.encodedStateLayout`. The shared-vs-fallback bytecode-cache decision and the `usesCanonicalEncodedStateLayout` predicate are preserved exactly — only their *source* changes from independent optional fields to the binding.

### 4. Migrate the 4 source construction sites

Map each site's current arguments to the binding:

- `policy-eval.ts:691` — `input.runtime === undefined ? { kind: 'isolated' }` ; else `encodedView === undefined ? { kind: 'runtime', runtime: input.runtime } : { kind: 'runtime', runtime: input.runtime, preEncoded: { layout: encodedView.layout, encoded: encodedView.encoded } }`.
- `microturn-option-eval.ts:121` — `runtime === undefined ? { kind: 'isolated' } : { kind: 'runtime', runtime }`.
- `policy-evaluation-core.ts:2044` (spawned selector-item context) — mirror site 691's runtime+optional-preEncoded mapping, sourcing from `this.input`'s derived runtime/layout/encoded.
- `plan-proposal.ts:508` (`evaluatePlanPosture`) — `input.runtime === undefined ? { kind: 'isolated' } : { kind: 'runtime', runtime: input.runtime }`.

### 5. Migrate the 26 test construction sites

For each of the 20 test files, replace the `runtime`/`encodedState`/`encodedStateLayout` arguments with the equivalent binding variant. Tests that intentionally exercise the uncached path use `{ kind: 'isolated' }` (this is the explicit, greppable, reviewable signal the spec wants). Tests passing a runtime use `{ kind: 'runtime', runtime }` (plus `preEncoded` where they currently pass precomputed encoded state). Update shared test helpers (`compiled-policy-production-helpers.ts`, `projected-lookup-runtime-test-helpers.ts`, `strategy-module-test-fixtures.ts`) so dependent test files inherit the migrated shape.

## Files to Touch

Source:
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — union type, input contract, constructor, resolver methods, spawned-context site)
- `packages/engine/src/agents/policy-eval.ts` (modify — site `:691`)
- `packages/engine/src/agents/microturn-option-eval.ts` (modify — site `:121`)
- `packages/engine/src/agents/plan-proposal.ts` (modify — site `:508`)

Tests (26 construction sites across 20 files):
- `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts` (modify)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-runtime-tracing.test.ts` (modify)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-runtime-test-helpers.ts` (modify — shared helper)
- `packages/engine/test/integration/policy-bytecode-equivalence-partial-visibility.test.ts` (modify — 2 sites)
- `packages/engine/test/integration/agents/strategic-condition-e2e.test.ts` (modify)
- `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` (modify — 3 sites)
- `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-bytecode-cache.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval-relationship.test.ts` (modify)
- `packages/engine/test/helpers/compiled-policy-production-helpers.ts` (modify — shared helper)
- `packages/engine/test/unit/agents/policy-evaluation-core-layout-cache.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval-strategic-condition.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-selector-trace.test.ts` (modify)
- `packages/engine/test/unit/agents/turn-shape-preview-fallback.test.ts` (modify)
- `packages/engine/test/unit/agents/strategy-module-activation-caching.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-selector-eval.test.ts` (modify — 2 sites)
- `packages/engine/test/unit/agents/strategy-module-test-fixtures.ts` (modify — shared helper)
- `packages/engine/test/unit/agents/guardrail-severity-dispatch.test.ts` (modify — 3 sites)
- `packages/engine/test/unit/agents/turn-shape-evaluator-basic.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-encoded-state-cache.test.ts` (modify)

## Out of Scope

- The new distilled cache-dedup architectural-invariant test and the isolated-binding negative test — owned by `archive/tickets/189POLEVALCACHE-002.md` (kept separate so this atomic-cut diff stays focused on the contract change + mechanical migration).
- Auditing whether other engine constructors share this opt-in-cache shape (e.g., projection caches) — Spec 189 §8 defers these as sibling specs if found during decomposition.
- Any change to perf-lane sharding or the `172POLEVASTA-001` witness budget.
- No new caches: this reuses `runtime.policyEncodedStateCache`, `runtime.policyEncodedStateProjectionCache`, and `runtime.policyBytecodeCache` exactly as they exist.

## Acceptance Criteria

### Tests That Must Pass

1. All 20 migrated test files compile and pass against the new `cacheBinding` contract.
2. `172POLEVASTA-001` perf witness (`packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts`) still passes at `duplicateEncodedStateRebuilds === 0` — confirms the `plan-proposal.ts` posture site (and all others) consult the shared caches.
3. Engine build + full suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. Every `new PolicyEvaluationContext({...})` call site (source and test) supplies a `cacheBinding`; omitting it is a compile-time type error (the three optional fields no longer exist).
2. Encoded state from the cache is byte-identical to the direct `tryBuildEncodedState` build; bytecode from the shared cache is identical to the per-context build. No replay/hash impact (Foundation 8).
3. The uncached path remains reachable, but only via an explicit `{ kind: 'isolated' }` binding — never by silent omission.

## Test Plan

### New/Modified Tests

1. The 20 test files listed in Files to Touch — migrated to the `cacheBinding` contract (mechanical; behavior unchanged). New behavioral assertions are deferred to `archive/tickets/189POLEVALCACHE-002.md`.

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.js`
2. `pnpm -F @ludoforge/engine test:all && pnpm turbo lint typecheck`

## Outcome (2026-05-22)

Implemented. `CreatePolicyEvaluationContextInput` now requires `cacheBinding`; the old independent optional `runtime`, `encodedStateLayout`, and `encodedState` constructor fields were removed. `PolicyEvaluationContext` derives its runtime, encoded-state layout, encoded state, and bytecode-cache selection from that binding, and spawned selector-item contexts reuse the same binding.

The binding type and helpers live in `packages/engine/src/agents/policy-evaluation-cache-binding.ts` so the atomic constructor migration does not add active size to the already oversized policy-evaluation source files. Source-size ledger after extraction:

- `packages/engine/src/agents/policy-evaluation-cache-binding.ts`: new 56-line helper module.
- `packages/engine/src/agents/policy-evaluation-core.ts`: 19 additions / 19 deletions.
- `packages/engine/src/agents/policy-eval.ts`: 2 additions / 2 deletions.
- `packages/engine/src/agents/microturn-option-eval.ts`: 1 addition / 1 deletion.
- `packages/engine/src/agents/plan-proposal.ts`: 1 addition / 1 deletion.

Migrated all listed source and test/helper construction sites to explicit `cacheBinding` variants. Runtime callers use `{ kind: 'runtime', runtime }`, runtime callers with precomputed encoded state use `preEncoded`, and uncached/ad-hoc sites now use explicit `{ kind: 'isolated' }`. No schemas, data files, golden artifacts, or generated artifacts changed.

Verification:

- `pnpm -F @ludoforge/engine build` — PASS.
- Focused migrated-file bundle via `pnpm -F @ludoforge/engine exec node --test ...` — PASS (`74` tests, `74` pass).
- `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.js` — PASS; `duplicateEncodedStateRebuilds=0`, `total=57`, `threshold=8`, `staticOnlyTotal=8`.
- `pnpm turbo typecheck` — PASS.
- `pnpm turbo lint` — PASS.
- `pnpm run check:ticket-deps` — PASS.
- `pnpm -F @ludoforge/engine test:all` — RAN, still RED with `958` tests, `956` pass, `2` fail. The failing files are `dist/test/integration/diagnose-parity-runGame.test.js` and `dist/test/integration/policy-bytecode-equivalence.test.js`. Both failures were reproduced from clean `HEAD` in `/tmp/ludoforge-189-baseline`, so they are repo-preexisting broad-suite blockers, not regressions introduced by this ticket.

Ticket `189POLEVALCACHE-002` was later completed and archived for the distilled cache-dedup architectural-invariant and isolated-binding negative tests.
