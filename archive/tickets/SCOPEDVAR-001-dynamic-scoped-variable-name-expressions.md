# SCOPEDVAR-001: Dynamic Scoped Variable Name Expressions

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — AST/scoped-var contract/runtime/validation/query surfaces/tooltips
**Deps**: tickets/README.md, docs/fitl-event-authoring-cookbook.md, archive/specs/45-fitl-section3-rules-gaps.md, archive/specs/60-engine-architecture-improvement.md

## Problem

Scoped variable surfaces currently require literal variable names. That blocks clean generic authoring whenever the variable to read or write is selected earlier in the effect sequence.

Concrete symptoms:

- Card/event authors must explode a simple "choose tracks, then modify each chosen track" rule into one conditional branch per concrete variable.
- Shared macros cannot cleanly parameterize resource-track names.
- Archived FITL analysis already identified this gap when trying to drive resource-capped selection from a passed-in variable name.

This is not just an event-authoring annoyance. It is a missing engine abstraction: selectors, players, zones, and bindings can already be dynamic, but scoped variable identifiers cannot.

## Assumption Reassessment (2026-03-13)

1. `packages/engine/src/kernel/scoped-var-contract.ts`, `packages/engine/src/kernel/scoped-var-runtime-access.ts`, `packages/engine/src/kernel/resolve-ref.ts`, and `packages/engine/src/kernel/eval-query.ts` currently treat scoped variable names as resolved literal strings at runtime.
2. `packages/engine/src/kernel/types-ast.ts` hardcodes literal-string `var` fields across `ref: gvar/pvar/zoneVar`, `addVar`, `setVar`, `transferVar`, and `intsInVarRange`.
3. Static validation is already broader than the original ticket implied. Literal-name checks live in shared helpers such as `packages/engine/src/kernel/validate-behavior-shared.ts` and `packages/engine/src/kernel/validate-queries.ts`, not only in effect-local validators.
4. Compile-time macro substitution already supports parameterized `var` payloads before AST validation. For example, `packages/engine/test/integration/effect-macro-compile.test.ts` covers `{ setVar: { var: { param: 'varName' } } }` expanding to a literal name. The missing capability is runtime symbolic indirection from bindings or grant context after compilation, not macro-time templating.
5. `archive/specs/45-fitl-section3-rules-gaps.md` still motivates the feature, but the corrected scope is broader: add one generic runtime variable-name expression contract across all scoped-var read/write/query surfaces, not one-off support in `addVar` only.

## Architecture Check

1. The comprehensive solution is to promote variable names to a small dedicated expression type shared across all scoped-var APIs. That is cleaner than sprinkling ad hoc "dynamic var" support into individual effects.
2. This preserves the boundary: `GameSpecDoc` supplies which track/resource to target, while `GameDef`/kernel remain agnostic and merely resolve symbolic variable identifiers against declared variable definitions.
3. No backwards-compatibility shims are needed. Literal names remain valid values of the new contract; the engine simply gains first-class symbolic indirection.
4. The cleanest implementation is to mirror the existing narrow symbolic-key pattern already used by `FreeOperationSequenceKeyExpr`: a small dedicated union for scoped variable names plus shared schema, resolver, validator, and humanizer helpers. That is a better long-term fit than treating variable names as arbitrary `ValueExpr`.

## What to Change

### 1. Introduce a shared `ScopedVarNameExpr`

Add a dedicated type used anywhere a scoped variable name is referenced:

```ts
type ScopedVarNameExpr =
  | string
  | { ref: 'binding'; name: string; displayName?: string }
  | { ref: 'grantContext'; key: string };
```

Deliberately do not allow arbitrary `ValueExpr` concatenation or numeric expressions for variable names. Variable identifiers are symbolic, so the type should stay narrow and statically legible.

### 2. Apply the new contract uniformly across read/write/query surfaces

Update all scoped-var entry points to accept `ScopedVarNameExpr` instead of literal `string`:

- `ref: gvar`
- `ref: pvar`
- `ref: zoneVar`
- `addVar`
- `setVar`
- `transferVar.from.var`
- `transferVar.to.var`
- `intsInVarRange.var`

The goal is one coherent authoring rule: if a surface names a declared variable, it uses the same variable-name expression contract everywhere.

### 3. Centralize dynamic var-name resolution and validation

Add a shared resolver in the scoped-var runtime path:

- evaluate the `ScopedVarNameExpr`
- require a string result
- validate the resolved name against the declared variables for the requested scope
- preserve existing int/boolean restrictions for `addVar` and `transferVar`

Validation policy:

- literal var names continue to be validated statically
- dynamic var names receive structural validation statically and declared-name validation at runtime
- runtime errors for unknown dynamic names must be deterministic and descriptive
- query-time var-name resolution for `intsInVarRange` should follow the same contract so reads, writes, and range queries do not diverge architecturally

### 4. Update compiler, schemas, diagnostics, and tooltip layers

Because scoped-var names surface in many user-facing paths, update:

