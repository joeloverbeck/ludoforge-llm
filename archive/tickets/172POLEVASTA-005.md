# 172POLEVASTA-005: Phase 4 — runtime-owned policyEncodedStateCache (runLocal GameDefRuntime field)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/gamedef-runtime.ts` (new `runLocal` field); `packages/engine/src/agents/policy-evaluation-core.ts` (constructor `encodedState` resolution)
**Deps**: `archive/tickets/172POLEVASTA-001.md`

## Problem

`PolicyEvaluationContext`'s constructor rebuilds the encoded state per construction (`packages/engine/src/agents/policy-evaluation-core.ts:376`):

```ts
this.encodedState = input.encodedState ?? tryBuildEncodedState(input.state, this.encodedStateLayout);
```

`buildEncodedState` (`packages/engine/src/kernel/encoded-state/view.ts:214`) is the **single largest named self-time function** in the trigger report's slow profile (6.62%, 1613 ms). It is genuinely state-dependent — but within one preview-drive microturn node, sibling option evaluations are scored against the *same* `GameState` object (the option differs, not the state), so the rebuild is redundant across siblings. The prior Spec 172 deferred this; that left the #1 profile entry unaddressed (spec §2.6, §4.4; Foundation #15).

This is spec 172 §4.4: memoize `buildEncodedState` in a `runLocal` `WeakMap<GameState, EncodedState>` on `GameDefRuntime`, keyed by immutable-`GameState` object identity.

## Assumption Reassessment (2026-05-14)

