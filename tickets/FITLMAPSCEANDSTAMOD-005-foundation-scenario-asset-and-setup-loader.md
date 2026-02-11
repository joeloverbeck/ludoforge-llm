# FITLMAPSCEANDSTAMOD-005 - Foundation Scenario Asset and Setup Loader

**Status**: Proposed
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `brainstorming/implement-fire-in-the-lake-foundation.md` (Setup section)
**Depends on**: `FITLMAPSCEANDSTAMOD-002`, `FITLMAPSCEANDSTAMOD-003`, `FITLMAPSCEANDSTAMOD-004`

## Goal
Create one canonical foundation scenario asset (Westy’s War slice) and load it into a complete initial state with pool/out-of-play placement accounting.

## Scope
- Author scenario asset with initial tracks, eligibility state, pools, out-of-play counts, and per-space placements.
- Bind scenario asset to map + piece catalog ids/version.
- Add loader checks for unknown ids, illegal placements, and inventory mismatch.
- Include tunelled-base initial markers through declared piece/marker contracts.

## File List Expected To Touch
- `data/fitl/scenarios/foundation-westys-war.v1.json` (new)
- `data/fitl/scenarios/foundation-westys-war.v1.schema.json` (new)
- `src/cnl/compiler.ts`
- `src/kernel/initial-state.ts`
- `src/kernel/validate-gamedef.ts`
- `test/fixtures/gamedef/fitl-foundation-initial-valid.json` (new)
- `test/unit/initial-state.test.ts`
- `test/unit/validate-gamedef.test.ts`
- `test/integration/game-loop.test.ts`

## Out Of Scope
- No alternative scenarios (A Better War, full campaign variants).
- No non-player setup options.
- No deck/event execution behavior.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/initial-state.test.ts`
  - loads the canonical FITL scenario into deterministic state.
  - preserves exact declared pool/out-of-play/map counts.
- `test/unit/validate-gamedef.test.ts`
  - rejects scenario entries with unknown space/faction/piece ids.
  - rejects >2 bases in a City/Province.
  - rejects bases on LoCs.
  - rejects non-NVA/VC pieces in North Vietnam.
- `test/integration/game-loop.test.ts`
  - FITL scenario initialization succeeds without affecting existing game-loop fixtures.
- `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Piece inventory conservation holds across map + pools + out-of-play.
- Scenario initialization is deterministic and seed-independent.
- No hidden runtime defaults fill missing scenario fields.
