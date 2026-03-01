# CROGAMPRIELE-006: Phase action defaults kernel primitive (B1)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel types, legal move enumeration, action resolution, compiler lowering, GameSpecDoc types
**Deps**: None (independent kernel primitive)

## Problem

Both games repeat the same preconditions and post-effects across every action in a phase. Texas Hold'em: `handActive && !allIn && !eliminated` in 5 actions, plus 3 cleanup macros x 5 actions = 15 macro invocations. Forgetting a cleanup macro produces silent bugs. A phase-level `actionDefaults` with `pre` and `afterEffects` eliminates this repetition and makes bugs impossible.

## Assumption Reassessment (2026-03-01)

1. `PhaseDef` in `types-core.ts:129-133` has `id: PhaseId`, optional `onEnter`, optional `onExit`. No `actionDefaults` field exists yet.
2. `action.pre` evaluation in `legal-moves.ts:221` uses `evalCondition(action.pre, ctx)` after all params are bound. Phase check is handled earlier in `action-applicability-preflight.ts:104`.
3. Action effects are applied via `applyEffects` in `apply-move.ts:800-816`.
4. Usage increment happens at `apply-move.ts:872` via `incrementActionUsage`.
5. Trigger dispatch happens at `apply-move.ts:874-911`, after usage increment.
6. `lowerTurnStructure` in `compile-lowering.ts:232-292` lowers phases via inner `lowerPhaseDefs` mapper. `lowerEffectsWithDiagnostics` at lines 1041-1060 handles effect array lowering.
7. `GameSpecPhaseDef` in `game-spec-doc.ts:88-92` has `id`, `onEnter?`, `onExit?`. No `actionDefaults` yet.

## Architecture Check

1. Phase-level `actionDefaults` is a kernel-level concept because the runtime must evaluate `pre` during legal move enumeration and execute `afterEffects` during action resolution. This cannot be composed from existing primitives without error-prone manual repetition.
2. The `pre` condition uses AND with short-circuit: phase pre evaluated first (cheaper shared check), then action pre.
3. `afterEffects` run between action effects and trigger dispatch, as part of the same state transition.
4. Critical edge case: if action effects cause a phase transition, `afterEffects` of the **originating** phase still run to completion. The originating phase must be captured BEFORE action effects run.

## What to Change

### 1. Add `actionDefaults` to `PhaseDef` in `types-core.ts`

```typescript
export interface PhaseDef {
  readonly id: PhaseId;
  readonly onEnter?: readonly EffectAST[];
  readonly onExit?: readonly EffectAST[];
  readonly actionDefaults?: {
    readonly pre?: ConditionAST;
    readonly afterEffects?: readonly EffectAST[];
  };
}
```

### 2. Add `actionDefaults` to `GameSpecPhaseDef` in `game-spec-doc.ts`

```typescript
export interface GameSpecPhaseDef {
  readonly id: string;
  readonly onEnter?: readonly unknown[];
  readonly onExit?: readonly unknown[];
  readonly actionDefaults?: {
    readonly pre?: unknown;
    readonly afterEffects?: readonly unknown[];
  };
}
```

### 3. Modify legal move enumeration in `legal-moves.ts`

In the leaf of the parameter enumeration (around line 221), BEFORE the existing `action.pre` check:

1. Look up the current phase's `PhaseDef` from `def.turnStructure.phases` (or interrupts). Build a `Map<PhaseId, PhaseDef>` cache once at the top of the enumeration function for performance.
2. If the phase has `actionDefaults.pre`, evaluate it with `evalCondition(phaseDef.actionDefaults.pre, ctx)`.
3. If it fails, return immediately (action is illegal) — skip evaluating `action.pre`.
4. If it passes (or is absent), proceed to evaluate `action.pre` as today.

### 4. Modify action resolution in `apply-move.ts`

**Critical**: Capture the originating phase def BEFORE action effects run:

1. Before `applyEffects(action.effects, ...)` (around line 800), resolve the current phase's `PhaseDef` and store it as `originatingPhaseDef`.
2. After action effects complete and BEFORE `incrementActionUsage` (line 872):
   a. If `originatingPhaseDef.actionDefaults?.afterEffects` is non-empty, execute them via `applyEffects(originatingPhaseDef.actionDefaults.afterEffects, createExecutionEffectContext({...}))`.
   b. Use the post-action-effects state as input.
3. Update `effectState` with the afterEffects result.
4. Continue to `incrementActionUsage` and trigger dispatch with the final state.

