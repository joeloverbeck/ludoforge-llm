# FITLGOLT4-002: `effectTiming` and Deferred Event Effects

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — event execution, turn flow state, types, schema
**Deps**: None

## Problem

Gulf of Tonkin (card-1) grants a free Air Strike **then** deploys 6 US pieces to cities. The current engine executes event effects (`EventSideDef.effects`) immediately when the event move is applied (`executeEventMove` in `event-execution.ts:675`), and separately enqueues free operation grants via `extractPendingFreeOperationGrants` in `turn-flow-eligibility.ts:721`. This means the deployment effects fire **before** the free Air Strike grant is consumed. The playbook requires the Air Strike to resolve first (removing VC guerrillas, shifting opposition, degrading trail), and deployment to happen **after**.

The same ordering issue affects card-6 (Aces): free Air Strike, then Degrade Trail −2.

## Assumption Reassessment (2026-02-25)

1. **`executeEventMove` runs effects at event-move time** — confirmed in `event-execution.ts` (`executeEventMove`). It runs inside `apply-move.ts` before turn-flow grant extraction.
2. **Free operation grants are enqueued after action execution** — confirmed in `applyTurnFlowEligibilityAfterMove` (`turn-flow-eligibility.ts`) via `extractPendingFreeOperationGrants`.
3. **Free operation moves do _not_ run `applyTurnFlowEligibilityAfterMove`** — confirmed in `apply-move.ts`: free-operation moves call `consumeTurnFlowFreeOperationGrant` directly. Therefore, deferred-event release logic must be wired into free-operation grant consumption (or a shared helper called from there), not only the normal eligibility path.
4. **No `effectTiming` field exists anywhere in the codebase** — confirmed via grep. This is net-new.
5. **`EventSideDef` in `types-events.ts:71-79`** — has `effects`, `freeOperationGrants`, `eligibilityOverrides`, `branches`, `targets`, `lastingEffects`, `text`. No timing field.
6. **Schema layers** — no `effectTiming` property currently exists in either `schemas-extensions.ts` (source schema) or generated `GameDef.schema.json`.

## Architecture Check

1. **Why this approach is better than current architecture**: Current architecture has a hardcoded temporal assumption (“event effects now, grants later”) baked into execution order. `effectTiming` introduces an explicit declarative timing contract in event data, making ordering robust and extensible without card-specific kernel branches.
2. **Preferred runtime design**: Use a batch-scoped deferred queue in `TurnFlowRuntimeState` (each deferred payload tied to the emitted free-operation grant batch ids). This is cleaner and more extensible than a single global deferred slot because it safely handles multi-chain grants and future concurrent deferred batches.
3. **Game-specific vs engine-agnostic**: `effectTiming` remains a generic engine primitive. FITL uses it, but no FITL identifiers/rules enter kernel logic.
4. **Behavioral default**: omitted `effectTiming` preserves current behavior (`beforeGrants`). `afterGrants` changes only explicitly opted-in events.

## What to Change

### 1. Add `effectTiming` to `EventSideDef` type

In `packages/engine/src/kernel/types-events.ts`, add to `EventSideDef`:

```typescript
readonly effectTiming?: 'beforeGrants' | 'afterGrants';
```

### 2. Add `effectTiming` to `EventBranchDef` type

Same file, add to `EventBranchDef` for branch-level override consistency.

### 3. Add deferred effects to turn flow runtime state

In `packages/engine/src/kernel/types-turn-flow.ts`, add to `TurnFlowRuntimeState`:

```typescript
readonly pendingDeferredEventEffects?: readonly {
  readonly deferredId: string;
  readonly requiredGrantBatchIds: readonly string[];
  readonly effects: readonly import('./types-ast.js').EffectAST[];
  readonly moveParams: Readonly<Record<string, import('./types-ast.js').MoveParamValue>>;
  readonly actorPlayer: number;
  readonly actionId: string;
}[];
```

### 4. Modify event execution to respect `effectTiming`

In `packages/engine/src/kernel/event-execution.ts`:
- `executeEventMove`: when the resolved side/branch timing is `afterGrants`, skip immediate `eventEffects` execution and return them as deferred payload (effects + move params + actor/action metadata).
- Branch timing overrides side timing when both are present.

### 5. Store deferred effects when `afterGrants`

