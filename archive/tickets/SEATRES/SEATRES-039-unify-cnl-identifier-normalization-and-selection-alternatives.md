# SEATRES-039: Unify CNL identifier normalization and canonicalize selection alternatives

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — shared CNL identifier utility + data-asset selection helper hardening
**Deps**: archive/tickets/SEATRES/SEATRES-024-extract-shared-data-asset-selection-policy-for-compiler-and-validator.md

## Problem

Identifier normalization currently exists in multiple CNL modules, and the new shared data-asset selector imports normalization from validator-oriented shared code. This creates avoidable layer coupling and risks semantic drift in future refactors. Selection alternatives are sorted but not explicitly deduplicated by normalized identity, which can produce unstable/duplicative suggestion lists when ids differ only by whitespace/Unicode normalization.

## Assumption Reassessment (2026-03-02)

1. `normalizeIdentifier` is currently duplicated in at least `compile-lowering.ts` and `validate-spec-shared.ts`.
2. Compile call sites (`compile-event-cards.ts`, `compile-operations.ts`) currently depend on the `compile-lowering.ts` copy while validator/cross-validation paths depend on the `validate-spec-shared.ts` copy.
3. `data-asset-selection.ts` currently imports normalization from `validate-spec-shared.ts`, which couples generic selection logic to validator-oriented shared helpers.
4. There is no existing `packages/engine/test/unit/validate-spec-shared.test.ts`; normalization coverage must be added in existing selector/asset tests or a new focused test file.
5. Active tickets do not explicitly require consolidating normalization into one canonical utility module or deduplicating selector alternatives by normalized identity.

## Architecture Check

1. One canonical identifier-normalization utility is cleaner and more extensible than duplicated definitions in compile/validate modules.
2. Consolidation is fully game-agnostic infrastructure work; it preserves the boundary where `GameSpecDoc` carries game-specific data and `GameDef`/simulation remain generic.
3. No backwards-compatibility aliases are introduced: normalization semantics remain strict and canonical, and selector alternatives become deterministic.

## What to Change

### 1. Create canonical CNL identifier utility and migrate call sites

1. Introduce a shared CNL utility module (for example `identifier-utils.ts`) exporting `normalizeIdentifier`.
2. Migrate compile-path and validator/cross-validation callers to the new module.
3. Remove duplicated normalization implementations from previous modules once all call sites are migrated.

### 2. Canonicalize data-asset selection alternatives

1. In `selectDataAssetById()`, produce alternatives using normalized identity dedupe + stable sort.
2. Keep selected-match behavior unchanged (normalized equality) while ensuring deterministic suggestion lists.
3. Add focused tests for collisions such as trimmed/Unicode-normalized equivalent ids.

## Files to Touch

- `packages/engine/src/cnl/` (add shared identifier utility module)
- `packages/engine/src/cnl/data-asset-selection.ts` (modify)
- `packages/engine/src/cnl/compile-lowering.ts` (modify)
- `packages/engine/src/cnl/compile-event-cards.ts` (modify)
- `packages/engine/src/cnl/compile-operations.ts` (modify)
- `packages/engine/src/cnl/validate-spec-shared.ts` (modify)
- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/src/cnl/validate-actions.ts` (modify)
- `packages/engine/src/cnl/validate-spec-core.ts` (modify)
- `packages/engine/src/cnl/cross-validate.ts` (modify)
- `packages/engine/src/cnl/seat-reference-validation.ts` (modify)
- `packages/engine/test/unit/data-asset-selection.test.ts` (modify/add)
- `packages/engine/test/unit/*` (add/modify focused normalization test coverage in existing or new file)

## Out of Scope

- Game-specific schema changes
- Runtime/simulator behavior changes
- Visual configuration format or runner presentation

## Acceptance Criteria

### Tests That Must Pass

1. CNL compile + validator codepaths consume a single canonical normalization implementation.
2. `selectDataAssetById()` returns deterministic, deduplicated alternatives under normalized-id collisions.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Identifier normalization semantics are defined once and reused everywhere in CNL infrastructure.
2. Data-asset selection remains game-agnostic and deterministic across compiler and validator.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/data-asset-selection.test.ts` — add normalized-collision alternatives dedupe assertions. Rationale: locks deterministic alternative-list contract.
2. `packages/engine/test/unit/data-asset-selection.test.ts` — add explicit-id resolution case under whitespace/Unicode-normalized equivalents. Rationale: guards canonical matching invariants.
3. `packages/engine/test/unit/identifier-utils.test.ts` (or equivalent) — add focused canonical normalization contract assertions. Rationale: prevents silent drift when compile/validate call sites are consolidated.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/data-asset-selection.test.js`
3. `node --test packages/engine/dist/test/unit/identifier-utils.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo typecheck`
6. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-03
- **What changed**:
  - Added canonical CNL identifier utility: `packages/engine/src/cnl/identifier-utils.ts`.
  - Removed duplicate `normalizeIdentifier` implementations from:
    - `packages/engine/src/cnl/compile-lowering.ts`
    - `packages/engine/src/cnl/validate-spec-shared.ts`
  - Migrated compile/validate/cross-validation callers to canonical utility in:
    - `packages/engine/src/cnl/compile-event-cards.ts`
    - `packages/engine/src/cnl/compile-operations.ts`
    - `packages/engine/src/cnl/data-asset-selection.ts`
    - `packages/engine/src/cnl/validate-actions.ts`
    - `packages/engine/src/cnl/validate-spec-core.ts`
    - `packages/engine/src/cnl/validate-extensions.ts`
    - `packages/engine/src/cnl/cross-validate.ts`
    - `packages/engine/src/cnl/seat-reference-validation.ts`
  - Canonicalized selector alternatives in `selectDataAssetById()` by normalized-identity dedupe + stable sorting.
  - Added/strengthened tests:
    - `packages/engine/test/unit/data-asset-selection.test.ts`
    - `packages/engine/test/unit/identifier-utils.test.ts`
- **Deviations from original plan**:
  - Replaced planned `validate-spec-shared` test updates with a new dedicated utility test file (`identifier-utils.test.ts`) because `validate-spec-shared.test.ts` does not exist.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/data-asset-selection.test.js packages/engine/dist/test/unit/identifier-utils.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
