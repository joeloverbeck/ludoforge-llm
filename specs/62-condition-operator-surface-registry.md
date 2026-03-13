# Spec 62: Condition Operator Surface Registry

## Summary

Condition operators currently have no single source of truth. Adding or changing one operator requires hand-editing multiple independent switches and string lists across:

- kernel runtime evaluation
- kernel validation
- AST schema wiring
- CNL lowering
- zone-selector alias collection
- display rendering
- tooltip blocker extraction
- tooltip humanization
- exhaustiveness tests

This is not a one-off maintenance inconvenience. It is an architectural ownership gap: the engine has a first-class effect dispatch/registry pattern, and binder surfaces already use centralized contracts, but conditions still rely on distributed procedural knowledge.

This spec defines a game-agnostic condition operator surface registry so each operator’s structural metadata and cross-surface behavior are declared once and consumed consistently.

## Problem

Today, condition operator ownership is fragmented.

Observed examples:

- `packages/engine/src/cnl/compile-conditions.ts` maintains `SUPPORTED_CONDITION_OPS` separately from the actual lowering switch.
- `packages/engine/src/kernel/validate-conditions.ts` re-describes each operator’s validation shape.
- `packages/engine/src/kernel/ast-to-display.ts`, `packages/engine/src/kernel/tooltip-blocker-extractor.ts`, and `packages/engine/src/kernel/tooltip-modifier-humanizer.ts` each carry independent condition-specific formatting logic.
- `packages/engine/src/kernel/zone-selector-aliases.ts` must be updated manually so every operator exposes the correct selector/value traversal.
- `packages/engine/test/unit/types-exhaustive.test.ts` acts as a downstream guard rather than preventing surface drift at the source.

This creates three architectural risks:

1. Semantic drift: one operator’s runtime, validation, lowering, and humanization semantics can diverge.
2. Extensibility drag: every new operator becomes a scavenger hunt through unrelated files.
3. Weak ownership: there is no single module that answers “what is a supported condition operator and what surfaces must it implement?”

## Goals

1. Make condition operator support explicit and centralized.
2. Keep `GameDef`, runtime evaluation, and simulation game-agnostic.
3. Keep game-specific rules in `GameSpecDoc` content, not in kernel branches.
4. Keep visual presentation concerns in `visual-config.yaml` or tooltip/verbalization layers, not in simulation semantics.
5. Remove backwards-compatibility burden. This is an internal architecture cleanup; callers should move to the new ownership model directly.
6. Make adding a new operator require one primary declaration, plus only genuinely operator-specific runtime logic where unavoidable.

## Non-Goals

1. Replacing the core `ConditionAST` union with a loose untyped record shape.
2. Moving game-specific legality or macro logic into the kernel.
3. Turning tooltip prose into simulation semantics.
4. Solving effect/operator registry unification in the same change.

## Architectural Direction

Introduce a condition operator surface registry with two layers:

### 1. Canonical operator descriptor layer

Create a module owned by the kernel/CNL boundary, for example:

- `packages/engine/src/kernel/condition-operator-registry.ts`

This module should define:

- the canonical set of supported condition operator ids
- structural metadata per operator
- reusable traversal metadata for references/selectors/value expressions
- optional humanization/display labels where those are structural rather than game-authored

Representative descriptor shape:

```ts
interface ConditionOperatorDescriptor<TCondition extends ConditionAST = ConditionAST> {
  readonly op: ConditionOperator;
  readonly category: 'boolean' | 'comparison' | 'spatial' | 'marker' | 'membership';
  readonly valueFieldPaths?: readonly ConditionFieldPath[];
  readonly numericValueFieldPaths?: readonly ConditionFieldPath[];
  readonly zoneSelectorFieldPaths?: readonly ConditionFieldPath[];
  readonly nestedConditionFieldPaths?: readonly ConditionFieldPath[];
  readonly lower: ConditionLoweringHandler<TCondition>;
  readonly validate: ConditionValidationHandler<TCondition>;
  readonly display?: ConditionDisplayHandler<TCondition>;
  readonly blocker?: ConditionBlockerHandler<TCondition>;
  readonly humanize?: ConditionHumanizer<TCondition>;
}
```

The exact type shape may differ, but the ownership rule should hold:

- one registry declares the operator surface contract
- consumers iterate/use registry data instead of open-coding operator lists and duplicated path metadata

### 2. Runtime semantics remain separate where they should

Do not force runtime evaluation into a generic metadata table if doing so weakens type safety or clarity.

The right split is:

- registry owns operator identity and cross-surface metadata
- runtime evaluation remains in `eval-condition.ts`, but dispatches through registry-backed typed handlers or a tightly coupled handler map

That avoids turning simulation logic into stringly-typed config while still centralizing surface ownership.

## Proposed Design

