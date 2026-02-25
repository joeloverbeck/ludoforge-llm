# EVTTGT-001: Wire Event Target Declarations into Decision Sequence Pipeline

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel event execution, legal choices, event effect resolution
**Deps**: none

## Problem

Event cards declare `targets` on `EventSideDef` and `EventBranchDef` — each target has an `id` (e.g. `$targetCity`), a `selector` (`OptionsQuery`), and a `cardinality`. The compiler correctly compiles these declarations into the GameDef and uses them to establish binding scope for effect compilation. However, the kernel never converts target declarations into decision sequence entries. When effects reference a target binding like `$targetCity`, the binding is missing at runtime.

Consequence: `isMoveDecisionSequenceSatisfiable` in `legal-moves.ts` catches the `MISSING_BINDING` error via `shouldDeferMissingBinding` and silently skips the move. All event sides/branches that reference target bindings in their effects are unreachable — `legalMoves` never returns them.

In the FITL game data, 59 target declarations exist across the event deck with 121 references to `$target*` bindings. Every card that references target bindings in its effects is currently broken. This includes card-97 (Brinks Hotel shaded), card-87, and many others.

## Assumption Reassessment (2026-02-25)

1. `EventTargetDef` is defined in `packages/engine/src/kernel/types-events.ts` with `id`, `selector` (OptionsQuery), and `cardinality` (exact or range). Both `EventSideDef.targets` and `EventBranchDef.targets` are optional arrays of `EventTargetDef`. Confirmed current.
2. The compiler (`packages/engine/src/cnl/compile-event-cards.ts`) correctly lowers targets via `lowerEventTargets` and uses `collectBindingScopeFromTargets` to make target IDs available as binding scope during effect compilation. The compiled GameDef stores targets as data alongside effects. Confirmed current.
3. `legal-choices.ts` line 446-448 resolves event effects via `resolveEventEffectList` but never collects or processes event targets. The effects are dispatched directly to `executeDiscoveryEffects`, which sees no bindings for target IDs. Confirmed gap.
4. `event-execution.ts` line 270 passes `{ ...moveParams }` as bindings to `applyEffects`. If target decisions were resolved into `move.params` by the decision sequence, they would be available here. No kernel change needed in `executeEventMove` itself — just ensure `move.params` contains target bindings by the time execution runs.
5. The existing `chooseOne` effect in `effects-choice.ts` already handles the full decision lifecycle: evaluates options query, emits `pendingChoice` in discovery mode, validates selection in execution mode. This is the exact mechanism needed for targets.

## Architecture Check

1. **Synthesize, don't duplicate**: Convert each `EventTargetDef` into a synthetic `chooseOne` (cardinality.n === 1 or cardinality.max === 1) or `chooseN` EffectAST node. Prepend these to the event effects list before dispatch. This reuses the entire existing effect dispatch + decision sequence machinery with zero new decision types, dispatch keys, or control flow branches.
2. **Game-agnostic**: The synthesis operates on generic `EventTargetDef` data — no game-specific identifiers or branches. Any game using event targets with effects that reference target bindings benefits automatically.
3. **No backwards-compatibility shims**: The current behavior (silently dropping moves with unresolvable target bindings) is a bug, not a feature. The fix changes behavior — previously-unreachable event moves become reachable — but this is the correct semantic.

## What to Change

### 1. Add target-to-effect synthesis in `event-execution.ts`

Add a new exported function `synthesizeEventTargetEffects` that converts `EventTargetDef[]` into `EffectAST[]`:

- For each target, produce a `chooseOne` or `chooseN` effect node with:
  - `bind` set to the target's `id` (e.g. `$targetCity`)
  - `options` set to the target's `selector` (OptionsQuery)
  - For `chooseN`: `min`/`max` derived from the target's `cardinality`
  - For `chooseOne`: cardinality where `n === 1` or `max === 1`
- Collect targets from both side-level and branch-level (branch targets follow side targets)

