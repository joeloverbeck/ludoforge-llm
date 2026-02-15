# FITLEVECARENC-013: 1968 Period — NVA-First Faction Order Cards

**Status**: ✅ COMPLETED
**Priority**: P3
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.4, Phase 4)
**Depends on**: archive/tickets/FITLEVECARENC-001-upgrade-existing-cards-metadata.md

## Description

Encode the 1968 period cards where NVA is the first faction in the order:

| # | Title | Faction Order | Complexity | Notes |
|---|-------|---------------|------------|-------|
| 32 | Long Range Guns | NVA, US, ARVN, VC | Medium | NVA Capability |
| 33 | MiGs | NVA, US, ARVN, VC | Medium | NVA Capability; interacts with Top Gun |
| 35 | Thanh Hoa | NVA, US, ARVN, VC | Medium | Trail math |
| 36 | Hamburger Hill | NVA, US, VC, ARVN | Medium | Troop movement + Tunnel |
| 37 | Khe Sanh | NVA, US, VC, ARVN | Medium | Mass removal + Casualties |
| 40 | PoWs | NVA, US, VC, ARVN | Low | Casualties movement |
| 41 | Bombing Pause | NVA, ARVN, US, VC | Medium | Momentum (unshaded) |
| 42 | Chou En Lai | NVA, ARVN, US, VC | Medium | Resource changes + die roll |
| 45 | PT-76 | NVA, ARVN, US, VC | Medium | NVA Capability |
| 49 | Russian Arms | NVA, ARVN, VC, US | Medium | Piece placement |
| 52 | RAND | NVA, VC, US, ARVN | Medium | Flip capability side |
| 54 | Son Tay | NVA, VC, US, ARVN | Medium | Eligibility changes |
| 57 | International Unrest | NVA, VC, ARVN, US | Low | Casualties + die roll |
| 58 | Pathet Lao | NVA, VC, ARVN, US | Medium | Conditional Trail/Redeploy |
| 60 | War Photographer | NVA, VC, ARVN, US | Low | Pieces from out-of-play |

15 cards total.

## Reassessed Assumptions (2026-02-15)

1. None of the 15 target cards (`32, 33, 35, 36, 37, 40, 41, 42, 45, 49, 52, 54, 57, 58, 60`) are currently encoded in `data/games/fire-in-the-lake.md`.
2. Existing 1968 coverage is currently US-first only (`test/integration/fitl-events-1968-us.test.ts`), so this ticket should add a new NVA-first test file rather than modifying existing period tests.
3. Capability effects in the current architecture compile to `setGlobalMarker` via `set-global-marker` macros, not raw `setVar` toggles. Required marker lattices already exist: `cap_longRangeGuns`, `cap_migs`, and `cap_pt76`.
4. Momentum effects are encoded as `lastingEffects` with `duration: round`; `mom_bombingPause` already exists and is consumed by operation-profile gating.
5. Card 52 (`RAND`) requires flipping an already-active capability side chosen at runtime; this required adding a generic marker-selection + marker-flip primitive path in the kernel/compiler.
6. Scope includes focused generic kernel/compiler/schema/test updates required to support data-driven capability flipping without game-specific handlers.

## Architecture Rationale

