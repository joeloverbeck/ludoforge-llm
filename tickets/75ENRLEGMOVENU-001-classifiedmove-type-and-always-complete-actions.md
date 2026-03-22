# 75ENRLEGMOVENU-001: ClassifiedMove Type & Always-Complete Action Detection

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel types, new kernel module, GameDefRuntime extension
**Deps**: None (foundational ticket — all others depend on this)

## Problem

Spec 75 introduces a `ClassifiedMove` wrapper and a static `alwaysCompleteActionIds` set to eliminate redundant `probeMoveViability` calls. This ticket builds the foundational types and the always-complete detection infrastructure that all subsequent tickets consume.

## Assumption Reassessment (2026-03-22)

1. `ExecutionOptions` at `types-core.ts:1343-1353` does NOT currently have a `skipMoveValidation` field — confirmed.
2. `GameDefRuntime` at `gamedef-runtime.ts:25-31` has 5 fields (adjacencyGraph, runtimeTableIndex, zobristTable, ruleCardCache, compiledLifecycleEffects) — no `alwaysCompleteActionIds` yet.
3. `createGameDefRuntime` at `gamedef-runtime.ts:33-42` does not compute always-complete action IDs — must be extended.
4. `MoveViabilityProbeResult` exists at `apply-move.ts:414-441` as a 4-way discriminated union — no changes needed to that type.
5. `EffectAST` is the tree structure for effects — must walk it to detect decision nodes (`chooseOne`, `chooseN`, `chooseFromZone`).
6. `ActionId` is a branded type — `alwaysCompleteActionIds` must be `ReadonlySet<ActionId>`.

## Architecture Check

1. Static analysis of action completeness is conservative by design — false negatives cost one probe, false positives would be correctness bugs. This is the safest approach.
2. `alwaysCompleteActionIds` is game-agnostic — it inspects `ActionDef` structure, not game-specific content (Foundation 1).
3. No backwards-compatibility shims — `GameDefRuntime` gains a new required field; `createGameDefRuntime` is the sole constructor so all consumers are updated at the source (Foundation 9).

## What to Change

### 1. New file: `packages/engine/src/kernel/always-complete-actions.ts`

Create two exported functions:

```typescript
export function effectTreeContainsDecision(effects: readonly EffectAST[]): boolean
```
Recursively walks an `EffectAST[]` looking for decision-creating nodes: `chooseOne`, `chooseN`, `chooseFromZone`. Returns `true` if any decision node is found anywhere in the tree (including nested inside `forEach`, `conditional`, `let`, etc.).

```typescript
export function computeAlwaysCompleteActionIds(def: GameDef): ReadonlySet<ActionId>
```
Iterates `def.actions`. An action is always-complete if ALL of:
- `action.params.length === 0` — no user-facing parameter choices
- No matching entry in `def.actionPipelines` — pipeline actions always involve multi-stage decision sequences
- `effectTreeContainsDecision(action.effects) === false` — no decision nodes in effect AST
- `effectTreeContainsDecision(action.cost ?? []) === false` — no decision nodes in cost effects

Returns a `ReadonlySet<ActionId>` of qualifying action IDs.

### 2. New type in `packages/engine/src/kernel/types-core.ts`

Add `ClassifiedMove` interface after the `Move` interface:

```typescript
/** A legal move with its viability pre-computed during enumeration. */
export interface ClassifiedMove {
  readonly move: Move;
  /** Full probe result. Always viable — non-viable moves are filtered during enumeration. */
  readonly viability: import('./apply-move.js').MoveViabilityProbeResult;
}
```

### 3. Extend `GameDefRuntime` in `packages/engine/src/kernel/gamedef-runtime.ts`

Add `alwaysCompleteActionIds: ReadonlySet<ActionId>` to the `GameDefRuntime` interface. Compute it in `createGameDefRuntime` by calling `computeAlwaysCompleteActionIds(def)`.

### 4. Export from `packages/engine/src/kernel/index.ts`

Add export for `always-complete-actions.ts` and ensure `ClassifiedMove` is re-exported from types-core.

## Files to Touch

- `packages/engine/src/kernel/always-complete-actions.ts` (new)
- `packages/engine/src/kernel/types-core.ts` (modify — add `ClassifiedMove`)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify — add field + compute)
- `packages/engine/src/kernel/index.ts` (modify — add export)

## Out of Scope

- Changing `enumerateLegalMoves` return type (ticket 002)
- Changing `legalMoves` facade return type (ticket 002)
- Changing agent interfaces or `preparePlayableMoves` (ticket 004)
- Adding `skipMoveValidation` to `ExecutionOptions` (ticket 003)
- Modifying the simulator or runner (tickets 005, 006)
- Changing `MoveViabilityProbeResult` itself — it stays as-is

## Acceptance Criteria

### Tests That Must Pass

1. `effectTreeContainsDecision` returns `false` for an empty effect list
2. `effectTreeContainsDecision` returns `false` for effects with only `set`, `moveToken`, `forEach` (no decisions)
3. `effectTreeContainsDecision` returns `true` for a top-level `chooseOne` effect
4. `effectTreeContainsDecision` returns `true` for a `chooseN` nested inside `forEach`
5. `effectTreeContainsDecision` returns `true` for `chooseFromZone` nested inside `conditional`
6. `computeAlwaysCompleteActionIds` returns an action with 0 params, no pipeline, no decision effects
7. `computeAlwaysCompleteActionIds` excludes an action with params
8. `computeAlwaysCompleteActionIds` excludes an action with a matching pipeline entry
9. `computeAlwaysCompleteActionIds` excludes an action with decision effects in cost
10. `createGameDefRuntime` populates `alwaysCompleteActionIds` — verify field exists and is a Set
11. Existing suite: `pnpm turbo test` — all existing tests pass unchanged
12. Existing suite: `pnpm turbo typecheck` — no type errors

### Invariants

1. `alwaysCompleteActionIds` is conservative: every action in the set MUST be truly always-complete. False positives are correctness bugs.
2. `ClassifiedMove.viability` references the existing `MoveViabilityProbeResult` type — no new viability type is introduced.
3. `GameDefRuntime` remains a plain object (no class instances) — structured clone safe.
4. Branded `ActionId` is used throughout — no raw strings.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/always-complete-actions.test.ts` — unit tests for `effectTreeContainsDecision` and `computeAlwaysCompleteActionIds` with synthetic GameDef fixtures
2. `packages/engine/test/unit/kernel/gamedef-runtime.test.ts` — verify `alwaysCompleteActionIds` is populated (may extend existing test file)

### Commands

1. `pnpm -F @ludoforge/engine test` — engine tests pass
2. `pnpm turbo typecheck` — no type errors
3. `pnpm turbo lint` — no lint errors
