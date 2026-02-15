# FITLEVECARENC-005: Tutorial Card — Gulf of Tonkin (#1)

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.1, Phase 1)
**Depends on**: FITLEVECARENC-001

## Reassessed Assumptions (2026-02-15)

1. `FITLEVECARENC-001` is archived as completed; prerequisite event-card metadata/type baselines are already present.
2. Free operations are modeled via structured `freeOperationGrants`; there is no `freeOp` effect node.
3. `moveAll` exists in `EffectAST`, but current production FITL pools do not define a dedicated US out-of-play zone in `data/games/fire-in-the-lake.md`.
4. Dynamic Aid deltas are representable today via expression AST (`op`, `aggregate`, `ref`) in `addVar.delta`.
5. There is no established `NEEDS_PRIMITIVE.md` tracking file workflow in this repository; unresolved semantics should be documented in-ticket and encoded with explicit compile-first intent.

## Architecture Rationale

- Using `freeOperationGrants` for the unshaded free Air Strike keeps free-op handling in the generic turn-flow runtime and avoids game-specific runtime branching.
- Encoding the shaded Aid penalty as an `aggregate`-driven expression uses existing generic AST primitives and is more robust/extensible than hardcoded card handlers.
- For the two clauses that reference “out-of-play” piece movement, this ticket should remain compile-first and declarative under current pool-zone modeling, rather than introducing ad-hoc aliases or game-specific kernel code.

## Description

Encode card #1 (Gulf of Tonkin), the highest-complexity tutorial card. This is the US escalation event with multi-step effects:

- **Unshaded**: "US free Air Strikes, then moves 6 US pieces from out-of-play to any Cities."
  - Free Air Strike modeled with `freeOperationGrants` scoped to `airStrike` for US.
  - Out-of-play-to-city movement represented as compile-first declarative targeting intent (without adding new kernel primitives or game-specific handlers).

- **Shaded**: "Congressional regrets: Aid -1 per Casualty. All Casualties out of play."
  - Dynamic calculation: Aid -= count of US pieces currently in `casualties-US:none` via `aggregate`.
  - "All Casualties out of play" retained as textual clause; no separate out-of-play pool move is encoded in this ticket given current production pool-zone model.

This card is high-complexity because it references free operations, aggregate calculations, and bulk piece movement.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add card-1 definition to the `eventDecks[0].cards` array.
- `test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` — **New file**. Integration test for card 1.

## Out of Scope

- Introducing new FITL-specific pool zones solely for this card.
- Any kernel/compiler changes.
- Other tutorial cards.

## Encoding Guidance

### Unshaded Side
Encode free Air Strike with:
- `freeOperationGrants: [{ faction: "0", actionIds: [airStrike] }]`

Represent out-of-play movement intent using declarative `targets` (US out-of-play selection budget + city selection budget) without introducing game-specific runtime behavior.

### Shaded Side
"Aid -1 per Casualty" should be encoded with an `addVar` expression delta that multiplies casualty count by `-1`:
- Count via `aggregate` + `tokensInZone` on `casualties-US:none`.
- Apply via `addVar` to global `aid`.

The trailing out-of-play clause remains in side `text` for this ticket and is not additionally modeled as an executable move.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts`:
   - Card 1: compiles, `sideMode: "dual"`, `metadata.period === "1964"`, `metadata.factionOrder` is `["US", "NVA", "ARVN", "VC"]`.
   - Unshaded declares `freeOperationGrants` for US `airStrike` and compile-first targeting structure for out-of-play/city movement intent.
   - Shaded declares dynamic Aid reduction (`addVar.delta` expression based on casualty aggregate).
   - `text` fields present on both sides.
2. `npm run build` passes.
3. `npm test` passes.
4. `npm run lint` passes.

### Invariants That Must Remain True

- All existing cards unchanged.
- Production spec compiles without errors.
- Card ID is `card-1`.
- No game-specific runtime/kernel branches are added for this card.

## Scope Correction Addendum (2026-02-15)

This addendum supersedes earlier “compile-first only” constraints in this ticket.

- The out-of-play clauses are now executable, not text-only.
- FITL now uses explicit out-of-play zones (`out-of-play-US:none`, `out-of-play-ARVN:none`) with no aliasing.
- Compiler/runtime architecture was extended generically (not FITL-specific):
  - Scenario assets can project executable setup tokens when `scenario.factionPools` is provided.
  - Projection remains opt-in; scenarios without `factionPools` keep prior behavior.
  - Piece runtime props are sourced from `pieceCatalog.pieceTypes[].runtimeProps` and remain game data driven.
- Test suites that require isolated operation microstates now explicitly start from cleared board zones, preserving deterministic unit/integration intent under scenario-projected setups.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Implemented card #1 plus surrounding out-of-play mechanics in production data:
    - `card-1` shaded now executes `moveAll` from `casualties-US:none` to `out-of-play-US:none`.
    - `card-82` and `card-43` now execute explicit out-of-play-to-available returns.
  - Added and wired dedicated out-of-play zones in production FITL data.
  - Implemented generic scenario setup projection in compiler:
    - `ScenarioPayload.factionPools` support.
    - `PieceTypeCatalogEntry.runtimeProps` support.
    - projected setup token creation from scenario placements/out-of-play/inventory remainder.
    - explicit opt-in guard: no projection when `factionPools` are absent.
  - Added/updated integration coverage for:
    - Gulf of Tonkin and related event behavior.
    - Domino Theory and card-43 return-to-available behavior.
    - Scenario setup projection invariants.
    - compile-pipeline fixture behavior when projection is not opted in.
  - Updated operation-focused FITL tests to use explicit isolated board setup where needed.
- **Deviations from original plan**:
  - Scope expanded from a single-card encoding ticket into a foundational architecture correction so GameSpecDoc scenario data can initialize simulator-ready states without game-specific engine branches.
  - Earlier ticket language that declared kernel/compiler changes out-of-scope is superseded by this addendum.
- **Verification results**:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
