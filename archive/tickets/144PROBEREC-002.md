# 144PROBEREC-002: Rollback safety net + blacklist state + GameTrace migration (I3)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel rollback module, GameState/GameTrace types, simulator, actionSelection publisher, seven GameTrace construction-site migration
**Deps**: `archive/tickets/144PROBEREC-001.md`

## Problem

The deep probe from ticket 001 closes the shallow-check hole, but cannot guarantee full coverage for all game specs: branches deeper than `K=3` or future bugs may still produce a published decision that proves unbridgeable at apply time. Today the simulator catches such errors via `isNoBridgeableMicroturnError` at `packages/engine/src/sim/simulator.ts:91-96` and surrenders to `stopReason='noLegalMoves'` (lines 177-185) — breaking campaign tooling and masking the root cause.

This ticket implements the runtime safety net: on constructibility failure, roll back to the nearest `actionSelection` frame, blacklist the offending action for the current `(turnId, seatId)`, and re-publish. If the post-rollback action-selection frame has no remaining legal actions, fall back to the game-spec `tags: [pass]` action. Only when both are unavailable does the simulator surrender to `noLegalMoves`.

The recovery event is stored as a trace-only `ProbeHoleRecoveryLog` in a new `GameTrace.probeHoleRecoveries` array — NOT in `GameTrace.decisions[]` and NOT as a `Decision` union variant (preserves F#19).

## Assumption Reassessment (2026-04-24)

1. `simulator.ts:177-185` has the current try/catch setting `stopReason='noLegalMoves'`. `isNoBridgeableMicroturnError` at `simulator.ts:91-96` matches both `'no simple actionSelection moves are currently bridgeable'` and `'has no bridgeable continuations'` — confirmed.
2. `DecisionLog` at `packages/engine/src/kernel/microturn/types.ts:290-309` is a **single interface**, not a union. The `Decision` union at `types.ts:263-269` has six variants. `ProbeHoleRecoveryLog` is added as a **separate trace field**, not as a `DecisionLog`/`Decision` variant, per the reassessed spec D1.
3. `GameTrace` at `packages/engine/src/kernel/types-core.ts:1707-1717` is constructed at seven sites: one source (`simulator.ts:248-258`) and six test fixtures (`serde.test.ts`, `schemas-top-level.test.ts`, `trace-enrichment.test.ts`, `json-schema.test.ts`, `sim/trace-eval.test.ts`, `sim/eval-report.test.ts`). All seven are migrated in this ticket per F#14 (non-optional field addition).
4. `publishActionSelection` is at `publish.ts:586-611`. Extending it to filter by the blacklist is a pre-pipeline step inside `supportedActionMovesForState`.
5. FITL's `pass` action has `tags: [pass]` at `data/games/fire-in-the-lake/30-rules-actions.md:159` with `effects: []` — the I3 audit (below) decides grant-clearing handling.
6. I3 audit correction: Texas Hold'em did not already declare a `tags: [pass]` fallback. `check` is the rule-valid generic pass carrier because the game's verbalization defines it as "Pass without adding chips to the pot" and its precondition requires `streetBet == currentBet`. `fold` remains fold-only.
7. Live package tests run `schema:artifacts:check` before focused files. Adding non-optional `GameTrace` fields therefore required absorbing the `Trace.schema.json` artifact extension into this ticket for F#14; ticket 005 is narrowed to replay-identity proof.
6. Free-operation grants live in `state.turnOrderState.pendingFreeOperationGrants` (`TurnFlowRuntimeState`), not directly in `GameState` — I3 audit addresses grant survival across rollback.

## Architecture Check

1. Rollback is a deterministic function of `(state, offendingAction)` — identical inputs produce identical outputs (F#8). The replay-identity test in ticket 005 proves this.
2. `ProbeHoleRecoveryLog` is trace-only. It records state hashes before and after rollback for audit, but it is not a `Decision`: it does not claim to be a player/chance/kernel decision, preserving F#19 ("every kernel-visible decision is atomic"). It lives in a separate `probeHoleRecoveries` array.
3. The blacklist lives in `state.unavailableActionsPerTurn[${turnId}:${seatId}]` and clears at turn retirement. Its scope is bounded per-turn per-seat — F#10.
4. The `tags: [pass]` fallback is the only engine↔game-spec coupling: the engine recognizes one tag name as the terminal-fallback hint. No game names, factions, or action-specific rules in engine code (F#1).
5. The pass action runs through the normal apply pipeline — its effects, grants, turn-retirement semantics are game-authored. The engine does not synthesize a synthetic pass (F#7: specs are data).
6. `GameTrace.probeHoleRecoveries` and `recoveredFromProbeHole` are non-optional per F#14 — the seven construction-site migration lands in the same change.

## What to Change

### 1. I3 pass-action audit at `campaigns/phase4-probe-recover/pass-action-audit.md`

Document each conformance-corpus game's fallback action:
- FITL `pass` at `30-rules-actions.md:159` — `tags: [pass]`, `effects: []` today.
- Texas Hold'em `fold` at line 244, `check` at line 259.
- Engine lookup predicate: `action.tags?.includes('pass')`.

Answer explicitly: when the rollback pops past a scope that opened a free-operation grant (stored in `state.turnOrderState.pendingFreeOperationGrants`), what clears the orphaned grant? Decide among (a) add grant-terminator effects to FITL's `pass`, (b) engine emits a grant-clearing effect at pop time, (c) grant harmlessly expires at turn retirement. The decision determines whether this ticket modifies FITL's pass action, the kernel's rollback function, or neither.

Any corpus game without a `tags: [pass]` action or whose pass cannot be made grant-safe becomes a spec-reviser blocker.

### 2. `ProbeHoleRecoveryLog` type + rollback module at `packages/engine/src/kernel/microturn/rollback.ts`

```ts
export interface ProbeHoleRecoveryLog {
  readonly kind: 'probeHoleRecovery';
  readonly stateHashBefore: bigint;
  readonly stateHashAfter: bigint;
  readonly seatId: ActiveDeciderSeatId;
  readonly turnId: TurnId;
  readonly blacklistedActionId: ActionId;
  readonly rolledBackFrames: number;
  readonly reason: string;
}

export interface RollbackResult {
  readonly state: GameState;
  readonly logEntry: ProbeHoleRecoveryLog;
}

export const rollbackToActionSelection = (
  def: ValidatedGameDef,
  state: GameState,
  runtime: GameDefRuntime,
  invariantMessage: string,
): RollbackResult | null => { ... }
```

Implementation (per spec D4):
1. Walk `state.decisionStack` top→bottom, find nearest frame with `context.kind === 'actionSelection'`; capture its `actionId`.
2. If no such frame, return `null`.
3. `newStack = decisionStack.slice(0, actionSelectionFrameIndex + 1)`.
4. Append captured `actionId` to `state.unavailableActionsPerTurn[${turnId}:${seatId}]`.
5. Reset `state.activeDeciderSeatId`, `state.nextFrameId`, and any stack-derived fields.
6. Return `{ state: newState, logEntry: ProbeHoleRecoveryLog }` with both state hashes recorded.

### 3. Extend `GameState` with `unavailableActionsPerTurn`

In `packages/engine/src/kernel/types-core.ts`, extend `GameState`:
```ts
readonly unavailableActionsPerTurn?: Readonly<Record<string, readonly ActionId[]>>;
```
Optional (pre-existing states without it are treated as empty blacklist). Cleared at turn retirement — amend the turn-retirement handler to drop `${retiringTurnId}:*` keys.

### 4. Extend `GameTrace` with `probeHoleRecoveries` + `recoveredFromProbeHole`

In `packages/engine/src/kernel/types-core.ts`, extend `GameTrace`:
```ts
readonly probeHoleRecoveries: readonly ProbeHoleRecoveryLog[];
readonly recoveredFromProbeHole: number;  // = probeHoleRecoveries.length
```
Both **non-optional** per F#14.

### 5. Simulator rewire in `packages/engine/src/sim/simulator.ts`

- Add a parallel accumulator: `const probeHoleRecoveries: ProbeHoleRecoveryLog[] = [];` (alongside `decisionLogs`).
- In the `try { microturn = publishMicroturn(...) } catch` block (line 177-185), when `isNoBridgeableMicroturnError(error)` returns true:
  ```ts
  const rollback = rollbackToActionSelection(
    validatedDef,
    state,
    resolvedRuntime,
    (error as Error).message,
  );
  if (rollback === null) { stopReason = 'noLegalMoves'; break; }
  state = rollback.state;
  if (shouldRetainTrace) probeHoleRecoveries.push(rollback.logEntry);
  continue;
  ```
- In the final `return { ... }` (line 248-258), include:
  ```ts
  probeHoleRecoveries: shouldRetainTrace ? probeHoleRecoveries : [],
  recoveredFromProbeHole: probeHoleRecoveries.length,
  ```

### 6. Extend `publishActionSelection` with blacklist + pass fallback

In `packages/engine/src/kernel/microturn/publish.ts:586-611`:
- Before enumerating `supportedActionMovesForState`, filter out actions whose `(turnId, seatId, actionId)` appears in `state.unavailableActionsPerTurn`.
- If post-filter result is empty:
  ```ts
  const passAction = def.actions.find(a =>
    a.tags?.includes('pass') &&
    isActionApplicableForSeat(def, state, a, activeSeatForPlayer(def, state))
  );
  if (passAction !== undefined) return publishActionSelectionAsSingletonPass(def, state, passAction);
  throw microturnConstructibilityInvariant('actionSelection has no bridgeable moves and no generic pass fallback declared');
  ```

### 7. Migrate seven `GameTrace` construction sites

Add `probeHoleRecoveries: []` and `recoveredFromProbeHole: 0` to each literal (tests can use constants since the values are deterministic zero for pre-spec fixtures):
- `packages/engine/src/sim/simulator.ts:248-258` (source — uses real accumulator values)
- `packages/engine/test/unit/serde.test.ts`
- `packages/engine/test/unit/schemas-top-level.test.ts`
- `packages/engine/test/unit/trace-enrichment.test.ts` (two sites in `makeMockTrace`)
- `packages/engine/test/unit/json-schema.test.ts`
- `packages/engine/test/unit/sim/trace-eval.test.ts`
- `packages/engine/test/unit/sim/eval-report.test.ts`

### 8. Rollback + blacklist unit tests + synthetic safety-net integration test

- `packages/engine/test/unit/kernel/microturn/rollback.test.ts` (`@test-class: architectural-invariant`): correct `actionSelection` frame selection; blacklist appends correctly; clears at turn retirement; `null` return when no `actionSelection` frame; pass-fallback publishes pass when all actions blacklisted; pass-fallback absence → `null` → simulator reaches `noLegalMoves` documented.
- `packages/engine/test/integration/fitl-probe-hole-rollback-safety-net.test.ts` (`@test-class: architectural-invariant`): synthetic GameDef crafted so probe at `K=3` cannot detect a dead end (dead end at depth 4). Asserts `stopReason='terminal'`, `recoveredFromProbeHole >= 1`.

## Files to Touch

- `campaigns/phase4-probe-recover/pass-action-audit.md` (new — I3 artifact)
- `data/games/texas-holdem/30-rules-actions.md` (modify — add `pass` tag to `check`)
- `packages/engine/src/kernel/microturn/rollback.ts` (new)
- `packages/engine/src/kernel/microturn/publish.ts` (modify — blacklist filter + pass fallback in `publishActionSelection`)
- `packages/engine/src/kernel/types-core.ts` (modify — `GameState.unavailableActionsPerTurn`, `GameTrace.probeHoleRecoveries`, `GameTrace.recoveredFromProbeHole`)
- `packages/engine/src/sim/simulator.ts` (modify — rollback integration, parallel recoveries accumulator)
- `packages/engine/src/kernel/schemas-core.ts` (modify — runtime/serialized trace schema mirrors)
- `packages/engine/src/kernel/serde.ts` (modify — recovery hash serialization)
- `packages/engine/src/kernel/zobrist.ts` (modify — hash blacklist state)
- `packages/engine/schemas/Trace.schema.json` (modify — required generated artifact fallout)
- `packages/engine/test/unit/kernel/microturn/rollback.test.ts` (new)
- `packages/engine/test/integration/fitl-probe-hole-rollback-safety-net.test.ts` (new)
- `packages/engine/test/unit/serde.test.ts` (modify — fixture)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify — fixture)
- `packages/engine/test/unit/trace-enrichment.test.ts` (modify — fixture)
- `packages/engine/test/unit/json-schema.test.ts` (modify — fixture)
- `packages/engine/test/unit/sim/trace-eval.test.ts` (modify — fixture)
- `packages/engine/test/unit/sim/eval-report.test.ts` (modify — fixture)
- `packages/engine/test/fixtures/trace/valid-serialized-trace.json` (modify — fixture)
- `packages/engine/test/fixtures/trace/simulator-golden-trace.json` (modify — fixture)
- `packages/engine/test/fixtures/trace/eval-golden-trace.json` (modify — fixture)
- `data/games/fire-in-the-lake/30-rules-actions.md` (conditional modify — only if I3 audit selects path (a) grant-terminator)

## Out of Scope

- Deep probe implementation — ticket 001.
- Replay-identity determinism proof for recovery traces — ticket 005.
- Seed-1001 regression fixture + convergence-witness re-bless — ticket 003 (this ticket's synthetic test exercises the rollback path without needing the FITL fixture).
- F#18 amendment in FOUNDATIONS.md — ticket 003.
- Diagnostic harness rewire / `SimulationOptions.decisionHook` — ticket 004.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test packages/engine/test/unit/kernel/microturn/rollback.test.ts` — rollback semantics, blacklist lifecycle, pass fallback.
2. `pnpm -F @ludoforge/engine test packages/engine/test/integration/fitl-probe-hole-rollback-safety-net.test.ts` — synthetic GameDef reaches terminal via rollback.
3. All migrated `GameTrace` construction-site tests pass (serde, schemas-top-level, trace-enrichment, json-schema, sim/trace-eval, sim/eval-report).
4. Existing engine suite: `pnpm turbo test`.

### Invariants

1. `rollbackToActionSelection` is pure: identical `(state, message)` → identical output `(state, log)` including `stateHashAfter`.
2. Blacklist is turn-scoped: after turn retirement, `state.unavailableActionsPerTurn` contains no entries keyed on the retired turn.
3. `probeHoleRecoveries` is NEVER appended to `decisions[]` — `decisionLogs.push(probeHoleLogEntry)` MUST NOT appear in the codebase (structural-invariant lint/grep-assertion in the test).
4. `recoveredFromProbeHole === probeHoleRecoveries.length` at trace construction.
5. `stopReason === 'noLegalMoves'` is reachable only when rollback cannot identify a new action-selection recovery path, or when the nearest action-selection action is already blacklisted and no `tags: [pass]` fallback is declared in the game spec.
6. The pass action, when used as a fallback, runs through the normal apply pipeline — no synthetic pass is created.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/microturn/rollback.test.ts` — rollback purity, blacklist lifecycle, pass fallback (`@test-class: architectural-invariant`).
2. `packages/engine/test/integration/fitl-probe-hole-rollback-safety-net.test.ts` — synthetic GameDef dead end at depth 4 → rollback fires (`@test-class: architectural-invariant`).
3. Migration of 6 test fixtures (`GameTrace` literal extensions); no semantic changes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test packages/engine/test/unit/kernel/microturn/rollback.test.ts`
3. `pnpm -F @ludoforge/engine test packages/engine/test/integration/fitl-probe-hole-rollback-safety-net.test.ts`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`
6. `pnpm turbo test`

## Outcome

Completed: 2026-04-24

Implemented:
- Added the I3 pass-action audit and tagged Texas Hold'em `check` as `[check, pass]`; `fold` remains fold-only.
- Added `rollbackToActionSelection`, turn/seat-scoped blacklist state, blacklist-aware action publication, generic `tags: [pass]` fallback publication, and turn-retirement blacklist cleanup.
- Added trace-only `ProbeHoleRecoveryLog`, `GameTrace.probeHoleRecoveries`, and `GameTrace.recoveredFromProbeHole`; recoveries are not appended to `decisions[]`.
- Added deterministic hash coverage for `unavailableActionsPerTurn`, serialization/Zod support for recovery logs, generated `Trace.schema.json` fallout, and migrated trace fixtures.
- Post-review cleanup: `rollbackToActionSelection` now returns `null` when the nearest action-selection action is already blacklisted, so pass-fallback absence terminates as `noLegalMoves` instead of retrying an exhausted frame.

Deviation:
- `Trace.schema.json` moved from ticket 005 into this ticket because the live engine package test command requires `schema:artifacts:check` before focused test execution. Leaving the generated schema for ticket 005 would fail ticket 002's own acceptance lanes and violate F#14. Ticket 005 is narrowed to replay-identity proof.
- The integration safety-net test uses a synthetic in-progress action stack to exercise rollback/fallback directly, rather than relying on a brittle full `runGame` stochastic/depth witness.

Verification:
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine test packages/engine/test/unit/kernel/microturn/rollback.test.ts`
- `pnpm -F @ludoforge/engine test packages/engine/test/integration/fitl-probe-hole-rollback-safety-net.test.ts`
- `pnpm -F @ludoforge/engine test packages/engine/test/unit/serde.test.ts packages/engine/test/unit/schemas-top-level.test.ts packages/engine/test/unit/trace-enrichment.test.ts packages/engine/test/unit/json-schema.test.ts packages/engine/test/unit/sim/trace-eval.test.ts packages/engine/test/unit/sim/eval-report.test.ts`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
- `pnpm turbo test`
