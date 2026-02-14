# ARCHDSL-003 - Standardized Removal Telemetry for Effects/Macros

**Status**: ✅ COMPLETED  
**Priority**: Medium  
**Depends on**: None

## 1) What needs to change / be added

Reassess the current architecture and eliminate repeated before/after recount scaffolding in FITL Body Count logic by using the existing generic removal telemetry surface already available in effect control flow.

### Assumptions check (updated)

- `removeByPriority` already exposes generic telemetry through `countBind` per group and `remainingBind` within the same effect pipeline stage.
- The runtime execution path for removal telemetry is `src/kernel/effects-control.ts` (not `src/kernel/effects-choice.ts`).
- Binder registration for removal telemetry already exists in `src/cnl/binder-surface-registry.ts`.
- FITL currently uses repeated guerrilla before/after recount in several Body Count call sites inside `data/games/fire-in-the-lake.md`.

### Required implementation changes

- Do **not** add a new engine effect primitive unless required by failing invariants.
- Thread Body Count through existing `removeByPriority` telemetry (`countBind`) by moving the +3 Aid calculation into the shared removal macro flow where group counts are already available.
- Replace repeated per-profile before/after guerrilla recount scaffolding with explicit `bodyCountEligible` wiring on `coin-assault-removal-order`.
- Keep compiler/runtime/kernel logic generic and game-agnostic.

### Expected files to touch (minimum)

- `data/games/fire-in-the-lake.md` (Body Count cleanup)
- `test/integration/fitl-momentum-formula-mods.test.ts`
- `test/integration/fitl-removal-ordering.test.ts`

## 2) Invariants that should pass

- Telemetry contract is generic and reusable across games.
- Telemetry values used by Body Count are deterministic and match actual removals.
- No new game-specific branching in kernel/compiler.
- No additional per-removal heavy payloads (for example removed token-id lists) unless explicitly justified by tests/invariants.

## 3) Tests that should pass

### New/updated unit tests

- Existing `removeByPriority` telemetry unit coverage remains valid (no kernel runtime changes required).

### New/updated integration tests

- `test/integration/fitl-momentum-formula-mods.test.ts`
  - Body Count aid wiring uses telemetry-driven removed-guerrilla counts (no local before/after recount scaffolding in affected paths).
- `test/integration/fitl-removal-ordering.test.ts`
  - confirms removal ordering contracts, explicit Body Count eligibility plumbing, and no actor-faction threading regressions.

### Full-suite gates

- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- **Completion date**: 2026-02-14
- **What changed**
  - Refactored FITL removal macros in `data/games/fire-in-the-lake.md`:
    - added explicit `bodyCountEligible` param to `piece-removal-ordering` and `coin-assault-removal-order`.
    - computed Body Count Aid from `removeByPriority` guerrilla group `countBind` values inside the shared removal flow.
    - removed repeated call-site `bodyCountGuerrillasBefore` recount scaffolding.
    - removed obsolete `mom-body-count-award-aid` macro.
  - Updated integration tests:
    - `test/integration/fitl-momentum-formula-mods.test.ts`
    - `test/integration/fitl-removal-ordering.test.ts`
- **Deviations from original plan**
  - No kernel/compiler changes were necessary; the implementation stayed in game data + integration tests by leveraging existing generic telemetry.
- **Verification**
  - `npm run build` passed.
  - `npm run lint` passed.
  - Targeted tests passed:
    - `node --test dist/test/integration/fitl-momentum-formula-mods.test.js`
    - `node --test dist/test/integration/fitl-removal-ordering.test.js`
    - `node --test dist/test/unit/effects-control-flow.test.js`
    - `node --test dist/test/unit/binder-surface-registry.test.js`
  - Full suite `npm test` passed.
