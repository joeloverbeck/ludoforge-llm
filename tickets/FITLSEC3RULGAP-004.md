# FITLSEC3RULGAP-004: Insurgent Attack/March/Terror Affordability Clamp via Shared Macros

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — data + tests only
**Deps**: FITLSEC3RULGAP-003, Spec 45 (`specs/45-fitl-section3-rules-gaps.md`)

## Problem

Shared insurgent selection macros (`insurgent-attack-select-spaces`, `insurgent-march-select-destinations`, `insurgent-terror-select-spaces`) still permit over-selection in non-LimOp paths relative to available faction resources.

## Assumption Reassessment (2026-02-24)

1. The relevant selectors are centralized in `data/games/fire-in-the-lake/20-macros.md` and called from both NVA and VC profiles.
2. Resolve-stage per-space spending already exists and should remain the source of exact paid-cost application.
3. Free-operation handling already exists and must continue bypassing operation-space affordability caps.

## Architecture Check

1. Keeping caps in shared selector macros avoids duplicated profile-level selector logic.
2. Macro parameterization preserves DRY while keeping engine/runtime generic.
3. Caller updates in `30-rules-actions.md` should be limited to macro argument wiring.

## What to Change

### 1. Extend shared selector macros for affordability-aware max

1. Add resource-variable-aware cap support to:
   - `insurgent-attack-select-spaces`
   - `insurgent-march-select-destinations`
   - `insurgent-terror-select-spaces`
2. Ensure free-operation branch bypasses the resource cap.
3. Preserve LimOp max=1 behavior.

### 2. Update macro callers for NVA/VC profiles

Pass each faction’s resource variable into shared selector macro calls in `30-rules-actions.md`.

### 3. Add integration/runtime validation

Add tests proving selectors are resource-capped while LoC/no-cost March/Terror behavior and free-op bypass remain valid.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `packages/engine/test/integration/fitl-insurgent-operations.test.ts` (modify)
- `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts` (modify, if selector structure assertions require updates)

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
9. `pnpm -F @ludoforge/engine test -- fitl-capabilities-march-attack-bombard.test.ts`
10. `pnpm -F @ludoforge/engine test`

### Invariants

1. Shared macro usage remains (no per-profile selector duplication introduced).
2. Existing per-space spend effects remain authoritative for actual resource deduction.
3. No `packages/engine/src/**` changes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-insurgent-operations.test.ts` — resource-cap legality + free-op bypass + LoC zero-cost cases.
2. `packages/engine/test/integration/fitl-capabilities-march-attack-bombard.test.ts` — update selector-structure/capability interaction assertions as needed.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-insurgent-operations.test.ts`
3. `pnpm -F @ludoforge/engine test -- fitl-capabilities-march-attack-bombard.test.ts`
4. `pnpm -F @ludoforge/engine test`
