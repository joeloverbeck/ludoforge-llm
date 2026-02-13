# FITLOPEFULEFF-023: Typed Zone References in GameSpecDoc

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Medium (4-6 hours)
**Spec reference**: Spec 25a compiler/kernel primitives, Spec 26 data-driven operation design
**Depends on**: FITLOPEFULEFF-022

## Summary

Harden GameSpecDoc zone-reference architecture by making dynamic zone selectors explicit and typed at the CNL boundary, then migrate FITL Available-box routing away from implicit object-as-zone-selector behavior.

Goal: eliminate fragile implicit zone-selector lowering and remove `available-<faction>:none` full-string assembly by hand in FITL macros.

## Problem

Current CNL lowering accepts *any* object in zone selector positions (`from`, `to`, `zone`, `space`) as a dynamic value expression via fallback. This creates ambiguity:
- Hard to distinguish intentional dynamic zone refs from malformed selector objects
- Weak compiler diagnostics for shape mistakes in zone selector fields
- Makes source-level architecture less explicit than kernel AST (`ZoneRef`) capabilities

Additionally, FITL production data still uses string concat patterns for Available-box routing.

## Proposed Architecture

Use explicit dynamic zone references at the CNL boundary:
- Dynamic zone selectors must be wrapped as `{ zoneExpr: <ValueExpr> }` in zone-selector fields.
- Remove implicit "any record lowers as zone expression" fallback in zone-selector lowering.
- Keep kernel/compiler game-agnostic (no FITL-specific zone kinds).

Compiler behavior:
- String selectors still canonicalize via existing selector normalization.
- Explicit `{ zoneExpr: ... }` lowers to kernel `ZoneRef` dynamic branch.
- Invalid zone-selector objects produce deterministic, targeted diagnostics.

Requirements:
- Works for dynamic faction values and static literals
- Preserves existing zone ownership/visibility model
- Improves diagnostic determinism for malformed dynamic zone-selector inputs

## Files to Touch

- `src/cnl/compile-effects.ts` — explicit dynamic zone-selector parsing, remove implicit record fallback
- `src/kernel/validate-gamedef-behavior.ts` — ensure dynamic zone-ref validation handles explicit shape
- `data/games/fire-in-the-lake.md` — migrate Available-box routing to explicit `zoneExpr` dynamic refs
- tests in `test/unit/compile-effects.test.ts`, `test/unit/resolve-zone-ref.test.ts`, and relevant FITL integration tests

## Out of Scope

- Renaming FITL zone ids globally
- Introducing game-specific zone kinds into kernel logic
- Reworking non-zone value-expression lowering

## Acceptance Criteria

### Tests That Must Pass
1. Dynamic zone selectors compile only via explicit `{ zoneExpr: ... }` wrapper in zone-selector fields.
2. Legacy implicit object-as-zone-selector forms fail with deterministic compiler diagnostics.
3. FITL Available-box routing compiles/runs using explicit dynamic zone refs.
4. `resolveZoneRef` behavior for static and dynamic refs remains deterministic.

### Invariants
- Kernel and compiler remain game-agnostic
- No alias path where implicit object fallback remains required for correctness in zone-selector lowering
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)

## Outcome

**Completed**: 2026-02-13

### What was changed
- Enforced explicit dynamic zone references in compiler effect lowering:
  - Zone selector fields now accept either static string selectors or `{ zoneExpr: <ValueExpr> }`.
  - Removed implicit object-as-zone-selector fallback in `src/cnl/compile-effects.ts`.
  - Added deterministic compiler diagnostics for implicit object selectors.
- Migrated FITL production data (`data/games/fire-in-the-lake.md`) for effect-zone fields that used implicit dynamic selector objects:
  - Wrapped dynamic `concat` and `tokenZone` usages in explicit `zoneExpr` wrappers.
- Updated unit tests in `test/unit/compile-effects.test.ts`:
  - Dynamic selector cases now use explicit `zoneExpr`.
  - Added coverage that legacy implicit object selectors are rejected.

### Deviations from original plan
- Original ticket proposed a game-specific style example (`kind: available`) and new typed-kind model.
- Implemented architecture is fully game-agnostic and stricter at the compiler boundary using existing kernel `ZoneRef` dynamic branch (`zoneExpr`) rather than introducing game-specific kinds.
- The originally referenced fixture path (`test/fixtures/cnl/compiler/fitl-operations-coin.md`) was outdated and not used.

### Verification
- `npm run build` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed (143 tests, 0 failures).
- Additional targeted checks passed:
  - `dist/test/unit/compile-effects.test.js`
  - `dist/test/unit/resolve-zone-ref.test.js`
  - `dist/test/integration/fitl-production-data-compilation.test.js`
  - `dist/test/integration/fitl-coin-operations.test.js`