### A. Define `ConditionOperator`

Replace ad hoc literal lists like `SUPPORTED_CONDITION_OPS` with a canonical exported union/tuple from the registry module.

Consumers should import:

- `SUPPORTED_CONDITION_OPERATORS`
- `isConditionOperator(...)`
- descriptor lookup helpers

This removes duplicated support lists from CNL and tests.

### B. Centralize traversal metadata

The registry should declare which fields contain:

- nested conditions
- generic `ValueExpr`
- `NumericValueExpr`
- zone selectors

This metadata should drive:

- zone-selector alias extraction
- generic validation traversal
- generic lowering traversal scaffolding

This is the highest-value cleanup because it removes the “edit every switch” pattern for structurally similar operators.

### C. Keep operator-specific logic pluggable

Some operators need custom behavior:

- `connected` has literal-only options like `allowTargetOutsideVia` and `maxDepth`
- `markerStateAllowed` validates state literals against lattice state sets
- `markerShiftAllowed` requires numeric delta semantics

Those cases should plug into the registry as custom handlers layered on top of the generic traversal metadata, not by bypassing the registry entirely.

### D. Separate structural presentation from game-authored labels

The registry may own structural phrases like:

- `adjacent`
- `connected`
- `allows`
- `allows shift`

But it must not own game-specific display names for markers, states, or spaces.

Those remain resolved through:

- verbalization data
- label resolver
- `visual-config.yaml` for presentation-only game-specific visuals

This preserves the boundary:

- registry defines engine structure
- `GameSpecDoc` defines game behavior/data
- `visual-config.yaml` defines game-specific visual presentation

### E. Move condition-surface tests to registry-backed invariants

Add tests that prove:

1. every supported operator has a descriptor
2. every descriptor’s declared field paths are valid
3. generic alias/validation/lowering traversal uses descriptor metadata
4. no separate hard-coded operator lists remain in consumer modules

This is better than relying on downstream exhaustiveness counts alone.

## File-Level Impact

Expected touched files in implementation:

- `packages/engine/src/kernel/condition-operator-registry.ts` (new)
- `packages/engine/src/kernel/types-ast.ts`
- `packages/engine/src/cnl/compile-conditions.ts`
- `packages/engine/src/kernel/validate-conditions.ts`
- `packages/engine/src/kernel/zone-selector-aliases.ts`
- `packages/engine/src/kernel/ast-to-display.ts`
- `packages/engine/src/kernel/tooltip-blocker-extractor.ts`
- `packages/engine/src/kernel/tooltip-modifier-humanizer.ts`
- `packages/engine/src/kernel/eval-condition.ts`
- `packages/engine/test/unit/types-exhaustive.test.ts`
- `packages/engine/test/unit/compile-conditions.test.ts`
- `packages/engine/test/unit/kernel/tooltip-*.test.ts`
- new registry-focused unit tests

## Migration Strategy

This is an internal refactor with no backwards-compatibility shim.

Implementation sequence:

1. Introduce registry module with the canonical operator set and descriptor types.
2. Migrate low-risk consumers first:
   - supported operator list
   - zone-selector alias traversal
   - generic validation field walking
3. Migrate CNL lowering to use descriptor-owned lowering handlers.
4. Migrate display/humanization/blocker extraction to descriptor-backed handlers.
5. Leave runtime eval on typed handlers, but make operator dispatch registry-owned.
6. Remove stale duplicate operator lists/switch-only ownership patterns.

## Acceptance Criteria

1. There is one canonical supported-condition-operator registry.
2. No consumer module keeps its own independent condition-operator support list.
3. Zone-selector alias traversal for conditions is derived from registry metadata rather than per-file duplicated switches.
4. Validation and CNL lowering use registry-backed structural ownership, with custom handlers only where structurally necessary.
5. Runtime semantics remain type-safe and game-agnostic.
6. Game-specific rule data remains in `GameSpecDoc`; visual-only game-specific data remains in `visual-config.yaml`.
7. Adding a new structurally ordinary condition operator requires:
   - extending `ConditionAST`
   - adding one registry descriptor
   - adding operator-specific runtime logic only if semantics are genuinely new
8. Engine tests, lint, and typecheck pass.

## Risks

1. Over-abstracting runtime semantics into generic config would reduce clarity.
   Mitigation: keep evaluation handlers typed and explicit.
2. Circular dependencies between kernel and CNL helpers.
   Mitigation: keep registry ownership in a leaf module with narrow imports.
3. Partial migration could leave two sources of truth.
   Mitigation: make duplicate lists a lint/test failure in the same change.

## Why This Should Be A Spec, Not A Ticket

This change defines ownership boundaries for a whole subsystem rather than implementing one localized behavior. The goal is to establish the permanent architecture for future condition operators, not just clean up one current duplication site.
