# FITLSPEACTFULEFF-005 - VC Special Activities: Tax, Subvert, VC Ambush

**Status**: ✅ COMPLETED  
**Spec**: `specs/27-fitl-special-activities-full-effects.md` (Tasks 27.10-27.12)  
**Reference**: `brainstorming/implementing-fire-in-the-lake-game-spec-doc.md` (derived values and action-pipeline integration)  
**Depends on**: `archive/tickets/FITLSPEACTFULEFF-001-shared-sa-contracts-zero-cost-and-accompanying-op-constraints.md`, `archive/tickets/FITLSPEACTFULEFF-004-nva-special-activities-infiltrate-bombard-ambush.md`

## Reassessed assumptions (current codebase)
- VC SA pipelines in `data/games/fire-in-the-lake.md` are still stubs:
  - `tax-profile` only increments `taxCount` and incorrectly caps at 2 spaces.
  - `subvert-profile` only increments `subvertCount` and incorrectly caps at 1 space.
  - `vc-ambush-profile` only increments `vcAmbushCount` and incorrectly enforces exactly 1 space.
- `test/integration/fitl-nva-vc-special-activities.test.ts` currently has behavior coverage for NVA SAs, but VC SA coverage only checks profile presence metadata.
- `test/integration/fitl-derived-values.test.ts` and `test/integration/fitl-coup-victory.test.ts` do not currently validate VC SA execution semantics; requiring them here is not a ticket-fidelity fit.

## Goal
Replace VC SA stubs with full, rule-correct effects for:
- `tax` (up to 4 spaces, underground VC + no COIN control, Econ or 2xPop resource gain, support shift)
- `subvert` (Rally/March/Terror only, remove-2 vs replace-1 chooseOne, patronage drop by removed/replaced ARVN cubes)
- `ambushVc` (VC equivalent of NVA Ambush, including LoC adjacency behavior)

## Scope
- Implement VC SA targeting and resolution logic in production FITL YAML.
- Encode Subvert prerequisites and patronage penalty arithmetic in data-driven effects.
- Ensure VC Ambush follows corrected no-flip-back/no-attacker-loss behavior and mirrors NVA Ambush structure using shared ambush macros.
- Strengthen integration tests to assert VC SA behavior and invariants (not only profile existence).
- Keep production FITL spec parseable under parser safety limits after SA expansion (adjust parser default block-size ceiling if needed).

## File list it expects to touch
- `data/games/fire-in-the-lake.md`
- `test/integration/fitl-nva-vc-special-activities.test.ts`
- `src/cnl/parser.ts` (only if YAML block-size ceiling blocks production-spec parsing)
- `test/unit/parser.test.ts` (only if parser default-limit behavior requires explicit regression coverage)

## Out of scope
- NVA SA implementation details.
- Base-game Terror operation semantics except where Subvert coupling requires legality linkage.
- Any event-card capability/momentum effects on VC SAs.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`

## Invariants that must remain true
- Tax uses LoC Econ or 2x Population exactly as specified.
- Subvert requires ARVN cubes in selected spaces and never removes ARVN bases.
- Patronage delta is deterministic and rounded down per rule.
- SA execution does not spend Resources.
- VC Ambush activates exactly one Underground VC Guerrilla per selected space and never inflicts attacker attrition.

## Outcome
- Completion date: 2026-02-14
- Actually changed:
  - Replaced VC SA stubs in `data/games/fire-in-the-lake.md` with full `tax`, `subvert`, and `ambushVc` pipelines.
  - Refactored NVA/VC Ambush into shared reusable macros (`insurgent-ambush-select-spaces`, `insurgent-ambush-resolve-spaces`) and standardized canonical ambush decision bindings (`$ambushTargetMode@{space}`, `$ambushAdjacentTargets@{space}`) for both factions.
  - Added VC behavior integration coverage in `test/integration/fitl-nva-vc-special-activities.test.ts` for Tax formula/support shift, Subvert mode behavior + rounded patronage penalty, and VC Ambush LoC-adjacent/no-attrition behavior.
  - Increased parser default YAML block-size limit in `src/cnl/parser.ts` and added regression coverage in `test/unit/parser.test.ts` so the expanded production FITL spec remains parseable.
- Deviations from original plan:
  - Added parser-limit hardening work because the expanded production YAML exceeded the prior default block-size ceiling and caused unrelated integration suites to fail.
- Verification results:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js` passed.
  - `node --test dist/test/integration/fitl-card-flow-determinism.test.js` passed.
  - `node --test dist/test/unit/parser.test.js` passed.
  - `npm run test` passed.
