# FITLASSAULT-001: Refactor FITL Assault data to consume grant-scoped target restrictions

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — depends on generic engine support from `FREEOP-001`, but game logic remains in FITL data
**Deps**: FREEOP-001, `tickets/README.md`, `data/games/fire-in-the-lake/20-macros.md`, `data/games/fire-in-the-lake/30-rules-actions.md`, `packages/engine/test/integration/fitl-coin-operations.test.ts`

## Problem

Fire in the Lake Assault data currently assumes COIN Assault always targets the full insurgent set allowed by the printed default rules. That is correct for normal Assault, but it prevents event-driven variants from narrowing the target set through shared action logic.

Because the Assault profiles and shared removal macros cannot read a grant-scoped target restriction, `card-47` needed a bespoke `coin-assault-removal-order-single-faction` macro in event data. That macro duplicates core Assault behavior and creates drift risk for future rule fixes.

## Assumption Reassessment (2026-03-09)

1. `data/games/fire-in-the-lake/30-rules-actions.md` still routes ARVN Assault through `coin-assault-removal-order`, which hardcodes NVA/VC target handling rather than reading any external target restriction.
2. `data/games/fire-in-the-lake/20-macros.md` now contains `coin-assault-removal-order-single-faction`, added specifically to let Chu Luc remove NVA only while preserving Assault ordering/base-protection behavior.
3. `packages/engine/test/integration/fitl-coin-operations.test.ts` and `packages/engine/test/integration/fitl-removal-ordering.test.ts` already assert the shared Assault/removal structure, so the refactor must preserve ordinary Assault semantics when no grant-scoped restriction exists.
4. Mismatch: a pure engine fix is insufficient. Even after `FREEOP-001`, FITL action data still must be refactored to read the new generic context and default cleanly when that context is absent.

## Architecture Check

1. Reading an optional target restriction from shared Assault data is cleaner than keeping a second single-faction macro family or adding Chu Luc-specific branches.
2. The engine stays agnostic because the interpretation of `targetFactions` or equivalent payload keys lives entirely in FITL `GameSpecDoc` data and tests.
3. No compatibility shim should preserve the bespoke single-faction helper once the shared path is working; remove the duplicate path rather than maintaining both.

## What to Change

### 1. Teach shared FITL Assault macros to read optional target restrictions

Refactor the Assault/removal macros so they can derive the target faction set from the new grant-scoped execution context, defaulting to the normal insurgent set when the context is absent.

### 2. Keep normal Assault behavior unchanged by default

Paid Assault, ordinary free Assault, ARVN follow-up Assault, and capability-driven variants must continue to resolve exactly as they do now when no target restriction is present.

### 3. Remove the bespoke single-faction Assault helper

Delete `coin-assault-removal-order-single-faction` after the shared Assault path can express the same behavior through context-driven target filtering.

### 4. Update FITL verbalization and regression tests

If macro/action verbalization snapshots mention the old helper shape, update them to reflect the shared target-aware path and add runtime tests for restricted-target Assault resolution.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `data/games/fire-in-the-lake/05-verbalization.md` (modify)
- `packages/engine/test/integration/fitl-coin-operations.test.ts` (modify)
- `packages/engine/test/integration/fitl-removal-ordering.test.ts` (modify)

## Out of Scope

- Rewriting Chu Luc event data itself.
- Changing non-Assault COIN operations unless they also need the new shared target-restriction surface.
- Introducing Fire in the Lake-specific branches in engine code.

## Acceptance Criteria

### Tests That Must Pass

1. Normal ARVN Assault still removes insurgent pieces in the current printed order when no grant-scoped target restriction exists.
2. A free/granted ARVN Assault can restrict removal to NVA only (and, if supported by the chosen payload shape, VC only) through shared Assault data rather than a bespoke event helper.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. FITL target-restriction semantics live in game data, not kernel special cases.
2. There is only one shared Assault removal path after the refactor; no duplicate Chu Luc-only helper remains.

## Tests

1. Expand `packages/engine/test/integration/fitl-coin-operations.test.ts` with restricted-target Assault runtime cases that prove NVA-only removal leaves VC untouched while preserving base-protection rules.
2. Update `packages/engine/test/integration/fitl-removal-ordering.test.ts` to assert the shared macro structure after the duplicate single-faction helper is removed.
3. Run the focused FITL Assault suite and then the broader engine test suite.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coin-operations.test.ts` — add NVA-only and default-target Assault runtime coverage.
2. `packages/engine/test/integration/fitl-removal-ordering.test.ts` — update structural assertions around shared removal macros.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/integration/fitl-coin-operations.test.ts`
3. `pnpm -F @ludoforge/engine test -- test/integration/fitl-removal-ordering.test.ts`
4. `pnpm -F @ludoforge/engine test`
