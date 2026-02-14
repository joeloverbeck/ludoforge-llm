# FITLOPEFULEFF-016: Attack NVA Profile

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Medium (4-6 hours)
**Spec reference**: Spec 26, Task 26.9 — `attack-nva-profile` (Rule 3.3.3, NVA variant)
**Depends on**: FITLOPEFULEFF-002 (`insurgent-attack-removal-order`)

## Summary

Replace the stub `attack-profile` with `attack-nva-profile` implementing the full NVA Attack operation per FITL Rule 3.3.3.

## Reassessed Baseline (Current Code Reality)

- `__actionClass` binding injection is already implemented in kernel and covered by tests.
- `rollRandom` already exists in kernel/compiler and has unit coverage.
- `insurgent-attack-removal-order` macro already exists in production YAML and integration coverage.
- Insurgent operation pipelines are still stubs (`rally-profile`, `march-profile`, `attack-profile`, `terror-profile`), and `attack-profile` is still generic stub logic.
- **Architecture gap identified**: `resolveActionPipeline` currently ignores `applicability` when exactly one profile exists for an action. For faction-specific rollout tickets (like this one before FITLOPEFULEFF-017), that behavior weakens profile isolation and delays correctness until both profiles exist.

Key behaviors:
- **Space filter**: Spaces where NVA AND an enemy faction have pieces
- **Cost**: 1 NVA Resource per space
- **Mode choice**: Guerrilla Attack OR NVA Troops Attack (NVA-only alternative)
- **Guerrilla Attack**: Activate ALL NVA guerrillas → roll d6 → if roll <= guerrilla count: remove up to 2 enemy pieces
- **Troops Attack** (NVA only): No die roll, no guerrilla activation. Damage = floor(nvaTroops / 2)
- **Attrition**: Per US piece removed, attacker loses 1 piece to Available (via `insurgent-attack-removal-order`)
- **Die roll**: Uses `rollRandom` for deterministic seeded PRNG

## Files to Touch

- `data/games/fire-in-the-lake.md` — Replace stub in production spec with `attack-nva-profile` YAML
- `data/games/fire-in-the-lake.md` — Correct `insurgent-attack-removal-order` to remove COIN defenders in Attack order and preserve attrition
- `src/kernel/apply-move-pipeline.ts` — Honor `applicability` even when only one profile candidate exists
- `test/integration/fitl-insurgent-operations.test.ts` — Update profile ID, add test cases
- `test/integration/fitl-attack-die-roll.test.ts` — **New file**: deterministic die roll tests with seeded PRNG
- `test/unit/kernel/apply-move-pipeline.test.ts` — **New file**: single-candidate applicability behavior
- `test/integration/fitl-removal-ordering.test.ts` — Strengthen macro runtime coverage for defender removal + attrition

## Out of Scope

- `attack-vc-profile` (separate ticket FITLOPEFULEFF-017)
- US piece Casualties box distinction (remains tracked under FITLOPEFULEFF-002 follow-up)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Changes to random number generation primitives
- Macro redesign/refactor beyond what is required for NVA Attack behavior and defender-removal correctness

## Acceptance Criteria

### Tests That Must Pass
1. `attack-nva-profile` compiles without diagnostics
2. `attack-profile` stub no longer exists in production data
3. Space filter: requires NVA pieces AND enemy pieces in same space
4. `attack-nva-profile` is gated to NVA via `applicability`
5. Kernel pipeline resolver enforces `applicability` even for single-candidate actions
6. Cost: 1 NVA Resource per space
7. Guerrilla Attack mode: all NVA guerrillas activated (underground → active)
8. Guerrilla Attack mode: `rollRandom` produces d6 result (1-6)
9. Guerrilla Attack: if roll <= guerrilla count → 2 enemy pieces removed
10. Guerrilla Attack: if roll > guerrilla count → 0 damage (miss)
11. Troops Attack mode: no guerrilla activation, no die roll
12. Troops Attack: damage = floor(nvaTroops / 2)
13. Attrition: per US piece removed, attacker loses 1 piece to Available
14. Die roll deterministic with same PRNG seed
15. Free operation: per-space cost skipped
16. LimOp variant: max 1 space
17. `insurgent-attack-removal-order` removes COIN defenders (US/ARVN) before attacker attrition is applied

### Invariants
- No compiler source files modified
- `rollRandom` kernel primitive unchanged
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

- **Completion date**: 2026-02-13
- **What changed**:
  - Replaced production `attack-profile` stub with `attack-nva-profile` in `data/games/fire-in-the-lake.md`.
  - Added NVA attack mode logic (guerrilla die-roll branch and troops branch), LimOp space selection, and free-op cost guard.
  - Fixed `insurgent-attack-removal-order` to remove COIN defenders via `removeByPriority` and guarded attrition loop for `usRemoved > 0`.
  - Updated resolver behavior in `src/kernel/apply-move-pipeline.ts` to enforce `applicability` for single-candidate pipelines.
  - Added `test/integration/fitl-attack-die-roll.test.ts`.
  - Added `test/unit/kernel/apply-move-pipeline.test.ts`.
  - Updated `test/integration/fitl-insurgent-operations.test.ts`, `test/integration/fitl-removal-ordering.test.ts`, and `test/unit/applicability-dispatch.test.ts`.
- **Deviations from original plan**:
  - Original invariant "No kernel source files modified" was intentionally dropped; resolver applicability behavior required a kernel fix for robust faction isolation.
  - Original invariant "`insurgent-attack-removal-order` unchanged" was intentionally dropped due defender-targeting correctness bug and zero-limit runtime bug.
- **Verification**:
  - `npm run build` passed.
  - `npm run typecheck` passed.
  - `npm test` passed (full unit + integration).
  - `npm run lint` passed.
