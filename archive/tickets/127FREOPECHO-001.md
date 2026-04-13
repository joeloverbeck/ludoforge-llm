# 127FREOPECHO-001: Create zone-filter binding-count constraint extraction utility

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new pure utility in kernel
**Deps**: `specs/127-free-operation-chooseN-max-constraint-propagation.md`

## Problem

Free-operation grants carry zone-filter ASTs that may constrain binding counts (e.g., `count($targetSpaces) == 1`), but no utility exists to extract these constraints from the AST. Ticket 002 needs this extraction to clamp `chooseN.max` at the source. This ticket delivers the pure extraction function and its unit tests, with zero behavioral changes to the engine.

## Assumption Reassessment (2026-04-13)

1. `ConditionAST` is the type for zone-filter nodes — confirmed in `packages/engine/src/kernel/types.js` (re-exported from types-ast).
2. Zone-filter ASTs use `op: 'and'` / `op: 'or'` with `args` arrays, and comparison nodes use `op: '=='` / `op: '<='` / `op: '<'` / `op: '>='` / `op: '>'` with `left`/`right` — confirmed by the grant YAML in the spec and by `ConditionAST` union shape.
3. The prior attempt's extraction logic (`extractBindingCountConstraints` / `extractBindingCountBoundsMap`) was fully reverted — zero remnants in the codebase (confirmed during reassessment). This is a fresh implementation.
4. `FreeOperationExecutionOverlay` at `free-operation-overlay.ts:15-21` carries `zoneFilter?: ConditionAST` — confirmed. This is the consumer site in ticket 002.

## Architecture Check

1. The extraction function is a **pure utility** — it takes an AST and a binding name, returns bounds or null. No side effects, no state access, no imports from effect execution or legal-choices modules.
2. Game-agnostic by construction: it pattern-matches generic `ConditionAST` nodes, not FITL-specific structures. Satisfies Foundation 1.
3. No backwards-compatibility concerns — this is a new file with no existing consumers.

## What to Change

### 1. Create `packages/engine/src/kernel/zone-filter-constraint-extraction.ts`

Export a single function:

```typescript
export function extractBindingCountBounds(
  zoneFilter: ConditionAST,
  bindingName: string,
): { readonly min?: number; readonly max?: number } | null;
```

**Algorithm:**
- Walk `and`-nodes recursively, collecting constraints.
- For each comparison node (`==`, `<=`, `<`, `>=`, `>`), check if one side is `aggregate: { op: 'count', query: { query: 'binding', name: bindingName } }` and the other side is a numeric literal.
- Convert each match to a min/max bound:
  - `count == N` → `{ min: N, max: N }`
  - `count <= N` → `{ max: N }`
  - `count < N` → `{ max: N - 1 }`
  - `count >= N` → `{ min: N }`
  - `count > N` → `{ min: N + 1 }`
  - Handle both `left`/`right` orientations (count may be on either side; flip the operator when count is on the right).
- Stop at `or`-nodes — constraints inside `or` branches are not universally applicable.
- If no constraints found for the given binding, return `null`.
- If multiple constraints found (e.g., `count >= 1 AND count <= 3`), intersect them into the tightest bounds.

**File size target**: <100 lines. No imports beyond kernel types.

### 2. Create unit test file

File: `packages/engine/test/unit/kernel/zone-filter-constraint-extraction.test.ts`

Test cases:
1. `count($binding) == 1` → `{ min: 1, max: 1 }`
2. `count($binding) <= 3` → `{ max: 3 }`
3. `count($binding) < 3` → `{ max: 2 }`
4. `count($binding) >= 2` → `{ min: 2 }`
5. `count($binding) > 0` → `{ min: 1 }`
6. Reversed operand order (literal on left) — same results
7. `or`-node containing a count constraint — returns `null` (not universally applicable)
8. `and`-node with no count constraints for the queried binding — returns `null`
9. `and`-node with constraints for a *different* binding — returns `null` for the queried name
10. Nested `and`-nodes — constraints collected from all levels
11. Multiple constraints intersected: `count >= 1 AND count <= 3` → `{ min: 1, max: 3 }`
12. The exact zone-filter AST from the spec's reproduction section (the `freeOp:1:2:event:0` grant) — returns `{ min: 1, max: 1 }` for `$targetSpaces`

## Files to Touch

- `packages/engine/src/kernel/zone-filter-constraint-extraction.ts` (new)
- `packages/engine/test/unit/kernel/zone-filter-constraint-extraction.test.ts` (new)

## Out of Scope

- Wiring the extraction into `effects-choice.ts` (that is ticket 002)
- Modifying any existing kernel file
- Handling `or`-node constraints (intentionally excluded — not universally applicable)
- Handling non-count aggregates (e.g., `sum`, `min`, `max` — only `count` is relevant here)

## Acceptance Criteria

### Tests That Must Pass

1. All 12 unit test cases listed above pass
2. `pnpm turbo typecheck` passes with no new errors
3. Existing suite: `pnpm turbo test` — all green (no behavioral changes)

### Invariants

1. The extraction function is pure — no side effects, no state mutation, no imports from effect-execution or legal-choices modules
2. Foundation 1: no game-specific logic in the utility
3. File stays under 100 lines (spec hard constraint: no new files > 200 lines)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/zone-filter-constraint-extraction.test.ts` — exercises all operator types, orientations, nesting, `or`-short-circuit, and the real-world zone-filter AST from the spec

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/zone-filter-constraint-extraction.test.js` (targeted)
2. `pnpm turbo typecheck` (type safety)
3. `pnpm turbo test` (full suite — confirm no regressions)

## Outcome (2026-04-13)

- Added `extractBindingCountBounds` in `packages/engine/src/kernel/zone-filter-constraint-extraction.ts` as a pure, game-agnostic `ConditionAST` walker that ignores `or` branches, handles reversed operands, and intersects multiple count constraints for a single binding.
- Added `packages/engine/test/unit/kernel/zone-filter-constraint-extraction.test.ts` covering all 12 planned cases, including the real-world `freeOp:1:2:event:0` zone-filter shape from the spec.
- Corrected the draft ticket's stale focused test command to the repo-valid built-file `node --test` form used by `@ludoforge/engine`.
- Deferred consumer wiring in `effects-choice.ts` and the regression/integration proof to sibling ticket `127FREOPECHO-002`.
- Schema/artifact fallout checked via `schema:artifacts:check` during `pnpm turbo test`; no generated artifact changes were required.

### Verification Run

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/zone-filter-constraint-extraction.test.js`
3. `pnpm turbo typecheck`
4. `pnpm turbo test`
