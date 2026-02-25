# FITLGOLT4-002: `effectTiming` and Deferred Event Effects

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — event execution, turn flow state, types, schema, compiler
**Deps**: None

## Problem

Gulf of Tonkin (card-1) grants a free Air Strike **then** deploys 6 US pieces to cities. The current engine executes event effects (`EventSideDef.effects`) immediately when the event move is applied (`executeEventMove` in `event-execution.ts:675`), and separately enqueues free operation grants via `extractPendingFreeOperationGrants` in `turn-flow-eligibility.ts:721`. This means the deployment effects fire **before** the free Air Strike grant is consumed. The playbook requires the Air Strike to resolve first (removing VC guerrillas, shifting opposition, degrading trail), and deployment to happen **after**.

The same ordering issue affects card-6 (Aces): free Air Strike, then Degrade Trail −2.

## Assumption Reassessment (2026-02-25)

1. **`executeEventMove` runs effects at event-move time** — confirmed at `apply-move.ts:675`. Effects run inside `executeMoveAction`, before `applyTurnFlowEligibilityAfterMove` enqueues grants.
2. **Free operation grants are enqueued but not yet consumed** — confirmed. `extractPendingFreeOperationGrants` adds them to `pendingFreeOperationGrants` in turn flow state. They are consumed one at a time as subsequent free-operation moves are applied.
3. **No `effectTiming` field exists anywhere in the codebase** — confirmed via grep. This is net-new.
4. **`EventSideDef` in `types-events.ts:71-79`** — has `effects`, `freeOperationGrants`, `eligibilityOverrides`, `branches`, `targets`, `lastingEffects`, `text`. No timing field.
5. **Schema at `GameDef.schema.json`** — no `effectTiming` property on event side definitions.

## Architecture Check

1. **Why this approach**: Adding an optional `effectTiming` field to `EventSideDef` is the minimal, backwards-compatible change. Events without the field behave as today (`beforeGrants` is the implicit default). Only events that explicitly set `afterGrants` get deferred behavior.
2. **Game-specific vs engine-agnostic**: `effectTiming` is a generic engine primitive — any game's event can use it. No FITL-specific logic enters the kernel. The YAML encoding change lives in the game data file (FITLGOLT4-003).
3. **No backwards-compatibility shims** — existing events without the field work identically.

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
readonly deferredEventEffects?: readonly import('./types-ast.js').EffectAST[];
readonly deferredEventMoveParams?: Readonly<Record<string, import('./types-ast.js').MoveParamValue>>;
```

### 4. Modify event execution to respect `effectTiming`

In `packages/engine/src/kernel/event-execution.ts`:
- `executeEventMove`: when the resolved side (or branch) has `effectTiming: 'afterGrants'`, skip running `eventEffects` and instead return them as a separate field (e.g. `deferredEffects`) so the caller can store them.
- Alternatively, export a `resolveEventEffectTiming` helper so `apply-move.ts` can decide.

### 5. Store deferred effects when `afterGrants`

In `packages/engine/src/kernel/turn-flow-eligibility.ts` (`applyTurnFlowEligibilityAfterMove`):
- When the event move has `effectTiming: 'afterGrants'`, store the deferred effects in `TurnFlowRuntimeState.deferredEventEffects`.

### 6. Fire deferred effects when all grants are consumed

In `packages/engine/src/kernel/turn-flow-eligibility.ts`:
- After a free operation grant is consumed (`consumeTurnFlowFreeOperationGrant`), check if the originating event's grants are all consumed (i.e. no remaining grants from that batch).
- If all consumed and `deferredEventEffects` is present, execute the deferred effects and clear the field.
- Alternatively, trigger deferred effects in `applyTurnFlowEligibilityAfterMove` when the last grant for the batch is consumed and the next eligible seat transitions.

### 7. Update `GameDef.schema.json`

Add `effectTiming` as an optional enum property (`["beforeGrants", "afterGrants"]`) to the event side and event branch definitions in the JSON Schema.

### 8. Update compiler (`compile-event-cards.ts`)

Pass through `effectTiming` from parsed YAML to compiled `EventSideDef`/`EventBranchDef`.

## Files to Touch

- `packages/engine/src/kernel/types-events.ts` (modify) — add `effectTiming` to `EventSideDef` and `EventBranchDef`
- `packages/engine/src/kernel/types-turn-flow.ts` (modify) — add `deferredEventEffects` + `deferredEventMoveParams` to `TurnFlowRuntimeState`
- `packages/engine/src/kernel/event-execution.ts` (modify) — respect `effectTiming`, return deferred effects
- `packages/engine/src/kernel/apply-move.ts` (modify) — plumb deferred effects into turn flow state
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify) — store deferred effects, fire when grants consumed
- `packages/engine/schemas/GameDef.schema.json` (modify) — add `effectTiming` enum
- `packages/engine/src/cnl/compile-event-cards.ts` (modify) — pass through `effectTiming`
- `packages/engine/test/integration/event-effect-timing.test.ts` (new) — integration test for deferred execution

## Out of Scope

- Changing any existing event card encodings (that's FITLGOLT4-003)
- The golden E2E test (that's FITLGOLT4-004)
- Support for more than two timing values (e.g. `duringGrants`)
- Branch-level `effectTiming` override of side-level timing (keep simple: branch inherits side timing unless branch also specifies it)

## Acceptance Criteria

### Tests That Must Pass

1. **New**: Event with `effectTiming: 'afterGrants'` — effects do NOT run at event-move time; they run after all free operation grants from that event are consumed.
2. **New**: Event with `effectTiming: 'beforeGrants'` (explicit) — effects run at event-move time, same as default.
3. **New**: Event with no `effectTiming` (omitted) — effects run at event-move time (backwards compat).
4. **New**: Event with multiple grants — deferred effects fire only after the LAST grant is consumed.
5. Existing suite: `pnpm turbo test --force`

### Invariants

1. Events without `effectTiming` behave identically to current behavior — zero regression.
2. Deferred effects see the game state AFTER all grants have resolved (i.e. post-Air-Strike state for Gulf of Tonkin).
3. No game-specific logic in kernel code — `effectTiming` is fully generic.
4. Schema validates both old (no `effectTiming`) and new (with `effectTiming`) event definitions.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/event-effect-timing.test.ts` — synthetic GameDef with an event that has `effectTiming: 'afterGrants'`, a free operation grant, and verifiable effects. Replay sequence: event move → free operation move → assert effects fired after grant consumption.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm turbo schema:artifacts`
