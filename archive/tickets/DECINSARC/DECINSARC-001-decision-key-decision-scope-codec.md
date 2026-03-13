# DECINSARC-001: Create DecisionKey, DecisionScope types and codec functions

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module `decision-scope.ts`
**Deps**: None

## Problem

The engine lacks a first-class decision identity model. Decision key strings are constructed ad hoc across multiple modules (`effects-choice.ts`, `move-decision-sequence.ts`, `legal-choices.ts`, test helpers) with no single source of truth. This ticket creates the authoritative codec module.

## Assumption Reassessment (2026-03-13)

1. `packages/engine/src/kernel/decision-occurrence.ts` currently owns the active runtime occurrence model:
   - mutable `DecisionOccurrenceContext` with `Map<string, number>` counters
   - multi-key lookup/write helpers (`resolveMoveParamForDecisionOccurrence()`, `writeMoveParamForDecisionOccurrence()`)
   - canonical-alias fallback behavior
   This ticket does not replace that runtime yet; it only adds the future authoritative codec surface.
2. `packages/engine/src/kernel/decision-id.ts` currently owns the active decision-id string composition helpers:
   - `composeScopedDecisionId()`
   - `extractResolvedBindFromDecisionId()`
   These remain in use after this ticket and are retired only once follow-up migration tickets finish.
3. No existing `packages/engine/src/kernel/decision-scope.ts` file exists — confirmed, this ticket introduces it.
4. Current runtime/request types still depend on legacy identity fields:
   - `ChoicePendingRequest` in `packages/engine/src/kernel/types-core.ts`
   - `EffectContextBase` in `packages/engine/src/kernel/effect-context.ts`
   - `effects-choice.ts`, `move-decision-sequence.ts`, `legal-choices.ts`
   - `packages/engine/test/helpers/decision-param-helpers.ts`
   This ticket must not claim those consumers already use the new model.

## Architecture Check

1. Pure functions (no class) keep the codec simple, testable, and tree-shakeable.
2. `DecisionKey` and `DecisionScope` are fully game-agnostic — no game-specific identifiers.
3. The new module should not introduce aliases or compatibility wrappers of its own. Legacy runtime aliasing remains temporarily outside this ticket until the migration tickets remove it.
4. Adding the codec first is still architecturally beneficial: it creates one canonical serialization/parsing contract before broader runtime rewiring, which reduces drift during the migration.

## What to Change

### 1. Create `packages/engine/src/kernel/decision-scope.ts`

Define:
- `DecisionKey` branded string type: `type DecisionKey = string & { readonly __brand: 'DecisionKey' }`
- `DecisionScope` interface: `{ readonly iterationPath: string; readonly counters: Readonly<Record<string, number>> }`
- `ScopeAdvanceResult` interface: `{ readonly scope: DecisionScope; readonly key: DecisionKey; readonly occurrence: number }`
- `emptyScope()`: returns `{ iterationPath: '', counters: {} }`
- `advanceScope(scope, internalDecisionId, resolvedBind)`: increments counter for the composite base key, returns new scope + `DecisionKey` + 1-based occurrence
- `withIterationSegment(scope, index)`: returns new scope with `[N]` appended to `iterationPath`
- `formatDecisionKey(internalDecisionId, resolvedBind, iterationPath, occurrence)`: produces canonical key per spec format table
- `parseDecisionKey(key)`: parses back to `{ baseId, resolvedBind, iterationPath, occurrence } | null`

Canonical key format rules:
- `#1` suffix never written (first occurrence is unindexed)
- When `internalDecisionId === resolvedBind` and no iteration path, key is just `{resolvedBind}`
- `::` separates template id from resolved bind
- `[N]` segments encode forEach iteration path

### 2. Export from `packages/engine/src/kernel/index.ts`

Add `export * from './decision-scope.js'` (alongside existing exports — do NOT remove old exports yet).

## Files to Touch

