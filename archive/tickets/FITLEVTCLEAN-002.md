# FITLEVTCLEAN-002: Reduce Kissinger unshaded concat from 3 sources to 2

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — GameSpecDoc data + integration test
**Deps**: None

## Problem

Card-2 (Kissinger) unshaded currently uses a 3-source `concat` to query insurgent pieces in Cambodia/Laos — one source per piece type (`troops`, `guerrilla`, `base`). The `troops` and `guerrilla` sources are structurally identical except for type equality and can be merged via `{ prop: type, op: in, value: [troops, guerrilla] }`, removing duplicated query/filter structure.

The `base` source must remain separate because it has an additional `{ prop: tunnel, eq: untunneled }` constraint that should not be applied to non-base pieces.

## Assumption Reassessment (2026-02-27)

1. `{ prop: type, op: in, value: [...] }` is valid in FITL data and already used broadly across production YAML (including event deck content and action rules).
2. The `tunnel` property constraint is base-specific; combining base with non-base types would be incorrect.
3. `packages/engine/test/integration/fitl-events-1968-us.test.ts` exists and already asserts card-2 shaded structure (including shaded concat source count = 3). It currently does not assert unshaded concat source count or mixed-type filter shape.
4. This is not covered by a separate active architecture/spec ticket; it is a localized data cleanup plus invariant hardening.

## Architecture Reassessment

1. This change is beneficial versus current architecture because it removes duplication without introducing abstraction overhead or engine-side special cases.
2. It improves long-term robustness by reducing repeated structural YAML that can drift over time.
3. It preserves engine agnosticism: behavior remains encoded in GameSpecDoc data only; compiler/kernel remain unchanged.
4. No compatibility aliasing is introduced. The card data is updated directly, and tests are updated to lock the intended structure.

## Scope

### In Scope

1. Merge unshaded card-2 `troops` + `guerrilla` concat sources into one source using `op: in`.
2. Keep base source separate with `tunnel: untunneled` filter.
3. Strengthen card-2 integration assertions to verify the new unshaded concat shape (2 sources, mixed-type filter present, base+tunnel source preserved).

### Out of Scope

1. Refactoring concat/filter duplication in other cards.
2. Adding new DSL/compiler primitives for shared filters.
3. Engine/kernel/compiler behavior changes.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-1968-us.test.ts` (modify)

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/fitl-events-1968-us.test.ts` passes with updated unshaded card-2 assertions.
2. `pnpm -F @ludoforge/engine test` passes.

### Invariants

1. Unshaded selectable set remains: NVA/VC `troops` + `guerrilla` + untunneled `base` in Cambodia/Laos.
2. Shaded card-2 behavior remains unchanged (including US-troops concat source count = 3).
3. No engine/compiler files are modified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-1968-us.test.ts`
   - Add explicit assertions for card-2 unshaded `chooseN.options.sources.length === 2`.
   - Assert one source uses `type op: in [troops, guerrilla]` with NVA/VC filter.
   - Assert the other source remains `type eq base` with `tunnel eq untunneled`.

### Commands

1. `pnpm -F @ludoforge/engine test -- packages/engine/test/integration/fitl-events-1968-us.test.ts`
2. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-02-27
- **What changed**:
  - Updated `card-2` (Kissinger) unshaded `chooseN.options.query: concat` from 3 sources to 2 by merging `troops` + `guerrilla` into one source using `op: in`.
  - Preserved a dedicated base source with `tunnel: untunneled`.
  - Strengthened `packages/engine/test/integration/fitl-events-1968-us.test.ts` to assert the new unshaded shape and preserve base+tunnel guard.
- **Deviations from original plan**:
  - Ticket assumptions/scope were corrected first: the integration test file exists and already asserts shaded concat source count; unshaded structural assertions were missing and were added explicitly.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/integration/fitl-events-1968-us.test.ts` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
