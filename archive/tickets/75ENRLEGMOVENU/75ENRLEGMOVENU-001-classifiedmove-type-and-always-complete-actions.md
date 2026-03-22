# 75ENRLEGMOVENU-001: ClassifiedMove Type & Always-Complete Action Detection

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel types, new kernel module, GameDefRuntime extension
**Deps**: None (foundational ticket — all others depend on this)

## Problem

Spec 75 introduces a `ClassifiedMove` wrapper and a static `alwaysCompleteActionIds` set to eliminate redundant `probeMoveViability` calls. This ticket builds the foundational types and the always-complete detection infrastructure that all subsequent tickets consume.

## Assumption Reassessment (2026-03-22)

1. `ExecutionOptions` at `types-core.ts:1343-1353` does NOT currently have a `skipMoveValidation` field — confirmed. That remains ticket 003 scope.
2. `GameDefRuntime` at `gamedef-runtime.ts:25-30` has 5 fields (`adjacencyGraph`, `runtimeTableIndex`, `zobristTable`, `ruleCardCache`, `compiledLifecycleEffects`) — no `alwaysCompleteActionIds` yet.
3. `createGameDefRuntime` at `gamedef-runtime.ts:33-42` does not compute always-complete action IDs — must be extended.
4. `MoveViabilityProbeResult` exists at `apply-move.ts:414-441` as a 4-way discriminated union — it already models both pending user decisions and stochastic incompleteness. No change is needed to that type.
5. The current `EffectAST` does NOT contain a `chooseFromZone` effect kind. The relevant incompleteness-producing nodes in the current AST are `chooseOne`, `chooseN`, and `rollRandom`.
6. Nested effect containers in the current AST are `if.then` / `if.else`, `forEach.effects` / `forEach.in`, `reduce.in`, `removeByPriority.in`, `let.in`, `evaluateSubset.compute` / `evaluateSubset.in`, and `rollRandom.in`. The ticket must use these real shapes, not stale names like `conditional`.
7. `ActionId` is a branded type — `alwaysCompleteActionIds` must be `ReadonlySet<ActionId>`.
8. The runtime shape change affects more than `createGameDefRuntime`: tests such as `condition-annotator.test.ts` and any helper that constructs `GameDefRuntime` object literals must be updated in the same change.

## Architecture Reassessment

1. The core optimization remains beneficial versus the current architecture because move viability belongs at the legal-move production boundary, not in every downstream consumer. Computing state-independent fast-path metadata once in `GameDefRuntime` is cleaner than repeated ad hoc probes in agents or the simulator.
2. The original ticket's helper name and predicate were too narrow. The runtime needs a conservative detector for any effect subtree that can make a move viability result incomplete, including stochastic incompleteness from `rollRandom`, not just explicit user choices. A false positive only costs a probe; a false negative would misclassify a move as always-complete and is therefore unacceptable.
3. The clean architecture is to keep this ticket purely about static runtime metadata and shared types. Enumeration/classification behavior changes still belong in ticket 002, agent consumption in ticket 004, and `skipMoveValidation` in ticket 003.
4. No backwards-compatibility shims: `GameDefRuntime` gains a new required field; all direct object-literal constructions are fixed in the same change (Foundation 9).

## What to Change

### 1. New file: `packages/engine/src/kernel/always-complete-actions.ts`

Create two exported functions:

```typescript
export function effectTreeMayYieldIncompleteMove(effects: readonly EffectAST[]): boolean
```

Recursively walks an `EffectAST[]` looking for any node that can cause `probeMoveViability` to return an incomplete result. In the current AST that means:
- `chooseOne`
- `chooseN`
- `rollRandom`

The walk must recurse through the real nested containers present today:
- `if.then` / `if.else`
- `forEach.effects` / `forEach.in`
- `reduce.in`
- `removeByPriority.in`
- `let.in`
- `evaluateSubset.compute` / `evaluateSubset.in`
- `rollRandom.in`

Returns `true` if any incompleteness-producing node is found anywhere in the tree.

```typescript
export function computeAlwaysCompleteActionIds(def: GameDef): ReadonlySet<ActionId>
```

Iterates `def.actions`. An action is always-complete if ALL of:
- `action.params.length === 0` — no user-facing parameter choices
- No matching entry in `def.actionPipelines` — pipeline actions always involve multi-stage completion/probing semantics
- `effectTreeMayYieldIncompleteMove(action.effects) === false`
- `effectTreeMayYieldIncompleteMove(action.cost ?? []) === false`

Returns a `ReadonlySet<ActionId>` of qualifying action IDs.

### 2. New type in `packages/engine/src/kernel/types-core.ts`

Add `ClassifiedMove` after the `Move` interface:

```typescript
/** A legal move with its viability pre-computed during enumeration. */
export interface ClassifiedMove {
  readonly move: Move;
  /** Full probe result. Always viable — non-viable moves are filtered during enumeration. */
  readonly viability: import('./apply-move.js').MoveViabilityProbeResult;
}
```

This type is intentionally added here even though ticket 002 is the first behavioral consumer. It establishes the canonical shared contract at the kernel boundary before the return-type migration.

### 3. Extend `GameDefRuntime` in `packages/engine/src/kernel/gamedef-runtime.ts`

