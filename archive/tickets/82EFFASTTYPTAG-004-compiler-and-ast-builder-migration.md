# 82EFFASTTYPTAG-004: Compiler and AST Builder Migration to makeEffect

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `ast-builders.ts` + `compiler-core.ts`
**Deps**: 82EFFASTTYPTAG-001, 82EFFASTTYPTAG-002 (needs types + `makeEffect`)

## Problem

All effect construction sites in the compiler (`compile-effects-*.ts`) and
kernel (`ast-builders.ts`) produce raw `{ kind: payload }` objects without
`_k`. With `EffectAST` now requiring `_k`, these must migrate to
`makeEffect()`.

## Assumption Reassessment (2026-03-25)

1. `ast-builders.ts` has `buildEffect()` (lines 10-12) and 34 convenience
   builders (lines 18-51). All construct `{ [kind]: payload }` without `_k`.
   Confirmed.
2. Compiler effect lowering files (8 files under `packages/engine/src/cnl/`):
   - `compile-effects-core.ts` — main dispatch
   - `compile-effects-var.ts` — setVar, addVar, setActivePlayer, transferVar
   - `compile-effects-token.ts` — moveToken, moveAll, draw, reveal, etc.
   - `compile-effects-flow.ts` — if, forEach, reduce, let, markers, phases
   - `compile-effects-choice.ts` — chooseOne, chooseN, distributeTokens
   - `compile-effects-free-op.ts` — grantFreeOperation
   - `compile-effects-binding-scope.ts` — binding scope management
   - `compile-effects-utils.ts` — utility functions
   - `compile-effects-types.ts` — type definitions
   Confirmed.
3. Each lowering function returns an `EffectAST` literal like
   `{ setVar: { var: ..., value: ... } }`. These are the sites to migrate.

## Architecture Check

1. `makeEffect('setVar', { var, value })` replaces
   `{ setVar: { var, value } }` — mechanical transformation with no logic
   change.
2. `ast-builders.ts` convenience builders (e.g., `setVar(payload)`) should
   call `makeEffect()` internally, preserving the same public API.
3. No backwards-compat shims. Direct `{ kind: payload }` construction
   without `_k` will be a type error after ticket 001.

## What to Change

### 1. Update `ast-builders.ts`

- Change `buildEffect()` to call `makeEffect()` internally, so it returns
  `WithKindTag<K>` instead of `EffectKindMap[K]`.
- Update the `EffectBuilder<K>` type alias to return `WithKindTag<K>`.
- All 34 convenience builders automatically inherit `_k` via `buildEffect()`.
- No signature changes needed for callers — the returned type is a supertype
  intersection that includes the original shape plus `_k`.

**Key insight**: Since all `compile-effects-*.ts` files use these convenience
builders (not raw literals), fixing `buildEffect()` propagates `_k` to all
compiler call sites automatically. No changes needed in the compile-effects
files themselves.

### 2. Migrate `compiler-core.ts`

`compileScenarioDeckSetupEffects()` (around line 1418) constructs 8 raw
`EffectAST` literals pushed into an `EffectAST[]`:
- `createToken` ×2 (event cards, coup cards)
- `shuffle` ×3 (event pools, coups pool, pile work zone)
- `draw` ×2 (events per pile, coups per pile)
- `moveAll` ×1 (pile work → draw zone)

Replace each with the corresponding `ast-builders.ts` convenience builder
(which now returns `WithKindTag<K>` via `makeEffect()`).

### 3. No changes needed in compile-effects-*.ts

All effect lowering functions already use `ast-builders.ts` convenience
builders. Once `buildEffect()` is updated (step 1), these files produce
correctly tagged `EffectAST` nodes without any code changes.

### 4. No changes needed in compile-effects-utils.ts or compile-effects-types.ts

These files do not construct EffectAST literals.

## Files to Touch

- `packages/engine/src/kernel/ast-builders.ts` (modify — `buildEffect()` calls `makeEffect()`)
- `packages/engine/src/cnl/compiler-core.ts` (modify — 8 raw EffectAST literals → builders)

**No changes needed** (use builders already):
- `compile-effects-var.ts`, `compile-effects-token.ts`, `compile-effects-flow.ts`,
  `compile-effects-choice.ts`, `compile-effects-free-op.ts`, `compile-effects-core.ts`,
  `compile-effects-utils.ts`, `compile-effects-types.ts`

