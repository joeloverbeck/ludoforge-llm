# FITLSPEACTFULEFF-005 - VC Special Activities: Tax, Subvert, VC Ambush

**Status**: TODO  
**Spec**: `specs/27-fitl-special-activities-full-effects.md` (Tasks 27.10-27.12)  
**Reference**: `brainstorming/implementing-fire-in-the-lake-game-spec-doc.md` (derived values and action-pipeline integration)  
**Depends on**: `FITLSPEACTFULEFF-001`

## Goal
Replace VC SA stubs with full, rule-correct effects for:
- `tax` (up to 4 spaces, underground VC + no COIN control, Econ or 2xPop resource gain, support shift)
- `subvert` (Rally/March/Terror only, remove-2 vs replace-1 chooseOne, patronage drop by removed/replaced ARVN cubes)
- `ambushVc` (VC equivalent of NVA Ambush, including LoC adjacency behavior)

## Scope
- Implement VC SA targeting and resolution logic in production FITL YAML.
- Encode Subvert prerequisites and patronage penalty arithmetic in data-driven effects.
- Ensure VC Ambush follows the corrected no-flip-back/no-attacker-loss behavior.

## File list it expects to touch
- `data/games/fire-in-the-lake.md`
- `test/integration/fitl-nva-vc-special-activities.test.ts`
- `test/integration/fitl-derived-values.test.ts`
- `test/integration/fitl-coup-victory.test.ts` (only if patronage assertions need updates)

## Out of scope
- NVA SA implementation details.
- Base-game Terror operation semantics except where Subvert coupling requires legality linkage.
- Any event-card capability/momentum effects on VC SAs.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js`
- `node --test dist/test/integration/fitl-derived-values.test.js`
- `node --test dist/test/integration/fitl-coup-victory.test.js`

## Invariants that must remain true
- Tax uses LoC Econ or 2x Population exactly as specified.
- Subvert requires ARVN cubes in selected spaces and never removes ARVN bases.
- Patronage delta is deterministic and rounded down per rule.
- SA execution does not spend Resources.

