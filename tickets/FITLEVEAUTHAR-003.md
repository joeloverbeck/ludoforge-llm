# FITLEVEAUTHAR-003: Create shared FITL event fidelity test helpers

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test infrastructure only
**Deps**: None (can proceed in parallel with FITLEVEAUTHAR-001 and FITLEVEAUTHAR-002)

## Problem

Each FITL event card test file reinvents setup logic: compiling the production spec, building initial state, placing tokens in zones, overriding variables, applying event moves with decision overrides, and asserting outcomes. The existing `fitl-events-test-helpers.ts` (32 lines) only provides `createEligibilityOverride`. There is no standardized way to verify the five key fidelity dimensions: exact event text, compiled structural contract, deterministic execution, depletion/fallback behavior, and no-op behavior. A shared helper layer makes it cheap to add strong per-card coverage and exposes regressions faster.

## Assumption Reassessment (2026-03-13)

1. `packages/engine/test/integration/fitl-events-test-helpers.ts` exists but is minimal (32 lines, one helper) — confirmed.
2. 84 event test files exist, each with duplicated setup boilerplate (compileDef, setupEventState, makeToken, etc.) — confirmed by CIDG test pattern.
3. `packages/engine/test/helpers/` has 27 files with general helpers but no FITL event fidelity-specific module — confirmed.
4. Existing test pattern in `fitl-events-cidg.test.ts` shows the recurring boilerplate: `compileDef()`, `setupEventState()`, `makeToken()`, `applyMoveWithResolvedDecisionIds()` — confirmed.

## Architecture Check

1. Test helpers live in `packages/engine/test/helpers/` (engine test infrastructure) — correct location.
2. Helpers use only public kernel API (`initialState`, `legalMoves`, `legalChoicesEvaluate`, etc.) — no internal coupling.
3. No production source code changes — only test infrastructure.

## What to Change

### 1. Create `packages/engine/test/helpers/fitl-event-fidelity-helpers.ts`

Provide reusable helpers for the five fidelity dimensions:

- **`compileFitlDef()`** — Compile the full FITL production spec, assert no errors, return `GameDef`. Wraps the common `compileProductionSpec()` + `assertNoErrors()` + null-check pattern.
- **`setupFitlEventState(def, opts)`** — Build a `GameState` from a `GameDef` with declarative overrides: zone tokens, global variables, active player, event queue state. Replaces the per-test `setupEventState` functions.
- **`makeFitlToken(id, type, faction, extraProps?)`** — Standard token factory matching FITL naming conventions. Replaces per-test `makeToken` functions.
- **`assertEventText(def, cardId, expectedShaded, expectedUnshaded)`** — Verify a compiled event's text matches expected strings.
- **`assertCompiledStructure(def, cardId, checks)`** — Verify structural properties of the compiled event (e.g., number of effects, presence of specific effect types, decision points).
- **`runEventToCompletion(def, state, cardId, decisionOverrides, opts?)`** — Execute an event card from start to terminal state given a list of decision overrides. Return final state and trace. Wraps the move-apply loop.
- **`assertTokensInZone(state, zoneId, expectedTokens)`** — Assert exact token contents of a zone after event execution.
- **`assertNoOpEvent(def, state, cardId)`** — Verify that an event is legal but produces no state changes (empty target set).
- **`assertDepletionFallback(def, state, cardId, decisionOverrides)`** — Verify that when Available pools are empty, the event handles depletion correctly (partial execution or graceful skip).

### 2. Extend `packages/engine/test/integration/fitl-events-test-helpers.ts`

Keep existing `createEligibilityOverride` in place. Add re-exports from the new fidelity helpers for convenience, so existing integration test imports don't need to change paths.

## Files to Touch

- `packages/engine/test/helpers/fitl-event-fidelity-helpers.ts` (new)
- `packages/engine/test/integration/fitl-events-test-helpers.ts` (modify — add re-exports)

## Out of Scope

- Migrating existing event card tests to use the new helpers — that starts with FITLEVEAUTHAR-004 (CIDG rework) and continues per-card.
- Modifying any engine source code (compiler, kernel, agents, sim).
- Modifying game data files (`data/games/`).
- Adding new test cases for specific event cards.

## Acceptance Criteria

### Tests That Must Pass

1. New helper file compiles without TypeScript errors: `pnpm -F @ludoforge/engine build`.
2. Existing suite: `pnpm -F @ludoforge/engine test` — must remain green (no regressions; helpers are imported but not yet used by migrated tests).
3. A smoke test in the new helper file (or a dedicated `fitl-event-fidelity-helpers.test.ts`) verifies that `compileFitlDef()`, `setupFitlEventState()`, and `makeFitlToken()` produce valid objects.

### Invariants

1. No production source files are modified — only files under `packages/engine/test/`.
2. Existing `createEligibilityOverride` in `fitl-events-test-helpers.ts` remains unchanged and functional.
3. Helpers depend only on public kernel API exports — no internal module imports.
4. Helpers are generic enough to work for any FITL event card, not just CIDG.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/helpers/fitl-event-fidelity-helpers.test.ts` (new) — smoke tests for the helper functions: compile succeeds, state setup produces valid state, token factory produces correct shapes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
