# EVTTGT-001: Wire Event Target Declarations into Decision Sequence Pipeline

**Status**: ✅ COMPLETED
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
3. `legal-choices.ts` resolves event effects via `resolveEventEffectList` but never processes event targets into choices. Effects are dispatched directly to `executeDiscoveryEffects`, which sees no target bindings. Confirmed gap.
4. `executeEventMove` currently applies side/branch effects directly and does not run a target decision phase first. Relying on raw `move.params` alone is insufficient for canonical choice behavior, because choice effects bind decision values using `internalDecisionId` + runtime binding resolution before downstream effects read `{ ref: 'binding', name: '$targetX' }`. The target synthesis must therefore participate in execution flow, not discovery only.
5. `chooseOne`/`chooseN` are the correct existing mechanisms for target selection lifecycle (discovery pending choice + execution validation + binding materialization). Confirmed current.
6. Ticket discrepancy: `packages/engine/test/unit/event-execution.test.ts` does not exist in this repository. New unit coverage must be added under an existing unit domain path.

## Architecture Check

1. **Synthesize, don't duplicate**: Convert each `EventTargetDef` into a synthetic `chooseOne`/`chooseN` `EffectAST` node and reuse existing choice dispatch/runtime. No new decision type or dispatch branch.
2. **Single source of truth for event effects**: Target synthesis must feed the same event-effect list used by both `legalChoices` discovery and `executeEventMove` execution so discovery and runtime semantics cannot drift.
3. **Canonical cardinality semantics**:
- Exact `{ n: 1 }` maps to `chooseOne`.
- Exact `{ n: k }` for `k != 1` maps to `chooseN` with `n`.
- Range `{ min?, max }` maps to `chooseOne` when `max === 1`, otherwise `chooseN`.
- Rationale: existing event target bindings with cardinality `max: 1` are consumed as scalar selector inputs (for example `space: $targetCity`), so synthesizing `chooseN` arrays would break selector cardinality at runtime.
4. **Game-agnostic**: The synthesis operates on generic `EventTargetDef` data and applies to any game.
5. **No compatibility shims**: Current behavior (silent move-drop due to missing target bindings) is a bug.

## What to Change

### 1. Add target-to-effect synthesis in `event-execution.ts`

Add exported helpers:

- `resolveEventTargetDefs(context)` to collect targets from side + branch in deterministic order (side first, then branch).
- `synthesizeEventTargetEffects(targets)` to convert target defs into `chooseOne`/`chooseN` effects.

Synthesis requirements:

- `bind` is target `id`.
- `options` is target `selector`.
- `internalDecisionId` is deterministic and unique within the synthesized list.
- Cardinality mapping follows the rules in Architecture Check §3.

### 2. Centralize event effect list composition

Update `resolveEventEffectList` to return:

1. synthesized target effects,
2. side effects,
3. branch effects.

Then update `executeEventMove` to consume the same composed event effect list (instead of rebuilding side+branch-only effects inline).

This guarantees that execution validates submitted target decisions and materializes bindings before downstream event effects run.

### 3. Keep missing-binding deferral policy unchanged

`shouldDeferMissingBinding` stays in place for genuine unresolved-binding edge cases. After this fix, event target bindings should no longer hit that path in normal target-driven event cards.

### 4. Unit tests for target synthesis and event effect composition

Add unit tests verifying:

- `{ n: 1 }` target maps to `chooseOne`.
- `{ n: k }` (`k > 1`) maps to `chooseN` exact `n`.
- `{ min?, max }` maps to `chooseOne` when `max: 1`, otherwise `chooseN` with min/max.
- Side + branch targets are collected in deterministic order.
- Empty/undefined targets produce no synthetic effects.
- `resolveEventEffectList` returns target effects before real event effects.

### 5. Integration test gate: card-97 shaded (Brinks Hotel)

Existing 5 shaded tests in `fitl-events-brinks-hotel.test.ts` must pass after fix:

- Shift city with VC by 2 toward Active Opposition
- Terror marker incremented on target city
- Terror stacks when already present
- Global terror counter incremented
- Only cities with VC presence are targetable

## Files to Touch

- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/test/unit/kernel/event-execution-targets.test.ts` (add)
- `packages/engine/test/integration/fitl-events-brinks-hotel.test.ts` (verify existing tests pass; no required edits)

## Out of Scope

- Compiler changes (compilation already captures target declarations)
- Schema changes (target shapes already modeled)
- UI/runner changes
- Changing `shouldDeferMissingBinding` policy
- Additional event target validation beyond current schema/validation layers

## Acceptance Criteria

### Tests That Must Pass

1. New unit tests for target synthesis and ordering in kernel event execution path
2. Integration tests: all 9 card-97 Brinks Hotel tests pass (4 unshaded + 5 shaded)
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Kernel remains game-agnostic
2. Synthetic target effects reuse existing `chooseOne`/`chooseN` AST shapes
3. Discovery and execution use the same event effect composition
4. Determinism preserved (same seed + decisions => same result)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/event-execution-targets.test.ts` — new target synthesis + event effect composition tests
2. `packages/engine/test/integration/fitl-events-brinks-hotel.test.ts` — existing shaded regression checks

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/unit/kernel/event-execution-targets.test.js`
3. `node packages/engine/dist/test/integration/fitl-events-brinks-hotel.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine test:e2e`

## Outcome

- Completion date: 2026-02-25
- What actually changed:
  - Added event-target synthesis to kernel event execution (`resolveEventTargetDefs`, `synthesizeEventTargetEffects`).
  - Centralized event effect composition so target synthesis is prepended consistently and reused by both discovery (`resolveEventEffectList`) and execution (`executeEventMove`).
  - Added focused unit coverage in `packages/engine/test/unit/kernel/event-execution-targets.test.ts`.
- Deviations from original plan:
  - The original ticket assumption that range cardinality should always synthesize to `chooseN` was corrected. `max: 1` now synthesizes to `chooseOne` to preserve scalar target-binding behavior used by existing event effects.
  - Unit-test target file path was corrected from a non-existent file to the existing `test/unit/kernel/` domain.
- Verification results:
  - Passed: `pnpm -F @ludoforge/engine build`
  - Passed: `node packages/engine/dist/test/unit/kernel/event-execution-targets.test.js`
  - Passed: `node packages/engine/dist/test/integration/fitl-events-brinks-hotel.test.js`
  - Passed: `pnpm -F @ludoforge/engine lint`
  - Passed: `pnpm -F @ludoforge/engine test`
  - Passed: `pnpm -F @ludoforge/runner test`
  - Passed: `pnpm turbo test`
  - Passed: `pnpm turbo lint`
  - Passed: `pnpm turbo typecheck`