1. `policy-evaluation-core.ts:376` reads `this.encodedState = input.encodedState ?? tryBuildEncodedState(input.state, this.encodedStateLayout)`; `tryBuildEncodedState` (`:62`) wraps `buildEncodedState`. Confirmed.
2. `GameDefRuntime` `runLocal` precedent: `tokenStateIndexCache` (`gamedef-runtime.ts:65-66`) is a `runLocal` field — constructed fresh in `createGameDefRuntime` (`:119`) **and** reset to a fresh instance in `forkGameDefRuntimeForRun` (`:152`). The `forkGameDefRuntimeForRun` doc comment (`:136-141`) lists the `runLocal` members.
3. `GameState` is immutable by contract (Foundation #11 — every transition returns a new object, the previous state is never mutated), so `WeakMap<GameState, EncodedState>` keyed by object identity is collision-free and GC-correct: the same object always maps to the same projection, the entry dies with the state object.
4. `CreatePolicyEvaluationContextInput.runtime?` and the `microturn-option-eval.ts:113` construction site already thread `runtime` (see `172POLEVASTA-004` Assumption 3) — no new plumbing.
5. `eval-runtime-resources-contract.ts` validates an `EvalRuntimeResources` subset, not the full `GameDefRuntime` (see `172POLEVASTA-004` Assumption 5). Same check applies here: confirm `policyEncodedStateCache` does not flow into an `EvalRuntimeResources` object; if it does, add the key.
6. **Verification step (spec §4.4, mandatory in this phase)**: confirm sibling option evaluations at one preview-drive microturn node receive the *same* `GameState` reference. This is the expected shape (the option differs, the state does not) but it is a verification step, not an assumption. If sibling options are found to receive distinct-but-equal `GameState` objects, the key upgrades to a canonical-state-digest key **with an object-identity equality guard before reuse** — never Zobrist alone (Foundation #8: canonical serialized state remains the source of truth for equality). Trace this through `microturn-option-eval.ts` / `policy-preview.ts` `driveSyntheticCompletion` during implementation.
7. Mismatch + correction: none material. Spec §8 anchors verify.

## Architecture Check

1. **Object-identity keying carries zero collision risk** — strictly safer than the canonical-hash keying the trigger report's `tokenStateIndexCache` uses, and sound *because* Foundation #11 guarantees `GameState` is never mutated after construction. Runtime ownership (`runLocal`) is cleaner than a module-level `WeakMap`: it gives the cache an explicit per-run lifetime via the established fork mechanism, matching `tokenStateIndexCache` exactly.
2. **Agnostic boundaries preserved**: `policyEncodedStateCache` keys on `GameState` — a generic engine structure. The field sits alongside existing generic `runLocal` `GameDefRuntime` caches with no game-specific branching (Foundation #1).
3. **No backwards-compat shims**: the constructor's `tryBuildEncodedState` call is **replaced** by the runtime-cache resolution path when a runtime is present; the `input.runtime`-absent fallback is a single graceful-degradation lookup with a byte-identical value (spec §4.4; Foundation #14). `input.encodedState` precedence is preserved.

## What to Change

### 1. Add the `runLocal` field to `GameDefRuntime`

In `gamedef-runtime.ts`, add to the `GameDefRuntime` interface (established doc-comment style):

```ts
/** `runLocal`: memoizes encoded-state projections keyed by immutable
 *  GameState object identity; reset for every run via fork. */
readonly policyEncodedStateCache: WeakMap<GameState, EncodedState>;
```

Construct it fresh in `createGameDefRuntime` (`new WeakMap()`) **and** reset it to a fresh `WeakMap` in `forkGameDefRuntimeForRun` (mirroring `tokenStateIndexCache`). Add it to the `forkGameDefRuntimeForRun` doc comment's `runLocal` member list. Import the `GameState` and `EncodedState` types — confirm exact module paths during implementation.

### 2. Resolve `encodedState` through the runtime cache

In the `PolicyEvaluationContext` constructor (`policy-evaluation-core.ts:376`), resolve `encodedState` through `input.runtime?.policyEncodedStateCache` (get-or-build-and-set) when a runtime is present, falling back to `tryBuildEncodedState(input.state, this.encodedStateLayout)` directly when `input.runtime` is absent. `input.encodedState`, when supplied, still wins.

### 3. Confirm sibling-option `GameState` sharing

Per Assumption 6 / spec §4.4: trace `microturn-option-eval.ts` / `driveSyntheticCompletion` to confirm sibling option evaluations at one microturn node share the same `GameState` reference. Record the finding in the implementation notes. If they do not share identity, upgrade the key to canonical-state-digest + object-identity equality guard (never Zobrist alone) before proceeding.

### 4. Encoded-state-cache invariant test

Add a test asserting: two `PolicyEvaluationContext` instances constructed with the **same** `GameState` object and the **same** `GameDefRuntime` observe the same `encodedState` reference; distinct `GameState` objects do not collide.

## Files to Touch

- `packages/engine/src/kernel/gamedef-runtime.ts` (modify) — `policyEncodedStateCache` field; construct in `createGameDefRuntime`; reset in `forkGameDefRuntimeForRun`; update doc comment
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — constructor `encodedState` resolution via `input.runtime?.policyEncodedStateCache`
- `packages/engine/src/kernel/eval-runtime-resources-contract.ts` (modify — **only if** Assumption 5's check shows the field flows into `EvalRuntimeResources`)
- `packages/engine/test/unit/agents/policy-encoded-state-cache.test.ts` (new) — encoded-state-cache invariant (confirm exact dir against sibling agent tests during implementation)

## Out of Scope

- The layout accessor (`172POLEVASTA-002`), the feature-table cache (`172POLEVASTA-003`), the runtime-owned bytecode cache (`172POLEVASTA-004`), and the constructor-no-direct-build architectural invariant (`172POLEVASTA-006`).
- Any change to `buildEncodedState` / `tryBuildEncodedState` bodies or the `EncodedState` type.
- A two-tier `byObject` + `byObserver` projection cache — explicitly rejected by spec §11 as unjustified complexity for the observed redundancy. A single `WeakMap<GameState, EncodedState>` is the committed design.
- A logical-state transposition cache beyond object identity — only pursued (with a collision-safe key) if Assumption 6's verification shows sibling options receive distinct-but-equal `GameState` objects.

## Acceptance Criteria

### Tests That Must Pass

1. Encoded-state-cache invariant: two `PolicyEvaluationContext`s built with the same `GameState` + same `GameDefRuntime` observe the same `encodedState` reference; distinct `GameState`s do not collide.
2. `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts` — a forked runtime carrying the new `runLocal` `policyEncodedStateCache` (reset on fork) produces results identical to a fresh one. **Especially load-bearing for this ticket.**
3. Determinism gates byte-identical: `spec-140-replay-identity.test.ts`, `zobrist-incremental-parity-fitl-seed-42.test.ts` / `-seed-123.test.ts`.
4. The `172POLEVASTA-001` perf witness shows `buildEncodedState` self-time drop materially (cache-hit on sibling options).
5. Existing suite: `pnpm -F @ludoforge/engine test` and `pnpm -F @ludoforge/engine test:integration:fitl-rules`.

### Invariants

1. The cached encoded state is byte-identical to a freshly-built `buildEncodedState(state, layout)` result — cache warmth changes nothing observable (Foundation #8).
2. `policyEncodedStateCache` is `runLocal`: reset to a fresh `WeakMap` on every `forkGameDefRuntimeForRun`, so no cross-run state accumulates.
3. The cache key is `GameState` object identity (or, only if Assumption 6 forces it, canonical-state-digest + object-identity equality guard) — never Zobrist alone (Foundation #8).
4. `input.encodedState`, when supplied, still takes precedence.
5. No game-specific branching enters `gamedef-runtime.ts` or the constructor resolution path (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-encoded-state-cache.test.ts` (new) — same-`GameState`/same-runtime constructions share one `encodedState` reference; distinct `GameState`s do not collide. `@test-class: architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine test:unit` (targeted)
2. `pnpm -F @ludoforge/engine test:integration` (forked-vs-fresh parity)
3. `pnpm -F @ludoforge/engine test:perf` (witness — `buildEncodedState` self-time drops materially)
4. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`
5. `pnpm -F @ludoforge/engine test && pnpm -F @ludoforge/engine test:integration:fitl-rules`

## Outcome

Completion date: 2026-05-15. Implementation complete.

What landed:

- Added `GameDefRuntime.policyEncodedStateCache` as a `runLocal` `WeakMap<GameState, EncodedState>` constructed in `createGameDefRuntime` and reset to a fresh `WeakMap` in `forkGameDefRuntimeForRun`.
- Changed `PolicyEvaluationContext` to resolve `encodedState` through `input.runtime.policyEncodedStateCache` when a runtime is present and the context uses the canonical per-`GameDef` encoded-state layout.
- Preserved `input.encodedState` precedence and preserved the runtime-absent / explicit non-canonical layout fallback path as a direct fresh build.
- Added `packages/engine/test/unit/agents/policy-encoded-state-cache.test.ts` covering same-object cache reuse, distinct-`GameState` non-collision, run-local fork reset, explicit `encodedState` precedence, and byte-equivalence with a fresh `buildEncodedState` result.
- Verified `packages/engine/src/kernel/eval-runtime-resources-contract.ts` requires no edit: `policyEncodedStateCache` is read directly from `CreatePolicyEvaluationContextInput.runtime` and does not flow into the `EvalRuntimeResources` subset.

Sibling-option `GameState` sharing:

- `microturn-option-evaluator.ts` and `policy-agent-inner-preview.ts` pass the same `input.state` object to each sibling `scoreMicroturnOptionWithContributions` call. `driveSyntheticCompletion` maintains a separate local preview `state` only after the scored option path begins. Object-identity keying therefore matches the live Phase 4 redundancy seam; no canonical-digest key upgrade is needed.

Generated/schema fallout: none expected. No serialized trace/result, schema, GameDef, or golden shape changed.

Deferred scope:

- `172POLEVASTA-006` still owns the constructor-wide no-direct-build architectural invariant, flipping the combined `172POLEVASTA-001` perf witness fully green, and the headline ARVN deep-preview completion check.

Source-size ledger:

| path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor |
|---|---:|---:|---|---|---|---|
| `packages/engine/src/agents/policy-evaluation-core.ts` | 2234 | 2249 | no; preexisting oversize | 15 lines | extraction would widen and obscure the constructor encoded-state-cache seam | none |

Final command ledger:

| ticket section | literal command/shorthand | status |
|---|---|---|
| Test Plan | `pnpm -F @ludoforge/engine test:unit` | passed; 5723 tests / 957 suites |
| Test Plan | `pnpm -F @ludoforge/engine test:integration` | passed; 293/293 files |
| Test Plan | `pnpm -F @ludoforge/engine test:perf` | ran red only on the combined Spec 172 witness: `total=451`, `threshold=4`, `buildEncodedState=413`; current-ticket phase accepted because `buildEncodedState` dropped materially from the archived `172POLEVASTA-004` value of `5039`, while the remaining combined threshold is owned by `172POLEVASTA-006` |
| Test Plan | `pnpm turbo build` | passed; engine and runner executed, engine-wasm cache-hit replayed as supplemental |
| Test Plan | `pnpm turbo lint` | passed; engine executed, runner cache-hit replayed as supplemental |
| Test Plan | `pnpm turbo typecheck` | passed; engine and runner typecheck executed, repeated engine build cache-hit replayed as supplemental |
| Test Plan | `pnpm -F @ludoforge/engine test` | passed; default lane completed with 81/81 files passed after unit and architecture phases |
| Test Plan | `pnpm -F @ludoforge/engine test:integration:fitl-rules` | passed; 79/79 files |
| Closeout | `pnpm run check:ticket-deps` | passed; 2 active tickets and 2340 archived tickets |

Pre-final verification already observed:

- `pnpm -F @ludoforge/engine build` failed before implementation on the new test because `GameDefRuntime.policyEncodedStateCache` did not exist.
- `pnpm -F @ludoforge/engine build` passed after implementation.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-encoded-state-cache.test.js` passed.

Late-edit validity:

- After the final proof runs, the only remaining ticket edits were terminal status and proof-ledger transcription. No source, test, schema, generated artifact, command semantics, scope boundary, dependency edge, or acceptance criterion changed, so the implementation proof was not invalidated by this closeout edit.
