# LEGACTTOO-002: Verbalization Compiler + Wire into Compiler Core

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new compiler module + modification to compiler-core pipeline
**Deps**: LEGACTTOO-001

## Problem

The `verbalization:` block in GameSpecDoc YAML has no compiler to transform it into the `VerbalizationDef` stored in GameDef. Without this, no downstream module (normalizer, realizer) can access game-specific labels, stages, macros, or sentence plans.

## Assumption Reassessment (2026-03-06)

1. `compileGameSpecToGameDef` lives at `packages/engine/src/cnl/compiler-core.ts:227` and returns a `GameDef` object. The return object is constructed inline — adding a `verbalization` field is a single property addition.
2. `GameSpecDoc` will have a `verbalization` field after LEGACTTOO-001. The raw YAML shape uses plain objects/arrays (not Maps).
3. No `compile-verbalization.ts` exists in the codebase.

## Architecture Check

1. The compiler converts plain-object YAML into strongly-typed `ReadonlyMap`-based `VerbalizationDef`. This follows the same pattern as other compile steps (e.g., zone compilation, macro expansion).
2. Game-specific content stays in YAML data files. The compiler is generic — it transforms any conforming YAML shape.
3. No backwards-compatibility shims. Missing `verbalization` → `undefined` on GameDef.

## What to Change

### 1. Create `packages/engine/src/cnl/compile-verbalization.ts` (~120 lines)

Export `compileVerbalization(raw: GameSpecVerbalization): VerbalizationDef`:
- Convert `labels` object → `ReadonlyMap<string, string | {singular, plural}>`
- Convert `stages` object → `ReadonlyMap<string, string>`
- Convert `macros` object → `ReadonlyMap<string, {class, summary, slots?}>`
- Convert `sentencePlans` nested object → `ReadonlyMap<string, ReadonlyMap<string, ReadonlyMap<string, string>>>`
- Copy `suppressPatterns` as `readonly string[]`

Handle edge cases: empty objects → empty Maps, missing sub-fields → defaults.

### 2. Wire into `packages/engine/src/cnl/compiler-core.ts`

In `compileGameSpecToGameDef`, after existing compilation steps, add:
```typescript
verbalization: doc.verbalization != null
  ? compileVerbalization(doc.verbalization)
  : undefined,
```

### 3. Author initial verbalization YAML blocks

Add a `05-verbalization.md` file to both `data/games/fire-in-the-lake/` and `data/games/texas-holdem/` with minimal starter content (a few labels, one stage, one macro summary, one suppress pattern each). Full authoring deferred to LEGACTTOO-010 and LEGACTTOO-011.

## Files to Touch

- `packages/engine/src/cnl/compile-verbalization.ts` (new)
- `packages/engine/src/cnl/compiler-core.ts` (modify — add verbalization compilation step)
- `data/games/fire-in-the-lake/05-verbalization.md` (new — starter verbalization block)
- `data/games/texas-holdem/05-verbalization.md` (new — starter verbalization block)
- `packages/engine/test/unit/cnl/compile-verbalization.test.ts` (new)
- `packages/engine/test/integration/compile-verbalization-integration.test.ts` (new)

## Out of Scope

- Full FITL verbalization content (LEGACTTOO-010)
- Full Texas Hold'em verbalization content (LEGACTTOO-011)
- Normalizer or realizer usage of VerbalizationDef (LEGACTTOO-003 through LEGACTTOO-007)
- GameSpecDoc parser changes (the parser already passes through unknown top-level YAML keys)
- JSON Schema artifact regeneration (VerbalizationDef is optional and not schema-validated at the GameDef JSON Schema level)

## Acceptance Criteria

### Tests That Must Pass

1. `compileVerbalization` converts a full YAML-shaped object into a `VerbalizationDef` with correct `ReadonlyMap` entries.
2. `compileVerbalization` handles empty/missing sub-fields gracefully (empty maps, empty arrays).
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

1. `packages/engine/test/unit/cnl/compile-verbalization.test.ts` — unit tests for each field conversion, edge cases (empty, missing, nested).
2. `packages/engine/test/integration/compile-verbalization-integration.test.ts` — compile FITL starter spec, verify `GameDef.verbalization` shape.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
