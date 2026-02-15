# FITLRULES1-006: Named Set References for Token Filter Membership

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium (compiler + FITL YAML replacement + tests)
**Engine Changes**: Yes (generic compiler support)

## Reassessed Assumptions

1. The duplication claim is still true: `[US, ARVN]` and `[NVA, VC]` are repeated across FITL macro/action YAML.
2. The prior solution shape was not ideal: a game-specific `factionAlliances` field would violate agnostic-engine direction by baking FITL semantics into shared schema.
3. The better architecture is a generic metadata mechanism:
   - Add `metadata.namedSets` as a reusable compile-time map of `string -> string[]`.
   - Allow token-filter `in`/`notIn` values to reference named sets with `{ ref: namedSet, name: <setId> }`.
   - Expand references at compile time into canonical string arrays.

## Problem

Faction-group membership filters in FITL repeat literal arrays in many locations, increasing maintenance cost and drift risk.

## Scope

1. Extend GameSpec metadata/validation with optional generic `namedSets`.
2. Extend condition/effect lowering so token filter membership operators (`in`/`notIn`) accept named-set references and lower to literal arrays.
3. Replace repeated FITL faction-pair literals in:
   - `data/games/fire-in-the-lake/20-macros.md`
   - `data/games/fire-in-the-lake/30-rules-actions.md`
4. Add compiler unit coverage for:
   - successful named-set expansion
   - unknown named-set diagnostics

## Explicit Non-Goals

1. No runtime kernel semantic changes.
2. No game-specific alliance branches in compiler/runtime.
3. No compatibility aliasing for alternative reference spellings.

## Invariants

1. Compiled `GameDef` behavior remains unchanged.
2. Named-set references are compile-time sugar only and resolve to concrete string arrays before runtime.
3. Existing specs without `metadata.namedSets` continue compiling unchanged.

## Tests

1. Unit: token-filter `in` accepts named-set references and lowers correctly.
2. Unit: unknown named-set reference emits compiler diagnostic and fails lowering for that node.
3. Regression: relevant FITL/compile suites pass after YAML replacement.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Added generic `metadata.namedSets` support and validation in shared compiler/validator layers.
  - Added compile-time expansion for token filter `in`/`notIn` values from `{ ref: namedSet, name: <id> }` to literal arrays.
  - Added/updated tests for named-set lowering and metadata validation edge cases.
  - Updated FITL YAML to define named sets once in `00-metadata.md` and replaced repeated faction filter literals in macro/action files.
- **Deviations from original deferred plan**:
  - Implemented a game-agnostic `namedSets` mechanism instead of a FITL-specific `factionAlliances` field.
  - Kept runtime/kernel unchanged; this is compile-time sugar only.
- **Verification results**:
  - `npm test` passed.
  - `npm run lint` passed.
  - Targeted unit suites for the new behavior passed.
