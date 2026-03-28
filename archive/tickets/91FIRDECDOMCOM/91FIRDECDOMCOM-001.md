# 91FIRDECDOMCOM-001: First-decision types and effect-tree walker

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module
**Deps**: Spec 90 (compiled condition predicates — `condition-compiler.ts`, `compiled-condition-cache.ts`)

## Problem

The first step toward compiling first-decision domain checks is a static
analysis pass that walks an `EffectAST[]` tree and locates the first
`chooseOne` (_k: 15) or `chooseN` (_k: 16) node in execution order. This
walker is the foundation for all subsequent tickets in the
91FIRDECDOMCOM series, so its traversal rules must match the actual
kernel AST shape exactly.

## Assumption Reassessment (2026-03-28)

1. `EffectAST` is a discriminated union keyed by `_k` (confirmed in
   `packages/engine/src/kernel/types-ast.ts`). Tags 15 and 16 are
   `chooseOne` and `chooseN`.
2. Nested-effect carriers in the current AST are broader than the ticket
   originally assumed. The walker must account for:
   - `if` (_k: 28): `if.then`, optional `if.else`
   - `forEach` (_k: 29): `forEach.effects`, optional `forEach.in`
   - `reduce` (_k: 30): `reduce.in`
   - `removeByPriority` (_k: 31): optional `removeByPriority.in`
   - `let` (_k: 32): `let.in`
   - `evaluateSubset` (_k: 33): `evaluateSubset.compute`,
     `evaluateSubset.in`
   - `rollRandom` (_k: 27): `rollRandom.in`
3. `forEach` uses `over: OptionsQuery`, not `query`; `reduce` uses
   `over` plus `in`; `evaluateSubset` uses `source`, `compute`, and `in`.
   The original ticket's field names for these nodes were incorrect.
4. Pipeline actions do not expose `EffectAST[][]` directly. They expose
   `stages: readonly { effects: readonly EffectAST[]; ... }[]` plus
   `costEffects`. Ticket 001 stays action-local and effect-list-local;
   pipeline-aware composition belongs in later tickets.
5. `condition-compiler.ts` exports `CompiledConditionPredicate` and
   `tryCompileCondition`, but 001 should not depend on them yet.

## Architecture Check

1. The walker remains a pure function
   `readonly EffectAST[] -> FirstDecisionNode | null`. No side effects,
   no game-specific knowledge. Aligns with F1 (agnosticism) and
   F5 (determinism).
2. Keeping 001 limited to structural discovery is still architecturally
   sound. It lets 002 compile against a stable, tested descriptor instead
   of re-deriving traversal state ad hoc.
3. The original ticket leaned toward introducing yet another bespoke AST
   walker without acknowledging existing duplication
   (`move-runtime-bindings.ts`, `effect-compiler-patterns.ts`). For this
   ticket, a dedicated walker is still justified because first-decision
   analysis needs path/guard metadata that the existing walkers do not
   expose. However, the implementation should stay narrowly scoped and
   avoid speculative generalization. Shared traversal consolidation can be
   proposed later if the series creates a third or fourth copy.
4. No backwards-compatibility shims. Export the new module from the
   kernel surface; do not add alias paths.

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
  /**
   * Guard conditions on the concrete path preceding this node.
   * `if.then` contributes `if.when`; `if.else` contributes `not(if.when)`.
   */
  readonly guardConditions: readonly ConditionAST[];
  /** Whether the node is inside a forEach (affects domain resolution). */
  readonly insideForEach: boolean;
  /** The nearest enclosing forEach collection query, when applicable. */
  readonly forEachQuery?: OptionsQuery;
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
  counts"). Collect `if.when` as a guard for `then`, and
  `{ op: 'not', arg: if.when }` as a guard for `else`.
- For `forEach` (_k: 29): descend into `forEach.effects`. Mark
  `insideForEach: true` and capture `forEach.over`. If no decision is
  found there, continue with optional `forEach.in`.
- For `let` (_k: 32): descend into `let.in`.
- For `evaluateSubset` (_k: 33): descend into `evaluateSubset.compute`
  first, then `evaluateSubset.in`.
- For `reduce` (_k: 30): descend into `reduce.in`.
- For `removeByPriority` (_k: 31): descend into optional
  `removeByPriority.in`.
- For `rollRandom` (_k: 27): descend into `rollRandom.in`.
- For `chooseOne` (_k: 15) / `chooseN` (_k: 16): return the node.
- All other tags: skip (no decision, continue to next effect).

