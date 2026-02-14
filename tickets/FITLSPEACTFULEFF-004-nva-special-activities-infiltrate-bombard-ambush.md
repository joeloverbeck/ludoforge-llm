# FITLSPEACTFULEFF-004 - NVA Special Activities: Infiltrate, Bombard, NVA Ambush

**Status**: TODO  
**Spec**: `specs/27-fitl-special-activities-full-effects.md` (Tasks 27.7-27.9)  
**Reference**: `brainstorming/implementing-fire-in-the-lake-game-spec-doc.md` (piece sourcing, casualties, and operation profile constraints)  
**Depends on**: `FITLSPEACTFULEFF-001`

## Goal
Replace NVA SA stubs with full, rule-correct effects for:
- `infiltrate` (Rally/March only, build-up vs takeover chooseOne, Trail and tunnel-marker handling)
- `bombard` (1-2 spaces, strict prerequisites, automatic troop removal)
- `ambushNva` (March/Attack coupling, one-guerilla activation, no attacker losses, LoC adjacency extension)

## Scope
- Implement full NVA SA rules in production FITL YAML without introducing NVA-specific runtime branches.
- Enforce Bombard prerequisite logic exactly (troop/base condition plus in/adjacent 3+ NVA troops condition).
- Route removed US troops from Bombard/Ambush to `casualties-US`.

## File list it expects to touch
- `data/games/fire-in-the-lake.md`
- `test/integration/fitl-nva-vc-special-activities.test.ts`
- `test/integration/fitl-removal-ordering.test.ts`
- `test/integration/fitl-coup-resources-phase.test.ts` (for casualty-box interactions)

## Out of scope
- VC SA implementation details.
- Changes to NVA core Rally/March/Attack operation semantics outside SA-specific hooks.
- Capability/momentum modifiers (for example Claymores/Rolling Thunder interactions).

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js`
- `node --test dist/test/integration/fitl-removal-ordering.test.js`
- `node --test dist/test/integration/fitl-coup-resources-phase.test.js`

## Invariants that must remain true
- Bombard is automatic (no die roll).
- NVA Ambush removes one enemy piece and does not remove NVA attackers in that SA resolution.
- Infiltrate takeover replacement uses available NVA counterpart sourcing rules and tunnel-marker flip behavior.
- SA execution does not spend Resources.

