# GAMEDEFGEN-004: Strengthen Generic Map-Space Query Diagnostics

**Status**: ✅ COMPLETED  
**Priority**: P1  
**Complexity**: S  
**Depends on**: Existing eval-query/eval-condition architecture

## 1) Reassessed assumptions and updated scope

### Confirmed current architecture (already implemented)

The engine already has generic, game-agnostic query primitives for board/location logic:
- `mapSpaces` and `tokensInMapSpaces` queries
- zone owner filtering via query `filter.owner`
- map metadata references via `zoneProp`
- array-membership checks via `zonePropIncludes`

These are already data-driven from `GameDef.mapSpaces` and reused broadly by existing FITL and non-FITL tests.  
Because of this, adding new query kinds for "space class", "route class", or "control predicate" is unnecessary and would duplicate current architecture.

### Actual gap to close

The main discrepancy is not missing primitives, but missing **static diagnostics** for map-space selector/property misuse:
- invalid static zone references that are not in `mapSpaces`
- invalid map property names used by `zoneProp` / `zonePropIncludes`
- type mismatch at authoring time (`zoneProp` should target scalar props; `zonePropIncludes` should target array props)

### Updated implementation scope

- Keep existing query/condition surface area unchanged (no new query operators).
- Improve `validateGameDef` behavior diagnostics to catch static map-space misuse early.
- Keep runtime checks intact as defense-in-depth.

## 2) Invariants that should pass

- Query primitives remain game-agnostic and reusable across games.
- Map-space semantics remain data-driven from `GameDef`.
- Validation catches static selector/property mistakes deterministically.
- No game-specific hardcoding is introduced.

## 3) Tests that should pass

### Modified tests
- `test/unit/validate-gamedef.test.ts`
  - add diagnostics coverage for invalid static `zoneProp` / `zonePropIncludes` references and property-kind mismatches.

### Existing tests
- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Re-scoped ticket from "add new control/class query primitives" to "strengthen diagnostics on existing generic primitives".
  - Added static `validateGameDef` diagnostics for map-space property misuse:
    - unknown map-space property names
    - scalar/array property kind mismatches between `zoneProp` and `zonePropIncludes`
    - static map-space zone references not present in `mapSpaces`
  - Hardened selector validation to accept dynamic bound zone selectors (for example `$zone`) in generic query/filter paths.
  - Added unit tests for the new diagnostics and for dynamic zone-selector acceptance.
- Deviations from original plan:
  - Did not introduce new query/condition primitives because the existing architecture already provides generic game-agnostic primitives (`mapSpaces`, `tokensInMapSpaces`, `zoneProp`, `zonePropIncludes`, owner filters).
  - Focus shifted to validation correctness and architecture hardening.
- Verification:
  - `npm run build` passed
  - `npm run lint` passed
  - `npm test` passed
