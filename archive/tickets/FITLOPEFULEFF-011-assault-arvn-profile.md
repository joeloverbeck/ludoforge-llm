# FITLOPEFULEFF-011: Assault ARVN Profile

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Small (2-3 hours)
**Spec reference**: Spec 26, Task 26.6 — `assault-arvn-profile` (Rule 3.2.4, ARVN variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002, FITLOPEFULEFF-003, FITLOPEFULEFF-010

## Summary

Replace the transitional stubbed `assault-arvn-profile` with canonical ARVN Assault behavior per FITL Rule 3.2.4.

Current repository reality (reassessed):
- `assault-arvn-profile` is still a stub tied to transitional globals (`coinResources`, `assaultCount`).
- `assault-us-profile` is already canonical and archived in FITLOPEFULEFF-010.
- Prerequisite kernel/compiler capabilities for this ticket are already present:
  - `__actionClass` binding injection exists in move application and legal choice generation.
  - `coin-assault-removal-order` macro exists and is already used by canonical COIN assault paths.
- Existing integration coverage (`test/integration/fitl-coin-operations.test.ts`) currently validates US Assault and does not yet provide dedicated ARVN Assault acceptance coverage.

Key behaviors:
- **Space filter**: Spaces with ARVN cubes AND enemy pieces
- **Cost**: 3 ARVN Resources per space
- **Damage formula**:
  - Provinces: Troops only (Police excluded)
  - Cities/LoCs: Troops + Police
  - Highland: 1 enemy per 3 ARVN cubes (floor)
  - Non-Highland: 1 enemy per 2 ARVN cubes (floor)
- **Removal**: Uses `coin-assault-removal-order` macro (+6 Aid per insurgent Base removed)
- **LimOp-aware**: Max 1 space

## Architectural Notice

- The current production data still contains transitional COIN stub resource wiring (`coinResources`, `assaultCount`).
- This ticket must remove ARVN Assault dependence on transitional COIN stub semantics and implement canonical FITL/Spec 26 behavior for `assault-arvn-profile` using ARVN resource rules only.
- No backward-compatibility profile aliases or dual-path logic: if tests break due to old stub assumptions, update tests to the canonical behavior.
- Keep architecture data-driven and engine-agnostic: encode ARVN-specific behavior in `GameSpecDoc` YAML (`data/games/fire-in-the-lake.md`), not kernel branches.
- Preserve separate US/ARVN profile architecture from Spec 26 (cleaner and more extensible than actor-branching inside one profile).

## Files to Touch

- `data/games/fire-in-the-lake.md` — Replace stub in production spec with `assault-arvn-profile` YAML
- `test/integration/fitl-coin-operations.test.ts` — Add/strengthen ARVN Assault structure and runtime test cases

## Out of Scope

- `assault-us-profile` modifications (FITLOPEFULEFF-010)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `assault-arvn-profile` compiles without diagnostics
2. ARVN Assault uses top-level legality/costValidation gate `arvnResources >= 3`
3. ARVN Assault applies per-space `-3 arvnResources` inside `resolve-per-space` with `__freeOperation` guard
4. Province: only Troops count toward damage (Police excluded)
5. City/LoC: Troops + Police count toward damage
6. Highland damage: floor(arvnCubes / 3)
7. Non-Highland damage: floor(arvnCubes / 2)
8. Each insurgent Base removed: +6 Aid (via `coin-assault-removal-order`)
9. Free operation: per-space cost skipped
10. LimOp variant: max 1 space
11. No assertions remain that require `assault-arvn-profile` to mutate transitional globals (`coinResources`, `assaultCount`)

### Invariants
- `assault-us-profile` unchanged
- No kernel source files modified
- No compiler source files modified
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

- Completion date: 2026-02-14
- Actually changed:
  - Replaced stubbed `assault-arvn-profile` in `data/games/fire-in-the-lake.md` with canonical Spec 26 ARVN Assault logic:
    - LimOp-aware space selection
    - ARVN/enemy space filter
    - Per-space `arvnResources` spend guarded by `__freeOperation`
    - Province-only-troops damage counting, City/LoC troops+police counting
    - Highland (`/3`) and non-highland (`/2`) damage formulas
    - `coin-assault-removal-order` macro usage for removal ordering and Aid-on-base behavior
  - Added focused ARVN Assault structure/runtime coverage in `test/integration/fitl-coin-operations.test.ts`.
- Deviations from original plan:
  - None in architecture: ticket remained data-driven with no kernel/compiler changes.
  - Acceptance wording was refined during reassessment to reflect existing profile cost model conventions (top-level gate + per-space guarded spend).
- Verification:
  - `npm run build` passed
  - `node dist/test/integration/fitl-coin-operations.test.js` passed
  - `npm run lint` passed
  - `npm run typecheck` passed
  - `npm test` passed
