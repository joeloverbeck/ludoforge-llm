# 144PROBEREC-001: Deep probe + minimal LRU + memoization cache (I1/I2)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel microturn publication, GameDefRuntime, new shared LRU
**Deps**: `specs/144-probe-and-recover-microturn-publication.md`

## Problem

The microturn publication probe at `packages/engine/src/kernel/microturn/publish.ts:194` terminates in `isSupportedChoiceRequest(continuation.nextDecision)` — a shape-only check that accepts any `chooseOne` / `chooseN` next decision without verifying it has ≥ 1 legal option. Under FITL on seed 1001, the NVA `march` pipeline's `confirm` candidate is therefore published even though its resume opens a `chooseN` frame with zero options at one of the selected destinations; `applyPublishedDecision` succeeds, the next `publishMicroturn` throws `MICROTURN_CONSTRUCTIBILITY_INVARIANT`, and the simulator surrenders to `noLegalMoves`. This violates Foundation #18.

This ticket closes the publication-side hole by recursively verifying bridgeability to depth `K=3`, backed by a run-scoped memoization cache. It does not implement the runtime rollback safety net (ticket 002); the two changes together form the amended F#18 contract (publication + runtime).

## Assumption Reassessment (2026-04-24)

1. `publish.ts:194` still contains `return isSupportedChoiceRequest(continuation.nextDecision);` — confirmed by reassessment.
2. `isSupportedChoiceRequest` is defined at `publish.ts:79-80` and has exactly one caller (line 194) — confirmed by reassessment.
3. `toChooseNStepDecisions` (`publish.ts:442-531`) already verifies bridgeability for `add` candidates via recursive `isSupportedFrameContinuationMove` calls at lines 505 and 521 — the hole is specifically the `confirm` candidate path, which only gets the shape check.
4. `GameDefRuntime` currently has seven fields, none named `probeCache` at the runtime level (there is a session-scoped `probeCache` at `packages/engine/src/kernel/choose-n-session.ts:258`, deliberately distinct). The new field is named `publicationProbeCache` to avoid collision.
5. No `LruCache` type exists anywhere in the codebase — this ticket introduces one at `packages/engine/src/shared/lru-cache.ts`. No npm dependency is added per F#14.
6. `createGameDefRuntime` is invoked at six source sites (`simulator.ts:123`, `publish.ts:56`, `apply.ts` ×2, `resume.ts`) — all flow through the factory, so the new cache initialization needs to happen only inside the factory body.

## Architecture Check