Add `alwaysCompleteActionIds: ReadonlySet<ActionId>` to the `GameDefRuntime` interface. Compute it in `createGameDefRuntime` by calling `computeAlwaysCompleteActionIds(def)`.

### 4. Export from `packages/engine/src/kernel/index.ts`

Add export for `always-complete-actions.ts`. `ClassifiedMove` will flow through the existing `types.ts` re-export.

### 5. Update direct `GameDefRuntime` object-literal tests/helpers

Any test or helper that constructs a `GameDefRuntime` object literal directly must add `alwaysCompleteActionIds` so the runtime contract stays total. Known touchpoints include:
- `packages/engine/test/unit/kernel/condition-annotator.test.ts`
- any test helper that clones/spreads a runtime while preserving the full interface

## Files to Touch

- `packages/engine/src/kernel/always-complete-actions.ts` (new)
- `packages/engine/src/kernel/types-core.ts` (modify — add `ClassifiedMove`)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify — add field + compute)
- `packages/engine/src/kernel/index.ts` (modify — add export)
- `packages/engine/test/unit/kernel/effect-compiler-types.test.ts` (modify — extend runtime assertions)
- `packages/engine/test/unit/kernel/condition-annotator.test.ts` (modify — add new runtime field to object-literal fixture)
- other tests/helpers that fail typecheck due to direct `GameDefRuntime` construction

## Out of Scope

- Changing `enumerateLegalMoves` return type (ticket 002)
- Changing `legalMoves` facade return type (ticket 002)
- Changing agent interfaces or `preparePlayableMoves` (ticket 004)
- Adding `skipMoveValidation` to `ExecutionOptions` (ticket 003)
- Modifying the simulator or runner (tickets 005, 006)
- Changing `MoveViabilityProbeResult` itself — it stays as-is

## Acceptance Criteria

### Tests That Must Pass

1. `effectTreeMayYieldIncompleteMove` returns `false` for an empty effect list
2. `effectTreeMayYieldIncompleteMove` returns `false` for effects with only `set`, `moveToken`, `forEach` (no nested incomplete nodes)
3. `effectTreeMayYieldIncompleteMove` returns `true` for a top-level `chooseOne` effect
4. `effectTreeMayYieldIncompleteMove` returns `true` for a `chooseN` nested inside `forEach`
5. `effectTreeMayYieldIncompleteMove` returns `true` for `rollRandom` nested inside `if`
6. `computeAlwaysCompleteActionIds` returns an action with 0 params, no pipeline, and no incompleteness-producing cost/effect nodes
7. `computeAlwaysCompleteActionIds` excludes an action with params
8. `computeAlwaysCompleteActionIds` excludes an action with a matching pipeline entry
9. `computeAlwaysCompleteActionIds` excludes an action with incomplete cost/effect nodes, including `rollRandom`
10. `createGameDefRuntime` populates `alwaysCompleteActionIds` — verify field exists and is a Set
11. Existing suite: relevant engine unit tests pass unchanged aside from fixture updates
12. Existing suite: `pnpm turbo typecheck` — no type errors

### Invariants

1. `alwaysCompleteActionIds` is conservative: every action in the set MUST be truly always-complete. False positives are correctness bugs.
2. `effectTreeMayYieldIncompleteMove` must fail closed against the current AST: any known incompleteness-producing node makes the result `true`.
3. `ClassifiedMove.viability` references the existing `MoveViabilityProbeResult` type — no new viability type is introduced.
4. `GameDefRuntime` remains a plain object (no class instances beyond the existing `Map` fields) — structured-clone-safe constraints for downstream consumers stay unchanged.
5. Branded `ActionId` is used throughout — no raw strings.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/always-complete-actions.test.ts` — unit tests for `effectTreeMayYieldIncompleteMove` and `computeAlwaysCompleteActionIds` with synthetic `GameDef` fixtures
2. `packages/engine/test/unit/kernel/effect-compiler-types.test.ts` — verify `createGameDefRuntime` now populates `alwaysCompleteActionIds`
3. `packages/engine/test/unit/kernel/condition-annotator.test.ts` — update direct runtime fixture construction to satisfy the expanded `GameDefRuntime` contract

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-22
- What changed:
  - Added `ClassifiedMove` to the shared kernel types.
  - Added `packages/engine/src/kernel/always-complete-actions.ts` with a fail-closed scan for incompleteness-producing effect nodes.
  - Extended `GameDefRuntime` and `createGameDefRuntime` with `alwaysCompleteActionIds`.
  - Added focused unit coverage for the new static analysis and extended runtime tests.
  - Updated direct `GameDefRuntime` test fixtures to satisfy the expanded runtime contract.
- Deviations from original plan:
  - Replaced the narrower `effectTreeContainsDecision` concept with `effectTreeMayYieldIncompleteMove` because the current kernel also treats `rollRandom` as an incomplete viability source.
  - Removed stale `chooseFromZone` / `conditional` assumptions from the ticket because those do not match the current `EffectAST`.
- Verification results:
  - `node --test packages/engine/dist/test/unit/kernel/always-complete-actions.test.js packages/engine/dist/test/unit/kernel/effect-compiler-types.test.js`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo test`
