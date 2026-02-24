# FITLSEC3RULGAP-004: Insurgent Attack/March/Terror Affordability Clamp via Shared Macros

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — data + tests only
**Deps**: FITLSEC3RULGAP-003, Spec 45 (`specs/45-fitl-section3-rules-gaps.md`)

## Problem

Shared insurgent selector macros (`insurgent-attack-select-spaces`, `insurgent-march-select-destinations`, `insurgent-terror-select-spaces`) still allow paid non-LimOp over-selection (`max: 99`) relative to faction resources.

## Assumption Reassessment (2026-02-24)

1. FITLSEC3RULGAP-003 is already completed: Rally affordability is now encoded via `insurgent-rally-select-spaces` and is out of scope here.
2. Attack/March/Terror selectors remain centralized in `data/games/fire-in-the-lake/20-macros.md` and are called by both NVA and VC profiles in `30-rules-actions.md`.
3. Attack/March/Terror non-LimOp selector max is currently hardcoded (`max: 99`) and does not yet clamp to faction resources at selection time.
4. Resolve-stage per-space spending already exists and remains authoritative for exact paid-cost application (including LoC zero-cost paths).
5. Free-operation handling already exists in resolve stages and must continue to bypass paid selector caps.

## Architecture Check

1. Keeping caps in shared selector macros avoids duplicated profile-level selector logic.
2. Macro parameterization preserves DRY while keeping engine/runtime generic.
3. Caller updates in `30-rules-actions.md` should be restricted to macro argument wiring (`resourceVar`) with no per-profile selector inlining.

## What to Change

### 1. Extend shared selector macros for affordability-aware max

1. Add `resourceVar` param support to:
   - `insurgent-attack-select-spaces`
   - `insurgent-march-select-destinations`
   - `insurgent-terror-select-spaces`
2. In non-LimOp branches, set selector `max` to:
   - `99` when `__freeOperation == true`
   - `{ ref: gvar, var: { param: resourceVar } }` otherwise
3. Preserve LimOp `max: 1` behavior unchanged.

### 2. Update macro callers for NVA/VC profiles

Pass each faction resource variable into shared selector calls in `30-rules-actions.md`:
- NVA profiles pass `nvaResources`
- VC profiles pass `vcResources`

### 3. Add integration/runtime validation

Add/extend tests proving selector-time caps are enforced for paid operations, while LoC zero-cost behavior and free-op bypass remain valid.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `packages/engine/test/integration/fitl-insurgent-operations.test.ts` (modify)

## Out of Scope

- Rally profile affordability (handled in FITLSEC3RULGAP-003).
- ARVN/US operation affordability.
- Kernel/compiler implementation changes.

## Acceptance Criteria

### Tests That Must Pass

1. NVA Attack with 2 resources cannot legally select 3 paid spaces.
2. VC Attack with 1 resource cannot legally select 2 paid spaces.
3. March with zero resources still allows legal LoC-only destination selection where cost is 0.
4. Terror with zero resources still allows legal LoC-only target selection where cost is 0.
5. Free-operation Attack/March/Terror bypass selector affordability caps.
6. LimOp selection max remains 1 for all affected actions.
7. Macro caller updates do not break existing NVA/VC profile compilation.
8. `pnpm -F @ludoforge/engine test -- fitl-insurgent-operations.test.ts`
9. `pnpm -F @ludoforge/engine test`
10. `pnpm turbo lint`

### Invariants

1. Shared macro usage remains (no per-profile selector duplication introduced).
2. Existing per-space spend effects remain authoritative for actual resource deduction.
3. No `packages/engine/src/**` changes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-insurgent-operations.test.ts` — Attack/March/Terror paid cap legality + free-op bypass + LoC zero-cost cases.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-insurgent-operations.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-02-24
- Actual changes:
  - Extended shared insurgent selector macros (`insurgent-attack-select-spaces`, `insurgent-march-select-destinations`, `insurgent-terror-select-spaces`) to accept `resourceVar`, apply paid affordability in non-LimOp paths, and preserve free-operation bypass.
  - Wired NVA/VC callers in `30-rules-actions.md` to pass `nvaResources` / `vcResources`.
  - Added integration coverage in `fitl-insurgent-operations.test.ts` for Attack/March/Terror selector affordability behavior, including zero-resource LoC handling and free-operation bypass contracts.
  - Tightened selector robustness to avoid `min > max` cardinality runtime failures at zero resources.
- Deviations from original plan:
  - No changes were needed in `fitl-capabilities-march-attack-bombard.test.ts`; all required behavior was validated within `fitl-insurgent-operations.test.ts`.
  - March/Terror selectors now explicitly gate Province/City selection when paid resources are zero, while keeping LoC selections legal and free-operation unrestricted.
- Verification results:
  - `pnpm turbo build` passed.
  - `pnpm -F @ludoforge/engine test -- fitl-insurgent-operations.test.ts` passed (`270/270` under package test wiring).
  - `pnpm -F @ludoforge/engine test` passed (`270/270`).
  - `pnpm turbo lint` passed.
