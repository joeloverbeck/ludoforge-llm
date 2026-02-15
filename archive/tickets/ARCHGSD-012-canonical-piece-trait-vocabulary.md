# ARCHGSD-012: Canonical Piece Trait Vocabulary (No Synonyms)

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/00-implementation-roadmap.md
**Depends on**: ARCHGSD-011

## Description

Enforce a single canonical vocabulary for piece trait values used by generic token filters (especially `prop: type`) so scenario-projected tokens and filter literals cannot drift.

## Reassessed Assumptions (2026-02-15)

1. Canonical trait-value enforcement is **not** currently performed in `schemas-gamespec` or `compile-data-assets`.
2. Token filter literals are lowered in `src/cnl/compile-conditions.ts` and currently accept any string-like value.
3. FITL production data already uses canonical singular trait values in piece runtime props (`troops`, `police`, `guerrilla`, `base`, `irregular`, `ranger`) and in most filters.
4. There are still filter literals in FITL that can drift (`'rangers'`, `'irregulars'`) because no compiler-time vocabulary check ties filters to the selected piece catalog.
5. The correct architecture is compiler-level semantic validation using selected `pieceCatalog` data, not hardcoded per-game synonyms and not runtime aliasing.

### What to Implement

1. Build a generic trait-vocabulary map from the selected `pieceCatalog` `pieceTypes[].runtimeProps` values.
2. Validate token-filter predicates in `tokensInZone` / `tokensInAdjacentZones` lowering:
   - When `prop` is known in the vocabulary map and filter value is a string literal (or string array for `in`/`notIn`), require membership in the canonical set.
   - Reject non-canonical synonyms at compile time with deterministic diagnostics.
3. Keep validation generic:
   - No game-specific hardcoded vocabularies.
   - No alias resolution / synonym fallback.
4. Update FITL production filter literals that violate the canonical vocabulary.

## Files to Touch

- `src/cnl/compile-conditions.ts` (token filter canonical validation at lowering time)
- `src/cnl/compile-effects.ts` / `src/cnl/compile-lowering.ts` / `src/cnl/compile-event-cards.ts` / `src/cnl/compiler-core.ts` (thread optional trait-vocabulary context)
- `src/cnl/compile-data-assets.ts` (derive selected piece-catalog trait vocabulary for compiler context)
- `data/games/fire-in-the-lake.md` (replace any non-canonical trait literals in filters)
- unit/integration tests covering compile diagnostics and FITL regressions

## Out of Scope

- Introducing alias resolution or runtime synonym matching.
- Non-trait-related event rewrites.

## Acceptance Criteria

### Tests That Must Pass

1. New validation tests:
   - Non-canonical token-filter trait literal fails with deterministic diagnostic.
   - Canonical token-filter trait literals pass.
2. Existing FITL operation/special-activity integration tests continue to pass (no behavioral regression).
3. `npm run build` passes.
4. `npm test` passes.
5. `npm run lint` passes.

### Invariants That Must Remain True

- One canonical term per semantic trait (no synonyms, no aliases).
- GameDef/simulator remain game-agnostic.
- Game-specific semantics stay in GameSpecDoc data only.

## Outcome

- Completion date: 2026-02-15
- Implemented:
  - Added generic compiler trait-vocabulary derivation from selected `pieceCatalog` runtime props and status transitions.
  - Added canonical token-filter literal validation in query lowering (`tokensInZone` / `tokensInAdjacentZones`) with deterministic diagnostic `CNL_COMPILER_TOKEN_FILTER_VALUE_NON_CANONICAL`.
  - Threaded optional trait-vocabulary context through compiler lowering paths (actions, triggers, action pipelines, event decks, effects, terminal conditions).
  - Extended effect macro param typing with generic trait contracts:
    - `{ kind: tokenTraitValue, prop: <trait> }`
    - `{ kind: tokenTraitValues, prop: <trait> }`
  - Enforced canonical selected piece-catalog trait vocabulary for macro args at expansion time with deterministic diagnostics (`EFFECT_MACRO_ARG_CONSTRAINT_VIOLATION`) and declaration tracing.
  - Extracted shared trait-vocabulary derivation utility in `src/cnl/token-trait-vocabulary.ts` and reused it in both compile-time and macro-expansion validation paths.
  - Updated FITL production trait literals that feed filters/macro filter args from plural to canonical singular (`irregular`, `ranger`).
  - Updated FITL macro declarations to explicit trait contracts where macro args feed trait filters (`pieceType`, `sfType`).
  - Added compile integration tests for rejecting non-canonical trait literals and accepting canonical literals.
  - Added macro-constraint tests covering canonical acceptance, non-canonical rejection, and dynamic value-expression allowance.
- Deviations from original plan:
  - Canonical enforcement was implemented in compiler lowering context, not `schemas-gamespec`, because semantic token-filter checks require selected piece-catalog cross-context.
  - Vocabulary derivation includes transition values for status dimensions to cover valid values like `active` and `tunneled`.
  - Scope was expanded from token-filter literals to macro param contracts because macro invocation args are another high-leverage entry point for vocabulary drift.
- Verification:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
