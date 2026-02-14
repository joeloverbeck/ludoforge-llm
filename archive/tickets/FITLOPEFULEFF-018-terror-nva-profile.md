# FITLOPEFULEFF-018: Terror NVA Profile

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Medium (3-4 hours)
**Spec reference**: Spec 26, Task 26.10 — `terror-nva-profile` (Rule 3.3.4, NVA variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002 (`per-province-city-cost`), FITLOPEFULEFF-003

## Reassessed Baseline (2026-02-14)

Validated against current repository state:
- `data/games/fire-in-the-lake.md` still contains legacy stub `terror-profile` using `insurgentResources` and `terrorCount`.
- The shared FITL marker lattice already uses `terrorSabotageMarkersPlaced` and faction resources (`nvaResources`, `vcResources`), so the stub wiring is architecturally inconsistent.
- `test/integration/fitl-insurgent-operations.test.ts` currently asserts `terror-profile` exists and has no behavioral Terror coverage.
- Compiler derivation from `dataAssets` currently surfaces `mapSpaces` but does not propagate map `markerLattices` into compiled `GameDef`, which makes any `setMarker`/`shiftMarker` operation runtime-fail even with valid YAML.

Ticket correction:
- This ticket must **replace** the legacy `terror-profile` with canonical `terror-nva-profile` (no alias/backward-compat profile retained).
- This ticket must remove now-dead legacy Terror globals from the production spec (`insurgentResources`, `terrorCount`) if no longer referenced after replacement.
- This ticket must add NVA Terror behavioral integration tests, not just compile/profile-id checks.
- This ticket must include a **generic compiler derivation fix** so map `markerLattices` from `GameSpecDoc` data assets are carried into `GameDef` (engine-agnostic; no FITL-specific code paths).

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

- `data/games/fire-in-the-lake.md` — Replace stub with canonical `terror-nva-profile`; remove dead Terror stub globals (`insurgentResources`, `terrorCount`) after migration
- `test/integration/fitl-insurgent-operations.test.ts` — Update profile ID assertion and add NVA Terror behavior tests (cost, activation, marker placement, support shift, marker supply, LimOp)
- `src/cnl/compile-data-assets.ts` — Derive marker lattices from selected map data asset (generic)
- `src/cnl/compiler-core.ts` — Include derived marker lattices in compiled `GameDef` (generic)

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
15. Legacy stub globals removed from production spec with no remaining references (`insurgentResources`, `terrorCount`)

### Invariants
- No kernel source files modified
- Compiler changes, if any, remain generic data-asset derivation only (no game-specific logic)
- `per-province-city-cost` macro unchanged
- NVA Terror shift is toward Neutral, NOT toward Active Opposition (critical distinction from VC)
- No backward-compatibility alias profile retained (`terror-profile` removed)
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

- **Completion date**: 2026-02-14
- **Implemented changes**:
  - Replaced legacy `terror-profile` with faction-specific `terror-nva-profile` in `data/games/fire-in-the-lake.md`.
  - Added full NVA Terror behavior (Troops-or-Underground targeting, Province/City cost vs LoC free, single-guerrilla activation, Terror/Sabotage marker placement, Support shift toward Neutral, marker-cap/idempotency handling, LimOp max-1).
  - Removed dead Terror stub globals from production spec (`insurgentResources`, `terrorCount`).
  - Added/updated integration tests in `test/integration/fitl-insurgent-operations.test.ts`.
  - Added generic compiler derivation support for map `markerLattices` (`src/cnl/compile-data-assets.ts`, `src/cnl/compiler-core.ts`) and coverage in `test/integration/compile-pipeline.test.ts`.
- **Deviation from original plan**:
  - Included a scoped generic compiler fix not in the original ticket draft because NVA Terror marker effects were impossible at runtime without derived marker lattices in `GameDef`.
- **Verification**:
  - `npm run build` passed
  - `npm run typecheck` passed
  - `npm run lint` passed
  - `npm test` passed
