# FITLOPEFULEFF-014: March NVA Profile

**Status**: Pending
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

## Files to Touch

- `test/fixtures/cnl/compiler/fitl-operations-insurgent.md` — Replace `march-profile` stub with `march-nva-profile` YAML
- `data/games/fire-in-the-lake.md` — Add `march-nva-profile` operation profile
- `test/integration/fitl-insurgent-operations.test.ts` — Update profile ID, add test cases

## Out of Scope

- `march-vc-profile` (separate ticket FITLOPEFULEFF-015)
- Full NVA Trail chain multi-hop (may be deferred to a follow-up if too complex for YAML-only modeling; document the limitation)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

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
- No kernel source files modified
- No compiler source files modified
- `per-province-city-cost` macro unchanged
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
