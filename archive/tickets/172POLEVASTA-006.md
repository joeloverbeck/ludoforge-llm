# 172POLEVASTA-006: Phase 5 — constructor-no-direct-build architectural invariant test

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test-only; reuses the test/internal build counters added by `172POLEVASTA-001`
**Deps**: `archive/tickets/172POLEVASTA-002.md`, `archive/tickets/172POLEVASTA-003.md`, `archive/tickets/172POLEVASTA-004.md`, `archive/tickets/172POLEVASTA-005.md`

## Problem

`172POLEVASTA-002`…`-005` cache the four rebuild seams in the policy-evaluation preview path, but the prior Spec 172 fixed the symptom without a guard — a future `PolicyEvaluationContext` constructor edit could silently reintroduce a direct builder call and reopen the seam (spec §4.5; Foundation #15).

This ticket adds the **constructor invariant** as an architectural-invariant test:

> The `PolicyEvaluationContext` constructor MUST resolve `encodedStateLayout`, `featureTable` (transitively, via `compilePolicyBytecode`), `bytecode`, and `encodedState` through the cached accessors / runtime-owned caches. It MUST NOT call `buildEncodedStateLayout`, `buildFeatureTable`, `compilePolicyBytecode` (uncached), or `buildEncodedState` in a way that guarantees a cache miss on a warm runtime.

The residual measured perf witness and headline completion claim moved to `tickets/172POLEVASTA-007.md` after live proof showed this constructor invariant can pass while the Phase 0 witness remains red.

## Assumption Reassessment (2026-05-14)

1. By the time this ticket is implemented, `172POLEVASTA-002`…`-005` have landed: the layout resolves via `getPolicyEncodedStateLayout`, the feature table via `getFeatureTable`, the bytecode via `runtime.policyBytecodeCache`, and the encoded state via `runtime.policyEncodedStateCache`. This ticket's test asserts the *combined* warm-runtime property — it cannot pass until all four are in place (hence the four-way `Deps`).
2. Spec §6.2 specifies the test is "implementable via spies/counters on the builder functions or a build-counter on the runtime" and classifies it `architectural-invariant`.
3. The `172POLEVASTA-001` perf witness (`packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts`) exists and currently fails. It also added test/internal logical counters for `buildEncodedStateLayout`, `buildFeatureTable`, `buildExpressionFeatureTable`, and `buildEncodedState`; this ticket should reuse those counters rather than adding a second instrumentation surface. After the 2026-05-15 boundary reset, the witness remains expected-red until `172POLEVASTA-007`.
4. Mismatch + correction: the original draft allowed adding a new test-observable build counter here. That is now stale after `172POLEVASTA-001`; this ticket is test-only and reuses the already-landed counters. If `172POLEVASTA-004`/`-005`'s reassessment changed any cache key shape (e.g. an `EncodedStateLayout`-extended bytecode key, or a canonical-digest encoded-state key), this test's "warm runtime -> zero rebuilds" assertion still holds — only the construction of the "warm" fixture changes. Re-verify against the as-landed cache APIs during implementation.
5. Boundary reset (2026-05-15): live focused proof showed the constructor invariant can pass while the Phase 0 perf witness remains red (`total=451`, `buildExpressionFeatureTable=36`, `buildEncodedState=413`, threshold `4`). The user approved narrowing this ticket to the constructor invariant and splitting the residual measured rebuild work to `tickets/172POLEVASTA-007.md`. This preserves Foundations #15/#16 by not claiming architectural completeness or passing proof that live code does not yet provide.

## Architecture Check

1. **An invariant test proves the property rather than assuming it** (Foundation #16). The four cache tickets each prove their *own* seam; this ticket proves the *constructor-level composite* property — that no warm-runtime construction path bypasses any of them — which no single cache ticket can establish alone.
2. **Test-only enforcement preserves agnostic boundaries**: reuse the generic test/internal builder counters from `172POLEVASTA-001`; do not add a second counter family or runtime-side build counter. The counters carry no game-specific logic (Foundation #1).
3. **No backwards-compat shims**: this ticket adds a test and (optionally) a test-observable counter; it deletes nothing and aliases nothing.
4. **Measured residual stays explicit**: the still-red Phase 0 perf witness is not normalized into success. `172POLEVASTA-007` owns the remaining measured rebuild counts and headline completion claim.

## What to Change

### 1. Add the constructor-no-direct-build architectural invariant test

Add `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts` that:

- builds a warm `GameDefRuntime` (layout, feature table, bytecode, encoded state all populated by a first construction);
- constructs N additional `PolicyEvaluationContext` instances for the same `(GameDef, layout, state)` on that warm runtime;
- asserts each of `buildEncodedStateLayout`, `buildFeatureTable`, `buildExpressionFeatureTable`, and `buildEncodedState` is invoked **exactly once** (first-touch only) — zero invocations across the N subsequent constructions.

Use the test/internal builder counters added by `172POLEVASTA-001`. Declare `@test-class: architectural-invariant`.

### 2. Classify the residual measured witness

Run the `172POLEVASTA-001` perf witness after the constructor invariant lands. If it still exceeds the first-touch-only threshold, keep this ticket closeable only on the constructor invariant and record the residual counts under `tickets/172POLEVASTA-007.md`.

## Files to Touch

- `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts` (new) — constructor-no-direct-build architectural invariant
- `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` (modify) — update stale expected-failure owner comment only; behavior unchanged
- `tickets/172POLEVASTA-007.md` (new) — successor owner for residual measured rebuild counts if the Phase 0 witness remains red

## Out of Scope

- Any change to the four caches themselves (`172POLEVASTA-002`…`-005`) — this ticket only guards them.
- Any additional runtime/cache repair required to make the Phase 0 perf witness green — owned by `tickets/172POLEVASTA-007.md`.
- Retuning the `arvn-evolved` preview config or any agent profile — a campaign decision, spec §3/§9 non-goal.
- The deferred preview-result transposition memo and `PreviewWorkBudget` accounting — explicitly out of scope per spec §9 / §11.
- Production-shipped `build*` instrumentation beyond what the test strictly needs.

## Acceptance Criteria

### Tests That Must Pass

1. Constructor-no-direct-build invariant: N constructions for the same `(GameDef, layout, state)` on a warm `GameDefRuntime` invoke each of `buildEncodedStateLayout`, `buildFeatureTable`, `buildExpressionFeatureTable`, `buildEncodedState` exactly once (first-touch only); the test **fails** if any builder runs past first-touch.
2. The `172POLEVASTA-001` perf witness is rerun and classified. A red result is not a failure of this narrowed ticket when the residual owner is `tickets/172POLEVASTA-007.md`.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. The invariant test fails if a future constructor edit calls any `build*` in a way that guarantees a warm-runtime cache miss — the regression guard the prior Spec 172 lacked.
2. No new `build*` instrumentation is introduced in this ticket; the existing `172POLEVASTA-001` counters remain game-agnostic test/internal side channels (Foundation #1).
3. Cache warmth changes nothing observable for the asserted constructor seam — the test only observes build-counter side channels and policy expression value parity (Foundation #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts` (new) — warm-runtime first-touch-only invariant over all four builders. `@test-class: architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/policy-evaluation-context-constructor-invariant.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.js` (classification only; red residual belongs to `tickets/172POLEVASTA-007.md`)
4. `pnpm -F @ludoforge/engine test:unit`

## Outcome

Completion date: 2026-05-15. Implementation complete under the user-approved narrowed boundary.

What landed:

- Added `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts`.
- The new architectural invariant warms a `GameDefRuntime` once, then constructs/evaluates five additional `PolicyEvaluationContext` instances for the same `GameDefRuntime` and `GameState`.
- The invariant asserts `buildEncodedStateLayout`, `buildFeatureTable`, `buildExpressionFeatureTable`, and `buildEncodedState` each stay at exactly one first-touch invocation.
- Updated `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` comment-only ownership text so the red witness now points to `172POLEVASTA-007`, not this ticket.
- Added `tickets/172POLEVASTA-007.md` as the residual owner for the still-red Phase 0 perf witness and headline seed 1013 completion.
- Updated `specs/172-policy-eval-static-structure-caching.md` to split Phase 5 constructor-invariant proof from Phase 6 residual measured rebuild elimination.

Boundary correction:

- User-approved reset: Option 2 / narrowed ticket. `172POLEVASTA-006` owns the constructor invariant and residual classification only.
- Deferred owner: `tickets/172POLEVASTA-007.md` owns `buildExpressionFeatureTable=36`, `buildEncodedState=413`, the final perf witness flip, and the headline ARVN seed 1013 completion claim.

Generated/schema fallout: none. No runtime schema, generated schema artifact, golden, GameDef, or serialized trace shape changed.

Final verification:

| command | result |
|---|---|
| `pnpm -F @ludoforge/engine build` | passed |
| `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/policy-evaluation-context-constructor-invariant.test.js` | passed; 1 test / 1 suite |
| `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.js` | classified red for successor: `total=451`, `threshold=4`, `buildEncodedStateLayout=1`, `buildFeatureTable=1`, `buildExpressionFeatureTable=36`, `buildEncodedState=413` |
| `pnpm -F @ludoforge/engine test:unit` | passed; 5724 tests / 958 suites |

Late-edit proof validity:

- After the boundary reset, the perf witness source edit was comment-only ownership text. `pnpm -F @ludoforge/engine build`, the focused architecture test, and `pnpm -F @ludoforge/engine test:unit` were rerun after that edit.
- Terminal status/proof transcription changes no source, test behavior, schema, generated artifact, command semantics, scope boundary, dependency ownership, or acceptance criterion. No implementation proof is invalidated by this closeout edit.
