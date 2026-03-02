# CROGAMPRIELE-017: Strengthen trigger-sees-afterEffects-state test

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-006-phase-action-defaults.md`

## Problem

The test "triggers fire AFTER afterEffects complete" in `apply-move-phase-action-defaults.test.ts:119-137` verifies that both `afterCounter === 1` and `triggerFired === 1`, confirming both run. However, it does not prove the `actionResolved` trigger executes against the post-afterEffects state. Both values could independently increment without the trigger seeing the afterEffects mutation. A stronger test would have the trigger's effects be conditional on afterEffects' state change, proving causal ordering.

## Assumption Reassessment (2026-03-02)

1. `apply-move-phase-action-defaults.test.ts:119-137` — confirmed: trigger and afterEffects both increment independent variables; no cross-dependency asserted.
2. The kernel pipeline at `apply-move.ts:877-939` confirms afterEffects run before `actionResolved` dispatch. The test trusts this ordering but doesn't assert it via state dependency.
3. The "afterEffects see state changes from action effects" test (lines 98-117) already demonstrates the conditional-effect pattern — this ticket applies the same pattern to prove trigger-sees-afterEffects ordering.

## Architecture Check

1. This is a test-only improvement — no production code changes.
2. Fully game-agnostic — tests use synthetic variable-incrementing effects.
3. No backwards-compatibility concern.

## What to Change

### 1. Add or modify the trigger ordering test

Add a test (or modify the existing one) where the `actionResolved` trigger uses a conditional effect that checks the afterEffects' state change:

```typescript
it('actionResolved trigger sees afterEffects state changes', () => {
  const def = makeBaseDef({
    actions: [simpleAction],
    phases: [{
      id: asPhaseId('main'),
      actionDefaults: { afterEffects: [incrementAfterCounter] },
    }],
    triggers: [{
      id: asTriggerId('checkAfterState'),
      event: { type: 'actionResolved', action: asActionId('doThing') },
      effects: [{
        if: {
          when: { op: '>=', left: { ref: 'gvar', var: 'afterCounter' }, right: 1 },
          then: [{ addVar: { scope: 'global', var: 'triggerFired', delta: 1 } }],
        },
      }],
    }],
  });
  const state = makeBaseState();
  const move: Move = { actionId: asActionId('doThing'), params: {} };
  const result = applyMove(def, state, move);
  assert.equal(result.state.globalVars.afterCounter, 1, 'afterEffects should run');
  assert.equal(result.state.globalVars.triggerFired, 1,
    'trigger should see afterCounter >= 1, proving it runs after afterEffects');
});
```

If `triggerFired === 0`, the trigger ran before afterEffects — proving the test catches ordering regressions.

## Files to Touch

- `packages/engine/test/unit/apply-move-phase-action-defaults.test.ts` (modify) — add or refine test

## Out of Scope

- Changing production code — this is purely a test quality improvement.
- Testing emitted-events-from-afterEffects ordering (separate concern).

## Acceptance Criteria

### Tests That Must Pass

1. New/modified test passes, confirming trigger sees post-afterEffects state.
2. Full suite: `pnpm turbo test --force`

### Invariants

1. The test would fail if trigger dispatch were moved before afterEffects execution.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/apply-move-phase-action-defaults.test.ts` — new test proving causal state dependency between afterEffects and actionResolved trigger.

### Commands

1. `node --test packages/engine/dist/test/unit/apply-move-phase-action-defaults.test.js`
2. `pnpm turbo build && pnpm turbo test --force`