- `packages/engine/src/kernel/decision-scope.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add export)
- `packages/engine/test/unit/kernel/decision-scope.test.ts` (new)

## Out of Scope

- Rewiring active runtime consumers to use `DecisionKey` / `DecisionScope` directly. In particular this ticket does not modify:
  - `decision-occurrence.ts`
  - `decision-id.ts`
  - `ChoicePendingRequest`, `EffectContextBase`, or `EffectResult`
  - `effects-choice.ts`, `effect-dispatch.ts`, `effects-control.ts`
  - `move-decision-sequence.ts`, `legal-choices.ts`
  - runner code
  - test helpers
- Deleting legacy files or legacy identity fields before their consumers are migrated.

## Acceptance Criteria

### Tests That Must Pass

1. `formatDecisionKey` produces correct keys for all 7 canonical format scenarios from the spec table:
   - Simple bind `$target` → `$target`
   - Simple bind 2nd occurrence → `$target#2`
   - Template `decision:attack` resolved to `Quang_Tri` → `decision:attack::Quang_Tri`
   - Same 2nd occurrence → `decision:attack::Quang_Tri#2`
   - forEach iteration 0 → `decision:train::Saigon[0]`
   - forEach iteration 0, 2nd occurrence → `decision:train::Saigon[0]#2`
   - Nested forEach → `decision:op::Saigon[0][1]`
2. `parseDecisionKey` round-trips all 7 key formats (format → parse → reformat = identical)
3. `advanceScope` returns a new scope object (input scope is not mutated)
4. `advanceScope` increments counters correctly for repeated calls with same base key
5. `withIterationSegment` appends `[N]` to iteration path without mutating input
6. `emptyScope` returns zero counters and empty iteration path
7. First occurrence serializes unindexed; second and later serialize with `#N`
8. `packages/engine/src/kernel/index.ts` exports the new surface
9. Existing decision-id / decision-occurrence behavior remains unchanged after this additive ticket
10. Engine build passes
11. Engine tests pass
12. Workspace typecheck and lint pass

### Invariants

1. `DecisionKey` is produced exclusively by `formatDecisionKey()` — no handcrafted key strings in the new module.
2. `DecisionScope` is immutable — `advanceScope` and `withIterationSegment` return new objects, never mutate.
3. `emptyScope()` produces a scope with zero counters and empty iteration path.
4. No game-specific identifiers appear anywhere in the module.
5. The module is authoritative for the new key format even though runtime callers are migrated in later tickets.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/decision-scope.test.ts` — comprehensive unit tests for all codec functions, round-trip parsing, immutability proofs, occurrence numbering
2. No legacy tests should need semantic rewrites in this ticket; if any fail, that indicates the new module leaked into active runtime paths prematurely.

### Commands

1. `node --test packages/engine/dist/test/unit/kernel/decision-scope.test.js`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo build`
4. `pnpm turbo test`
5. `pnpm turbo typecheck`
6. `pnpm turbo lint`

## Architectural Rationale

This ticket is worth doing relative to the current architecture because the current identity logic is split between:
- scoped id formatting in `decision-id.ts`
- occurrence indexing and fallback alias lookup in `decision-occurrence.ts`
- ad hoc structural assumptions in runtime consumers and tests

That split is fragile. Introducing a dedicated codec module now gives the migration a single target contract and lets later tickets delete legacy machinery cleanly rather than re-deriving the format in multiple places.

Ideal end state, beyond this ticket:
- one identity field on pending requests
- one immutable decision scope threaded through effect execution
- direct `DecisionKey` reads/writes in `move.params`
- no alias fallback chain, no mutable counter maps, no duplicated key-construction logic

## Outcome

- Completed: 2026-03-13
- Actual changes:
  - added `packages/engine/src/kernel/decision-scope.ts` with the canonical `DecisionKey` / `DecisionScope` codec surface
  - exported the new module from `packages/engine/src/kernel/index.ts`
  - added `packages/engine/test/unit/kernel/decision-scope.test.ts` covering canonical formatting, parsing, round-trips, and scope immutability/counter behavior
  - corrected a stale architecture guard in `packages/engine/test/unit/kernel/apply-move.test.ts` that was failing the full engine suite even though runtime code was already correct
- Deviations from original plan:
  - none in the codec module itself
  - the implementation also fixed one pre-existing test assertion outside the decision-scope module because full required verification exposed it
- Verification results:
  - `pnpm turbo build`
  - `node --test packages/engine/dist/test/unit/kernel/decision-scope.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
