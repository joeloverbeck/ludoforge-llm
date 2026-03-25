# 82EFFASTTYPTAG-006: Test Fixture Migration to Include _k Tags

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — test files in `packages/engine/test/`
**Deps**: 82EFFASTTYPTAG-001, 82EFFASTTYPTAG-002 (needs types + `makeEffect` / `tagEffectAsts`)

## Problem

Many test files construct `EffectAST` literals directly as
`{ setVar: { ... } }` without `_k`. After ticket 001 makes `_k` required,
these tests will have type errors. They must be migrated to use either
`makeEffect()` (preferred for new/small fixtures) or `tagEffectAsts()`
(preferred for large existing fixture objects).

## Assumption Reassessment (2026-03-25)

1. Test files with direct EffectAST literals include (at minimum):
   - `test/unit/effects-var.test.ts`
   - `test/unit/effects-control-flow.test.ts`
   - `test/unit/effects-choice.test.ts`
   - `test/unit/effects.golden.test.ts`
   - `test/unit/property/effects.property.test.ts`
   - Various FITL and Texas Hold'em integration/e2e test files
   Confirmed via grep.
2. Some test helper files may also construct effects directly — e.g.,
   `test/helpers/` utilities. Must check.
3. Golden test fixtures in `test/fixtures/` may contain serialized EffectAST
   JSON that needs `_k` fields added.

## Architecture Check

1. Two migration strategies available:
   - **`makeEffect()`**: Use for small, inline effect construction. Preferred
     for new code.
   - **`tagEffectAsts()`**: Use for large fixture objects or deeply nested
     effect trees. Wrap the existing literal with `tagEffectAsts()`.
2. No backwards-compat shims. All test fixtures must include `_k`.
3. Golden test expected outputs must be updated to include `_k` fields.

## What to Change

### 1. Unit test files

For each test file that constructs EffectAST literals:
- Replace `{ kind: payload }` with `makeEffect('kind', payload)`, OR
- Wrap large fixture objects with `tagEffectAsts()`.

Priority order (by likely number of literals):
1. `test/unit/effects-var.test.ts`
2. `test/unit/effects-control-flow.test.ts`
3. `test/unit/effects-choice.test.ts`
4. `test/unit/effects.golden.test.ts`
5. `test/unit/property/effects.property.test.ts`
6. Any other `test/unit/effects-*.test.ts` files

### 2. Test helper files

Check `test/helpers/` for effect construction utilities and update them.

### 3. Integration and E2E test files

Search all `test/integration/` and `test/e2e/` files for EffectAST literals.
These may use compiled GameDefs (which will already have `_k` from ticket
004) but some may construct effects directly for test setup.

### 4. Golden test fixtures

Update JSON fixtures in `test/fixtures/` that contain serialized EffectAST
objects to include `_k` fields. Use `tagEffectAsts()` on fixture loading
if the fixtures are loaded as JS objects, or update the JSON files directly.

## Files to Touch

- `packages/engine/test/unit/effects-var.test.ts` (modify)
- `packages/engine/test/unit/effects-control-flow.test.ts` (modify)
- `packages/engine/test/unit/effects-choice.test.ts` (modify)
- `packages/engine/test/unit/effects.golden.test.ts` (modify)
- `packages/engine/test/unit/property/effects.property.test.ts` (modify)
- `packages/engine/test/helpers/*.ts` (modify, if needed)
- `packages/engine/test/fixtures/*.json` (modify, if needed)
- Any other test files found via grep for direct EffectAST construction

## Out of Scope

- Type definitions in `types-ast.ts` — ticket 001
- `makeEffect()` and `tagEffectAsts()` creation — ticket 002
- Dispatch/registry changes — ticket 003
- Compiler migration — ticket 004
- Schema changes — ticket 005
- CI exhaustiveness/contiguity tests — ticket 007
- Changing test logic or assertions — only the effect construction syntax
- Adding new test cases (those are in ticket 007)
- Changes to production source files

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` — no type errors in test files.
2. `pnpm -F @ludoforge/engine test` — all existing tests pass with `_k`
   included in effect fixtures.
3. `pnpm -F @ludoforge/engine test:e2e` — all E2E tests pass.
4. `pnpm turbo test` — full suite passes.

### Invariants

1. No test logic changes — only construction syntax.
2. All EffectAST literals in test code include correct `_k` tags.
3. Test behavior remains identical — same assertions, same outcomes.
4. Golden test expected outputs match compiler output (which now includes
   `_k`).

## Test Plan

### New/Modified Tests

1. No new test files. All changes are to existing test fixtures.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm turbo test`

### Migration Verification

To find remaining un-migrated literals, run:
```bash
grep -rn '{ setVar:\|{ addVar:\|{ if:\|{ let:\|{ forEach:' \
  packages/engine/test/ --include='*.ts' | grep -v '_k'
```
This should return zero results after migration is complete.