- Implementing cards 32/33/45 as canonical capability marker toggles is high-value and architecture-aligned because runtime branches already consume those markers.
- Implementing card 41 momentum as a round-lasting toggle is high-value and architecture-aligned because runtime logic already reads `mom_bombingPause`.
- Keeping non-capability, non-momentum cards text-first where behavior is currently unclear avoids speculative mechanics and preserves kernel genericity.
- Implementing card 52 with a new generic query/effect pair is cleaner than adding per-game alias paths or hardcoded handlers.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 15 card definitions.
- `test/integration/fitl-events-1968-nva.test.ts` — **New file**. Integration tests.
- `src/kernel/types-ast.ts` — Add `globalMarkers` query + `flipGlobalMarker` effect contracts.
- `src/kernel/schemas-ast.ts` — Mirror new query/effect schema shapes.
- `src/cnl/compile-conditions.ts` — Lower `globalMarkers` queries.
- `src/cnl/compile-effects.ts` — Lower `flipGlobalMarker` effects.
- `src/kernel/eval-query.ts` — Evaluate `globalMarkers` domains against current marker state.
- `src/kernel/effects-choice.ts` — Execute `flipGlobalMarker`.
- `src/kernel/effect-dispatch.ts` — Dispatch `flipGlobalMarker`.
- `src/kernel/validate-gamedef-behavior.ts` — Validate new query/effect references and state literals.
- `src/cnl/effect-kind-registry.ts`, `src/cnl/binder-surface-registry.ts` — Register new effect kind.
- `test/unit/effects-choice.test.ts`, `test/unit/effects-lifecycle.test.ts`, `test/unit/compile-effects.test.ts`, `test/unit/schemas-ast.test.ts`, `test/unit/types-exhaustive.test.ts` — Unit coverage for the new primitives.

## Out of Scope

- Other period/faction group cards.
- Full behavioral encoding for non-capability/non-momentum cards in this batch where mechanics remain intentionally text-first.

## Encoding Notes

- **Capabilities** (32, 33, 45): Tags `["capability", "NVA"]` with both sides implemented using `set-global-marker` (`cap_longRangeGuns`, `cap_migs`, `cap_pt76`).
- **Momentum** (41 unshaded): `lastingEffects` with `duration: "round"`.
- **Card 33 (MiGs)**: Interacts with Top Gun (card 4) through existing runtime marker checks (`cap_migs` / `cap_topGun`).
- **Card 52 (RAND)**: Uses generic `chooseOne` over `globalMarkers` (filtered to `unshaded|shaded`) followed by `flipGlobalMarker`.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1968-nva.test.ts`:
   - All 15 cards compile, correct metadata, faction orders.
   - Capability cards (32, 33, 45): correct `setGlobalMarker` on both sides, correct tags.
   - Card 41: unshaded momentum `lastingEffects` with `duration: round` and `mom_bombingPause` setup/teardown.
   - Card 52: generic marker-selection + marker-flip structure is present on both sides.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged. Card IDs unique. Faction orders valid.
- Production spec compiles without errors.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Added 15 missing 1968 NVA-first cards (`32, 33, 35, 36, 37, 40, 41, 42, 45, 49, 52, 54, 57, 58, 60`) to `data/games/fire-in-the-lake.md` with dual-side payloads, metadata (`period`, `factionOrder`, `flavorText`), and side text.
  - Implemented all NVA capability cards in this batch (cards `32, 33, 45`) for both sides using canonical `set-global-marker` effects (`cap_longRangeGuns`, `cap_migs`, `cap_pt76`).
  - Implemented card `41` unshaded momentum with `lastingEffects` (`duration: round`) and `mom_bombingPause` setup/teardown toggles.
  - Implemented card `52` (`RAND`) with generic marker-side flipping on both sides:
    - `chooseOne` over `globalMarkers` filtered to active capability-side states (`unshaded`, `shaded`),
    - `flipGlobalMarker` to toggle selected marker between `unshaded` and `shaded`.
  - Added generic architecture support for data-driven global marker flipping:
    - query: `globalMarkers`,
    - effect: `flipGlobalMarker`,
    - compiler lowering, schema support, behavior validation, runtime evaluation/execution, and dispatch wiring.
  - Added/updated tests to cover new primitives and RAND integration (`test/integration/fitl-events-1968-nva.test.ts` plus unit suites for schema/lowering/runtime/exhaustive unions).
- **Deviation from original plan**:
  - Instead of deferring card `52`, this ticket introduced a small generic kernel/compiler extension so RAND can be fully encoded without game-specific branches.
  - Non-capability/non-momentum cards (outside RAND) remain text-first where behavior-specific mechanics were not yet encoded in this ticket.
- **Verification**:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