## Out of Scope

- Type definitions in `types-ast.ts` — ticket 001
- `makeEffect()` and `tagEffectAsts()` creation — ticket 002
- Dispatch/registry changes — ticket 003
- Schema changes — ticket 005
- Test fixture migration — ticket 006
- CI tests — ticket 007
- Changing compiler logic or behavior — only the construction syntax changes
- Changes to `compile-conditions.ts` or `compile-value-exprs.ts`
- Changes to runtime effect handler implementations

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` compiles without type errors (this is
   the critical gate — all construction sites must include `_k`).
2. `pnpm -F @ludoforge/engine test` — all existing compiler and integration
   tests pass (compiled GameDefs now include `_k` fields).
3. E2E: `pnpm -F @ludoforge/engine test:e2e` — full pipeline tests pass
   (FITL and Texas Hold'em compile → run → verify).
4. Existing suite: `pnpm turbo test`

### Invariants

1. Every `EffectAST` constructed by the compiler includes a correct `_k` tag.
2. No logic changes — only construction syntax changes.
3. `ast-builders.ts` convenience builders preserve their existing public API
   signatures (callers don't need to change).
4. Compiled GameDef JSON now includes `_k` fields on all effect nodes.

## Test Plan

### New/Modified Tests

1. No new test files. Existing compiler tests validate that the compiled
   output is behaviorally correct. Golden tests may need updating if they
   compare exact JSON structure (see ticket 006).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm turbo typecheck`

## Outcome

**Completion date**: 2026-03-25

**What changed**:
- `ast-builders.ts`: `buildEffect()` now delegates to `makeEffect()`, returning `WithKindTag<K>` with `_k` tags. All 34 convenience builders automatically produce tagged effects.
- `compiler-core.ts`: 9 raw EffectAST literals replaced with builder calls (`createToken`, `shuffle`, `draw`, `moveAll`).
- `compile-data-assets.ts`: 6 raw literals replaced with builders (`setVar`, `setMarker`, `setGlobalMarker`, `createToken`).
- `condition-annotator.ts`: 1 raw `{ if: {...} }` literal replaced with `ifEffect()`.
- `effect-compiler-codegen.ts`: 1 raw `{ gotoPhaseExact: {...} }` replaced with builder.
- `effects-control.ts`: 1 raw `{ moveToken: {...} }` replaced with builder.
- `effects-token.ts`: 1 raw `{ moveToken: {...} }` replaced with builder (moveTokenAdjacent delegation).
- `event-execution.ts`: 4 raw literals replaced with builders (`chooseOne`, `chooseN`, `forEach`).
- `tooltip-normalizer.ts`: Type cast updated for `_k` compatibility; `getEffectKey()`/`tryLeafMacroOverride()` updated to skip `_k` when finding effect kind key.
- `effect-dispatch.ts`: Dispatch table lazy-initialized to avoid circular import at module load time.
- `schemas-ast.ts`: `_k: IntegerSchema` added to all 34 effect Zod schemas. JSON Schema artifacts regenerated.
- Created `test/helpers/effect-tag-helper.ts` providing `eff()`/`effs()` for test fixture construction.
- ~97 test files migrated to use `eff()` or `tagEffectAsts()` for EffectAST construction.

**Deviations from plan**:
- Ticket 006 (test fixture migration) was merged into this ticket per Foundation 9 (no backwards compatibility — fix all breaks in the same change). The original ticket scoped only compiler/builder files; the actual scope expanded to all source + test files constructing EffectAST.
- Schema changes (originally ticket 005 scope) were also included — `_k` added to Zod schemas and JSON Schema artifacts regenerated.
- `compile-effects-*.ts` files needed NO changes (they already used ast-builders convenience functions).
- Additional source files not listed in the original ticket required migration: `compile-data-assets.ts`, `condition-annotator.ts`, `effect-compiler-codegen.ts`, `effects-control.ts`, `effects-token.ts`, `event-execution.ts`, `tooltip-normalizer.ts`, `effect-dispatch.ts`.

**Verification**:
- `pnpm -F @ludoforge/engine build`: PASS (0 type errors)
- `pnpm -F @ludoforge/engine test`: PASS (4773/4773)
- `pnpm -F @ludoforge/engine test:e2e`: PASS (36/36)
- `pnpm turbo typecheck`: PASS
