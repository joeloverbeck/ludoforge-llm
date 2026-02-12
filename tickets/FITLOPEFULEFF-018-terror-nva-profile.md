# FITLOPEFULEFF-018: Terror NVA Profile

**Status**: Pending
**Priority**: P1
**Estimated effort**: Medium (3-4 hours)
**Spec reference**: Spec 26, Task 26.10 — `terror-nva-profile` (Rule 3.3.4, NVA variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002 (`per-province-city-cost`), FITLOPEFULEFF-003

## Summary

Replace the stub `terror-profile` (insurgent side) with a faction-specific `terror-nva-profile` implementing the full NVA Terror operation per FITL Rule 3.3.4.

Key behaviors:
- **Space filter**: Spaces with NVA Underground Guerrilla OR NVA Troops (NVA can Terror with Troops alone)
- **Cost**: 1 NVA Resource per Province/City (0 for LoCs)
- **Activation**: Activate 1 Underground NVA Guerrilla (if any present — Troops-only spaces don't activate)
- **LoC**: Place Sabotage marker (if not already present, marker supply < 15)
- **Province/City**: Place Terror marker + shift Support toward **Neutral** (NOT Opposition — NVA shifts toward Neutral only)
- **Marker supply**: 15-marker shared limit (terrorSabotageMarkersPlaced)
- **LimOp-aware**: Max 1 space

## Files to Touch

- `test/fixtures/cnl/compiler/fitl-operations-insurgent.md` — Replace `terror-profile` stub with `terror-nva-profile` YAML
- `data/games/fire-in-the-lake.md` — Add `terror-nva-profile` operation profile
- `test/integration/fitl-insurgent-operations.test.ts` — Update profile ID, add test cases

## Out of Scope

- `terror-vc-profile` (separate ticket FITLOPEFULEFF-019)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `terror-nva-profile` compiles without diagnostics
2. Space filter: accepts spaces with NVA Underground Guerrilla
3. Space filter: accepts spaces with NVA Troops only (no guerrilla required)
4. Cost: 1 NVA Resource per Province/City, 0 for LoC (via `per-province-city-cost`)
5. Activation: 1 Underground NVA Guerrilla set to Active (limit 1)
6. No activation error when space has only Troops (no guerrillas to activate)
7. LoC: Sabotage marker placed (if not already present)
8. Province/City: Terror marker placed (if not already present)
9. NVA Terror shifts Support toward Neutral (NOT toward Opposition)
10. NVA Terror does NOT shift if space already Neutral or has Opposition
11. Terror/Sabotage marker idempotent: no marker on already-marked space
12. Marker supply limit: stops at 15 (`terrorSabotageMarkersPlaced < 15`)
13. Free operation: per-Province/City cost skipped
14. LimOp variant: max 1 space

### Invariants
- No kernel source files modified
- No compiler source files modified
- `per-province-city-cost` macro unchanged
- NVA Terror shift is toward Neutral, NOT toward Active Opposition (critical distinction from VC)
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
