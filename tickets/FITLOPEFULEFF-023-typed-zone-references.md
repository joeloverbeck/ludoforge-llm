# FITLOPEFULEFF-023: Typed Zone References in GameSpecDoc

**Status**: Pending
**Priority**: P1
**Estimated effort**: Medium (4-6 hours)
**Spec reference**: Spec 25a compiler/kernel primitives, Spec 26 data-driven operation design
**Depends on**: FITLOPEFULEFF-022

## Summary

Replace string-concatenated zone-id construction in effects/macros with a typed zone-reference expression in GameSpecDoc and compiler lowering.

Goal: eliminate fragile stringly-typed zone selectors like `available-<faction>:none` construction via `concat`.

## Problem

Current YAML patterns construct zone ids as strings:
- Hard to validate statically
- Easy to typo
- Duplicates naming rules in many profiles/macros

This does not scale to many game specs.

## Proposed Architecture

Add a game-agnostic `zoneRef` expression form to CNL ValueExpr/Zone selector model.

Example direction:
- `zoneRef: { kind: available, faction: <ValueExpr> }`
- Compiler lowers to canonical zone selector string/id expected by kernel.

Requirements:
- Works for dynamic faction values and static literals
- Preserves existing zone ownership/visibility model
- Can be validated at compile time for known zone kinds

## Files to Touch

- `src/cnl/*` and/or schema definitions for expression typing
- `src/kernel/resolve-selectors.ts` (or compiler lowering path)
- `schemas/*` as needed for typed expression support
- `data/games/fire-in-the-lake.md` — migrate Available-box references to typed `zoneRef`
- tests in `test/unit/compile-selectors.test.ts`, `test/unit/resolve-selectors.test.ts`, and relevant FITL integration tests

## Out of Scope

- Renaming FITL zone ids globally
- Introducing game-specific zone kinds into kernel logic

## Acceptance Criteria

### Tests That Must Pass
1. Typed `zoneRef` compiles and resolves for dynamic faction values.
2. Invalid `zoneRef` shapes produce deterministic compiler diagnostics.
3. FITL profiles/macros using Available-box routing work without string `concat`-based zone-id assembly.

### Invariants
- Kernel and compiler remain game-agnostic
- No alias path where both old concat and new typed ref are required for correctness; migrate callers in-scope
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)
