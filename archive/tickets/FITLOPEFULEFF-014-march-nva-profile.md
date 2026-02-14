# FITLOPEFULEFF-014: March NVA Profile

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Medium (4-5 hours)
**Spec reference**: Spec 26, Task 26.8 — `march-nva-profile` (Rule 3.3.2, NVA variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002 (`per-province-city-cost`), FITLOPEFULEFF-003

## Summary

Replace the stub `march-profile` (insurgent side) with a faction-specific `march-nva-profile` implementing the full NVA March operation per FITL Rule 3.3.2.

Key behaviors:
- **Cost**: 1 NVA Resource per Province/City entered (0 for LoCs)
- **Movement**: NVA pieces (guerrillas + troops) from adjacent spaces into destinations
- **Activation condition**: If (destination is LoC OR has Support) AND (moving pieces + COIN pieces at destination > 3) → activate all guerrillas in moving group
- **NVA Trail chain**: NVA can continue moving through Laos/Cambodia if Trail > 0 and not LimOp (complex multi-hop — may require sequential destination selections)
- **LimOp-aware**: Max 1 destination

This is the most complex March profile due to the Trail chain mechanic. The spec notes that full chain logic may need to be modeled as sequential destination selections within the same operation.

## Assumption Reassessment (2026-02-14)

Validated against current code and tests:

- `data/games/fire-in-the-lake.md` still contains legacy stub `march-profile` using shared `insurgentResources`/`marchCount`; this is a real gap and must be replaced for NVA.
- Runtime binding injection for `__actionClass` and `__freeOperation` already exists in kernel (`src/kernel/apply-move.ts`, `src/kernel/legal-choices.ts`). No kernel/compiler changes are required for LimOp handling in this ticket.
- Follow-up architecture review identified a kernel limitation in sequential choice validation (`legalChoices` evaluated later choices against pre-effect state). This ticket was expanded to include a kernel-level fix so chained movement choices can be validated generically across games.
- `per-province-city-cost` macro exists and is already used elsewhere; this ticket should consume it, not modify it.
- Integration coverage currently validates profile compilation plus Rally/Attack behavior, but does not validate NVA March rule semantics (cost by destination type, movement from adjacency, activation condition, LimOp max-one, free-op cost skip).

Ticket scope was expanded accordingly: implement `march-nva-profile` in production spec, add focused March integration tests, implement Trail-chain continuation stages, and fix kernel sequential-choice validation.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Replace stub in production spec with `march-nva-profile` YAML
- `test/integration/fitl-insurgent-operations.test.ts` — Update profile ID, add test cases

## Out of Scope

- `march-vc-profile` (separate ticket FITLOPEFULEFF-015)
- Full NVA Trail chain multi-hop beyond destination-sequence modeling
- Capability/momentum modifiers (Spec 28)
- Turn flow changes

## Acceptance Criteria

### Tests That Must Pass
1. `march-nva-profile` compiles without diagnostics
2. Cost: 1 NVA Resource per Province/City (via `per-province-city-cost` macro)
3. Cost: 0 for LoC destinations
4. NVA pieces move from adjacent spaces into destination
5. Activation condition: (LoC or Support) AND (moving + COIN > 3) → guerrillas activated
6. Activation: guerrillas in moving group set to `active`
7. No activation when condition not met (e.g., Province without Support and pieces <= 3)
8. Free operation: per-Province/City cost skipped, LoC still free
9. LimOp variant: max 1 destination

### Invariants
- No compiler source files modified
- `per-province-city-cost` macro unchanged
- No backward-compatibility aliasing (`march-profile` must be replaced by canonical `march-nva-profile`)
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

- **Completion date**: 2026-02-14
- **Actually changed**:
  - Replaced legacy `march-profile` with canonical `march-nva-profile` in `data/games/fire-in-the-lake.md`.
  - Implemented LimOp-aware destination selection (`max: 1` for `limitedOperation`), adjacency-based NVA movement (guerrillas + troops), per-destination resource charging via existing `per-province-city-cost`, Trail=4 Laos/Cambodia free movement, activation check/behavior for moved NVA guerrillas, and Trail-chain continuation selection/resolution through Laos/Cambodia when `trail > 0` and not LimOp.
  - Implemented kernel fix in `src/kernel/legal-choices.ts` to validate sequential dependent choices against progressed state (state/rng advancement during effect-walk), enabling generic chained-choice modeling without game-specific engine branches.
  - Updated `test/integration/fitl-insurgent-operations.test.ts` to assert `march-nva-profile` presence and added targeted NVA March integration coverage (cost rules, adjacency movement, activation positive/negative cases, free-op cost skip, LimOp cap, Trail-chain enable/disable, Trail=4 free movement).
  - Added kernel regression coverage in `test/unit/kernel/legal-choices.test.ts` for sequential dependent choice validation across progressed state.
- **Deviations from original plan**:
  - Kernel source changes were introduced because the original non-progressive choice validation could not robustly support chained movement architecture.
  - To avoid token-shape coupling, movement selection uses separate guerrilla/troop bindings instead of a single mixed list.
- **Verification results**:
  - `npm run build` ✅
  - `npm run typecheck` ✅
  - `npm run lint` ✅
  - `npm test` ✅
