# ENGINEAGNO-001: Restore Int-Domain Contract Parity for Move Validation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel validation semantics
**Deps**: None

## Problem

`applyMove` param validation for `intsInRange` / `intsInVarRange` currently accepts values that are within min/max bounds but may violate domain shape constraints (for example `step` membership). This creates a legality mismatch between GameSpecDoc domain definition and runtime enforcement.

Current behavior was introduced by short-circuiting to `isInIntRangeDomain` in `src/kernel/apply-move.ts`, while `isInIntRangeDomain` only checks range bounds in `src/kernel/eval-query.ts`.

### Reassessed Current State (2026-02-16)

1. The core bug is real: `isInIntRangeDomain` currently enforces only integer + bounds and ignores `step`/shape semantics.
2. `maxResults` parity behavior is already covered by existing tests in `test/unit/kernel/apply-move.test.ts`:
   - `accepts intsInRange values excluded from legalMoves by maxResults downsampling`
   - `accepts intsInVarRange values excluded from legalMoves by maxResults downsampling`
3. Existing coverage does **not** explicitly assert rejection of out-of-step values for either int-domain query during `applyMove` validation.
4. Existing e2e Texas tests cover legal-move cardinality bounds, but do not explicitly pin this domain-membership contract regression.
5. Texas Hold'em `raise` currently encodes bucketing via `step: { ref: gvar, var: bigBlind }`; under strict contract parity this unintentionally forbids valid no-limit amounts. Data needs to encode legality independently from bucket suggestions.

## What to Change

1. Update int-domain membership validation so `applyMove` legality enforces the same semantic contract as the declared domain, including:
   - bounds (`min` / `max`)
   - integer safety
   - domain-shape membership (`step`)
   - explicit legal inclusions represented in the domain contract (`alwaysInclude`, bounds endpoints)
2. Keep `maxResults` as a legal-move enumeration/sampling concern, not a legality concern.
3. Ensure legality for int domains is expressed by a single shared contract-membership path used consistently by:
   - `applyMove` move-param validation
   - any future replay/ingestion APIs (via same shared helper)
4. Keep engine logic game-agnostic and avoid Texas-specific logic paths.
5. Add concise in-code documentation clarifying legality contract vs enumeration/downsampling semantics.
6. Update Texas Hold'em `raise` GameSpecDoc data so no-limit legality remains full-range while legal-move enumeration remains capped and anchored.

## Architecture Direction

Preferred direction is to model int-domain legality as a reusable contract-resolution + membership check (not full-domain enumeration), so legality checks remain deterministic and scalable while preserving semantics shared by `legalMoves`/`applyMove`.

## Invariants

1. Declared int-domain legality in `applyMove` must be independent from `maxResults` downsampling.
2. Any value violating `step` must be rejected even if within min/max.
3. Values satisfying declared int-domain legality contract but omitted from `legalMoves` due to downsampling must still be accepted.
4. `intsInRange` and `intsInVarRange` follow the same legality model.
5. Endpoint behavior remains consistent with current query semantics (min/max legal when domain is otherwise valid).
6. No game-specific exceptions in engine code.
7. Game-specific bucketing intent must be represented in game data, not by relaxing engine legality semantics.

## Tests

1. Unit (new): `intsInRange` with `step: 2` rejects out-of-step in-range value and still accepts in-step value.
2. Unit (new): `intsInVarRange` with `step` rejects out-of-step in-range value and still accepts in-step value.
3. Unit (existing regression): values omitted by `maxResults` but satisfying full domain are accepted (`intsInRange` and `intsInVarRange`).
4. Regression: existing legal-move cardinality tests continue to pass.
5. Integration regression: Texas no-limit replay test continues to accept exact non-enumerated raise amounts.

## Outcome

- Completion date: 2026-02-16
- Implemented:
  - Introduced shared int-domain contract resolution in `src/kernel/eval-query.ts` and updated `isInIntRangeDomain` to enforce full domain-shape legality (`step`, bounds endpoints, `alwaysInclude`) independently from `maxResults`.
  - Kept legal-move downsampling behavior unchanged for enumeration (`maxResults` remains suggestion/cardinality concern, not legality).
  - Added/strengthened unit coverage in `test/unit/kernel/apply-move.test.ts` for out-of-step rejection and contract-shape acceptance.
  - Updated Texas Hold'em raise domain data in `data/games/texas-holdem/30-rules-actions.md` to encode full no-limit legality (`step: 1`) while retaining anchored/capped enumeration via `alwaysInclude` + `maxResults`.
- Deviations from original plan:
  - The originally proposed dedicated Texas replay test did not need to be newly created because an equivalent integration guard already existed; work focused on making that existing test pass under strict domain-parity semantics.
- Verification:
  - `npm run lint` passed.
  - `npm test` passed.
