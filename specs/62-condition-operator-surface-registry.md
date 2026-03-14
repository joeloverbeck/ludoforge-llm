# Spec 62: Condition Operator Metadata

## Summary

Condition operators lack a single module declaring what operators exist and what their structural shapes are. Adding a new operator requires updating multiple switches across ~9 files, and while TypeScript exhaustiveness checks prevent missing cases, two specific patterns cause unnecessary duplication:

1. **Duplicate operator identity lists**: `SUPPORTED_CONDITION_OPS` in CNL (`compile-conditions.ts`) vs the `ConditionAST` discriminated union in `types-ast.ts`.
2. **Duplicated field-path traversal knowledge**: `zone-selector-aliases.ts` and `validate-conditions.ts` both independently walk operator-specific field paths to find `ZoneSel`, `ValueExpr`, `NumericValueExpr`, and nested `ConditionAST` nodes.

This spec introduces a lightweight metadata module that declares operator identity and structural field-path metadata in one place, eliminating these two duplication sites without disturbing the existing switch-based dispatch architecture.

## Problem

Today, two concrete duplications exist:

- `packages/engine/src/cnl/compile-conditions.ts` maintains `SUPPORTED_CONDITION_OPS` as a separate array, duplicating what `ConditionAST`'s discriminated union already defines.
- `packages/engine/src/kernel/zone-selector-aliases.ts` and `packages/engine/src/kernel/validate-conditions.ts` each independently encode which fields of each operator contain `ZoneSel`, `ValueExpr`, `NumericValueExpr`, or nested `ConditionAST` — the same structural knowledge in two places.

The remaining ~7 switch statements (`eval-condition.ts`, `ast-to-display.ts`, `tooltip-blocker-extractor.ts`, `tooltip-modifier-humanizer.ts`, `compile-conditions.ts` lowering, etc.) each handle genuinely different semantic concerns (evaluation, display, lowering). These are **not** a problem — TypeScript exhaustiveness ensures every operator is handled, and the per-operator logic in each switch is semantically distinct. Centralizing those handlers into a mega-descriptor would mix compile-time, runtime, and presentation concerns, making the architecture worse.

**Comparison with effects**: The effect registry pattern (`effect-handlers.ts`) is justified because effects have 32+ operators with budget tracking, recursion limits, and complex dispatch. Conditions are simpler — 15 operators, read-only evaluation, no budget — and do not need the same pattern.

## Goals

1. Provide a single module answering "what condition operators exist and what are their structural field shapes?"
2. Eliminate the duplicate `SUPPORTED_CONDITION_OPS` list in CNL.
3. Eliminate duplicated field-path traversal knowledge across `zone-selector-aliases.ts` and `validate-conditions.ts`.
4. Keep `GameDef`, runtime evaluation, and simulation game-agnostic.
5. Keep game-specific rules in `GameSpecDoc` content, not in kernel branches.
6. Remove backwards-compatibility burden — this is an internal cleanup; callers move to the new module directly.

## Non-Goals

1. Replacing the `ConditionAST` discriminated union — it stays exactly as-is.
2. Centralizing runtime evaluation, CNL lowering, display rendering, blocker extraction, or humanization into registry-owned handlers.
3. Creating a plugin-like handler registration system for conditions.
4. Moving game-specific legality or macro logic into the kernel.
5. Unifying the condition metadata with the effect registry in the same change.

## Architectural Direction

Introduce a **metadata-only** module at `packages/engine/src/kernel/condition-operator-meta.ts` with two responsibilities:

### 1. Canonical operator identity

Export the canonical set of supported condition operator identifiers as a tuple and derived union type, plus a type guard:

```ts
export const CONDITION_OPERATORS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'and', 'or', 'not',
  'adjacent', 'connected',
  'markerStateAllowed', 'markerShiftAllowed',
  'includes', 'isEmpty',
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export function isConditionOperator(op: string): op is ConditionOperator {
  return (CONDITION_OPERATORS as readonly string[]).includes(op);
}
```

This replaces the ad hoc `SUPPORTED_CONDITION_OPS` array in `compile-conditions.ts`.

### 2. Structural field-path metadata

Declare per-operator metadata describing which fields contain `ValueExpr`, `NumericValueExpr`, `ZoneSel`, and nested `ConditionAST`:

```ts
interface ConditionOperatorMeta {
  readonly op: ConditionOperator;
  readonly category: 'boolean' | 'comparison' | 'spatial' | 'marker' | 'membership';
  readonly valueFields?: readonly string[];
  readonly numericValueFields?: readonly string[];
  readonly zoneSelectorFields?: readonly string[];
  readonly nestedConditionFields?: readonly string[];
}
```

This metadata drives:

- **Zone-selector alias extraction** (`zone-selector-aliases.ts`): iterate metadata instead of a per-operator switch.
- **Generic validation traversal** (`validate-conditions.ts`): use metadata for structural field walking, keeping only operator-specific validation logic (e.g., `markerStateAllowed` lattice checks, `connected` literal-only constraints) in targeted branches.

### What stays unchanged

All existing switch statements in these files remain as-is — they handle genuinely distinct semantic concerns:

