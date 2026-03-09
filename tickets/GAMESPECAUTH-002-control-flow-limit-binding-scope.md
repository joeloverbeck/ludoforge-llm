# GAMESPECAUTH-002: Make local control-flow limits resolve bindings from the current authored scope

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effect execution scoping, binding resolution for control-flow limits, regression coverage
**Deps**: tickets/README.md, tickets/_TEMPLATE.md, data/games/fire-in-the-lake/41-content-event-decks.md

## Problem

Bindings created inside a local `let` scope are not always visible where a nearby control-flow construct resolves its limit, especially inside `forEach.limit`. In practice this forces authors to avoid the natural authored shape of “compute a per-iteration count, then use it as the loop limit” and instead rewrite to less direct forms. That is a generic authored-data scoping problem, not a game-rule problem.

## Assumption Reassessment (2026-03-09)

1. Russian Arms shaded initially failed at runtime with `MISSING_BINDING` when `forEach.limit` referenced a value bound by a surrounding `let` in the same per-space effect block.
2. Replacing the templated/per-space binding with a plain local binding fixed the authored data without changing intended behavior, confirming a scope-resolution limitation rather than bad card logic.
3. The corrected scope is to make control-flow limit resolution honor the current effect scope consistently, not to preserve workarounds in authored FITL card data.

## Architecture Check

1. Fixing scope resolution is cleaner than teaching authors special cases about where bindings “count” because it aligns authored behavior with the existing AST nesting model.
2. This remains entirely game-agnostic: it is about generic effect execution semantics and binding visibility, not FITL event behavior.
3. No compatibility layer is needed. The runtime should treat local authored scopes consistently and remove the need for workaround patterns.

## What to Change

### 1. Audit control-flow limit evaluation

Inspect `forEach.limit`, `chooseN.min/max`, and any related control-flow budget/limit evaluation sites to ensure they resolve bindings from the same scoped environment as sibling nested effects.

### 2. Unify scoped binding visibility rules

Make binding resolution consistent across nested `let`, `if`, and `forEach` evaluation so a binding authored in the surrounding scope is available anywhere semantically inside that scope unless intentionally shadowed.

### 3. Lock behavior with regression tests

Add direct engine tests for local bindings used inside loop limits and similar control-flow boundaries.

## Files to Touch

- `packages/engine/src/kernel/*control*` (modify)
- `packages/engine/src/kernel/resolve-ref*` (modify if needed)
- `packages/engine/src/kernel/effects-*` (modify if needed)
- `packages/engine/test/unit/effects-control-flow.test.ts` (modify)
- `packages/engine/test/unit/resolve-ref.test.ts` (modify if needed)

## Out of Scope

- New FITL-specific macros
- Changing unrelated binding-shadowing diagnostics unless needed for correctness
- Visual config changes

## Acceptance Criteria

### Tests That Must Pass

1. A local `let` binding can be referenced by `forEach.limit` within the same authored scope.
2. Existing binding-shadowing and missing-binding diagnostics still behave correctly for truly invalid references.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Binding resolution remains generic and game-agnostic.
2. Authored nested control flow follows one coherent scope model across compiler/runtime boundaries.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-control-flow.test.ts` — cover local `let` binding usage in `forEach.limit`.
2. `packages/engine/test/unit/resolve-ref.test.ts` — verify scoped visibility and invalid-binding failure cases.
3. `packages/engine/test/integration/fitl-events-russian-arms.test.ts` — optionally simplify shaded assertions once authored data is reworked.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-control-flow.test.js`
3. `node --test packages/engine/dist/test/unit/resolve-ref.test.js`
4. `pnpm turbo test`
