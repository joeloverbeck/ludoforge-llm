# 62BINCCHOPRO-008: Integration tests — card 87 re-authoring + generic prioritized `chooseN`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — data file + test files
**Deps**: tickets/62BINCCHOPRO-004.md, tickets/62BINCCHOPRO-003.md, tickets/62BINCCHOPRO-002.md

## Problem

The incremental `chooseN` protocol and tier-admissibility enforcement need end-to-end validation. Card 87 (Nguyen Chanh Thi) must be re-authored to use `prioritized` query, and the new protocol must be tested with both FITL-specific and generic non-FITL fixtures to prove engine-agnosticism.

## Assumption Reassessment (2026-03-14)

1. Card 87 is in `data/games/fire-in-the-lake/41-events/065-096.md`. Its unshaded effect currently uses a `concat` query that pools Available and map sources freely, violating FITL Rule 1.4.1. Confirmed.
2. FITL integration tests use `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`. Confirmed per CLAUDE.md.
3. FITL event tests exist for other cards (e.g., `fitl-events-nguyen-chanh-thi.test.ts` or similar). Confirmed.
4. Synthetic fixtures use inline Game Spec Markdown or fixture files in `packages/engine/test/fixtures/`. Confirmed.
5. The `advanceChooseN` function (ticket 004) and shared tier helper (ticket 002) will be available. Confirmed.

## Architecture Check

1. Card 87 re-authoring is a data-only change — no engine source is modified.
2. The `prioritized` query with `qualifierKey: type` encodes Rule 1.4.1 in authored YAML, keeping the engine game-agnostic.
3. The generic non-FITL fixture demonstrates `prioritized` with a different `qualifierKey` (e.g., `color`) in a synthetic game, proving no FITL dependency.
4. Integration tests exercise the full pipeline: Game Spec → compile → kernel `advanceChooseN` → verify stepwise legality transitions.

## What to Change

### 1. Re-author card 87 to use `prioritized` query

In `data/games/fire-in-the-lake/41-events/065-096.md`, replace card 87's unshaded effect `chooseN` options from `concat` query to `prioritized` query with `qualifierKey: type`, following the spec's authored YAML pattern.

### 2. FITL integration tests — stepwise tier enforcement

Test using `compileProductionSpec()` + `advanceChooseN`:

- **Test A**: Map pieces of a type remain unavailable while Available pieces of that type still exist. Set up state with Available ARVN Troops + map ARVN Troops. Use `advanceChooseN` to add Available troops. Verify map troops are `illegal` in options. After exhausting Available troops of that type, verify map troops become `legal`.
- **Test B**: Once higher-tier pieces of a type are exhausted by prior selections, lower-tier pieces of that type become selectable. Set up state with 1 Available troop + 2 map troops. Add the Available troop. Verify map troops transition from `illegal` to `legal`.
- **Test C**: Mixed types are independent. Set up Available Troops + Available Police + map Troops. Exhausting Available Troops unlocks map Troops, but Available Police remain preferred for Police type.

### 3. Generic non-FITL integration test

Create a synthetic fixture with `prioritized` query using a different qualifier (e.g., `qualifierKey: 'color'`, tiers for 'shelf' vs 'warehouse' sources). Test stepwise selection through `advanceChooseN` proving the same tier-admissibility rules apply without any FITL-specific code.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify — card 87 re-authoring)
- `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts` (new or modify — FITL integration tests)
- `packages/engine/test/integration/prioritized-choose-n.test.ts` (new — generic non-FITL integration test)
- `packages/engine/test/fixtures/prioritized-choose-n-fixture.md` (new — synthetic Game Spec fixture for generic test)

## Out of Scope

- Engine kernel source changes (tickets 62BINCCHOPRO-001 through -004)
- Runner changes (tickets 62BINCCHOPRO-005 through -007)
- Other FITL event cards — only card 87 is re-authored
- Non-card-87 FITL rules
- Performance optimization of the incremental protocol
- Per-piece animation implementation

## Acceptance Criteria

### Tests That Must Pass

1. Card 87 compiles successfully with `compileProductionSpec()` using the `prioritized` query
2. FITL Test A: Available pieces of a type are preferred over map pieces of the same type — map pieces are `illegal` while Available pieces remain
3. FITL Test B: After exhausting higher-tier pieces of a type via `advanceChooseN` add commands, lower-tier pieces become `legal`
4. FITL Test C: Qualifier independence — exhausting one type's Available pieces does not affect another type's tier ordering
5. Generic Test: Non-FITL `prioritized` fixture with `qualifierKey: 'color'` enforces the same tier rules
6. Generic Test: Stepwise add/remove/confirm through `advanceChooseN` works correctly
7. AI fast-path: `resolveMoveDecisionSequence` with card 87's `chooseN` and a `choose` callback returning a full legal array still works
8. `pnpm turbo build` succeeds
9. Existing suite: `pnpm -F @ludoforge/engine test` — no regressions

### Invariants

1. Card 87's re-authored YAML uses only generic `prioritized` query syntax — no kernel changes needed
2. No FITL-specific identifiers in the generic integration test
3. No FITL-specific identifiers in engine kernel code
4. Discovery-time and apply-time agree on admissibility in all test scenarios
5. The AI fast-path is unaffected by the re-authoring

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts` — card 87 stepwise tier enforcement (Tests A, B, C)
2. `packages/engine/test/integration/prioritized-choose-n.test.ts` — generic non-FITL prioritized `chooseN` integration
3. `packages/engine/test/fixtures/prioritized-choose-n-fixture.md` — synthetic fixture

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