- `eval-condition.ts` — runtime evaluation logic
- `ast-to-display.ts` — display rendering
- `tooltip-blocker-extractor.ts` — blocker extraction
- `tooltip-modifier-humanizer.ts` — humanization
- `compile-conditions.ts` — CNL lowering (the switch itself stays; only `SUPPORTED_CONDITION_OPS` is removed)

## Proposed Design

### A. Create `condition-operator-meta.ts`

New file at `packages/engine/src/kernel/condition-operator-meta.ts`:

- `CONDITION_OPERATORS` tuple (canonical operator list)
- `ConditionOperator` type
- `isConditionOperator()` type guard
- `CONDITION_OPERATOR_META` map: `ReadonlyMap<ConditionOperator, ConditionOperatorMeta>`
- `getConditionOperatorMeta(op)` lookup helper

### B. Replace `SUPPORTED_CONDITION_OPS` in CNL

`compile-conditions.ts` imports `CONDITION_OPERATORS` (or `isConditionOperator`) from the new module instead of maintaining its own list.

### C. Refactor zone-selector alias extraction

`zone-selector-aliases.ts` uses `CONDITION_OPERATOR_META` to iterate declared `zoneSelectorFields` instead of a per-operator switch for field-path walking.

### D. Refactor structural validation traversal

`validate-conditions.ts` uses `CONDITION_OPERATOR_META` for generic field walking (finding nested conditions, value expressions, zone selectors). Operator-specific validation logic (lattice checks, literal constraints) remains in targeted branches.

### E. Add registry-backed tests

Add tests proving:

1. Every operator in `ConditionAST` has a corresponding entry in `CONDITION_OPERATOR_META`.
2. Every metadata entry's declared field paths are valid (fields exist on the corresponding AST node type).
3. `CONDITION_OPERATORS` tuple matches the `ConditionAST` union's `op` discriminants exactly.
4. No separate hard-coded operator identity list remains in `compile-conditions.ts`.

## File-Level Impact

Files created:

- `packages/engine/src/kernel/condition-operator-meta.ts` (new)
- `packages/engine/test/unit/kernel/condition-operator-meta.test.ts` (new)

Files modified:

- `packages/engine/src/cnl/compile-conditions.ts` — remove `SUPPORTED_CONDITION_OPS`, import from new module
- `packages/engine/src/kernel/zone-selector-aliases.ts` — use metadata for field-path traversal
- `packages/engine/src/kernel/validate-conditions.ts` — use metadata for structural field walking

Files **not** modified (switches stay as-is):

- `packages/engine/src/kernel/eval-condition.ts`
- `packages/engine/src/kernel/ast-to-display.ts`
- `packages/engine/src/kernel/tooltip-blocker-extractor.ts`
- `packages/engine/src/kernel/tooltip-modifier-humanizer.ts`
- `packages/engine/src/kernel/types-ast.ts` (`ConditionAST` union unchanged)

## Migration Strategy

This is an internal refactor with no backwards-compatibility shim.

Implementation sequence:

1. Create `condition-operator-meta.ts` with the canonical operator set, type guard, and per-operator structural metadata.
2. Add tests proving metadata completeness and correctness against `ConditionAST`.
3. Replace `SUPPORTED_CONDITION_OPS` in `compile-conditions.ts` with import from new module.
4. Refactor `zone-selector-aliases.ts` to use metadata-driven field-path traversal.
5. Refactor `validate-conditions.ts` to use metadata for structural field walking (keeping operator-specific logic in targeted branches).
6. Verify all engine tests, lint, and typecheck pass.

## Acceptance Criteria

1. A single `condition-operator-meta.ts` module declares the canonical set of condition operators and their structural field-path metadata.
2. No consumer module keeps its own independent condition-operator identity list (specifically, `SUPPORTED_CONDITION_OPS` in CNL is removed).
3. Zone-selector alias traversal for conditions is derived from metadata rather than a per-operator switch duplicating field-path knowledge.
4. Structural validation field walking uses metadata, with operator-specific checks remaining in targeted branches.
5. `ConditionAST` discriminated union in `types-ast.ts` is unchanged.
6. All existing switch statements in `eval-condition.ts`, `ast-to-display.ts`, `tooltip-blocker-extractor.ts`, `tooltip-modifier-humanizer.ts`, and `compile-conditions.ts` (lowering) remain as-is.
7. Runtime semantics remain type-safe and game-agnostic.
8. Game-specific rule data remains in `GameSpecDoc`; visual-only data remains in `visual-config.yaml`.
9. Tests prove metadata completeness: every `ConditionAST` operator has metadata, and every metadata entry's fields are valid.
10. Engine tests, lint, and typecheck pass.

## Risks

1. **Over-abstracting traversal**: If metadata-driven traversal becomes harder to read than the original switches, it defeats the purpose.
   Mitigation: Only use metadata for the two genuinely duplicated concerns (alias extraction, validation walking). Don't force it on semantically distinct switches.
2. **Circular dependencies**: The new module sits in `kernel/` but is consumed by CNL.
   Mitigation: Keep `condition-operator-meta.ts` as a leaf module with no imports from CNL or other kernel modules beyond types.
3. **Metadata staleness**: Metadata could drift from `ConditionAST` types.
   Mitigation: Tests enforce that metadata entries match `ConditionAST` union members exactly.