Also implement `countDecisionNodes(effects: readonly EffectAST[]): number`
to determine whether an action has exactly 1 decision (enables the
aggressive single-decision optimization in later tickets).

### 2. Export the module from the kernel surface

Export `findFirstDecisionNode`, `countDecisionNodes`,
`FirstDecisionNode`, `FirstDecisionDomainResult`, and
`FirstDecisionCheckResult` from the main kernel surface
(`packages/engine/src/kernel/index.ts`). Do not introduce a parallel
"types barrel"; `types.ts` already re-exports shared AST/core types.

## Files to Touch

- `packages/engine/src/kernel/first-decision-compiler.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify)
- `packages/engine/test/unit/kernel/first-decision-walker.test.ts` (new)

## Out of Scope

- Domain check compilation (patterns 1-5) — that is 91FIRDECDOMCOM-002.
- Cache infrastructure — that is 91FIRDECDOMCOM-003.
- Any modification to `legal-moves.ts` — that is 91FIRDECDOMCOM-003.
- Any modification to `gamedef-runtime.ts`.
- Event card effect resolution.
- Performance benchmarks.
- Extracting a repo-wide shared effect walker. That may be worthwhile
  later, but it is not required to land a correct first-decision walker.

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
8. `findFirstDecisionNode` searches `forEach.effects` before
   `forEach.in`.
9. `findFirstDecisionNode` descends through `rollRandom.in`,
   `removeByPriority.in`, `reduce.in`, and both
   `evaluateSubset.compute` / `evaluateSubset.in`.
10. `countDecisionNodes` returns 0 for effect lists with no decisions.
11. `countDecisionNodes` returns 1 for a single `chooseOne` in a flat list.
12. `countDecisionNodes` returns 2 for `[chooseOne, forEach { chooseN }]`.
13. `countDecisionNodes` correctly counts decisions inside `if` branches
    (both then and else), optional continuation branches, and other nested
    carriers listed above.
14. Existing relevant suite plus targeted first-decision tests pass.

### Invariants

1. The walker is a pure function — no side effects, no state mutation.
2. All `EffectAST` `_k` tags are handled (either descended into or skipped).
   Unknown tags must not crash — they are skipped.
3. The walker operates on generic `EffectAST[]` — no game-specific logic.
4. `guardConditions` accumulates conditions from `if` nodes on the path
    to the decision — never conditions from sibling or unrelated branches.
5. Execution-order semantics matter: nested bodies that execute before
   later sibling effects must be searched before later siblings; optional
   continuation lists (`forEach.in`, `removeByPriority.in`) are searched
   only after their primary nested body when applicable.
6. 001 is intentionally conservative about branch-divergent topologies.
   The walker returns one deterministic candidate node plus its path
   guards; later tickets may still mark such actions non-compilable if a
   single first-decision-domain closure cannot faithfully represent all
   runtime branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/first-decision-walker.test.ts` —
   Unit tests for `findFirstDecisionNode` and `countDecisionNodes` using
   hand-crafted `EffectAST` fixtures covering all nested-effect carriers
   that can contain decisions in the current kernel AST.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern=\"first-decision|walker\"`
2. `pnpm turbo typecheck`
3. `pnpm turbo test --force`

## Outcome

- Completed: 2026-03-28
- What actually changed:
  - Added `packages/engine/src/kernel/first-decision-compiler.ts` with
    the shared series types plus pure `findFirstDecisionNode` and
    `countDecisionNodes` walkers.
  - Exported the module from `packages/engine/src/kernel/index.ts`.
  - Added `packages/engine/test/unit/kernel/first-decision-walker.test.ts`
    covering flat traversal, `if` guard accumulation, `forEach` body vs
    continuation semantics, nested path capture, and all currently
    supported nested-effect carriers.
  - Corrected the ticket itself before implementation so its AST field
    assumptions matched the real kernel (`forEach.over`,
    `reduce.in`, `evaluateSubset.compute` / `in`,
    `removeByPriority.in`, `rollRandom.in`).
- Deviations from original plan:
  - The ticket originally described several AST fields incorrectly and
    implied a separate "types barrel". The implementation instead exports
    the new module through the existing kernel surface.
  - Else-branch guards are represented as `{ op: 'not', arg: if.when }`
    rather than reusing the raw `if.when` condition.
  - `forEach.in` is treated as loop continuation, not loop body, so
    decisions there are not marked `insideForEach`.
- Verification results:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine typecheck` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
  - `node --test dist/test/unit/kernel/first-decision-walker.test.js` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo test --force` ✅
