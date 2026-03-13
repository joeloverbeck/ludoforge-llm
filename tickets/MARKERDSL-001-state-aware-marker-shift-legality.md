# MARKERDSL-001: State-Aware Marker Shift Legality

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — condition AST/schema/runtime, lattice helper reuse, validation/display/tooltips
**Deps**: tickets/README.md, docs/fitl-event-authoring-cookbook.md, archive/specs/25-fitl-game-mechanics-infrastructure.md

## Problem

`markerStateAllowed` answers only whether a marker state is legal in a space in the abstract. It does not answer whether a relative marker shift from the current state is executable. That mismatch forces authoring workarounds such as pairing `markerStateAllowed` with extra current-state exclusions to avoid illegal no-op selections.

This is a DSL gap, not a FITL-specific rule quirk:

- Support/opposition events often mean "shift 1 level toward X", not "target any space where state X is legal".
- The same pattern applies to any lattice-backed marker in any game package.
- The current authoring surface makes correct selector predicates harder to write and easier to get subtly wrong.

## Assumption Reassessment (2026-03-13)

1. `packages/engine/src/kernel/eval-condition.ts` currently implements `markerStateAllowed` by checking whether the candidate state is allowed under the lattice constraints for the space.
2. `packages/engine/src/kernel/space-marker-rules.ts` already centralizes constraint checking, so there is a natural place to add state-aware transition logic without FITL-specific branching.
3. `shiftMarker` already encodes relative lattice movement semantics at effect execution time, but there is no corresponding condition operator for selectors. The corrected scope is to add a generic transition-aware condition surface rather than layering more author-side guard patterns into FITL YAML.

## Architecture Check

1. The clean solution is a first-class generic condition operator, not more cookbook guidance or event-local macros. The engine should expose the same transition semantics for legality checks that it already exposes for mutation.
2. This preserves the boundary: FITL continues to declare support-shift intent in `GameSpecDoc`, while `GameDef`/kernel provide a game-agnostic lattice-transition primitive usable by any package with ordered marker states.
3. No backwards-compatibility shim is needed. `markerStateAllowed` keeps its current meaning, and the new operator becomes the canonical surface for relative transition checks.

## What to Change

### 1. Add a generic `markerShiftAllowed` condition operator

Add a new `ConditionAST` shape:

```ts
{
  op: 'markerShiftAllowed';
  space: ZoneSel;
  marker: string;
  delta: NumericValueExpr;
}
```

Semantics:

- Resolve the current marker state for `space` and `marker`.
- Compute the shifted destination using the same lattice ordering/clamping rules as `shiftMarker`.
- Return `false` if the shift would clamp back to the same state and therefore produce no state change.
- Return `false` if the shifted destination is not allowed by lattice constraints for that space.
- Return `true` only when the shift would produce a different legal destination state.

This is intentionally relative-state semantics. Absolute-state legality remains the job of `markerStateAllowed`.

### 2. Factor lattice transition resolution into a shared helper

Today the engine has:

- abstract state legality (`markerStateAllowed`)
- mutation-time relative shift (`shiftMarker`)

Add a shared helper that resolves:

- current state index
- shifted destination state after delta and clamping
- whether the shift changes state
- whether the destination satisfies lattice constraints

Both `shiftMarker` execution and `markerShiftAllowed` should use that helper so selector legality and mutation semantics cannot drift.

### 3. Wire the new operator through validation, schema, compiler, and diagnostics

Update:

- AST types and Zod schemas
- condition validation
- CNL/lowering support if condition operators are enumerated there
- humanization / tooltip rendering / blocker extraction
- display rendering

The error contract should remain explicit:

- unknown marker lattice -> validation/runtime error as today
- non-numeric delta -> validation/runtime error
- no-op shift -> legal `false`, not an exception

### 4. Update authoring guidance toward transition-aware predicates

Extend the FITL cookbook to make the preferred split explicit:

- use `markerStateAllowed` for absolute target-state legality
- use `markerShiftAllowed` for "shift N levels" event or action targeting

Include one production-style example showing a support-shift selector expressed without ad hoc current-state exclusions.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/eval-condition.ts` (modify)
- `packages/engine/src/kernel/space-marker-rules.ts` (modify)
- `packages/engine/src/kernel/validate-conditions.ts` (modify)
- `packages/engine/src/kernel/ast-to-display.ts` (modify)
- `packages/engine/src/kernel/tooltip-blocker-extractor.ts` (modify)
- `packages/engine/src/kernel/tooltip-modifier-humanizer.ts` (modify)
- `packages/engine/src/cnl/compile-conditions.ts` (modify if needed by the condition registry path)
- `packages/engine/test/unit/` (modify/add targeted condition and display tests)
- `packages/engine/test/integration/` (modify/add lattice-transition legality tests)
- `docs/fitl-event-authoring-cookbook.md` (modify)

## Out of Scope

- Adding game-specific support/opposition predicates to the engine.
- Changing the semantics of `markerStateAllowed`.
- Re-authoring the full FITL card set in the same ticket.
- Adding visual-config-only affordances.

## Acceptance Criteria

### Tests That Must Pass

1. A `markerShiftAllowed` selector returns `true` for a legal one-step shift that changes state.
2. A `markerShiftAllowed` selector returns `false` when the current state is already at the clamped edge and the requested delta would be a no-op.
3. A `markerShiftAllowed` selector returns `false` when the shifted destination violates the lattice constraints for that space.
4. `shiftMarker` and `markerShiftAllowed` agree on destination-state semantics for the same starting state and delta.
5. A FITL-style support-shift selector can target populated legal spaces without an extra explicit `currentState != activeSupport` guard.
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Marker-lattice legality remains game-agnostic and driven entirely by lattice data plus space context.
2. Selector legality and effect execution share one transition-resolution contract.
3. No new FITL-specific branches or identifiers appear in kernel/runtime code.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/spatial-conditions.test.ts` — add `markerShiftAllowed` truth-table coverage for change/no-op/constraint-failure cases.
2. `packages/engine/test/unit/spatial-effects.test.ts` — assert `shiftMarker` uses the same destination computation as the new helper.
3. `packages/engine/test/unit/tooltip-*` tests — verify humanization and blocker text for the new operator.
4. `packages/engine/test/integration/space-marker-rules.test.ts` — exercise lattice constraints through the new condition in a full eval context.
5. `packages/engine/test/integration/fitl-events-usaid.test.ts` or successor event tests — confirm a production-style support selector can rely on `markerShiftAllowed`.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/spatial-conditions.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/space-marker-rules.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint && pnpm turbo typecheck`
