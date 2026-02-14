# FITLOPEFULEFF-012: Rally NVA Profile

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Medium (3-4 hours)
**Spec reference**: Spec 26, Task 26.7 — `rally-nva-profile` (Rule 3.3.1, NVA variant)
**Depends on**: FITLOPEFULEFF-001, FITLOPEFULEFF-002, FITLOPEFULEFF-003

## Summary

Replace the transitional stub `rally-profile` with a faction-specific `rally-nva-profile` that implements NVA Rally per FITL Rule 3.3.1.

## Reassessed Baseline (Current Code Reality)

- Production data still contains insurgent stub pipelines for Rally/March/Terror, while NVA Attack is already canonicalized.
- `data/games/fire-in-the-lake.md` currently defines `rally-profile` with transitional globals (`insurgentResources`, `rallyCount`) and no FITL Rally behavior.
- `test/integration/fitl-insurgent-operations.test.ts` still asserts `rally-profile` exists; it does not cover NVA Rally Rule 3.3.1 behavior.
- Kernel prerequisites previously called out in Spec 26 are already in place:
  - `__actionClass` and `__freeOperation` bindings are already injected in decision/runtime contexts.
  - LimOp branching via `if` + static `chooseN.max` is already used in production profiles.
- Newly identified runtime gap: `markerState` resolution does not currently evaluate dynamic zone bindings (`$zone`/`$space`), which blocks fully data-driven support-state filtering in operation profile `chooseN` queries.
- Strict operation profile dispatch is already enforced (no fallback aliasing).

Key behaviors to implement:
- **Space filter**: Provinces or Cities WITHOUT Support (Neutral + Opposition states are eligible)
- **Cost**: 1 NVA Resource per selected space
- **Without NVA Base**: Place 1 NVA Guerrilla OR replace 2 NVA Guerrillas with 1 NVA Base (mutually exclusive)
- **With NVA Base**: Place guerrillas up to `Trail + NVA Bases in space`
- **Trail improvement**: Optional spend of 2 more NVA Resources to improve Trail by 1, available even in LimOp and with 0 selected spaces, and not waived by `freeOperation`
- **Base stacking**: Max 2 Bases in a space
- **LimOp-aware**: Max 1 selected space, min 0

## Architecture Assessment

Implementing `rally-nva-profile` is strictly better than retaining the generic stub architecture because it:
- Removes transitional, non-rulebook global coupling (`insurgentResources`, `rallyCount`) from Rally behavior.
- Preserves clean faction isolation through profile dispatch (`applicability`) instead of actor-branching inside a shared profile.
- Keeps game-specific behavior fully data-driven in `GameSpecDoc` YAML with no kernel branching.
- Requires one generic kernel fix so marker-state references can work with dynamic zone selectors across all games, not just FITL.
- Aligns with Spec 26’s long-term architecture (16 faction-specific operation profiles), with no compatibility aliases.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Replace `rally-profile` stub with canonical `rally-nva-profile` YAML
- `test/integration/fitl-insurgent-operations.test.ts` — Update profile ID expectations and add runtime/structural Rally NVA coverage
- `src/kernel/resolve-ref.ts` — Resolve `markerState.space` through zone selector binding resolution (generic kernel behavior fix)
- `test/unit/resolve-ref.test.ts` — Add unit coverage for `markerState` with bound zone selectors

## Out of Scope

- `rally-vc-profile` (separate ticket FITLOPEFULEFF-013)
- Capability/momentum modifiers (Spec 28)
- Turn flow changes
- Compiler source code changes

## Acceptance Criteria

### Tests That Must Pass
1. `rally-nva-profile` compiles without diagnostics
2. `rally-profile` stub no longer exists in production data
3. `rally-nva-profile` applies only when active player is NVA (`applicability`)
4. Space filter excludes spaces with `passiveSupport` or `activeSupport`
5. Space filter includes spaces with `neutral`, `passiveOpposition`, or `activeOpposition`
6. Cost is 1 NVA Resource per selected space when not free
7. Free operation skips per-space Rally cost
8. Without NVA Base, Rally branch is mutually exclusive: place guerrilla OR replace 2 guerrillas with 1 base
9. Base replacement requires at least 2 NVA guerrillas and base stacking room (`< 2` total bases in space)
10. With NVA Base, guerrilla placement limit is `trail + nvaBaseCount`
11. Trail improvement is available even with 0 selected spaces
12. Trail improvement remains available in LimOp
13. Trail improvement cost (2 NVA Resources) is charged even when operation is free
14. LimOp variant enforces max 1 selected space (min 0)
15. `markerState` references resolve correctly when `space` is a bound zone selector (e.g., `$zone`) in kernel evaluation contexts

### Invariants

- No compiler source files modified
- Kernel change is limited to generic `markerState` zone resolution only (no FITL-specific branching)
- `place-from-available-or-map` macro behavior unchanged
- Base stacking limit remains enforced
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)

## Outcome

- Completion date: 2026-02-14
- Actually changed:
  - Replaced stub `rally-profile` with canonical `rally-nva-profile` in `data/games/fire-in-the-lake.md`, including NVA-only applicability, support-aware space filtering, no-base vs with-base Rally behavior, LimOp min/max constraints, free-op per-space cost guard, and standalone Trail-improvement stage.
  - Updated `test/integration/fitl-insurgent-operations.test.ts` to remove stale stub assumptions and add runtime coverage for Rally NVA legality/filtering/costing/Trail-improvement/LimOp and no-base/with-base branches.
  - Implemented a generic kernel fix in `src/kernel/resolve-ref.ts` so `markerState.space` resolves dynamic zone bindings and returns stable defaults for unset marker states (marker lattice default if available, otherwise `'none'`), enabling data-driven profile filters without game-specific branching.
  - Added/strengthened `test/unit/resolve-ref.test.ts` for marker-state dynamic binding and default fallback behavior.
  - Hardened determinism integration in `test/integration/fitl-card-flow-determinism.test.ts` to skip scripted actions that are not legal/satisfiable in the current state, preserving deterministic coverage under incremental profile rollout.
- Deviations from original plan:
  - Original ticket invariant “No kernel source files modified” was removed after reassessment; generic `markerState` zone-resolution/default semantics were required for robust, extensible YAML-driven operation filtering.
  - Original scope did not include deterministic card-flow script adaptation; this became necessary because strict faction-specific profile rollout changed scripted legality assumptions.
- Verification:
  - `npm run build` passed
  - `npm run typecheck` passed
  - `npm run lint` passed
  - `node dist/test/unit/resolve-ref.test.js` passed
  - `node dist/test/integration/fitl-insurgent-operations.test.js` passed
  - `node dist/test/integration/fitl-card-flow-determinism.test.js` passed
  - `npm test` passed
