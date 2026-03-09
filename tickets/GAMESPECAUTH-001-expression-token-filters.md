# GAMESPECAUTH-001: Support expression-shaped token filters in authored GameSpecDoc data

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL compiler lowering, token-filter normalization, unit/integration coverage
**Deps**: tickets/README.md, tickets/_TEMPLATE.md, data/games/fire-in-the-lake/41-content-event-decks.md

## Problem

Authored `GameSpecDoc` data currently accepts only the narrow `{ prop, op, value }` token-filter shape in many selector sites. When an author writes the more direct expression form that matches the rest of the AST surface, the compiler rejects it and forces a more awkward rewrite. This makes authored game data less uniform, less composable, and more error-prone than the surrounding GameSpecDoc language.

## Assumption Reassessment (2026-03-09)

1. Current FITL production data compiles only when token filters use the lowered property-filter form in selector/filter contexts.
2. Attempting to author card 49 using expression-shaped token filters produced compiler errors of type `CNL_COMPILER_MISSING_CAPABILITY` during lowering.
3. The limitation is compiler-surface specific, not a Fire in the Lake rule requirement; the corrected scope is to broaden generic authored-data lowering rather than preserve the current workaround shape in game data.

## Architecture Check

1. Supporting expression-shaped token filters is cleaner than preserving a special mini-language beside the main condition AST because it reduces DSL surface area and removes needless author translation work.
2. This change stays game-agnostic: it improves the generic GameSpecDoc compiler/lowering pipeline and does not introduce any FITL-specific logic into `GameDef`, runtime, or simulation.
3. No backwards-compatibility shim is needed. The engine should simply accept the broader authored form and lower it canonically.

## What to Change

### 1. Broaden token-filter lowering

Allow selector/filter sites that currently require `{ prop, op, value }` entries to also accept equivalent expression-shaped authored nodes such as equality/inequality over `tokenProp`, while lowering them into the existing generic kernel filter representation.

### 2. Normalize to one internal form

After parsing, canonicalize supported authored filter shapes into one compiler-internal representation so downstream compiler and runtime logic remain simple.

### 3. Add diagnostics for truly unsupported forms

If an authored expression still cannot be lowered into token-filter semantics, emit a precise diagnostic explaining which sub-shapes are supported and why the expression is invalid.

## Files to Touch

- `packages/engine/src/cnl/*` (modify)
- `packages/engine/test/unit/*token-filter*.test.ts` (modify)
- `packages/engine/test/integration/*production*.test.ts` (modify if needed)

## Out of Scope

- Adding arbitrary full-expression evaluation to every query surface where token filters are not semantically appropriate
- FITL card rewrites beyond any minimal fixture or regression coverage needed to prove the compiler change
- Visual config changes

## Acceptance Criteria

### Tests That Must Pass

1. An authored GameSpecDoc selector using expression-shaped token filters over `tokenProp` compiles successfully.
2. Existing authored `{ prop, op, value }` token filters continue to compile and execute identically.
3. Existing suite: `pnpm turbo test`

### Invariants

1. `GameDef` and runtime token-query semantics remain game-agnostic.
2. Authored-data ergonomics improve without introducing FITL-specific branches or alias syntax.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/token-filter.test.ts` — verify new authored forms lower to canonical token filters.
2. `packages/engine/test/unit/token-filter-runtime-boundary.test.ts` — verify invalid expression shapes still fail with targeted diagnostics.
3. `packages/engine/test/integration/fitl-events-russian-arms.test.ts` — optionally tighten assertions once card 49 is rewritten to the new authored form.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/token-filter.test.js`
3. `node --test packages/engine/dist/test/unit/token-filter-runtime-boundary.test.js`
4. `pnpm turbo test`
