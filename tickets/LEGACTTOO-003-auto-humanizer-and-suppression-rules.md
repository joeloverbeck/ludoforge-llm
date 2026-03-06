# LEGACTTOO-003: Auto-Humanizer + Suppression Rules

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — two new kernel utility modules
**Deps**: LEGACTTOO-001

## Problem

The normalizer and template realizer both need two utility modules: (a) an auto-humanizer that converts programmatic identifiers (`usTroops`, `available-us`, `$player`) into title-cased display names, and (b) a suppression checker that determines whether a variable/binding name should be hidden from tooltip output. Without these, every downstream module would need to implement its own ad-hoc name formatting and suppression logic.

## Assumption Reassessment (2026-03-06)

1. No auto-humanize or suppression utility exists in the codebase. `packages/runner/src/utils/` has `format-display-name.ts` but that's runner-side display name formatting, not engine-side identifier humanization.
2. Suppression patterns from the spec: `*Count`, `*Tracker`, `__*`, `temp*`, plus explicit `suppressPatterns` from VerbalizationDef.
3. The auto-humanizer needs to handle camelCase, kebab-case, `$`-prefix stripping, title case, and a known acronym table.

## Architecture Check

1. Both modules are pure utility functions with no dependencies beyond `VerbalizationDef` types (for acronym table and suppress patterns). No kernel state, no side effects.
2. Engine-agnostic: the humanizer and suppressor work on plain strings. No game-specific logic.
3. No backwards-compatibility concerns — these are new files.

## What to Change

### 1. Create `packages/engine/src/kernel/tooltip-humanizer.ts` (~80 lines)

Export `humanizeIdentifier(id: string, acronyms?: ReadonlySet<string>): string`:
- Split camelCase: `usTroops` → `['us', 'Troops']`
- Split kebab-case: `available-us` → `['available', 'us']`
- Strip leading `$`: `$player` → `player`
- Title-case each word
- Apply acronym table: if a word (lowercased) matches a known acronym, use the uppercase form (`us` → `US`, `nva` → `NVA`)
- Default acronym set: `US`, `ARVN`, `NVA`, `VC`, `NLF`, `AI`

Export `buildAcronymSet(verbalization: VerbalizationDef | undefined): ReadonlySet<string>`:
- Extract all-caps tokens from verbalization labels to auto-populate the acronym set.

### 2. Create `packages/engine/src/kernel/tooltip-suppression.ts` (~100 lines)

Export `isSuppressed(name: string, patterns: readonly string[]): boolean`:
- Check against built-in conventions: `*Count`, `*Tracker`, `__*` prefix
- Check against explicit `suppressPatterns` from VerbalizationDef using glob-style matching (`*` = wildcard prefix/suffix)

Export `isScaffoldingEffect(effectKind: string, bindingName?: string): boolean`:
- Returns true for `let`, `bindValue`, `concat` effects used for zone construction scaffolding
- Returns true for `setNextPlayer`, `advanceTurn` turn machinery effects

### 3. Export from `packages/engine/src/kernel/index.ts`

Add barrel exports for both new modules.

## Files to Touch

- `packages/engine/src/kernel/tooltip-humanizer.ts` (new)
- `packages/engine/src/kernel/tooltip-suppression.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add exports)
- `packages/engine/test/unit/kernel/tooltip-humanizer.test.ts` (new)
- `packages/engine/test/unit/kernel/tooltip-suppression.test.ts` (new)

## Out of Scope

- Normalizer logic that calls these utilities (LEGACTTOO-004, LEGACTTOO-005)
- Template realizer label resolution (LEGACTTOO-007)
- VerbalizationDef compilation (LEGACTTOO-002)
- Runner-side display name formatting (`packages/runner/src/utils/format-display-name.ts` is untouched)

## Acceptance Criteria

### Tests That Must Pass

1. `humanizeIdentifier('usTroops')` → `'Us Troops'` (no acronym table)
2. `humanizeIdentifier('usTroops', new Set(['US']))` → `'US Troops'`
3. `humanizeIdentifier('available-us', new Set(['US']))` → `'Available US'`
4. `humanizeIdentifier('$player')` → `'Player'`
5. `humanizeIdentifier('totalEcon')` → `'Total Econ'`
6. `isSuppressed('sweepCount', [])` → `true` (built-in `*Count` convention)
7. `isSuppressed('__internal', [])` → `true` (built-in `__*` convention)
8. `isSuppressed('aid', ['temp*'])` → `false`
9. `isSuppressed('tempBuffer', ['temp*'])` → `true`
10. `isScaffoldingEffect('let')` → `true`
11. `isScaffoldingEffect('advanceTurn')` → `true`
12. `isScaffoldingEffect('moveToken')` → `false`
13. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Both modules are pure functions — no side effects, no state mutation.
2. Humanizer handles empty strings and single-character identifiers without crashing.
3. Suppression never false-negatives on `__*` prefix or `*Count`/`*Tracker` suffix conventions.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-humanizer.test.ts` — camelCase, kebab, `$` strip, title case, acronym table, edge cases (empty, single char, all-caps).
2. `packages/engine/test/unit/kernel/tooltip-suppression.test.ts` — built-in conventions, explicit patterns, glob matching, scaffolding effects.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo typecheck`
