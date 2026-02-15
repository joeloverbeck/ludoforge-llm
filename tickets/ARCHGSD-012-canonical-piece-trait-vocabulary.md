# ARCHGSD-012: Canonical Piece Trait Vocabulary (No Synonyms)

**Status**: TODO
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/00-implementation-roadmap.md
**Depends on**: ARCHGSD-011

## Description

Enforce a single canonical vocabulary for piece trait values used by generic filters (especially `props.type`) so scenario-projected tokens and event/operation filters cannot drift.

### What to Implement

1. Define canonical trait values for projected piece runtime props (e.g., `type` values) and enforce them in data validation.
2. Reject non-canonical synonyms (example class: singular vs plural variants) at compile/validation time.
3. Update production FITL data to the canonical vocabulary everywhere (piece runtime props, filters, macro args that bind into filters).
4. Keep all logic generic in compiler/kernel; do not encode FITL-only special cases.

## Files to Touch

- `src/kernel/schemas-gamespec.ts` and/or compiler cross-validation where canonical checks belong
- `src/cnl/compile-data-assets.ts` (if canonicalization checks live there)
- `data/games/fire-in-the-lake.md`
- FITL integration tests that assert filter behavior by piece traits

## Out of Scope

- Introducing alias resolution or runtime synonym matching.
- Non-trait-related event rewrites.

## Acceptance Criteria

### Tests That Must Pass

1. New validation tests:
   - Non-canonical trait value in `runtimeProps` fails with deterministic diagnostic.
   - Canonical values pass.
2. Existing FITL operation/special-activity integration tests continue to pass (no behavioral regression).
3. `npm run build` passes.
4. `npm test` passes.
5. `npm run lint` passes.

### Invariants That Must Remain True

- One canonical term per semantic trait (no synonyms, no aliases).
- GameDef/simulator remain game-agnostic.
- Game-specific semantics stay in GameSpecDoc data only.
