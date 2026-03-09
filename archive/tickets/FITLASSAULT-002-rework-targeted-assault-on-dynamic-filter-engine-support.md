# FITLASSAULT-002: Rework Targeted Assault on Dynamic-Filter Engine Support

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — added generic scalar-array `ValueExpr` support so authored `GameSpecDoc` can pass canonical runtime sets without FITL-specific aliasing or workaround control inputs
**Deps**: TOKFILAST-040, `tickets/README.md`, `data/games/fire-in-the-lake/20-macros.md`, `data/games/fire-in-the-lake/30-rules-actions.md`, `data/games/fire-in-the-lake/41-content-event-decks.md`, `packages/engine/test/integration/fitl-removal-ordering.test.ts`, `packages/engine/test/integration/fitl-coin-operations.test.ts`, `packages/engine/test/integration/fitl-events-chu-luc.test.ts`, `packages/engine/test/integration/fitl-events-1965-nva.test.ts`, `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts`, `archive/tickets/FITLASSAULT-001-grant-aware-assault-targeting.md`, `archive/tickets/FREEOP-001-grant-scoped-action-context.md`

## Problem

`archive/tickets/FITLASSAULT-001-grant-aware-assault-targeting.md` unified FITL Assault onto one shared helper, but it intentionally stopped at an intermediate authoring contract: the helper still exposes FITL-specific `targetFactionMode` values and contains separate `all` vs single-faction branches.

`TOKFILAST-040` has now landed. FITL should therefore be reworked again so targeted Assault uses the already-available generic runtime-set predicate surface rather than preserving the branch-heavy `targetFactionMode` workaround contract. This ticket exists to close that architectural debt explicitly instead of leaving a “good enough” intermediate form in place indefinitely.

## Assumption Reassessment (2026-03-09)

1. `archive/tickets/TOKFILAST/TOKFILAST-040-dynamic-token-filter-expressions-and-runtime-domain-aware-macro-args.md` is complete. The engine and compiler already support canonical runtime-selected membership sets in token filters and constrained macro args.
2. `data/games/fire-in-the-lake/20-macros.md` still duplicates logic in both `piece-removal-ordering` and `coin-assault-removal-order` by branching on `targetFactionMode` for `all` vs single-faction targeting.
3. `data/games/fire-in-the-lake/30-rules-actions.md` currently passes explicit `targetFactionMode: all` for ordinary Assault call sites, and `data/games/fire-in-the-lake/41-content-event-decks.md` passes `targetFactionMode: NVA` for Chu Luc.
4. `packages/engine/test/integration/fitl-removal-ordering.test.ts`, `packages/engine/test/integration/fitl-coin-operations.test.ts`, `packages/engine/test/integration/fitl-events-chu-luc.test.ts`, `packages/engine/test/integration/fitl-events-1965-nva.test.ts`, and `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` already pin the current shared-path shape and should be tightened, not replaced wholesale.
5. `archive/tickets/FREEOP-001-grant-scoped-action-context.md` already exposes generic `grantContext`, but the current Assault callers do not need direct grant coupling to achieve the cleaner design.
6. Mismatch: the earlier ticket assumption that no engine work was needed was wrong. While `TOKFILAST-040` covered runtime membership in token filters, the generic value/condition surface still could not treat literal scalar arrays as first-class `ValueExpr` values. That limitation prevented the cleanest `targetFactions`-only authoring shape.

## Architecture Check

1. A single authored removal pipeline driven by canonical runtime-set membership is cleaner than preserving parallel `all` and single-faction branches inside the shared macro.
2. `targetFactionMode` is a FITL-specific alias contract for a problem the engine should solve generically. The cleaner architecture is to let `GameSpecDoc` express scalar arrays directly as canonical `targetFactions` values rather than preserving FITL-specific selector aliases or workaround ordering controls.
3. This keeps all game semantics in FITL `GameSpecDoc`: FITL still decides what “all insurgents” or “NVA only” means by choosing the set, while the engine only evaluates generic filter expressions and bindings.
4. No backwards-compatibility layers should preserve `targetFactionMode` after the rework. Rewrite the shared helper and its callers around the canonical runtime-set surface directly.
5. This ticket should leave FITL in the shape we would want as the stable long-term example of data-authored targeted operations.

## What to Change

### 1. Replace `targetFactionMode` with a canonical `targetFactions` selector contract

Rewrite `piece-removal-ordering` / `coin-assault-removal-order` so the helper expresses one authored removal pipeline whose target selection is driven by a canonical `targetFactions` runtime set, rather than by duplicated `if all` / `else single faction` branches keyed off `targetFactionMode`.

If the current generic value/condition surface blocks a pure `targetFactions`-driven shape, improve that generic engine surface instead of preserving FITL-only aliasing or workaround inputs.

### 2. Keep default and targeted callers explicit in data

Ordinary US/ARVN Assault callers should remain explicit about their target selection, but they should now pass canonical sets such as `['NVA', 'VC']` rather than the FITL-specific `all` alias. Chu Luc should keep its NVA-only exhaustive behavior while passing the same shared authored structure a single-faction set such as `['NVA']`.

If caller data must also specify whether the first active-guerrilla faction is chosen or fixed, keep that explicit in data rather than smuggling it through a selector alias.

### 3. Reassess grant-context usage after the engine improvement

