# FITLOPEFULEFF-019: Terror VC Profile

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Small (2-3 hours)
**Spec reference**: Spec 26, Task 26.10 — `terror-vc-profile` (Rule 3.3.4, VC variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002, FITLOPEFULEFF-003, FITLOPEFULEFF-018 (pattern)

## Summary

Add `terror-vc-profile` implementing the VC Terror operation. Different from NVA Terror in two critical ways: requires Underground Guerrilla (no Troops alternative) and shifts toward Active Opposition (not Neutral).

Key behaviors:
- **Space filter**: Underground VC Guerrilla required (VC CANNOT Terror with Troops alone)
- **Cost**: 1 VC Resource per Province/City (0 for LoCs)
- **Activation**: Activate 1 Underground VC Guerrilla
- **LoC**: Place Sabotage marker (same as NVA)
- **Province/City**: Place Terror marker + shift 1 level toward **Active Opposition**
- **Marker supply**: Same 15-marker shared limit
- **LimOp-aware**: Max 1 space

## Assumption Reassessment

Validated against current code/tests before implementation:
- There is currently **no** `terror-vc-profile` in `data/games/fire-in-the-lake.md` (this ticket adds a new profile; no stub replacement).
- `terror-nva-profile` exists and is covered by integration tests in `test/integration/fitl-insurgent-operations.test.ts`.
- Terror operation profile coverage currently includes only NVA Terror in the compile-profile assertion and behavior tests.
- Existing architecture is data-driven via YAML action pipelines; no kernel/compiler changes are needed for VC Terror behavior.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add new `terror-vc-profile` YAML action pipeline
- `test/integration/fitl-insurgent-operations.test.ts` — Add VC Terror compile + behavior tests

## Out of Scope

- `terror-nva-profile` behavior changes (FITLOPEFULEFF-018 already covers NVA)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes
- Compiler source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `terror-vc-profile` compiles without diagnostics
2. Space filter: requires Underground VC Guerrilla (rejects spaces with only VC Troops)
3. Cost: 1 VC Resource per Province/City, 0 for LoC
4. Activation: 1 Underground VC Guerrilla set to Active
5. LoC: Sabotage marker placed
6. Province/City: Terror marker placed
7. VC Terror shifts 1 level toward Active Opposition whenever not already at Active Opposition
8. VC Terror shift direction is DIFFERENT from NVA (toward Opposition, not Neutral)
9. Terror/Sabotage marker idempotent
10. Marker supply limit: stops at 15
11. Free operation: per-Province/City cost skipped
12. LimOp variant: max 1 space

### Invariants
- `terror-nva-profile` unchanged
- No kernel source files modified
- No compiler source files modified
- VC shift is toward Active Opposition (delta: -1 over the support/opposition lattice)
- NVA shift policy remains unchanged (toward Neutral from Support states only)
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

- **Completion date**: 2026-02-14
- **What actually changed**:
  - Added new `terror-vc-profile` action pipeline to `data/games/fire-in-the-lake.md`.
  - Refactored Terror operation logic into shared YAML macros (`insurgent-terror-select-spaces`, `insurgent-terror-resolve-space`) reused by both NVA and VC profiles to reduce duplication while preserving faction-specific policy via macro parameters.
  - Extended `test/integration/fitl-insurgent-operations.test.ts` with VC Terror compile/behavior coverage (costing, selector legality, LoC sabotage behavior, marker cap/idempotency, LimOp max, and NVA-vs-VC shift divergence).
  - Added macro-architecture assertions to enforce shared Terror macro usage in both profiles.
  - Corrected ticket assumptions before implementation: this work added a new VC profile (no existing VC terror stub to replace).
- **Deviations from original plan**:
  - Updated acceptance wording to match actual support/opposition lattice semantics (shift one level toward Active Opposition with bounded top state).
  - Performed an additional non-breaking architecture hardening pass to eliminate duplicated Terror pipeline blocks across factions.
- **Verification results**:
  - `npm run build` passed
  - `npm run typecheck` passed
  - `npm run lint` passed
  - `node --test dist/test/integration/fitl-insurgent-operations.test.js` passed
  - `npm test` passed
