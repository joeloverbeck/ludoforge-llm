# FITLEVECARENC-004: Tutorial Cards Batch 3 — Capability & Momentum Cards

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.1, Phase 1)
**Depends on**: FITLEVECARENC-001

## Description

Reassessed against current codebase architecture (global marker lattices for capabilities, typed momentum globals, and typed event-side `lastingEffects`/`eligibilityOverrides`), this ticket should encode two missing tutorial cards in `eventDecks[0].cards`:

| # | Title | Type | Key Effects |
|---|-------|------|-------------|
| 101 | Booby Traps | VC Capability | Unshaded: VC/NVA Ambush max 1 space; Shaded: Sweep Troop removal on die roll |
| 17 | Claymores | Momentum | Unshaded: Stay eligible, no Ambush until Coup, remove marching Guerrillas; Shaded: remove COIN Base + Underground Insurgent |

Both cards are currently missing from `eventDecks[0].cards` even though their downstream action-profile hooks (`cap_boobyTraps`, `mom_claymores`) already exist.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add card definitions for `card-101` and `card-17` to `eventDecks[0].cards`.
  Also add one event eligibility override window with `duration: "nextTurn"` so card-event `eligibilityOverrides` can express "Stay Eligible" correctly.
- `test/integration/fitl-events-tutorial-cap-momentum.test.ts` — **New file**. Integration tests for cards 101 and 17.

## Out of Scope

- Implementing capability effect resolution in the kernel (Spec 28 handles this).
- Implementing momentum/capability action-profile behavior in kernel pipelines (already present).
- Coup card encoding (#125).
- Gulf of Tonkin (#1).
- Any kernel/compiler changes.

## Encoding Guidance

### Booby Traps (#101) — VC Capability

- **Unshaded (pro-COIN)**: Set global marker lattice `cap_boobyTraps` to `unshaded` using `setGlobalMarker`. This maps to existing Ambush max-1 profile logic.
- **Shaded (pro-Insurgent)**: Set global marker lattice `cap_boobyTraps` to `shaded` using `setGlobalMarker`. This maps to existing Sweep troop-loss profile logic.
- **Tags**: `["capability", "VC"]`

### Claymores (#17) — Momentum

- **Unshaded**:
  - Create `lastingEffects` entry with `duration: "round"` (= until Coup).
  - Use setup/teardown effects to toggle `mom_claymores` (`true` on setup, `false` on teardown).
  - Add event-side `eligibilityOverrides` targeting `{ kind: "active" }` with a `nextTurn` window to encode "Stay Eligible."
- **Shaded**: Immediate effects — remove 1 COIN Base + 1 Underground Insurgent from a space with both.
- **Tags**: `["momentum"]`

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-tutorial-cap-momentum.test.ts`:
   - Card 101 (Booby Traps): compiles, `sideMode: "dual"`, `metadata.period === "1964"`, tags include `"capability"`. Unshaded effects include `setGlobalMarker` for `cap_boobyTraps` to `unshaded`. Shaded effects include `setGlobalMarker` for `cap_boobyTraps` to `shaded`.
   - Card 17 (Claymores): compiles, `sideMode: "dual"`, `metadata.period === "1964"`, tags include `"momentum"`. Unshaded has `lastingEffects` with `duration: "round"` and setup/teardown toggles for `mom_claymores`. Unshaded includes typed `eligibilityOverrides` for active faction remain-eligible behavior. Shaded has immediate piece-removal effects.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged.
- Capability marker IDs match global marker lattice IDs defined in production data (`cap_boobyTraps`).
- Momentum var IDs match existing global vars (`mom_claymores`).
- Momentum lasting effects use `duration: "round"` (maps to FITL's "until Coup").
- Production spec compiles without errors.

## Outcome

- **Completion date**: February 14, 2026
- **What changed**:
  - Added `card-101` (Booby Traps) and `card-17` (Claymores) to `eventDecks[0].cards` in `data/games/fire-in-the-lake.md`.
  - Encoded Booby Traps using `setGlobalMarker` on `cap_boobyTraps` (unshaded/shaded), aligned with current capability-marker architecture.
  - Encoded Claymores momentum as a `lastingEffects` entry with `duration: "round"` and setup/teardown `setVar` toggles for `mom_claymores`.
  - Added typed event `eligibilityOverrides` for Claymores unshaded (`target.kind: active`) and added `remain-eligible` override window with `duration: "nextTurn"` in turn-flow eligibility windows.
  - Added new integration coverage file `test/integration/fitl-events-tutorial-cap-momentum.test.ts`.
  - Strengthened `test/integration/fitl-production-data-compilation.test.ts` to assert the two new cards and the `remain-eligible` window.
- **Deviation from original plan**:
  - Replaced legacy `setVar capBoobyTraps` assumptions with the repository's current global marker lattice model (`cap_boobyTraps` + `setGlobalMarker`).
  - Expanded scope to include a `nextTurn` eligibility override window so "Stay Eligible" is representable in typed event data without kernel changes.
- **Verification results**:
  - `npm run build` ✅
  - `npm test` ✅
  - `npm run lint` ✅
