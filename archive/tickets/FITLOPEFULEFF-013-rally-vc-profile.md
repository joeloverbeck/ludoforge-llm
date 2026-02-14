# FITLOPEFULEFF-013: Rally VC Profile

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Small (2-3 hours)
**Spec reference**: Spec 26, Task 26.7 — `rally-vc-profile` (Rule 3.3.1, VC variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002, FITLOPEFULEFF-003, FITLOPEFULEFF-012

## Summary

Add `rally-vc-profile` implementing VC Rally (Rule 3.3.1 VC variant) as a second faction-specific Rally pipeline alongside `rally-nva-profile`.

## Reassessed Baseline (Current Code Reality)

- `rally-nva-profile` is already implemented in `data/games/fire-in-the-lake.md`; Rally is no longer a shared insurgent stub.
- The production spec currently has only one Rally pipeline (`rally-nva-profile`), so VC cannot legally execute Rally under strict applicability dispatch.
- `test/integration/fitl-insurgent-operations.test.ts` currently validates Rally behavior only for NVA assumptions.
- Kernel prerequisites required for this ticket are already present (`__actionClass` and `__freeOperation` bindings, strict pipeline dispatch, marker-state zone binding resolution from FITLOPEFULEFF-012).

## Architecture Assessment

Adding `rally-vc-profile` is more beneficial than retaining single-faction Rally coverage because it:
- Completes Spec 26’s faction-specific operation architecture with explicit applicability-based dispatch.
- Removes implicit NVA coupling from Rally action behavior and keeps VC behavior fully data-driven in GameSpecDoc YAML.
- Avoids kernel branching or compatibility aliases while preserving clean separation of faction rules.

No architecture-level kernel/compiler changes are required for this ticket if VC Rally is expressed through existing generic operations/effects.

## Key Behaviors to Implement

- **Space filter**: Provinces or Cities without Support (same as NVA Rally).
- **Cost**: 1 VC Resource per selected space.
- **Without VC Base**: Choose one of:
  - Place 1 VC Guerrilla, OR
  - Replace 2 VC Guerrillas with 1 VC Base (requires base stacking room `< 2`).
- **With VC Base**: Choose one of:
  - Place VC Guerrillas up to `population + vcBaseCount`, OR
  - Flip all Active VC Guerrillas in space to Underground.
- **No Trail improvement stage** for VC Rally.
- **LimOp-aware**: max 1 selected space, min 0.
- **Free operation**: skip only per-space Rally cost.

## Files to Touch

- `data/games/fire-in-the-lake.md`
  - Add `rally-vc-profile` (actionId `rally`) with VC-only applicability and canonical Rule 3.3.1 VC behavior.
- `test/integration/fitl-insurgent-operations.test.ts`
  - Update profile-compilation expectations for Rally.
  - Add/extend VC Rally integration coverage for legality, space filter, cost, no-base/with-base branches, free-op cost skip, and LimOp constraints.

## Out of Scope

- `rally-nva-profile` behavior changes (except minimal compatibility-safe test expectation updates where Rally now has two profiles).
- Capability/momentum modifiers (Spec 28).
- Turn flow changes.
- Kernel/compiler source code changes.

## Acceptance Criteria

### Tests That Must Pass
1. `rally-vc-profile` compiles without diagnostics.
2. `rally-vc-profile` dispatches only when active player is VC.
3. NVA Rally behavior remains unchanged and still dispatches for NVA.
4. VC Rally space filter excludes `passiveSupport`/`activeSupport` and includes neutral/opposition spaces.
5. VC Rally spends 1 `vcResources` per selected space when not free.
6. Free operation skips VC per-space Rally cost.
7. Without VC Base: mutually exclusive place-guerrilla / replace-with-base paths behave correctly.
8. Base replacement requires at least 2 VC guerrillas and base stacking room (`< 2` total bases).
9. With VC Base: `place-guerrillas` limit equals `population + vcBaseCount`.
10. With VC Base: `flip-underground` flips all active VC guerrillas in selected space.
11. VC Rally has no Trail-improvement behavior (trail/resources unchanged except per-space Rally spend).
12. LimOp variant enforces max 1 selected space (min 0).

### Invariants

- No kernel source files modified.
- No compiler source files modified.
- Base stacking enforcement remains generic and unchanged.
- Build passes (`npm run build`).
- Typecheck passes (`npm run typecheck`).
- Lint passes (`npm run lint`).

## Outcome

- Completion date: 2026-02-14
- Actually changed:
  - Added canonical `rally-vc-profile` to `data/games/fire-in-the-lake.md` with VC-only applicability, Rally space filter parity with NVA, VC per-space costs, no-base replacement/place branches, with-base place/flip branches, and no Trail-improvement stage.
  - Updated `test/integration/fitl-insurgent-operations.test.ts` to include dual Rally profile compilation expectations and new VC Rally integration coverage (dispatch, filter, free-op behavior, LimOp max constraint, no-base replacement, with-base place/flip).
  - Updated Rally illegality coverage to reflect strict dispatch semantics now that Rally has both NVA and VC profiles.
- Deviations from original plan:
  - The original wording implied replacing a Rally stub; implementation instead added a second Rally pipeline beside existing `rally-nva-profile`, matching current architecture.
- Verification:
  - `npm run build` passed
  - `node --test dist/test/integration/fitl-insurgent-operations.test.js` passed
  - `npm run typecheck` passed
  - `npm run lint` passed
  - `npm test` passed
