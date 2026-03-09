# FITLASSAULT-002: Rework Targeted Assault on Dynamic-Filter Engine Support

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: No new engine work in this ticket — depends on generic authoring/runtime support from `TOKFILAST-040`
**Deps**: TOKFILAST-040, `tickets/README.md`, `data/games/fire-in-the-lake/20-macros.md`, `data/games/fire-in-the-lake/30-rules-actions.md`, `data/games/fire-in-the-lake/41-content-event-decks.md`, `packages/engine/test/integration/fitl-removal-ordering.test.ts`, `packages/engine/test/integration/fitl-coin-operations.test.ts`, `packages/engine/test/integration/fitl-events-chu-luc.test.ts`, `archive/tickets/FITLASSAULT-001-grant-aware-assault-targeting.md`, `archive/tickets/FREEOP-001-grant-scoped-action-context.md`

## Problem

`archive/tickets/FITLASSAULT-001-grant-aware-assault-targeting.md` unified FITL Assault onto one shared helper, but it still had to do so with an engine-authoring workaround: the helper contains separate `all` vs single-faction branches because current token-filter and macro-arg contracts cannot express the cleaner runtime-selected filter shape directly.

Once `TOKFILAST-040` lands, FITL should be reworked again so targeted Assault uses the improved generic engine surface rather than the current branch-heavy data workaround. This ticket exists to close that architectural debt explicitly instead of leaving a “good enough” intermediate form in place indefinitely.

## Assumption Reassessment (2026-03-09)

1. `data/games/fire-in-the-lake/20-macros.md` now has one shared `coin-assault-removal-order` helper, but it still branches internally on `targetFactionMode` to duplicate filter structure for `all` vs single-faction targeting.
2. `data/games/fire-in-the-lake/30-rules-actions.md` currently passes explicit `targetFactionMode: all` for ordinary Assault call sites, and `data/games/fire-in-the-lake/41-content-event-decks.md` passes `targetFactionMode: NVA` for Chu Luc.
3. `packages/engine/test/integration/fitl-removal-ordering.test.ts`, `packages/engine/test/integration/fitl-coin-operations.test.ts`, and `packages/engine/test/integration/fitl-events-chu-luc.test.ts` already cover the current shared-path behavior and should be tightened, not replaced wholesale.
4. `archive/tickets/FREEOP-001-grant-scoped-action-context.md` already exposes generic `grantContext`, so after `TOKFILAST-040` this ticket may optionally map grant context into Assault targeting without new engine-specific contracts.
5. Mismatch: the current shared helper is an acceptable intermediate architecture, but it is not yet the cleanest possible long-term design. The corrected scope here is to remove that intermediate branching once the engine can support the generic authoring shape.

## Architecture Check

1. A single authored removal pipeline driven by generic dynamic filter/value support is cleaner than preserving parallel `all` and single-faction branches inside the shared macro.
2. This keeps all game semantics in FITL `GameSpecDoc`: FITL still decides what “all insurgents” or “NVA only” means, while the engine only evaluates generic filter expressions and bindings.
3. No backwards-compatibility layers should preserve the old branch-heavy helper contract after the rework. Rewrite the shared helper around the improved engine surface directly.
4. This ticket should leave FITL in the shape we would want as the stable long-term example of data-authored targeted operations.

## What to Change

### 1. Collapse the shared Assault helper onto the improved engine surface

Rewrite `piece-removal-ordering` / `coin-assault-removal-order` so the helper expresses one authored removal pipeline whose target selection is driven by the generic dynamic filter/value capability from `TOKFILAST-040`, rather than by duplicated `if all` / `else single faction` macro branches.

### 2. Keep default and targeted callers explicit in data

Ordinary US/ARVN Assault callers should remain explicit about their target selection, but they should now feed the cleaner engine-backed selector surface rather than the current workaround shape. Chu Luc should keep its NVA-only exhaustive behavior while using the same shared authored structure.

### 3. Reassess grant-context usage after the engine improvement

If the improved engine surface makes it cleaner for a granted Assault to source its selector from `grantContext`, encode that in FITL action/event data only when it reduces duplication without changing semantics. Do not add engine-side Assault-specific grant logic.

### 4. Tighten regression coverage around the cleaner authored shape

Update structural assertions so tests no longer merely prove the shared helper exists; they must prove the branch-heavy workaround is gone and the improved engine-backed authoring shape is now the only path.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify if caller wiring changes)
- `packages/engine/test/integration/fitl-removal-ordering.test.ts` (modify)
- `packages/engine/test/integration/fitl-coin-operations.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-chu-luc.test.ts` (modify)

## Out of Scope

- New engine capability work beyond what `TOKFILAST-040` provides.
- Changing non-Assault FITL operations unless they also benefit directly from the same cleanup.
- Visual presentation changes in `visual-config.yaml`.

## Acceptance Criteria

### Tests That Must Pass

1. Normal US/ARVN Assault still resolves in the printed/default insurgent order with no behavioral regression.
2. Targeted Assault consumers such as Chu Luc still resolve NVA-only behavior correctly, but the shared helper no longer relies on duplicated `all` vs single-faction workaround branches.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. FITL targeted Assault remains entirely data-authored; no game-specific engine logic is added.
2. The final shared Assault authoring shape relies on the improved generic engine surface rather than workaround duplication.

## Tests

1. `packages/engine/test/integration/fitl-removal-ordering.test.ts` — update structure assertions to prove the workaround branching is gone and only the cleaner shared path remains.
2. `packages/engine/test/integration/fitl-coin-operations.test.ts` — keep ordinary Assault caller coverage aligned with the new shared authoring shape.
3. `packages/engine/test/integration/fitl-events-chu-luc.test.ts` — preserve targeted runtime behavior while asserting Chu Luc consumes the final engine-backed shared path.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-removal-ordering.test.ts` — verifies the shared Assault macro was simplified onto the dynamic engine surface.
2. `packages/engine/test/integration/fitl-coin-operations.test.ts` — verifies ordinary Assault callers still route through the shared path with default semantics.
3. `packages/engine/test/integration/fitl-events-chu-luc.test.ts` — verifies targeted runtime behavior survives while authored structure loses the workaround.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/integration/fitl-removal-ordering.test.ts`
3. `pnpm -F @ludoforge/engine test -- test/integration/fitl-coin-operations.test.ts`
4. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-chu-luc.test.ts`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`