If a granted Assault caller later benefits from sourcing `targetFactions` from `grantContext`, encode that one layer up in FITL action/event data only when it reduces duplication without changing semantics. Do not add engine-side Assault-specific grant logic, and do not force grant-context coupling where literal data is cleaner.

### 4. Tighten regression coverage around the cleaner authored shape

Update structural assertions so tests no longer merely prove the shared helper exists; they must prove `targetFactionMode` and its branch-heavy workaround are gone and the canonical runtime-set authored shape is now the only path.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify if caller wiring changes)
- `packages/engine/test/integration/fitl-removal-ordering.test.ts` (modify)
- `packages/engine/test/integration/fitl-coin-operations.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-chu-luc.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-1965-nva.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` (modify)

## Out of Scope

- FITL-specific engine branches, aliases, or other game-coupled runtime logic.
- Changing non-Assault FITL operations unless they also benefit directly from the same cleanup.
- Visual presentation changes in `visual-config.yaml`.

## Acceptance Criteria

### Tests That Must Pass

1. Normal US/ARVN Assault still resolves in the printed/default insurgent order with no behavioral regression.
2. Targeted Assault consumers such as Chu Luc still resolve NVA-only behavior correctly, but the shared helper no longer relies on duplicated `all` vs single-faction workaround branches.
3. `targetFactionMode` no longer exists anywhere in FITL authored Assault data; the final contract is canonical `targetFactions` data with no separate workaround ordering-control input.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. FITL targeted Assault remains entirely data-authored; no game-specific engine logic is added.
2. The final shared Assault authoring shape relies on improved generic engine surface area rather than workaround duplication.
3. No FITL-specific selector alias contract or auxiliary ordering-control contract remains where a canonical runtime-set contract is sufficient.

## Tests

1. `packages/engine/test/integration/fitl-removal-ordering.test.ts` — update structure assertions to prove the workaround branching and `targetFactionMode` alias are gone and only the cleaner shared path remains.
2. `packages/engine/test/integration/fitl-coin-operations.test.ts` — keep ordinary Assault caller coverage aligned with the new canonical `targetFactions` shape.
3. `packages/engine/test/integration/fitl-events-chu-luc.test.ts` — preserve targeted runtime behavior while asserting Chu Luc consumes the final shared path via `targetFactions`.
4. `packages/engine/test/integration/fitl-events-1965-nva.test.ts` — keep production deck assertions aligned with the new card-47 authoring shape.
5. `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` — preserve backfill invariants for card 47 after the contract change.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-removal-ordering.test.ts` — verifies the shared Assault macro was simplified onto the canonical `targetFactions` engine surface.
2. `packages/engine/test/integration/fitl-coin-operations.test.ts` — verifies ordinary Assault callers still route through the shared path with default semantics expressed via `targetFactions`.
3. `packages/engine/test/integration/fitl-events-chu-luc.test.ts` — verifies targeted runtime behavior survives while authored structure loses the workaround and the alias contract.
4. `packages/engine/test/integration/fitl-events-1965-nva.test.ts` — verifies production card 47 assertions match the final shared targeted-Assault shape.
5. `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` — verifies card-47 backfill expectations still hold after the contract rewrite.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/integration/fitl-removal-ordering.test.ts`
3. `pnpm -F @ludoforge/engine test -- test/integration/fitl-coin-operations.test.ts`
4. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-chu-luc.test.ts`
5. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-1965-nva.test.ts`
6. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-text-only-behavior-backfill.test.ts`
7. `pnpm -F @ludoforge/engine test`
8. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completed: 2026-03-09
- Outcome amended: 2026-03-09
- What actually changed:
  - Added generic scalar-array `ValueExpr` support across the compiler, kernel evaluator, reference resolution, schema validation, and schema artifacts so `GameSpecDoc` can carry canonical scalar sets in general value positions.
  - Reworked FITL Assault authoring to remove the legacy `targetFactionMode` contract from `piece-removal-ordering`, `coin-assault-removal-order`, ordinary COIN Assault/Patrol callers, Chu Luc, and the CAP M48 bonus-removal helper.
  - Replaced the duplicated `all` vs single-faction removal bodies with one shared targeted removal pipeline driven by canonical `targetFactions`.
  - Removed the temporary first-faction ordering-control workaround entirely by deriving first-faction choice from canonical `targetFactions`.
  - Tightened FITL structural coverage so the shared helper, default callers, Chu Luc, production-deck assertions, and text-only backfill checks all pin the final authored shape.
  - Preserved the FITL rules invariant that underground VC still protect NVA bases during Chu Luc-style targeted Assault, so that rule remains data-authored exactly where it belongs.
- Deviations from original plan:
  - None on the final architecture. The earlier archived outcome that claimed no engine work was necessary was superseded once the generic scalar-array gap was confirmed and fixed.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine test -- test/unit/schemas-ast.test.ts test/unit/eval-value.test.ts test/unit/resolve-ref.test.ts test/unit/compile-bindings.test.ts test/unit/json-schema.test.ts test/integration/compile-pipeline.test.ts`
  - `pnpm -F @ludoforge/engine test -- test/integration/fitl-removal-ordering.test.ts`
  - `pnpm -F @ludoforge/engine test -- test/integration/fitl-coin-operations.test.ts`
  - `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-chu-luc.test.ts`
  - `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-1965-nva.test.ts`
  - `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-text-only-behavior-backfill.test.ts`
  - `pnpm -F @ludoforge/engine test -- test/integration/fitl-event-free-operation-grants.test.ts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm run check:ticket-deps`
