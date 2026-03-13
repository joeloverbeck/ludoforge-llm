# FITLEVEAUTHAR-002: Add reusable replacement/routing macros to FITL macros file

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — FITL game data only
**Deps**: FITLEVEAUTHAR-001 (cookbook documents the patterns these macros encapsulate)

## Problem

Complex event cards like CIDG (#81) open-code verbose replacement and routing sequences (remove piece → check Available pool → place replacement → set posture → route removed piece to correct destination). These ~20-30 line effect sequences recur across multiple cards. Extracting them into macros in `20-macros.md` reduces duplication, prevents copy-paste errors, and makes future card authoring faster.

## Assumption Reassessment (2026-03-13)

1. `data/games/fire-in-the-lake/20-macros.md` has 74 existing macros and ~3,827 lines — confirmed.
2. No existing macros cover the "replace piece and route removed piece" pattern as a single reusable verb — confirmed by scanning macro names.
3. Multiple event cards across `41-events/` files use similar open-coded replacement/routing sequences — confirmed (CIDG, plus cards involving guerrilla replacement, troop replacement, base swaps).
4. Macros must stay FITL-local per Agnostic Engine Rule — confirmed.

## Architecture Check

1. Macros live in FITL game data (`data/games/fire-in-the-lake/20-macros.md`), not in engine code — correct boundary.
2. The compiler's existing macro expansion handles parameterized macros — no compiler changes needed.
3. No backwards-compatibility aliases — new macros only.

## What to Change

### 1. Add replacement/routing macros to `data/games/fire-in-the-lake/20-macros.md`

Add macros for these recurring patterns (exact names TBD during implementation — use cookbook guidance from FITLEVEAUTHAR-001):

- **`fitl-remove-piece-to-destination`** — Remove a bound piece token and route it to the rule-correct destination (Available / Casualties / Out of Play) based on faction and piece type.
- **`fitl-replace-piece-from-available`** — Remove a piece and place a replacement from the appropriate Available pool, handling depletion gracefully (no-op if pool empty).
- **`fitl-replace-and-set-posture`** — Replace a piece and set the replacement's posture (e.g., underground guerrilla, active troop).
- **`fitl-select-spaces-by-terrain-and-occupant`** — Select legal spaces filtered by terrain type/country property AND occupant predicates (e.g., "Highland provinces with VC Guerrillas").
- **`fitl-route-removed-by-faction`** — Faction-aware routing: US → Casualties, ARVN → ARVN Available, VC/NVA → based on piece type and game rules.

Each macro must:
- Accept parameterized inputs (bound piece ref, replacement type, destination zone, etc.).
- Be documented with a YAML comment block showing usage.
- Be compilable — `compileProductionSpec()` must succeed after adding them.

### 2. Verify compilation

After adding macros, the full FITL spec must still compile cleanly via `compileProductionSpec()`.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify)

## Out of Scope

- Modifying any engine source code (compiler, kernel, agents, sim).
- Changing existing event card files to use the new macros — that is FITLEVEAUTHAR-004 (CIDG rework) and future card-by-card tickets.
- Adding macros to engine-level or cross-game locations.
- Modifying test files.

## Acceptance Criteria

### Tests That Must Pass

1. `compileProductionSpec()` succeeds with no errors (existing helper in `packages/engine/test/helpers/production-spec-helpers.ts`).
2. Existing suite: `pnpm -F @ludoforge/engine test` — must remain green (no regressions).
3. Existing suite: `pnpm -F @ludoforge/engine test:e2e` — must remain green.

### Invariants

1. No engine source files are modified — only `data/games/fire-in-the-lake/20-macros.md`.
2. All new macros are syntactically valid YAML and compile without diagnostics.
3. Existing event cards continue to compile and execute identically (no behavioral change).
4. New macros follow existing naming conventions in `20-macros.md` (kebab-case, `fitl-` prefix for FITL-specific helpers).

## Test Plan

### New/Modified Tests

1. No new test files — compilation is validated by existing production spec helpers.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test` (confirms compilation + all event card tests still pass)
3. `pnpm -F @ludoforge/engine test:e2e`
