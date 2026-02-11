# FITLEVEFRAANDINICARPAC-006 - Initial FITL Card Pack: Domino Theory and Phoenix Program

**Status**: Proposed  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: `FITLEVEFRAANDINICARPAC-001` through `FITLEVEFRAANDINICARPAC-005`

## Goal
Author the first FITL event-card data pack in `GameSpecDoc` YAML with complete dual-use definitions for Card 82 (Domino Theory) and Card 27 (Phoenix Program), executable via generic event primitives.

## Scope
- Add/extend FITL compiler fixture containing embedded event-card data assets.
- Encode both sides of card 82 and card 27 according to Spec 20 rules.
- Add card-level tests for both sides plus constrained-state partial-resolution cases.
- Ensure no runtime dependency on `data/fitl/...` for card loading.

## Implementation tasks
1. Add event-card payloads to a FITL fixture under `test/fixtures/cnl/compiler/`.
2. Encode Domino Theory:
  - unshaded branch choice (`US/ARVN out-of-play return` vs `ARVN Resources +9 and Aid +9`),
  - shaded `US Troops to out-of-play` and `Aid -9`.
3. Encode Phoenix Program:
  - unshaded `remove up to 3 VC from COIN-control spaces`,
  - shaded `add Terror to up to 2 qualifying spaces, then Active Opposition`.
4. Add golden-style card tests including at least one partial-resolution scenario per card.

## File list it expects to touch
- `test/fixtures/cnl/compiler/fitl-events-initial-card-pack.md` (new)
- `test/integration/fitl-events-domino-theory.test.ts` (new)
- `test/integration/fitl-events-phoenix-program.test.ts` (new)
- `test/integration/compile-pipeline.test.ts`
- `test/unit/no-hardcoded-fitl-audit.test.ts`

## Out of scope
- Additional FITL cards beyond 82 and 27.
- Rebalancing card text or introducing alternate interpretations of source rules.
- New runtime feature work beyond what prior tickets establish.
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
- Partial-resolution behavior is deterministic and trace-visible for constrained states.
- Compiling/running these cards does not require runtime reads from `data/fitl/...`.

