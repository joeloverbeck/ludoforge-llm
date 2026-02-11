# FITLEVEFRAANDINICARPAC-006 - Initial FITL Card Pack: Domino Theory and Phoenix Program

**Status**: ✅ COMPLETED  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: `FITLEVEFRAANDINICARPAC-001` through `FITLEVEFRAANDINICARPAC-005`

## Goal
Author the first FITL event-card data pack in `GameSpecDoc` YAML with complete dual-use definitions for Card 82 (Domino Theory) and Card 27 (Phoenix Program), lowered deterministically into `GameDef.eventCards` through generic compiler paths.

## Reassessed assumptions (2026-02-11)
- `eventCardSet` payloads are currently validated and compiled into `GameDef.eventCards`, but runtime event execution does not yet consume `gameDef.eventCards` directly.
- The original scope assumed immediate card-execution tests (`fitl-events-domino-theory` / `fitl-events-phoenix-program`) were possible in this ticket. That runtime linkage is deferred and belongs to the follow-on integration ticket (`FITLEVEFRAANDINICARPAC-007`).
- This ticket can and should still deliver:
  - canonical YAML card definitions for cards 82 and 27,
  - deterministic compile/lowering coverage for side/branch ordering and declarative constraints,
  - regression coverage proving no runtime filesystem dependency on `data/fitl/...` for card data ingestion.

## Scope
- Add/extend FITL compiler fixture containing embedded event-card data assets.
- Encode both sides of card 82 and card 27 according to Spec 20 rules as declarative event payloads.
- Add card-pack compilation tests for both sides plus constrained-state declarative limits/qualifier coverage.
- Ensure no runtime dependency on `data/fitl/...` for card loading.

## Implementation tasks
1. Add event-card payloads to a FITL fixture under `test/fixtures/cnl/compiler/`.
2. Encode Domino Theory:
  - unshaded branch choice (`US/ARVN out-of-play return` vs `ARVN Resources +9 and Aid +9`),
  - shaded `US Troops to out-of-play` and `Aid -9`.
3. Encode Phoenix Program:
  - unshaded `remove up to 3 VC from COIN-control spaces`,
  - shaded `add Terror to up to 2 qualifying spaces, then Active Opposition`.
4. Add integration tests that compile the card pack and assert:
  - both sides are present and deterministic,
  - branch ordering is deterministic,
  - declarative `up to N` constraints and selector qualifiers needed for constrained/partial runtime resolution are encoded.

## File list it expects to touch
- `test/fixtures/cnl/compiler/fitl-events-initial-card-pack.md` (new)
- `test/integration/fitl-events-domino-theory.test.ts` (new)
- `test/integration/fitl-events-phoenix-program.test.ts` (new)
- `test/integration/compile-pipeline.test.ts` (optional, if needed to strengthen pipeline-level regression)
- `test/unit/no-hardcoded-fitl-audit.test.ts` (optional, if needed for fixture-path regression assertions)

## Out of scope
- Additional FITL cards beyond 82 and 27.
- Rebalancing card text or introducing alternate interpretations of source rules.
- New runtime feature work to execute `gameDef.eventCards` directly.
- Deck shuffling/order algorithms outside existing card lifecycle behavior.

## Acceptance criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-events-domino-theory.test.js`
- `node --test dist/test/integration/fitl-events-phoenix-program.test.js`
- `node --test dist/test/integration/compile-pipeline.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

### Invariants that must remain true
- Card behavior is encoded in YAML data assets, not hardcoded in kernel/compiler by card id.
- Card 82 and 27 both support dual-use side choice and deterministic branch/target ordering.
- Declarative constraints required for deterministic partial resolution are encoded data-first and compile cleanly.
- Compiling/running these cards does not require runtime reads from `data/fitl/...`.

## Outcome
- Completion date: 2026-02-11.
- What changed:
  - Added `test/fixtures/cnl/compiler/fitl-events-initial-card-pack.md` with embedded `eventCardSet` data for Card 82 (Domino Theory) and Card 27 (Phoenix Program).
  - Added integration tests:
    - `test/integration/fitl-events-domino-theory.test.ts`
    - `test/integration/fitl-events-phoenix-program.test.ts`
    - shared helper `test/integration/fitl-events-test-helpers.ts`
  - Verified deterministic compile/lowering behavior, dual-side presence, branch ordering, and declarative target/cardinality constraints for constrained resolution cases.
- Deviations from original plan:
  - Did not implement direct runtime execution tests for `gameDef.eventCards`; runtime linkage is not present yet and is deferred to `FITLEVEFRAANDINICARPAC-007`.
  - No kernel/compiler runtime API changes were needed for this ticket; the work remained fixture/test-focused.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/integration/fitl-events-domino-theory.test.js` passed.
  - `node --test dist/test/integration/fitl-events-phoenix-program.test.js` passed.
  - `node --test dist/test/integration/compile-pipeline.test.js` passed.
  - `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js` passed.
  - Hard test: `npm test` passed.