In `packages/engine/src/kernel/turn-flow-eligibility.ts` (`applyTurnFlowEligibilityAfterMove`):
- When the event move has deferred effects, associate them with the new grant batch ids emitted by this move and append to `pendingDeferredEventEffects`.
- If timing is `afterGrants` but no free-operation grants were emitted, execute effects immediately (no deferred state).

### 6. Fire deferred effects when all grants are consumed

In `packages/engine/src/kernel/turn-flow-eligibility.ts`:
- In `consumeTurnFlowFreeOperationGrant`, after decrement/removal, detect deferred payloads whose `requiredGrantBatchIds` no longer appear in pending grants.
- Execute those deferred effects in deterministic order, then remove them from runtime state.

### 7. Update `GameDef.schema.json`

Add `effectTiming` as an optional enum property (`["beforeGrants", "afterGrants"]`) to event side and event branch schemas. Update both:
- `packages/engine/src/kernel/schemas-extensions.ts` (source schema)
- generated `packages/engine/schemas/GameDef.schema.json`

### 8. Update compiler (`compile-event-cards.ts`)

No explicit compiler logic should be required beyond type/schema support because `lowerEventCardSide` and branch lowering already preserve unknown-internal typed fields through object spread. Confirm via tests.

## Files to Touch

- `packages/engine/src/kernel/types-events.ts` (modify) — add `effectTiming` to `EventSideDef` and `EventBranchDef`
- `packages/engine/src/kernel/types-turn-flow.ts` (modify) — add `pendingDeferredEventEffects` to `TurnFlowRuntimeState`
- `packages/engine/src/kernel/event-execution.ts` (modify) — respect `effectTiming`, return deferred effects
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify) — store deferred effects, fire when grants consumed
- `packages/engine/src/kernel/schemas-extensions.ts` (modify) — add `effectTiming` enum and runtime deferred payload schema
- `packages/engine/schemas/GameDef.schema.json` (modify) — add `effectTiming` enum
- `packages/engine/test/integration/event-effect-timing.test.ts` (new) — integration test for deferred execution

## Out of Scope

- Changing any existing event card encodings (that's FITLGOLT4-003)
- The golden E2E test (that's FITLGOLT4-004)
- Support for more than two timing values (e.g. `duringGrants`)
- Additional timing modes beyond `beforeGrants` and `afterGrants`

## Acceptance Criteria

### Tests That Must Pass

1. **New**: Event with `effectTiming: 'afterGrants'` — effects do NOT run at event-move time; they run after all free operation grants from that event are consumed.
2. **New**: Event with `effectTiming: 'beforeGrants'` (explicit) — effects run at event-move time, same as default.
3. **New**: Event with no `effectTiming` (omitted) — effects run at event-move time (backwards compat).
4. **New**: Event with multiple grants — deferred effects fire only after the LAST grant is consumed.
5. **New**: Branch-level `effectTiming` overrides side-level timing.
6. Existing suite: `pnpm turbo test --force`

### Invariants

1. Events without `effectTiming` behave identically to current behavior — zero regression.
2. Deferred effects see the game state AFTER all grants have resolved (i.e. post-Air-Strike state for Gulf of Tonkin).
3. No game-specific logic in kernel code — `effectTiming` is fully generic.
4. Schema validates both old (no `effectTiming`) and new (with `effectTiming`) event definitions.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/event-effect-timing.test.ts` — synthetic GameDef with event timing variants (`afterGrants`, explicit `beforeGrants`, omitted timing) and verifiable state changes.
2. `packages/engine/test/integration/event-effect-timing.test.ts` — include multi-grant batch case verifying deferred effects fire only after last grant.
3. `packages/engine/test/integration/event-effect-timing.test.ts` — include branch-level override case.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm turbo schema:artifacts`

## Outcome

- Completion date: 2026-02-25
- What changed:
  - Added generic `effectTiming` support to event side/branch types and schema layers.
  - Implemented deferred event-effect payload tracking in card-driven runtime state.
  - Deferred `afterGrants` event effects now release only when their associated free-operation grant batch(es) are fully consumed.
  - Added integration coverage in `event-effect-timing.test.ts` for `afterGrants`, explicit `beforeGrants`, omitted timing default, multi-grant release, and branch override behavior.
- Deviations from original plan:
  - `compile-event-cards.ts` required no explicit change; object-spread lowering already preserves typed fields once schema/types are updated.
  - Deferred effect execution is performed in `apply-move.ts` after turn-flow release (to preserve trigger dispatch semantics), while turn-flow code only tracks/releases payloads.
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo schema:artifacts` passed.
