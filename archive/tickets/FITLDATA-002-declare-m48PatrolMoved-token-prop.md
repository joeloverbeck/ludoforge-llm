# FITLDATA-002: Declare `m48PatrolMoved` token prop in piece catalog

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — data + tests
**Deps**: None

## Problem

The M-48 Patton shaded capability macro (`cap-patrol-m48-shaded-moved-cube-penalty`) uses token prop `m48PatrolMoved` in both:

1. `setTokenProp` writes (`true` during Patrol movement, then `false` during cleanup)
2. token filter predicates (`{ prop: m48PatrolMoved, eq: true }`)

`m48PatrolMoved` is still not declared in the FITL production piece catalog (`40-content-data-assets.md`). With the current engine behavior, this is now an immediate correctness and robustness gap:

1. **Runtime strictness already applies**: `applySetTokenProp` validates that the property exists on the token type and throws if missing.
2. **Undeclared prop remains typo-fragile in filters**: filter props are still free-form by name, so misspellings can silently match nothing.
3. **Discoverability gap**: tooling derived from declared runtime props cannot expose `m48PatrolMoved`.

## Assumption Reassessment (2026-02-28)

1. `m48PatrolMoved` appears in FITL macro/rule YAML (`20-macros.md`, `30-rules-actions.md`) in both filter and `setTokenProp` usage — confirmed.
2. `40-content-data-assets.md` contains selected production piece catalog (`fitl-piece-catalog-production`) and currently does not declare `m48PatrolMoved` on relevant cube types — confirmed.
3. Kernel runtime behavior has changed from the original ticket assumption: `applySetTokenProp` now validates prop existence against `tokenTypes[*].props` and throws on unknown props — confirmed in `packages/engine/src/kernel/effects-token.ts`.
4. Compiler behavior has evolved from the original ticket assumption: token filters now validate canonical **string** literals against `tokenTraitVocabulary` when available. This still does not enforce prop-name declaration for arbitrary filter props — confirmed in `packages/engine/src/cnl/compile-conditions.ts`.
5. `tokenTraitVocabulary` currently tracks canonical **string** trait values; boolean runtime props are still useful for runtime schema/validation and discoverability even though they are not enumerated as vocabulary literals — confirmed in `packages/engine/src/cnl/token-trait-vocabulary.ts`.

## Architecture Check

1. **Most robust location**: Piece runtime props in `pieceCatalog` are the right source of truth. Declaring `m48PatrolMoved` there keeps game-specific behavior in game data, not engine code.
2. **Agnostic engine preserved**: No engine branching or game-specific exceptions are needed.
3. **Forward-compatible with stricter compilation**: Explicit declaration aligns runtime and compiler surfaces and reduces hidden coupling.

## What to Change

### 1. Declare `m48PatrolMoved` in FITL piece catalog

In `data/games/fire-in-the-lake/40-content-data-assets.md`, add `m48PatrolMoved: false` to runtime props for piece types that are tagged as moved Patrol cubes and later filtered by that prop:

1. `us-troops`
2. `arvn-troops`
3. `arvn-police`

### 2. Strengthen regression coverage

Add or update integration coverage so this ticket is protected by an explicit invariant assertion that production compilation exposes `m48PatrolMoved` as a declared boolean token prop on the relevant token types.

## Files to Touch

- `data/games/fire-in-the-lake/40-content-data-assets.md` (modify) — declare `m48PatrolMoved` runtime prop
- `packages/engine/test/integration/fitl-capabilities-train-patrol-rally.test.ts` (modify) — add invariant assertion for declared prop on relevant token types

## Out of Scope

- Compiler-level strict enforcement that every token filter `prop` name must exist in the declared trait/property set (separate engine ticket)
- Broader audit of other FITL undeclared runtime props

## Acceptance Criteria

### Tests That Must Pass

1. FITL production spec compiles with no parser/compiler diagnostics.
2. Existing M48 capability integration behavior still passes.
3. New invariant test asserts `m48PatrolMoved` exists as boolean token prop on `us-troops`, `arvn-troops`, and `arvn-police` in compiled `GameDef`.
4. Relevant suite passes (targeted integration test + workspace test run required by repo policy).

### Invariants

1. No game-specific logic is introduced in engine/compiler code.
2. M48 moved-cube marking/cleanup remains data-driven via FITL YAML.
3. Declared runtime token props are the single source of truth for `setTokenProp` validity.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-capabilities-train-patrol-rally.test.ts`
   - Add assertion on compiled `GameDef.tokenTypes` for `m48PatrolMoved: 'boolean'` on `us-troops`, `arvn-troops`, and `arvn-police`.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/integration/fitl-capabilities-train-patrol-rally.test.js`
3. `pnpm turbo test`

## Outcome

- **Completion date**: 2026-02-28
- **What changed**:
  - Declared `m48PatrolMoved: false` in FITL production piece catalog runtime props for `us-troops`, `arvn-troops`, and `arvn-police`.
  - Added integration assertion coverage in `fitl-capabilities-train-patrol-rally.test.ts` to verify compiled `GameDef.tokenTypes` declares `m48PatrolMoved` as `boolean` on those piece types.
  - Reassessed and corrected ticket assumptions/scope before implementation to match current compiler/runtime behavior.
- **Deviations from original plan**:
  - Original ticket stated this was only future-proofing against possible strictness and required no new tests.
  - Actual current architecture already enforces strict `setTokenProp` prop existence at runtime, so this was an immediate correctness fix; explicit regression coverage was added.
- **Verification results**:
  - `pnpm turbo build`: passed
  - `node --test packages/engine/dist/test/integration/fitl-capabilities-train-patrol-rally.test.js`: passed
  - `pnpm turbo test`: passed (`@ludoforge/engine` 333/333, `@ludoforge/runner` 1363/1363)
  - `pnpm turbo lint`: passed
  - `pnpm run check:ticket-deps`: passed
