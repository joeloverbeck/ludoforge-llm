# 141RUNCACHE-001: Runtime member ownership classification and per-member cache tests

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/gamedef-runtime.ts`, possibly `forkGameDefRuntimeForRun`
**Deps**: `specs/141-runtime-cache-run-boundary.md`

## Problem

`GameDefRuntime` (`packages/engine/src/kernel/gamedef-runtime.ts:28-36`) has 7 members today, classified only implicitly. `forkGameDefRuntimeForRun(...)` resets `zobristTable.keyCache` but leaves `ruleCardCache` (also mutable, mutated via `.set()` in `packages/engine/src/kernel/condition-annotator.ts:401,430`) shared across runs. The architectural boundary between `sharedStructural` and `runLocal` state is real but implicit.

Spec 141 Design §1 + §4 require every member to be classified and the cache policy declared explicitly. Without this contract, future members may drift across the boundary unnoticed, and the current `forkGameDefRuntimeForRun` is a targeted fix rather than a comprehensive ownership model — a Foundation 15 gap.

## Assumption Reassessment (2026-04-22)

1. Verified `GameDefRuntime` shape at `packages/engine/src/kernel/gamedef-runtime.ts:28-36` during Spec 141 reassessment. Seven members: `adjacencyGraph`, `runtimeTableIndex`, `zobristTable`, `alwaysCompleteActionIds`, `firstDecisionDomains`, `ruleCardCache`, `compiledLifecycleEffects`.
2. Verified `forkGameDefRuntimeForRun` at lines 60-68 resets only `zobristTable.keyCache`.
3. Verified `ruleCardCache.set(...)` call sites at `packages/engine/src/kernel/condition-annotator.ts:401, 430` — the cache is actively mutated during execution.
4. Existing baseline test confirmed at `packages/engine/test/unit/sim/simulator.test.ts:247` — `'treats shared runtime zobrist caches as per-run state'`. Covers Zobrist only.
5. `ruleCardCache` keys are `(actionId, eventCard.id)` tuples bounded by the compiled GameDef; RuleCard values are pure functions of `(GameDef, actionId)`. This supports a `sharedStructural` classification with bounded-key-universe proof, per Spec 141 Design §4. Alternative: classify `runLocal` and extend the fork. Either is acceptable; the decision lands in this ticket.

## Architecture Check

1. Explicit per-member classification closes the Foundation 15 gap — no more "targeted fix" hiding as a design. The contract becomes enforceable: every member declares its class, every mutation site is justified against that class.
2. Classification is generic kernel metadata (no game-specific logic); Foundation 1 holds trivially.
3. No backwards-compatibility shims. If `ruleCardCache` is reclassified `runLocal`, `forkGameDefRuntimeForRun` is extended in the same change. Existing callers (both production `simulator.ts` and test helper `zobrist-incremental-property-helpers.ts`) already pass their runtime through the fork, so no call-site migration is required.
4. Foundation 16 (testing as proof) is the linchpin: per-member assertions make the declared classification a runtime-verified invariant rather than a comment.

## What to Change

### 1. Classify each `GameDefRuntime` member

Annotate the `GameDefRuntime` interface in `packages/engine/src/kernel/gamedef-runtime.ts` with a per-field JSDoc declaring the ownership class. Expected baseline classification (implementer may refine if a stronger proof surfaces during the audit):

| Member | Class | Justification |
|---|---|---|
| `adjacencyGraph` | `sharedStructural` | Pure function of `def.zones`; never mutated. |
| `runtimeTableIndex` | `sharedStructural` | Pure function of `def`; never mutated. |
| `zobristTable` (seed/fingerprint/seedHex/sortedKeys) | `sharedStructural` | Immutable structural fields. |
| `zobristTable.keyCache` | `runLocal` | Mutable `Map`; populated during execution; already reset by `forkGameDefRuntimeForRun`. |
| `alwaysCompleteActionIds` | `sharedStructural` | Pure `ReadonlySet` derived from `def`. |
| `firstDecisionDomains` | `sharedStructural` | Compiled once from `def`; immutable. |
| `ruleCardCache` | **decide**: either `sharedStructural` (bounded `(actionId, eventCard.id)` key universe, immutable values) or `runLocal` (treat like `keyCache`). |
| `compiledLifecycleEffects` | `sharedStructural` | `ReadonlyMap`; compiled once from `def`. |

Document the chosen classification for `ruleCardCache` in a JSDoc comment with the specific justification (either "bounded structural key universe" or "treated as runLocal to match keyCache discipline").

### 2. Extend `forkGameDefRuntimeForRun` if needed

If `ruleCardCache` is classified `runLocal`, extend `forkGameDefRuntimeForRun` to reset it:

```ts
export function forkGameDefRuntimeForRun(runtime: GameDefRuntime): GameDefRuntime {
  return {
    ...runtime,
    zobristTable: { ...runtime.zobristTable, keyCache: new Map() },
    ruleCardCache: new Map(),  // if runLocal
  };
}
```

If classified `sharedStructural`, add a block JSDoc above `forkGameDefRuntimeForRun` documenting exactly which fields are NOT reset and why the bounded-key proof permits sharing.

### 3. Per-member classification tests

Extend `packages/engine/test/unit/sim/simulator.test.ts:247` into a table-driven per-member test. For each `runLocal` member, assert that its state at the start of a forked run is the declared reset state (empty `Map`). For each `sharedStructural` member, assert that the same reference is preserved across `forkGameDefRuntimeForRun`. The existing Zobrist test becomes one row of the new coverage.

Alternatively, split into a dedicated `packages/engine/test/unit/kernel/gamedef-runtime-ownership.test.ts` if the `simulator.test.ts` file would grow past its natural size.

### 4. Document the contract in kernel architecture docs

Append a short subsection to `docs/architecture.md` (or the nearest kernel architecture doc — confirm during implementation) naming the two classes, the member table, and the forking invariant. This is the documentation deliverable from Spec 141 Required Changes → Runtime contract.

## Files to Touch

- `packages/engine/src/kernel/gamedef-runtime.ts` (modify — annotate members; possibly extend fork)
- `packages/engine/test/unit/sim/simulator.test.ts` (modify — extend per-member coverage), OR
- `packages/engine/test/unit/kernel/gamedef-runtime-ownership.test.ts` (new — if split preferred)
- `docs/architecture.md` (modify — add runtime ownership subsection; confirm exact path during implementation)

## Out of Scope

- Helper API surface audit and JSDoc contract on `runGame`/`runVerifiedGame` (141RUNCACHE-002).
- Forked-vs-fresh parity witness across corpora (141RUNCACHE-003).
- Helper path vs canonical run path equivalence witness (141RUNCACHE-004).

## Acceptance Criteria

### Tests That Must Pass

1. Per-member classification test: every `runLocal` member resets on `forkGameDefRuntimeForRun`; every `sharedStructural` member's reference is preserved.
2. Existing baseline test `simulator.test.ts:247` remains green (may be subsumed into new coverage).
3. Full engine suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. Every `GameDefRuntime` member declares an ownership class via JSDoc; no member is silently mutable.
2. `forkGameDefRuntimeForRun` resets exactly the set of `runLocal` members, no more and no less.
3. `sharedStructural` members remain referentially equal across forks; this is observable in the test.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/simulator.test.ts` (or new `gamedef-runtime-ownership.test.ts`) — extended per-member classification table; asserts the runtime-level invariant that fork semantics match declared classes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/sim/simulator.test.js`
3. `pnpm -F @ludoforge/engine typecheck`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm -F @ludoforge/engine test:all`

## Outcome

- `ticket corrections applied`: `pnpm -F @ludoforge/engine test` -> `pnpm -F @ludoforge/engine build` plus focused `node --test dist/test/unit/sim/simulator.test.js`; `pnpm turbo typecheck` / `lint` / `test` -> package-local engine `typecheck` / `lint` / `test:all` for the owned kernel slice.
- `verification set`: `pnpm -F @ludoforge/engine build`; `pnpm -F @ludoforge/engine exec node --test dist/test/unit/sim/simulator.test.js`; `pnpm -F @ludoforge/engine typecheck`; `pnpm -F @ludoforge/engine lint`; `pnpm -F @ludoforge/engine test:all`
- `proof gaps`: none

Implemented the Spec 141 runtime-ownership contract for the live `GameDefRuntime` shape:

- annotated every runtime member with an explicit ownership class
- declared `zobristTable.keyCache` as the only `runLocal` member reset by `forkGameDefRuntimeForRun(...)`
- documented `ruleCardCache` as `sharedStructural` under its bounded structural key universe
- extended the simulator unit coverage into a per-member fork-classification witness
- added the missing runtime-ownership subsection to `docs/architecture.md`