- AST schemas
- compile/lowering code
- effect/query validators
- shared reference/query validation helpers
- ref/query runtime evaluators
- display/humanization code
- tooltip normalization where variable names are read from AST payloads

The implementation should remove any assumption that `effect.addVar.var` or `ref.gvar.var` is always a literal string.

### 5. Document the new authoring pattern

Extend the cookbook with canonical examples such as:

```yaml
- chooseN:
    bind: $tracks
    options:
      query: enums
      values: [aid, patronage, arvnResources]
- forEach:
    bind: $track
    over:
      query: binding
      name: $tracks
    effects:
      - addVar:
          scope: global
          var:
            ref: binding
            name: $track
          delta: 2
```

Also include a macro-style example for resource-capped selection using a passed-in variable name.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/scoped-var-contract.ts` (modify)
- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/src/kernel/effects-var.ts` (modify)
- `packages/engine/src/kernel/eval-value.ts` and/or scoped-var read helpers (modify as needed)
- `packages/engine/src/kernel/resolve-ref.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/validate-effects.ts` (modify)
- `packages/engine/src/kernel/validate-conditions.ts` (modify if scoped refs are checked there)
- `packages/engine/src/kernel/validate-behavior-shared.ts` (modify)
- `packages/engine/src/kernel/validate-queries.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/tooltip-*` and display files that assume literal `var` fields (modify)
- `packages/engine/src/cnl/compile-effects-var.ts` (modify)
- `packages/engine/src/cnl/compile-conditions.ts` (modify if scoped references are lowered there)
- `packages/engine/test/unit/` (modify/add scoped-var, validator, tooltip, and effect tests)
- `packages/engine/test/integration/` (modify/add dynamic var-name authoring tests)
- `docs/fitl-event-authoring-cookbook.md` (modify)

## Out of Scope

- Arbitrary string-building expressions for variable identifiers.
- New game-specific resource helpers in kernel code.
- Visual-config changes.
- Re-authoring every existing card/macro in the same ticket.

## Acceptance Criteria

### Tests That Must Pass

1. `addVar` can target a global variable named by a binding and updates the resolved declared variable.
2. `setVar` can target a per-player or zone variable named by a binding and preserves existing scope rules.
3. `transferVar` can use dynamic variable names on source and destination endpoints.
4. `ref: gvar/pvar/zoneVar` can read from a dynamically selected variable name.
5. `intsInVarRange` can drive a range from a dynamically selected variable name.
6. An unknown dynamic variable name produces a deterministic validation/runtime failure that identifies the resolved name and scope.
7. Existing macro-time parameterization that lowers to literal names continues to work unchanged.
8. Literal-name existing authoring continues to work without special-case compatibility code.
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Variable names remain declared-engine data, never inferred from game-specific hardcoded logic.
2. All scoped-var surfaces share one variable-name expression contract.
3. Static validation remains strict for literal names and structurally strict for dynamic names.
4. The runtime never writes to or reads from undeclared variables silently.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-var.test.ts` — dynamic-name `addVar` and `setVar` coverage, including int/boolean restrictions.
2. `packages/engine/test/unit/resolve-ref.test.ts` — dynamic `gvar` / `pvar` / `zoneVar` resolution.
3. `packages/engine/test/unit/validate-gamedef.test.ts` and related validator tests — literal vs dynamic validation policy.
4. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — shared resolver behavior and unknown-name failures.
5. `packages/engine/test/unit/eval-query.test.ts` — dynamic `intsInVarRange` resolution and unknown-name behavior.
6. `packages/engine/test/unit/tooltip-*` tests — humanization for dynamic var-name expressions.
7. `packages/engine/test/integration/effects-complex.test.ts` or a new targeted integration file — a choose-track then mutate-track scenario authored entirely through the DSL.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/effects-var.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint && pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-13
- Actually changed:
  - Introduced a shared `ScopedVarNameExpr` contract across scoped-var reads, writes, and `intsInVarRange`.
  - Added shared runtime resolution for binding and grant-context-backed variable names.
  - Updated CNL lowering, AST schemas, static validation, ref/query runtime evaluation, display, tooltip, and schema artifacts to treat scoped var names as expressions instead of literals.
  - Added unit and integration coverage for lowering, validation, runtime refs/effects, query evaluation, and DSL-level execution.
  - Documented the authoring pattern in `docs/fitl-event-authoring-cookbook.md`.
- Deviations from original plan:
  - The implementation explicitly preserved existing compile-time macro substitution for `var` payloads and clarified that the missing feature was runtime symbolic indirection.
  - Static validation was routed through existing shared validation helpers instead of effect-local one-offs.
- Verification results:
  - `node --test packages/engine/dist/test/unit/compile-effects.test.js packages/engine/dist/test/unit/compile-conditions.test.js packages/engine/dist/test/unit/effects-var.test.js packages/engine/dist/test/unit/resolve-ref.test.js packages/engine/dist/test/unit/eval-query.test.js packages/engine/dist/test/unit/validate-gamedef.test.js`
  - `pnpm -F @ludoforge/engine run schema:artifacts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
