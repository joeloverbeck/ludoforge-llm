# FITLSPEACTFULEFF-004 - NVA Special Activities: Infiltrate, Bombard, NVA Ambush

**Status**: ✅ COMPLETED  
**Spec**: `specs/27-fitl-special-activities-full-effects.md` (Tasks 27.7-27.9)  
**Reference**: `brainstorming/implementing-fire-in-the-lake-game-spec-doc.md` (piece sourcing, casualties, and operation profile constraints)  
**Depends on**: `FITLSPEACTFULEFF-001`

## Goal
Replace NVA SA stubs with full, rule-correct effects for:
- `infiltrate` (Rally/March only, build-up vs takeover chooseOne, Trail and tunnel-marker handling)
- `bombard` (1-2 spaces, strict prerequisites, automatic troop removal)
- `ambushNva` (March/Attack accompanying-op constraints, one-guerrilla activation, no attacker losses)

## Assumption Reassessment (2026-02-14)
- The production spec currently has **stub** NVA SA profiles (`infiltrate`, `bombard`, `ambushNva`) that only increment telemetry counters.
- Existing `test/integration/fitl-nva-vc-special-activities.test.ts` primarily validates profile presence/wiring and accompanying-op gate checks, not full NVA SA rule effects.
- `test/integration/fitl-coup-resources-phase.test.ts` is a standalone fixture test and does not directly verify production FITL SA casualty routing.
- Compound operation/SA constraints currently support accompanying-op allowlists and `disjoint` param constraints. They do not currently encode richer relations like "SA targets must be a subset of operation-paid targets".

## Scope
- Implement full NVA SA rules in production FITL YAML without introducing NVA-specific runtime branches.
- Enforce Bombard prerequisite logic exactly (troop/base condition plus in/adjacent 3+ NVA troops condition).
- Route removed US troops from Bombard to `casualties-US:none`.
- Model NVA Ambush as automatic insurgent removal with one-guerrilla activation and **no insurgent attrition during SA resolution**.

## File list expected to touch
- `data/games/fire-in-the-lake.md`
- `test/integration/fitl-nva-vc-special-activities.test.ts`
- `test/integration/fitl-removal-ordering.test.ts` (only if shared removal macro contracts need tightening)

## Out of scope
- VC SA implementation details.
- Changes to NVA core Rally/March/Attack operation semantics outside SA-specific hooks.
- Capability/momentum modifiers (for example Claymores/Rolling Thunder interactions).
- New kernel semantics for richer compound-op/SA relational constraints (for example subset/cost-coupling predicates).

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js`
- `node --test dist/test/integration/fitl-removal-ordering.test.js`
- `npm run lint`

## Invariants that must remain true
- Bombard is automatic (no die roll).
- NVA Ambush removes one enemy piece and does not remove NVA attackers in that SA resolution.
- Infiltrate takeover replacement uses available NVA counterpart sourcing rules and tunnel-marker flip behavior.
- SA execution does not spend Resources.

## Outcome
- Completion date: 2026-02-14
- Implemented:
  - Replaced NVA SA stubs in `data/games/fire-in-the-lake.md` with full action pipelines for `infiltrate`, `bombard`, and `ambushNva`.
  - Added shared ambush-removal macro and integrated casualty routing (`US -> casualties-US:none`, `ARVN -> available-ARVN:none`).
  - Reworked `test/integration/fitl-nva-vc-special-activities.test.ts` from wiring-only assertions into behavioral coverage for NVA SA rules and constraints.
- Deviations from original plan:
  - `test/integration/fitl-coup-resources-phase.test.ts` was not changed because it is a standalone fixture unrelated to production FITL SA execution.
  - Bombard adjacent-NVA prerequisite uses available query primitives (`tokensInAdjacentZones`) and cannot encode per-adjacent-space cardinality as a first-class declarative constraint in current YAML condition/query operators.
  - March/Attack cost-coupling subset semantics for Ambush targeting remain out of scope due current compound constraint relation limits.
- Verification:
  - `npm run build`
  - `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js`
  - `node --test dist/test/integration/fitl-removal-ordering.test.js`
  - `npm run lint`
