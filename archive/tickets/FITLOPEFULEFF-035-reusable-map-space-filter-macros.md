# FITLOPEFULEFF-035: Reusable Map-Space Filter Macros

**Status**: ✅ COMPLETED  
**Priority**: P2  
**Estimated effort**: Medium (3-5 hours)  
**Spec reference**: Spec 26 architecture hardening follow-up  
**Depends on**: FITLOPEFULEFF-034

## Summary

Protect and validate reusable map-space filter macro architecture in production `GameSpecDoc` YAML.

## Reassessed Assumptions (2026-02-14)

1. The core macro refactor described by this ticket is already present in `data/games/fire-in-the-lake.md`.
   - Shared macro definitions exist (`insurgent-march-select-destinations`, `insurgent-march-resolve-destination`, `insurgent-attack-removal-order`, `coin-assault-removal-order`, `per-province-city-cost`).
   - NVA/VC March and Attack profiles already invoke shared macros instead of duplicating large selector/effect blocks.
2. There is still residual duplication in `attack-nva-profile` and `attack-vc-profile` map-space selection filters (`select-spaces` stage), currently repeated with only faction differences.
3. Existing integration coverage strongly validates runtime behavior, but `test/integration/fitl-insurgent-operations.test.ts` does not explicitly assert macro usage/shape for insurgent March+Attack profiles.
4. `test/integration/fitl-coin-operations.test.ts` already contains substantial macro-structure assertions for COIN operations, so mandatory changes there are not currently required unless regressions are discovered.

## Scope Update

This ticket now focuses on finishing the remaining selector dedup plus guardrail tests:
- Add one shared macro for insurgent Attack map-space selection logic and route NVA/VC attack profiles through it.
- Keep existing shared-macro architecture for March/Removal-order logic.
- Add explicit integration assertions that insurgent profiles retain shared macro usage and key macro arguments.
- Re-run build/typecheck/lint/tests to confirm no regressions.

## Architecture Reassessment

The shared macro approach is more beneficial than reverting to inline duplicated selectors:
- It centralizes selector/filter semantics in game data, reducing drift risk between faction variants.
- It preserves engine agnosticism by keeping behavior in YAML assets rather than runtime branches.
- It is easier to extend (new factions/variants can reuse existing macro contracts).

## Files to Touch

- `data/games/fire-in-the-lake.md` (add shared insurgent attack selector macro; refactor NVA/VC attack select-spaces to call it)
- `test/integration/fitl-insurgent-operations.test.ts` (add structural assertions for insurgent macro usage)
- `tickets/FITLOPEFULEFF-035-reusable-map-space-filter-macros.md` (assumption/scope correction)

## Out of Scope

- New operation mechanics not already in Spec 26 scope
- Query model/type changes (ticket 034)

## Acceptance Criteria

### Tests That Must Pass
1. Insurgent March and Attack profiles continue to use shared macros for map-space selector/removal-order logic.
2. Key macro arguments for faction-specific behavior remain explicit and correct.
3. Existing insurgent operation runtime behavior remains unchanged.

### Invariants
- YAML refactors remain declarative and game-specific; engine/runtime stays generic.
- No alias behavior added; old duplicated paths are removed, not retained.
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)

## Outcome

- Completion date: February 14, 2026
- What changed:
  - Added `insurgent-attack-select-spaces` shared macro in `data/games/fire-in-the-lake.md`.
  - Refactored `attack-nva-profile` and `attack-vc-profile` to call this shared macro instead of duplicating inline map-space selector logic.
  - Added insurgent profile structure assertions in `test/integration/fitl-insurgent-operations.test.ts` for:
    - shared March macro usage (`insurgent-march-select-destinations`, `insurgent-march-resolve-destination`)
    - shared Attack selector/removal macro usage (`insurgent-attack-select-spaces`, `insurgent-attack-removal-order`)
    - absence of duplicated inline Attack selector blocks.
- Deviations from original plan:
  - Initial ticket draft assumed broad duplication remained; reassessment showed most macro dedup was already complete, with residual duplication isolated to Attack `select-spaces`.
  - `test/integration/fitl-coin-operations.test.ts` did not require changes after reassessment.
- Verification results:
  - `npm run build` passed.
  - `node --test "dist/test/integration/fitl-insurgent-operations.test.js"` passed.
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed.
