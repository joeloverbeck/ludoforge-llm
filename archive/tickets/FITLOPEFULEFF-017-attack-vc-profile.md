# FITLOPEFULEFF-017: Attack VC Profile

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Small (2-3 hours)
**Spec reference**: Spec 26, Task 26.9 — `attack-vc-profile` (Rule 3.3.3, VC variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002, FITLOPEFULEFF-003, FITLOPEFULEFF-016 (pattern)

## Summary

Add `attack-vc-profile` implementing the VC Attack operation. Guerrilla Attack only — no Troops alternative.

## Reassessed Baseline (Current Code Reality)

- `attack-nva-profile` is already implemented in `data/games/fire-in-the-lake.md`; `attack-vc-profile` is still missing.
- Attack currently resolves only for NVA because only one Attack profile exists; VC cannot legally execute Attack yet.
- Kernel/runtime prerequisites referenced by Spec 26 for this ticket are already in place and tested:
  - `__actionClass` binding in move application and legal-choice contexts
  - `__freeOperation` binding behavior for per-space costs
  - `rollRandom` seeded determinism used by Attack tests
- Existing Attack integration coverage is NVA-heavy; VC-specific Attack behavior is not yet covered.

## Architecture Decision

- Keep **separate faction-specific Attack profiles** (`attack-nva-profile`, `attack-vc-profile`) mapped by `applicability`.
- Do **not** fold VC behavior into NVA profile via actor branching; the separate-profile approach is cleaner, easier to validate, and aligns with Spec 26 profile isolation.

Key behaviors:
- **Space filter**: Spaces where VC AND an enemy faction have pieces
- **Cost**: 1 VC Resource per space
- **Guerrilla Attack only**: No `chooseOne` for mode — always guerrilla attack
- **Resolution**: Activate ALL VC guerrillas → roll d6 → if roll <= guerrilla count: remove up to 2 enemy pieces
- **Attrition**: Per US piece removed, attacker loses 1 piece to Available
- **LimOp-aware**: Max 1 space

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add `attack-vc-profile` YAML (keep `attack-nva-profile` unchanged)
- `test/integration/fitl-insurgent-operations.test.ts` — Add/update VC Attack integration coverage (applicability, cost, LimOp/free-op expectations)
- `test/integration/fitl-attack-die-roll.test.ts` — Extend die-roll coverage to VC guerrilla Attack branch behavior

## Out of Scope

- `attack-nva-profile` modifications (FITLOPEFULEFF-016)
- NVA Troops Attack mode (NVA-only)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Kernel source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `attack-vc-profile` compiles without diagnostics
2. `attack-vc-profile` is gated by `applicability` to VC active player
3. Space filter: requires VC pieces AND enemy pieces
4. Cost: 1 VC Resource per space
5. No mode choice — always guerrilla attack
6. All VC guerrillas activated (underground → active)
7. Roll d6: if roll <= guerrilla count → 2 enemy pieces removed
8. Roll d6: if roll > guerrilla count → 0 damage
9. Attrition: per US piece removed, VC loses 1 piece to Available
10. Free operation: per-space cost skipped
11. LimOp variant: max 1 space

### Invariants
- `attack-nva-profile` unchanged
- No kernel source files modified
- No compiler source files modified
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

- **Completion date**: 2026-02-14
- **What changed**:
  - Added `attack-vc-profile` to `data/games/fire-in-the-lake.md` with VC-only applicability, LimOp-aware space selection, free-op cost guard, guerrilla activation, die-roll hit logic, and shared insurgent attrition/removal macro usage.
  - Updated `test/integration/fitl-insurgent-operations.test.ts` with VC Attack compilation/applicability/resource-guard coverage and corrected the NVA-only legality assumption wording.
  - Updated `test/integration/fitl-attack-die-roll.test.ts` to include VC Attack die-roll/mode-shape coverage and VC hit/miss invariant coverage.
  - Updated `test/integration/fitl-limited-ops.test.ts` with VC Attack LimOp max-1 enforcement coverage.
- **Deviations from original plan**:
  - Added `test/integration/fitl-limited-ops.test.ts` changes beyond the initial file list to cover the LimOp invariant directly for VC Attack.
  - Clarified “no mode choice” as “no attack-mode choice”; shared defender-selection choice (`$targetFactionFirst`) remains required by the existing generic removal macro.
- **Verification**:
  - `npm run build` passed.
  - `node --test dist/test/integration/fitl-insurgent-operations.test.js dist/test/integration/fitl-attack-die-roll.test.js dist/test/integration/fitl-limited-ops.test.js` passed.
  - `npm run typecheck` passed.
  - `npm test` passed.
  - `npm run lint` passed.
