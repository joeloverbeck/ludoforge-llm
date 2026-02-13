# FITLOPEFULEFF-010: Assault US Profile

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Medium (3-4 hours)
**Spec reference**: Spec 26, Task 26.6 — `assault-us-profile` (Rule 3.2.4, US variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002 (`coin-assault-removal-order`), FITLOPEFULEFF-003

## Summary

Replace the transitional stubbed `assault-us-profile` implementation with canonical US Assault behavior per FITL Rule 3.2.4.

Current repository reality (reassessed):
- `assault-us-profile` and `assault-arvn-profile` both exist but are still stubbed and tied to transitional globals (`coinResources`, `assaultCount`).
- `coin-assault-removal-order` already exists and currently requires `actorFaction` in args.
- `test/integration/fitl-coin-operations.test.ts` still contains a runtime assertion path that assumes the old `coinResources/assaultCount` stub behavior.
- `piece-removal-ordering` currently has latent runtime defects that become visible under canonical Assault execution:
  - removal destination selector format uses `available-<faction>` (invalid; canonical zone selector format is `available:<faction>`)
  - `forEach.limit` executes with `0` when damage is zero (runtime error); removal should no-op instead

Key behaviors:
- **Space filter**: Spaces with US Troops AND enemy (NVA/VC) pieces
- **Cost**: 0 for US. Optional 3 ARVN Resources for ARVN follow-up in 1 space.
- **Damage formula**:
  - With US Base: 2 enemies per US Troop
  - Highland without US Base: 1 enemy per 2 US Troops (floor division)
  - Otherwise: 1 enemy per US Troop
- **ARVN follow-up**: In 1 space, pay 3 ARVN Resources for ARVN Assault using ARVN damage formula
- **Removal**: Uses `coin-assault-removal-order` macro (+6 Aid per insurgent Base removed)
- **LimOp-aware**: Max 1 space

## Architectural Notice

- The current production data still contains transitional COIN stub resource wiring (`coinResources`, `assaultCount`).
- This ticket must remove US Assault dependence on transitional COIN stub semantics and implement canonical FITL/Spec 26 behavior for `assault-us-profile` (including ARVN follow-up cost via canonical ARVN resource tracks).
- No backward-compatibility profile aliases or dual-path logic: if tests break due to old stub assumptions, update tests to the canonical behavior.
- Keep engine/compiler generic: this ticket is data-driven (`GameSpecDoc` YAML + integration coverage), not kernel branching.
- `assault-arvn-profile` remains a separate ticket concern; only remove US Assault's dependency on transitional globals in this ticket.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Replace stub in production spec with `assault-us-profile` YAML
- `data/games/fire-in-the-lake.md` — Minimal hardening of shared removal macro used by Assault (`piece-removal-ordering`) for canonical zone selector formatting and zero-damage no-op guard
- `test/integration/fitl-coin-operations.test.ts` — Remove stale stub assumptions, add/strengthen `assault-us-profile` tests

## Out of Scope

- `assault-arvn-profile` (separate ticket FITLOPEFULEFF-011)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `assault-us-profile` compiles without diagnostics
2. US Assault costs 0 (no resource deduction for base operation)
3. Space filter: requires US Troops AND enemy pieces
4. Damage with US Base: 2 × usTroops
5. Damage in Highland, no Base: floor(usTroops / 2)
6. Damage otherwise: 1 × usTroops
7. Each insurgent Base removed: +6 Aid (via `coin-assault-removal-order`)
8. ARVN follow-up: costs 3 ARVN Resources, applies ARVN damage formula
9. ARVN follow-up damage: Highland floor(arvnCubes/3), non-Highland floor(arvnCubes/2)
10. LimOp variant: max 1 space
11. Free operation: no cost change (US already pays 0)
12. No assertions remain that require `assault-us-profile` to mutate transitional globals (`coinResources`, `assaultCount`)

### Invariants
- No kernel source files modified
- No compiler source files modified
- `coin-assault-removal-order` macro unchanged
- `piece-removal-ordering` semantics remain unchanged except bug fixes required for canonical execution:
  - destination zone selector uses valid box-selector format `available-<faction>:none`
  - zero-damage path is a no-op (no runtime error)
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

- Completion date: 2026-02-13
- Actually changed:
  - Replaced `assault-us-profile` stub in `data/games/fire-in-the-lake.md` with canonical Spec 26 behavior (space filter, US damage formulas, ARVN follow-up, LimOp handling, zero base-cost semantics).
  - Hardened shared removal behavior used by COIN Assault (`piece-removal-ordering`) to fix runtime defects exposed by canonical Assault execution:
    - required zone-selector format for Available boxes (`available-<faction>:none`)
    - zero-damage no-op guards for `forEach.limit`
    - explicit insurgent target set (`NVA`/`VC`) to prevent COIN-on-COIN removals during ARVN follow-up.
  - Updated and expanded `test/integration/fitl-coin-operations.test.ts` with runtime + structural Assault US coverage and removed old stub-counter expectations.
  - Updated `test/integration/fitl-card-flow-determinism.test.ts` deterministic move execution helper to complete pipeline parameters (or deterministically skip unsatisfiable scripted actions), so operation-profile traces remain deterministic under decision-sequence actions.
- Deviations from original plan:
  - Ticket originally assumed no macro change; latent macro defects made canonical Assault impossible at runtime. Scope was corrected to include minimal macro hardening.
  - Original invariant text referenced canonical `available:<faction>` naming; actual repository zone-id convention required `available-<faction>:none` selectors for compatibility with existing data model.
- Verification:
  - `npm run build` passed
  - `npm run typecheck` passed
  - `npm run lint` passed
  - `node --test dist/test/integration/fitl-coin-operations.test.js` passed
  - `npm test` passed