1. The probe is pure: it reuses the existing `applyEffects` / `resumeSuspendedEffectFrame` paths which already satisfy F#11 (immutability). No draft state escapes the probe.
2. `MICROTURN_PROBE_DEPTH_BUDGET = 3` makes F#10 (bounded computation) explicit. Budget decrements on recursion; depth-0 returns `bridgeable` optimistically, letting ticket 002's rollback catch any residual gap.
3. Memoization key `probe:${stateHash}:${frameId}:${decisionKey}:${candidateValueStableKey}:${depthBudget}` is a pure function of the inputs, preserving F#8 determinism. Removing the cache produces identical verdicts — it is strictly an accelerator.
4. `LruCache<K, V>` is implemented internally to avoid an external dependency per F#14. ~40 LoC map + linked-list.
5. Iteration order in `isBridgeableNextDecision` preserves the published `options` order, so the first-legal-hit short-circuit is deterministic.
6. No game-specific branching: the probe reads DSL AST types only (F#1).

## What to Change

### 1. New minimal LRU at `packages/engine/src/shared/lru-cache.ts`

Implement `class LruCache<K, V>` with:
- constructor `(evictionLimit: number)`
- `get(key: K): V | undefined` (promotes to most-recent)
- `set(key: K, value: V): void` (evicts least-recent at capacity)
- `size: number`
- `clear(): void`

Use a `Map` (which preserves insertion order in JS) with delete-then-set to promote entries. No external deps.

### 2. I1 probe-depth audit

Produce `campaigns/phase4-probe-recover/depth-audit.md` with one row per FITL action using `chooseN` / nested `chooseOne` / `forEach`-with-sub-choices. For each, record the observed deepest nested chooser chain and the probe depth that catches an induced dead end. Expected result: `march-nva-profile` is the deepest at 2 nested levels — `K=3` has one level of headroom. Any action requiring `K>3` is called out explicitly.

### 3. I2 memoization cost/benefit measurement

Produce `campaigns/phase4-probe-recover/memoization-measurement.md` measuring on the 18-seed campaign corpus:
- cache hit rate per game
- wall-clock delta with vs. without the cache
- peak cache size (to size the LRU eviction limit)

If hit rate < 15% OR total slowdown-without-memo < 5%, remove the cache from this ticket's scope and document the decision. Default LRU size is 10000; tune based on measured peak.

### 4. New probe module `packages/engine/src/kernel/microturn/probe.ts`

Export:
```ts
export interface ProbeContext { readonly def: GameDef; readonly state: GameState; readonly runtime: GameDefRuntime; readonly move: Move; readonly depthBudget: number }
export type ProbeVerdict = { kind: 'bridgeable' } | { kind: 'unbridgeable'; reason: ProbeUnbridgeableReason };
export type ProbeUnbridgeableReason = 'noLegalOptions' | 'applyThrewIllegal' | 'nextFrameHadNoLegal' | 'depthExhausted';
export const MICROTURN_PROBE_DEPTH_BUDGET = 3 as const;
export const isBridgeableNextDecision = (ctx: ProbeContext, request: ChoicePendingRequest): boolean => { ... }
```

`isBridgeableNextDecision` dispatches on `request.type`:
- `chooseOne`: `legal = options.filter(o => o.legality !== 'illegal')`; return `legal.length > 0 && legal.some(option => probeOneBridge(ctx, request, option, budget-1))`
- `chooseN`: `hasLegalAddThatBridges(ctx, request, budget-1) || canConfirmBridgeably(ctx, request, budget-1)`

Live-surface correction: `ChoicePendingRequest` currently contains only `chooseOne | chooseN`; stochastic continuations live on `DecisionContinuationResult.stochasticDecision` and remain handled by `publish.ts` before the probe is called. `ProbeContext` includes the current `move` because the live `resumeSuspendedEffectFrame` API resolves selected values from `move.params`.

`probeOneBridge` speculatively applies the candidate via `resumeSuspendedEffectFrame`, inspects the continuation, and recurses on its `nextDecision` (or returns `true` if terminal/auto-resolvable). Memoization lives at this entry point, keyed as specified in D3.

At `depthBudget === 0`, return `true` (optimistic — ticket 002's rollback is the safety net).

### 5. Extend `GameDefRuntime` with `publicationProbeCache`

In `packages/engine/src/kernel/gamedef-runtime.ts`:
- Add `readonly publicationProbeCache: LruCache<string, boolean>` to the interface (alongside existing `ruleCardCache`, etc.).
- Import `LruCache` from `../shared/lru-cache.js`.
- In `createGameDefRuntime` (line 61), instantiate `new LruCache<string, boolean>(10_000)` (or the I2-tuned size) and include it in the returned object.
- In `forkGameDefRuntimeForRun` (line 88), reset the cache per run: `publicationProbeCache: new LruCache(...)`. Cross-run cache sharing would violate run-boundary purity.

### 6. Rewire `publish.ts` to call the new probe

Replace line 194:
```ts
return isSupportedChoiceRequest(continuation.nextDecision);
```
with:
```ts
return isBridgeableNextDecision(
  { def, state, runtime: getRuntime(def, runtime), move, depthBudget: MICROTURN_PROBE_DEPTH_BUDGET },
  continuation.nextDecision,
);
```

Remove the unused `isSupportedChoiceRequest` helper if no other caller remains after the rewrite (reassessment confirmed only one caller today).

## Files to Touch

- `packages/engine/src/shared/lru-cache.ts` (new)
- `packages/engine/test/unit/shared/lru-cache.test.ts` (new)
- `packages/engine/src/kernel/microturn/probe.ts` (new)
- `packages/engine/test/unit/kernel/microturn/deep-probe.test.ts` (new)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify)
- `packages/engine/src/kernel/microturn/publish.ts` (modify)
- `campaigns/phase4-probe-recover/depth-audit.md` (new — I1 artifact)
- `campaigns/phase4-probe-recover/memoization-measurement.md` (new — I2 artifact)

## Out of Scope

- Rollback / blacklist / `ProbeHoleRecoveryLog` — ticket 002.
- `GameTrace` schema updates — ticket 005.
- F#18 amendment in `docs/FOUNDATIONS.md` — ticket 003.
- Convergence-witness re-bless — ticket 003 (this ticket may change decision counts; 003 captures the re-bless atomically after 002 also lands).
- Diagnostic harness rewire — ticket 004.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test packages/engine/test/unit/shared/lru-cache.test.ts` — LRU get/set/eviction/clear semantics.
2. `pnpm -F @ludoforge/engine test packages/engine/test/unit/kernel/microturn/deep-probe.test.ts` — probe returns correct verdicts for crafted continuations (chooseOne / chooseN / chooseNStep / terminal); stochastic continuations remain covered by `publish.ts`'s existing distribution handling; zero-option frames → unbridgeable; `K=0` → `bridgeable` (optimistic); purity (same inputs → same verdict across repeated invocations).
3. Existing engine suite: `pnpm turbo test`. No regressions expected; campaign-level seed 1001 may still fail until 002 lands (rollback safety net).

### Invariants

1. `isBridgeableNextDecision` is pure: identical `(ctx, request)` → identical verdict across invocations (enforced by test).
2. Memoization does not change verdicts — removing the cache (passing a no-op `{ get: () => undefined, set: () => {} }` double) produces byte-identical test outcomes.
3. Budget decrements exactly once per recursion; `K=3` default is respected.
4. `publicationProbeCache` is `runLocal` — forked per run by `forkGameDefRuntimeForRun`. Cross-run sharing is impossible (structural test asserts the cache instance differs after fork).
5. Publish-side behavior: for any `continuation.nextDecision` with zero legal options at depth ≤ `K`, `isBridgeableNextDecision` returns `false`. (architectural-invariant test.)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/shared/lru-cache.test.ts` — LRU core semantics (`@test-class: architectural-invariant`).
2. `packages/engine/test/unit/kernel/microturn/deep-probe.test.ts` — probe dispatch + purity + budget + short-circuit ordering (`@test-class: architectural-invariant`).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test packages/engine/test/unit/shared/lru-cache.test.ts`
3. `pnpm -F @ludoforge/engine test packages/engine/test/unit/kernel/microturn/deep-probe.test.ts`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`
6. `pnpm turbo test`

## Outcome

Completion date: 2026-04-24

Implemented the option-1 live boundary: deep publication probing applies to the current `ChoicePendingRequest` union (`chooseOne | chooseN`) and `publish.ts` keeps stochastic continuations on its existing `toStochasticDistribution(...)` path. `ProbeContext` includes the current `move` because live suspended-frame resumption reads selected values from `move.params`.

Added:
- `packages/engine/src/shared/lru-cache.ts`
- `packages/engine/test/unit/shared/lru-cache.test.ts`
- `packages/engine/src/kernel/microturn/probe.ts`
- `packages/engine/test/unit/kernel/microturn/deep-probe.test.ts`
- `campaigns/phase4-probe-recover/depth-audit.md`
- `campaigns/phase4-probe-recover/memoization-measurement.md`

Modified:
- `packages/engine/src/kernel/gamedef-runtime.ts` adds run-local `publicationProbeCache`.
- `packages/engine/src/kernel/microturn/publish.ts` calls the deep probe instead of the old shape-only helper.
- `packages/engine/src/kernel/index.ts` exports the probe module.
- `packages/engine/test/unit/sim/simulator.test.ts` asserts the new runtime cache forks per run.
- `packages/engine/test/unit/kernel/condition-annotator.test.ts` uses the runtime factory instead of a hand-authored `GameDefRuntime` literal.
- `packages/engine/test/unit/kernel/microturn/deep-probe.test.ts` includes the post-review no-cache verdict-equivalence invariant.
- `specs/144-probe-and-recover-microturn-publication.md` was corrected to match the live stochastic/request boundary.

Deviation:
- The production deep-probe seam and bounded calibration landed, but the original I1/I2 evidence gates did not fully land. `campaigns/phase4-probe-recover/depth-audit.md` is a source-derived category audit rather than one row per FITL action, and `campaigns/phase4-probe-recover/memoization-measurement.md` records a one-turn 18-seed calibration because the full 500-turn and 25-turn doubled corpus measurements exceeded bounded interactive time. Follow-up `archive/tickets/144PROBEREC-006.md` owns the full I1/I2 evidence completion and final cache-retention decision.

Outcome amended: 2026-04-24

Follow-up `archive/tickets/144PROBEREC-006.md` completed the full I1/I2 evidence gate and final cache-retention decision.

Verification:
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine test packages/engine/test/unit/shared/lru-cache.test.ts`
- `pnpm -F @ludoforge/engine test packages/engine/test/unit/kernel/microturn/deep-probe.test.ts`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
- `pnpm turbo test`
