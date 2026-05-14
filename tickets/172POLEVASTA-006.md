# 172POLEVASTA-006: Phase 5 — constructor-no-direct-build architectural invariant test

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test-only; reuses the test/internal build counters added by `172POLEVASTA-001`
**Deps**: `archive/tickets/172POLEVASTA-002.md`, `archive/tickets/172POLEVASTA-003.md`, `tickets/172POLEVASTA-004.md`, `tickets/172POLEVASTA-005.md`

## Problem

`172POLEVASTA-002`…`-005` cache the four rebuild seams in the policy-evaluation preview path, but the prior Spec 172 fixed the symptom without a guard — a future `PolicyEvaluationContext` constructor edit could silently reintroduce a direct builder call and reopen the seam (spec §4.5; Foundation #15).

This ticket adds the **constructor invariant** as an architectural-invariant test:

> The `PolicyEvaluationContext` constructor MUST resolve `encodedStateLayout`, `featureTable` (transitively, via `compilePolicyBytecode`), `bytecode`, and `encodedState` through the cached accessors / runtime-owned caches. It MUST NOT call `buildEncodedStateLayout`, `buildFeatureTable`, `compilePolicyBytecode` (uncached), or `buildEncodedState` in a way that guarantees a cache miss on a warm runtime.

It also flips the `172POLEVASTA-001` perf witness from failing to passing — the headline acceptance for spec 172.

## Assumption Reassessment (2026-05-14)

1. By the time this ticket is implemented, `172POLEVASTA-002`…`-005` have landed: the layout resolves via `getPolicyEncodedStateLayout`, the feature table via `getFeatureTable`, the bytecode via `runtime.policyBytecodeCache`, and the encoded state via `runtime.policyEncodedStateCache`. This ticket's test asserts the *combined* warm-runtime property — it cannot pass until all four are in place (hence the four-way `Deps`).
2. Spec §6.2 specifies the test is "implementable via spies/counters on the builder functions or a build-counter on the runtime" and classifies it `architectural-invariant`.
3. The `172POLEVASTA-001` perf witness (`packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts`) exists and currently fails / is documented as expected-to-fail-until-this-ticket. It also added test/internal logical counters for `buildEncodedStateLayout`, `buildFeatureTable`, `buildExpressionFeatureTable`, and `buildEncodedState`; this ticket should reuse those counters rather than adding a second instrumentation surface.
4. Mismatch + correction: the original draft allowed adding a new test-observable build counter here. That is now stale after `172POLEVASTA-001`; this ticket is test-only and reuses the already-landed counters. If `172POLEVASTA-004`/`-005`'s reassessment changed any cache key shape (e.g. an `EncodedStateLayout`-extended bytecode key, or a canonical-digest encoded-state key), this test's "warm runtime → zero rebuilds" assertion still holds — only the construction of the "warm" fixture changes. Re-verify against the as-landed cache APIs during implementation.

## Architecture Check

1. **An invariant test proves the property rather than assuming it** (Foundation #16). The four cache tickets each prove their *own* seam; this ticket proves the *constructor-level composite* property — that no construction path bypasses any of them — which no single cache ticket can establish alone.
2. **Test-only enforcement preserves agnostic boundaries**: reuse the generic test/internal builder counters from `172POLEVASTA-001`; do not add a second counter family or runtime-side build counter. The counters carry no game-specific logic (Foundation #1).
3. **No backwards-compat shims**: this ticket adds a test and (optionally) a test-observable counter; it deletes nothing and aliases nothing.

## What to Change

### 1. Add the constructor-no-direct-build architectural invariant test

Add `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts` that:

- builds a warm `GameDefRuntime` (layout, feature table, bytecode, encoded state all populated by a first construction);
- constructs N additional `PolicyEvaluationContext` instances for the same `(GameDef, layout, state)` on that warm runtime;
- asserts each of `buildEncodedStateLayout`, `buildFeatureTable`, `buildExpressionFeatureTable`, and `buildEncodedState` is invoked **exactly once** (first-touch only) — zero invocations across the N subsequent constructions.

Use the test/internal builder counters added by `172POLEVASTA-001`. Declare `@test-class: architectural-invariant`.

### 2. Flip the Phase 0 perf witness to passing

With `172POLEVASTA-002`…`-005` landed, the `172POLEVASTA-001` witness's combined `build*` work now stays below the first-touch-only threshold. Update `preview-drive-static-rebuild-witness.perf.test.ts`: remove the "expected to fail until 172POLEVASTA-006" header note and confirm the assertion now **passes**. If a temporary skip/xfail marker was used in `172POLEVASTA-001`, remove it here.

### 3. Headline acceptance check

Confirm the spec's headline acceptance: deep-preview `arvn-cubes` seed 1013 (`campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs --only 1013 --max-turns 200`) now completes, and per-seed times drop sharply toward the shallow-preview regime. Record the observed timings in the implementation notes (the target is *feasible*, not exact parity with the 5.1 s shallow control).

## Files to Touch

- `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts` (new) — constructor-no-direct-build architectural invariant
- `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` (modify) — flip from failing to passing; remove the expected-failure header note / skip marker

## Out of Scope

- Any change to the four caches themselves (`172POLEVASTA-002`…`-005`) — this ticket only guards them.
- Retuning the `arvn-evolved` preview config or any agent profile — a campaign decision, spec §3/§9 non-goal.
- The deferred preview-result transposition memo and `PreviewWorkBudget` accounting — explicitly out of scope per spec §9 / §11.
- Production-shipped `build*` instrumentation beyond what the test strictly needs.

## Acceptance Criteria

### Tests That Must Pass

1. Constructor-no-direct-build invariant: N constructions for the same `(GameDef, layout, state)` on a warm `GameDefRuntime` invoke each of `buildEncodedStateLayout`, `buildFeatureTable`, `buildExpressionFeatureTable`, `buildEncodedState` exactly once (first-touch only); the test **fails** if any builder runs past first-touch.
2. The `172POLEVASTA-001` perf witness now **passes** — combined `build*` work stays below the first-touch-only threshold.
3. Determinism gates byte-identical: `spec-140-replay-identity.test.ts`, `forked-vs-fresh-runtime-parity.test.ts`, `zobrist-incremental-parity-fitl-seed-42.test.ts` / `-seed-123.test.ts`.
4. `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts` pass.
5. Headline: `node campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs --only 1013 --max-turns 200` completes (no >15-min hang).
6. Existing suite: `pnpm -F @ludoforge/engine test` and `pnpm -F @ludoforge/engine test:integration:fitl-rules`.

### Invariants

1. The invariant test fails if a future constructor edit calls any `build*` in a way that guarantees a warm-runtime cache miss — the regression guard the prior Spec 172 lacked.
2. No new `build*` instrumentation is introduced in this ticket; the existing `172POLEVASTA-001` counters remain game-agnostic test/internal side channels (Foundation #1).
3. Cache warmth changes nothing observable — replay identity, Zobrist parity, preview status, selected action, score, and trace content are all unchanged (Foundation #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts` (new) — warm-runtime first-touch-only invariant over all four builders. `@test-class: architectural-invariant`.
2. `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` (modify) — flipped to passing; `@test-class` marker unchanged from `172POLEVASTA-001`.

### Commands

1. `pnpm -F @ludoforge/engine test:unit` (targeted — architecture + invariant tests)
2. `pnpm -F @ludoforge/engine test:perf` (witness now passes)
3. `node campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs --only 1013 --max-turns 200` (headline — completes)
4. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`
5. `pnpm -F @ludoforge/engine test && pnpm -F @ludoforge/engine test:integration:fitl-rules`
