# ENGINEARCH-201: Enforce Canonical `$` Binding Identifiers Across All Binding Surfaces

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — AST schemas, GameDef behavior validation, compiler diagnostics/tests, production spec bind-field migration
**Deps**: packages/engine/src/kernel/schemas-ast.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/cnl/compile-conditions.ts, packages/engine/src/cnl/compile-effects.ts, data/games/fire-in-the-lake/20-macros.md, data/games/fire-in-the-lake/30-rules-actions.md, data/games/fire-in-the-lake/41-content-event-decks.md

## Problem

Binding identifiers are currently only partially canonicalized. `removeByPriority` bind fields are now strict `$name`, but many other binding-introducing surfaces still allow non-canonical strings. This creates avoidable ambiguity and inconsistent authoring semantics in GameSpecDoc.

## Assumption Reassessment (2026-03-03)

1. Current code enforces canonical `$name` for `nextInOrderByCondition.bind` and now `removeByPriority` bind/count/remaining fields.
2. Current AST schema still allows non-canonical strings for other bind fields (`forEach`, `reduce`, `let`, `bindValue`, `chooseOne`, `chooseN`, `evaluateSubset`, `rollRandom`), creating inconsistent contract behavior.
3. Mismatch: architecture goal is strict, predictable authoring with no aliasing/back-compat shims; scope is corrected to enforce canonical binding identifiers uniformly across all binding-introducing fields.

## Architecture Check

1. A single canonical binding contract is cleaner and more robust than per-effect exceptions because it removes implicit conventions and parsing ambiguity.
2. This preserves agnostic engine boundaries: the rule is generic syntax/contract enforcement in compiler/runtime, not game-specific behavior.
3. No backwards-compatibility aliases/shims: non-canonical bind identifiers become hard errors.

## What to Change

### 1. Unify schema contract for all binding-introducing fields

Apply canonical binding schema (`$name`) to all relevant AST fields, including at minimum:
- `forEach.bind`, `forEach.countBind`
- `reduce.itemBind`, `reduce.accBind`, `reduce.resultBind`
- `let.bind`, `bindValue.bind`
- `chooseOne.bind`, `chooseN.bind`
- `evaluateSubset.bind`
- `rollRandom.bind`
- any other remaining effect/query bind fields that introduce binding names.

### 2. Unify behavior validation diagnostics

Add/extend deterministic validation diagnostics for all canonical binding fields so violations are explicit and path-precise.

### 3. Migrate production GameSpecDoc content

Migrate non-canonical bind declarations in production FITL GameSpecDoc markdown to canonical `$...` where affected by new strictness.

### 4. Ensure compiler diagnostics are consistent

Where CNL compile-time diagnostics validate bind fields, ensure messages/suggestions use the same canonical rule language.

## Files to Touch

- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/cnl/compile-conditions.ts` (modify, if required for consistency)
- `packages/engine/src/cnl/compile-effects.ts` (modify, if required for consistency)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify/add)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify/add)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify/add if diagnostics change)
- `data/games/fire-in-the-lake/20-macros.md` (modify as needed)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify as needed)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify as needed)
- `packages/engine/schemas/GameDef.schema.json` (regenerate)
- `packages/engine/schemas/Trace.schema.json` (regenerate if impacted)
- `packages/engine/schemas/EvalReport.schema.json` (regenerate if impacted)

## Out of Scope

- Any game-specific runtime branching.
- Visual configuration or runner presentation changes.
- Introducing any compatibility alias behavior for legacy non-canonical binds.

## Acceptance Criteria

### Tests That Must Pass

1. New/updated unit tests for canonical binding enforcement across all binding-introducing surfaces.
2. FITL production spec compiles and relevant integration tests pass after bind-field migration.
3. Existing suite: `pnpm turbo test`

### Invariants

1. All binding-introducing fields in AST/compiler contracts use canonical `$name` identifiers.
2. GameDef and runtime remain game-agnostic; changes are contract-level only.
3. No compatibility aliasing for legacy non-canonical bind strings.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — schema-level rejection for non-canonical bind values on all targeted fields.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — behavior validator emits deterministic diagnostics for all targeted fields.
3. `packages/engine/test/integration/fitl-production-data-compilation.test.ts` — production data migration remains valid.

### Commands

1. `pnpm turbo build`
2. `node --test "packages/engine/dist/test/unit/schemas-ast.test.js"`
3. `node --test "packages/engine/dist/test/unit/validate-gamedef.test.js"`
4. `node --test "packages/engine/dist/test/integration/fitl-production-data-compilation.test.js"`
5. `pnpm turbo test`
6. `pnpm turbo lint`
