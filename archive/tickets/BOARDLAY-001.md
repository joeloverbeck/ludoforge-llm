# BOARDLAY-001: Layout Type Definitions Foundation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No
**Deps**: None (first ticket in series)

## Problem

Spec 41 requires shared layout contracts (`LayoutMode`, `LayoutResult`, `AuxLayoutResult`) consumed by upcoming BOARDLAY tickets. The original dependency-bootstrap assumption is now stale: Graphology runtime dependencies are already present in the runner.

Without a dedicated `layout-types.ts` module, later tickets risk repeating or drifting type definitions across files.

## Assumption Reassessment (2026-02-19)

1. `graphology` and `graphology-layout-forceatlas2` are already declared in `packages/runner/package.json`; no dependency installation work remains in this ticket.
2. Runner currently has no `packages/runner/src/layout/` module yet; type contracts are still missing.
3. Engine already exposes `metadata.layoutMode` schema/type support (`'graph' | 'table' | 'track' | 'grid'`) per Spec 41 prerequisites.
4. This ticket should establish contract-only types and avoid introducing runtime behavior.

## Scope

- Create `packages/runner/src/layout/layout-types.ts` with shared layout type definitions:
  - `LayoutMode = 'graph' | 'table' | 'track' | 'grid'`
  - `LayoutResult`
  - `AuxLayoutResult`
- Keep this ticket contract-only (no algorithms, no graph construction, no cache, no canvas integration).

### Out of Scope

- Dependency changes in `packages/runner/package.json` or `pnpm-lock.yaml`
- Layout algorithms (`BOARDLAY-003` through `BOARDLAY-005`)
- Zone partitioning/mode resolution/graph construction (`BOARDLAY-002`)
- Aux layout logic (`BOARDLAY-006`)
- Layout caching (`BOARDLAY-007`)
- GameCanvas integration (`BOARDLAY-008`)

## Architectural Rationale

Compared to the previous plan, dependency edits are redundant and add no architectural value because the required packages already exist. The beneficial change is establishing a single source of truth for layout contracts now, so subsequent tickets compose against stable shared types rather than duplicating shape definitions.

This keeps the architecture cleaner and more extensible by separating:
- contract definitions (this ticket), from
- behavior/algorithms (subsequent tickets).

No aliasing or backwards-compat shims are introduced.

## Files to Touch

- `packages/runner/src/layout/layout-types.ts` (new)
- `tickets/BOARDLAY-001-graphology-deps-and-layout-types.md` (updated assumptions/scope)

## Acceptance Criteria

### Tests/Checks That Must Pass

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner build`

### Invariants

1. `layout-types.ts` exports only type definitions (no runtime logic).
2. No engine package files are modified.
3. No dependency manifest changes are made in this ticket.

## Outcome

- **Completion date**: 2026-02-19
- **What changed**:
  - Added `packages/runner/src/layout/layout-types.ts` with shared contracts:
    - `LayoutMode`
    - `LayoutBounds`
    - `LayoutPosition`
    - `LayoutResult`
    - `AuxZoneGroup`
    - `AuxLayoutResult`
  - Added `packages/runner/test/layout/layout-types.test.ts` to enforce the contract-only runtime invariant (`layout-types` has no runtime exports).
  - Reassessed and corrected this ticket's stale dependency assumptions and narrowed the scope accordingly.
- **Deviations from original plan**:
  - Removed package/dependency installation steps because `graphology` and `graphology-layout-forceatlas2` were already present.
  - Added one explicit invariant test for type-only runtime surface; original draft did not include a dedicated layout test file.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` ✅ (86 files, 620 tests)
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner build` ✅