### 5. Lower `actionDefaults` in `compile-lowering.ts`

In `lowerTurnStructure`'s inner `lowerPhaseDefs` mapper (around line 260):

1. Check if `phase.actionDefaults` exists.
2. If `actionDefaults.pre` exists, lower it using existing condition lowering (e.g., `lowerCondition` or equivalent).
3. If `actionDefaults.afterEffects` exists, lower it using `lowerEffectsWithDiagnostics`.
4. Include the lowered `actionDefaults` in the output `PhaseDef`.

### 6. Create unit tests

Test file covering:
- Legal moves: action legal when both phase pre and action pre pass.
- Legal moves: action illegal when phase pre fails (action pre not evaluated).
- Legal moves: action illegal when phase pre passes but action pre fails.
- Legal moves: phase with no `actionDefaults` behaves as today.
- Legal moves: action with `pre: null` uses only phase pre.
- Apply move: `afterEffects` execute after action effects.
- Apply move: `afterEffects` see state changes from action effects.
- Apply move: triggers fire AFTER afterEffects complete.
- Apply move: `afterEffects` of originating phase run even if action effects cause phase transition.
- Apply move: phase with no `actionDefaults` behaves as today.
- Lowering: `actionDefaults.pre` and `actionDefaults.afterEffects` are correctly lowered.
- Lowering: phase without `actionDefaults` lowers as today.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add `actionDefaults` to `PhaseDef`)
- `packages/engine/src/kernel/legal-moves.ts` (modify — phase pre check before `action.pre`)
- `packages/engine/src/kernel/apply-move.ts` (modify — afterEffects execution)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify — add `actionDefaults` to `GameSpecPhaseDef`)
- `packages/engine/src/cnl/compile-lowering.ts` (modify — lower `actionDefaults` in `lowerTurnStructure`)
- `packages/engine/test/unit/legal-moves-phase-action-defaults.test.ts` (new)
- `packages/engine/test/unit/apply-move-phase-action-defaults.test.ts` (new)
- `packages/engine/test/unit/compile-lowering-action-defaults.test.ts` (new)

## Out of Scope

- Phase templates (CROGAMPRIELE-005) — templates can include `actionDefaults` but the template expansion pass handles that via generic body copying
- `expandTemplates` orchestrator (CROGAMPRIELE-008)
- Zone behaviors (CROGAMPRIELE-007)
- JSON Schema updates (CROGAMPRIELE-009)
- Game spec migrations (CROGAMPRIELE-010, -011)
- Interaction with `actionPipelines` / operation compound moves — `afterEffects` apply to the action resolution level, not the pipeline stage level
- New `EffectTraceEventContext` values — `afterEffects` use the existing `'actionEffect'` context with a distinct `effectPath`

## Acceptance Criteria

### Tests That Must Pass

1. Legal moves correctly AND phase pre with action pre (short-circuit on phase pre failure).
2. `afterEffects` execute between action effects and trigger dispatch.
3. `afterEffects` of originating phase run even when action effects cause phase transition via `gotoPhaseExact` or `advancePhase`.
4. Phase with no `actionDefaults` has zero behavior change from current.
5. Lowering correctly handles `actionDefaults.pre` (condition) and `actionDefaults.afterEffects` (effects array).
6. Determinism: same seed + same moves = same result with `actionDefaults`.
7. Existing suite: `pnpm turbo test`

### Invariants

1. `actionDefaults` is entirely optional — games that don't use it see zero behavior change.
2. Phase pre is evaluated with the same `actor` binding as action pre.
3. `afterEffects` are logically part of action resolution, not phase lifecycle.
4. No mutation of `GameDef` or `GameState` — all transitions return new state objects.
5. Trigger dispatch order: action effects → afterEffects → incrementActionUsage → dispatchTriggers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/legal-moves-phase-action-defaults.test.ts` — validates phase pre gating in legal move enumeration. Rationale: core new behavior.
2. `packages/engine/test/unit/apply-move-phase-action-defaults.test.ts` — validates afterEffects execution timing, state visibility, and phase transition edge case. Rationale: correctness-critical.
3. `packages/engine/test/unit/compile-lowering-action-defaults.test.ts` — validates lowering of both pre and afterEffects fields. Rationale: ensures GameSpecDoc → GameDef path works.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/legal-moves-phase-action-defaults.test.js`
3. `node --test packages/engine/dist/test/unit/apply-move-phase-action-defaults.test.js`
4. `node --test packages/engine/dist/test/unit/compile-lowering-action-defaults.test.js`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