Add a companion function `resolveEventTargetDefs` that collects all target definitions from the event execution context (side + branch), mirroring the existing `collectFreeOperationGrants` pattern.

### 2. Prepend synthetic target effects in `resolveEventEffectList`

Modify `resolveEventEffectList` to prepend synthesized target effects before the real event effects:

```typescript
export const resolveEventEffectList = (def, state, move): readonly EffectAST[] => {
  const context = resolveEventExecutionContext(def, state, move);
  if (context === null) return [];
  const targetEffects = synthesizeEventTargetEffects(resolveEventTargetDefs(context));
  return [
    ...targetEffects,
    ...(context.side.effects ?? []),
    ...(context.branch?.effects ?? []),
  ];
};
```

This single change makes targets available to both `legalChoicesDiscover` (discovery mode — emits `pendingChoice`) and `executeEventMove` (execution mode — validates selection and establishes binding).

### 3. Remove silent `shouldDeferMissingBinding` suppression for resolved targets

In `legal-moves.ts` line 324, the `shouldDeferMissingBinding` catch clause silently drops moves with unresolvable bindings. After this fix, target bindings will be properly resolved as decisions. The catch clause remains for edge cases (e.g., truly unresolvable bindings from other sources), but the common case — target bindings — will no longer hit it.

No code change needed here, but behavior changes: moves that were previously silently dropped will now appear in `legalMoves` with their target decisions pending.

### 4. Unit tests for target synthesis

Add tests verifying:
- Single target with exact cardinality 1 produces `chooseOne` effect
- Single target with range cardinality produces `chooseN` effect with correct min/max
- Multiple targets (side + branch) produce effects in correct order
- Empty/undefined targets produce no synthetic effects
- `resolveEventEffectList` returns target effects before real effects

### 5. Integration test: card-97 shaded (Brinks Hotel)

The 5 failing shaded tests in `fitl-events-brinks-hotel.test.ts` should pass after this fix. They verify:
- Shift city with VC by 2 toward Active Opposition
- Terror marker (terrorCount) incremented on target city
- Terror stacking (incrementing existing terrorCount > 0)
- Global terrorSabotageMarkersPlaced counter incremented
- Only cities with VC presence are targeted

## Files to Touch

- `packages/engine/src/kernel/event-execution.ts` (modify — add `synthesizeEventTargetEffects`, `resolveEventTargetDefs`, update `resolveEventEffectList`)
- `packages/engine/test/unit/event-execution.test.ts` (modify — add target synthesis unit tests)
- `packages/engine/test/integration/fitl-events-brinks-hotel.test.ts` (existing — 5 shaded tests should pass)

## Out of Scope

- Compiler changes (compilation is already correct)
- Schema changes (EventTargetDef types/schemas are already correct)
- UI/runner changes
- Changing `shouldDeferMissingBinding` behavior (it still serves a purpose for other edge cases)
- Event target validation beyond what exists (validate-gamedef already checks targets)

## Acceptance Criteria

### Tests That Must Pass

1. New unit tests: `synthesizeEventTargetEffects` correctly converts targets to chooseOne/chooseN EffectAST nodes
2. New unit tests: `resolveEventTargetDefs` collects side + branch targets in correct order
3. New unit tests: `resolveEventEffectList` prepends synthetic target effects before real effects
4. Integration tests: all 9 card-97 Brinks Hotel tests pass (4 unshaded + 5 shaded)
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `GameDef` and kernel remain fully game-agnostic — no FITL-specific logic
2. Synthetic target effects use existing `chooseOne`/`chooseN` EffectAST shapes — no new effect types
3. Target resolution follows the same decision sequence flow as all other choices
4. Determinism preserved: same seed + same decisions = same result

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/event-execution.test.ts` — target synthesis and effect list resolution
2. `packages/engine/test/integration/fitl-events-brinks-hotel.test.ts` — 5 shaded tests (already written, currently failing)

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/event-execution.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-brinks-hotel.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine test:e2e`
