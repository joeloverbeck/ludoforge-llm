# 91FIRDECDOMCOM-001: First-decision types and effect-tree walker

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module
**Deps**: Spec 90 (compiled condition predicates — `condition-compiler.ts`, `compiled-condition-cache.ts`)

## Problem

The first step toward compiling first-decision domain checks is a static
analysis pass that walks an `EffectAST[]` tree and locates the first
`chooseOne` (_k: 15) or `chooseN` (_k: 16) node. This walker is the
foundation for all subsequent tickets in the 91FIRDECDOMCOM series.

## Assumption Reassessment (2026-03-28)

1. `EffectAST` is a discriminated union keyed by `_k` (confirmed in
   `types-ast.ts`). Tags 15 and 16 are `chooseOne` and `chooseN`.
2. Control-flow nodes that contain nested effects: `if` (_k: 28),
   `forEach` (_k: 29), `reduce` (_k: 30), `let` (_k: 32),
   `evaluateSubset` (_k: 33). All must be descended into.
3. Pipeline actions expose `stages[].effects` as `EffectAST[][]`.
   Plain actions expose `action.effects` as `EffectAST[]`.
4. `condition-compiler.ts` exports `CompiledConditionPredicate` and
   `tryCompileCondition` — these will be consumed in 91FIRDECDOMCOM-002,
   not in this ticket.

## Architecture Check

1. The walker is a pure function `EffectAST[] → FirstDecisionNode | null`.
   No side effects, no game-specific knowledge. Aligns with F1 (agnosticism)
   and F5 (determinism).
2. Keeping the walker separate from the compilation step (002) means the
   tree-walk logic can be unit-tested in isolation before any closure
   generation exists.
3. No backwards-compatibility shims. No changes to existing modules.

## What to Change

### 1. Create `first-decision-compiler.ts` (walker + types only)

Define the output types that the entire 91FIRDECDOMCOM series will use:

```typescript
/** Describes the first chooseOne/chooseN node found in an effect tree. */
interface FirstDecisionNode {
  readonly kind: 'chooseOne' | 'chooseN';
  /** The raw EffectAST node (tag 15 or 16). */
  readonly node: EffectAST;
  /** Path of ancestor node kinds from root to this node (for diagnostics). */
  readonly path: readonly number[];
  /** Guard conditions on the "always-taken" path preceding this node. */
  readonly guardConditions: readonly ConditionAST[];
  /** Whether the node is inside a forEach (affects domain resolution). */
  readonly insideForEach: boolean;
  /** The forEach collection query, if insideForEach is true. */
  readonly forEachQuery?: unknown;
}

interface FirstDecisionDomainResult {
  readonly compilable: boolean;
  readonly check?: (
    state: GameState,
    activePlayer: PlayerId,
  ) => FirstDecisionCheckResult;
  readonly description?: string;
  readonly isSingleDecision?: boolean;
}

interface FirstDecisionCheckResult {
  readonly admissible: boolean;
  readonly domain?: readonly ChoiceOption[];
}
```

Implement `findFirstDecisionNode(effects: readonly EffectAST[]): FirstDecisionNode | null`:

- Walk effects sequentially.
- For `if` (_k: 28): descend into BOTH `then` and `else` branches. Return
  the first decision found in either (spec says "first decision in either
  counts"). Collect the `if.when` condition as a guard.
- For `forEach` (_k: 29): descend into `forEach.effects`. Mark
  `insideForEach: true` and capture the collection query.
- For `let` (_k: 32): descend into `let.in`.
- For `evaluateSubset` (_k: 33): descend into `evaluateSubset.effects`.
- For `reduce` (_k: 30): descend into `reduce.effects`.
- For `chooseOne` (_k: 15) / `chooseN` (_k: 16): return the node.
- All other tags: skip (no decision, continue to next effect).

Also implement `countDecisionNodes(effects: readonly EffectAST[]): number`
to determine whether an action has exactly 1 decision (enables the
aggressive single-decision optimization in later tickets).

### 2. Export types from kernel barrel

Export `FirstDecisionNode`, `FirstDecisionDomainResult`,
`FirstDecisionCheckResult` from the kernel types barrel so downstream
tickets can import them.

## Files to Touch

- `packages/engine/src/kernel/first-decision-compiler.ts` (new)
- `packages/engine/test/unit/kernel/first-decision-walker.test.ts` (new)

## Out of Scope

- Domain check compilation (patterns 1-5) — that is 91FIRDECDOMCOM-002.
- Cache infrastructure — that is 91FIRDECDOMCOM-003.
- Any modification to `legal-moves.ts` — that is 91FIRDECDOMCOM-003.
- Any modification to `gamedef-runtime.ts`.
- Event card effect resolution.
- Performance benchmarks.
- Barrel re-exports beyond the new types (do not touch existing barrel files
  unless strictly necessary for type visibility).

## Acceptance Criteria

### Tests That Must Pass

1. `findFirstDecisionNode` returns `null` for an empty effect list.
2. `findFirstDecisionNode` returns the `chooseOne` node for a flat list
   `[setVar, setVar, chooseOne]`.
3. `findFirstDecisionNode` returns the `chooseOne` inside an `if.then`
   branch: `[if { then: [chooseOne], else: [] }]`.
4. `findFirstDecisionNode` returns the `chooseN` inside an `if.else`
   branch when `then` has no decision: `[if { then: [setVar], else: [chooseN] }]`.
5. `findFirstDecisionNode` returns the `chooseOne` inside a `forEach`
   body, with `insideForEach: true`.
6. `findFirstDecisionNode` returns the `chooseOne` inside nested
   `let → forEach → chooseOne`, with correct path and flags.
7. `findFirstDecisionNode` returns the FIRST decision when multiple exist
   (e.g., `[chooseOne_A, chooseOne_B]` returns A).
8. `countDecisionNodes` returns 0 for effect lists with no decisions.
9. `countDecisionNodes` returns 1 for a single `chooseOne` in a flat list.
10. `countDecisionNodes` returns 2 for `[chooseOne, forEach { chooseN }]`.
11. `countDecisionNodes` correctly counts decisions inside `if` branches
    (both then and else).
12. Existing suite: `pnpm turbo test --force`

### Invariants

1. The walker is a pure function — no side effects, no state mutation.
2. All `EffectAST` `_k` tags are handled (either descended into or skipped).
   Unknown tags must not crash — they are skipped.
3. The walker operates on generic `EffectAST[]` — no game-specific logic.
4. `guardConditions` accumulates conditions from `if` nodes on the path
   to the decision — never conditions from sibling or unrelated branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/first-decision-walker.test.ts` —
   Unit tests for `findFirstDecisionNode` and `countDecisionNodes` using
   hand-crafted EffectAST fixtures covering all control-flow node types.

### Commands

1. `pnpm -F @ludoforge/engine test 2>&1 | grep -E 'first-decision|FAIL'`
2. `pnpm turbo typecheck`
3. `pnpm turbo test --force`
