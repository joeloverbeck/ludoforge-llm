# LEGACTTOO-002: Verbalization Compiler + Wire into Compiler Core

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new compiler module + modification to compiler-core pipeline + parser/section-identifier/compose-gamespec updates
**Deps**: LEGACTTOO-001

## Problem

The `verbalization:` block in GameSpecDoc YAML has no compiler to transform it into the `VerbalizationDef` stored in GameDef. Without this, no downstream module (normalizer, realizer) can access game-specific labels, stages, macros, or sentence plans.

## Assumption Reassessment (2026-03-06, revised 2026-03-06)

1. `compileGameSpecToGameDef` lives at `packages/engine/src/cnl/compiler-core.ts:228`. The actual GameDef assembly happens in `compileExpandedDoc` (line 263), which already has `sections.verbalization = null` scaffolding (line 303) and spreads it into GameDef (line 686) — it just never gets populated.
2. `GameSpecDoc` already has `verbalization: GameSpecVerbalization | null` after LEGACTTOO-001 (line 460 of `game-spec-doc.ts`).
3. `VerbalizationDef` in `verbalization-types.ts` uses `Readonly<Record<...>>` (NOT `ReadonlyMap`) for JSON serializability. Both input (`GameSpecVerbalization`) and output (`VerbalizationDef`) use Record-based types.
4. No `compile-verbalization.ts` exists in the codebase.
5. **Correction**: The parser does NOT pass through unknown top-level YAML keys. `verbalization` must be explicitly registered in `section-identifier.ts` (`CANONICAL_SECTION_KEYS`), handled in `parser.ts` (section dispatch switch), and added to `compose-gamespec.ts` (`SINGLETON_SECTIONS` + `assignSingletonSection`).

## Architecture Check

1. The compiler normalizes `GameSpecVerbalization` (with nullable/optional fields) into `VerbalizationDef` (with non-nullable defaults). Both use `Readonly<Record<...>>` — no Map conversion needed. This follows the same pattern as other compile steps.
2. Game-specific content stays in YAML data files. The compiler is generic — it transforms any conforming YAML shape.
3. No backwards-compatibility shims. Missing `verbalization` → `undefined` on GameDef.

## What was Changed

### 1. Created `packages/engine/src/cnl/compile-verbalization.ts` (~20 lines)

Pure normalizer: `compileVerbalization(raw: GameSpecVerbalization): VerbalizationDef` — defaults null/undefined fields to empty Records/arrays.

### 2. Wired into `packages/engine/src/cnl/compiler-core.ts`

Added import and compilation step after victoryStandings block (~line 610):
```typescript
if (resolvedTableRefDoc.verbalization !== null) {
  sections.verbalization = compileVerbalization(resolvedTableRefDoc.verbalization);
}
```

### 3. Registered `verbalization` in parser pipeline (was NOT out of scope)

- `section-identifier.ts`: Added `'verbalization'` to `CANONICAL_SECTION_KEYS`
- `parser.ts`: Added `'verbalization'` case to section dispatch switch + `mergeSingletonVerbalization` function
- `compose-gamespec.ts`: Added `'verbalization'` to `SINGLETON_SECTIONS` + `assignSingletonSection` case

### 4. Authored initial verbalization YAML blocks

- `data/games/fire-in-the-lake/05-verbalization.md` — starter labels, stage, macro, sentencePlan, suppressPatterns
- `data/games/texas-holdem/05-verbalization.md` — starter labels, stage, macro, sentencePlan, suppressPatterns

## Files Touched

- `packages/engine/src/cnl/compile-verbalization.ts` (new)
- `packages/engine/src/cnl/compiler-core.ts` (modify — add import + verbalization compilation step)
- `packages/engine/src/cnl/section-identifier.ts` (modify — add `'verbalization'` to `CANONICAL_SECTION_KEYS`)
- `packages/engine/src/cnl/parser.ts` (modify — add verbalization case to section dispatch + `mergeSingletonVerbalization`)
- `packages/engine/src/cnl/compose-gamespec.ts` (modify — add `'verbalization'` to `SINGLETON_SECTIONS` + `assignSingletonSection`)
- `data/games/fire-in-the-lake/05-verbalization.md` (new — starter verbalization block)
- `data/games/texas-holdem/05-verbalization.md` (new — starter verbalization block)
- `packages/engine/test/unit/cnl/compile-verbalization.test.ts` (new — 8 unit tests)
- `packages/engine/test/integration/compile-verbalization-integration.test.ts` (new — 5 integration tests)

## Out of Scope

- Full FITL verbalization content (LEGACTTOO-010)
- Full Texas Hold'em verbalization content (LEGACTTOO-011)
- Normalizer or realizer usage of VerbalizationDef (LEGACTTOO-003 through LEGACTTOO-007)
- JSON Schema artifact regeneration (VerbalizationDef is optional and not schema-validated at the GameDef JSON Schema level)

## Acceptance Criteria

### Tests That Must Pass

1. `compileVerbalization` converts a full YAML-shaped object into a `VerbalizationDef` with correct `Readonly<Record<...>>` entries.
2. `compileVerbalization` handles empty/missing sub-fields gracefully (empty Records, empty arrays).
3. Round-trip: GameSpecDoc with `verbalization:` block → `compileGameSpecToGameDef` → `GameDef.verbalization` is defined and well-formed.
4. Round-trip: GameSpecDoc without `verbalization:` block → `compileGameSpecToGameDef` → `GameDef.verbalization` is `undefined`.
5. FITL and Texas Hold'em production specs compile without errors after adding starter verbalization files.
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Existing GameDefs without verbalization continue to compile identically (no output diff).
2. `compileVerbalization` is pure — no side effects, no mutation of input.
3. Game-specific content lives only in YAML data files, not in compiler code.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-verbalization.test.ts` — 8 unit tests for each field conversion, edge cases (empty, missing, nested, immutability).
2. `packages/engine/test/integration/compile-verbalization-integration.test.ts` — 5 integration tests: FITL/Texas production spec compilation, no-verbalization spec, error-free diagnostics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

### What changed vs originally planned

1. **Compiler module**: Implemented as planned, but simpler (~20 lines vs estimated ~120). Since both `GameSpecVerbalization` and `VerbalizationDef` use `Readonly<Record<...>>` (not `ReadonlyMap` as the original ticket assumed), the compiler is a pure normalizer that defaults missing fields — no Map conversion needed.

2. **Parser pipeline changes were required**: The original ticket listed "GameSpecDoc parser changes" as out of scope, claiming "the parser already passes through unknown top-level YAML keys." This was wrong. The parser requires explicit registration of every section key in three places:
   - `section-identifier.ts` — `CANONICAL_SECTION_KEYS` array
   - `parser.ts` — section dispatch switch
   - `compose-gamespec.ts` — `SINGLETON_SECTIONS` array + `assignSingletonSection` switch
   Without these, verbalization YAML blocks were silently dropped during parsing.

3. **Wiring into compiler-core**: Implemented as planned — single `if` block populating `sections.verbalization`.

4. **Starter YAML files**: Created for both FITL and Texas Hold'em as planned.

5. **Tests**: 8 unit tests + 5 integration tests, all passing. Covers full input, partial input, empty/missing fields, immutability, production spec compilation, and no-verbalization specs.
