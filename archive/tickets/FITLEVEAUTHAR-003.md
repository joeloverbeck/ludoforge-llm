# FITLEVEAUTHAR-003: Create shared FITL event fidelity test helpers

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test infrastructure only
**Deps**: None

## Problem

Many FITL event card tests still reinvent the same local scaffolding: obtaining the cached production `GameDef`, building an isolated runtime state, creating FITL tokens, locating an event move, applying it with deterministic decision overrides, and doing simple zone/token assertions. The existing `fitl-events-test-helpers.ts` only provides `createEligibilityOverride`. Shared event helpers would reduce repetition and make complex event suites easier to extend without pushing FITL-specific behavior into engine/runtime code.

## Assumption Reassessment (2026-03-13)

1. `packages/engine/test/integration/fitl-events-test-helpers.ts` exists but is minimal (32 lines, one helper) — confirmed.
2. There are currently 80 `fitl-events-*.test.ts` integration files, and 61 of them still declare local `compileDef()` / `makeToken()` style helpers — confirmed.
3. `packages/engine/test/helpers/` already contains shared infrastructure we should build on instead of wrapping again:
   - `production-spec-helpers.ts` already exposes cached FITL compilation via `getFitlProductionFixture()`.
   - `isolated-state-helpers.ts` already exposes isolated initial-state creation via `makeIsolatedInitialState()` and `clearAllZones()`.
   - `decision-param-helpers.ts` already exposes deterministic event execution via `applyMoveWithResolvedDecisionIds()`.
   - `fitl-playbook-harness.ts` already covers larger turn/snapshot replay use cases.
4. Existing event suites such as `fitl-events-cidg.test.ts` show the recurring boilerplate we should centralize: cached FITL fixture access, isolated state setup, FITL token factories, event move lookup, and deterministic execution with overrides.
5. The ticket originally pointed to `specs/62-fitl*`; the relevant source of truth is currently [specs/62-fitl-event-authoring-hardening.md](/home/joeloverbeck/projects/ludoforge-llm/specs/62-fitl-event-authoring-hardening.md).

## Architecture Check

1. Test helpers should live in `packages/engine/test/helpers/` and be re-exported through the existing integration-facing helper entrypoint.
2. The new helper layer should compose existing shared test helpers instead of introducing duplicate wrappers around FITL compilation or isolated-state creation.
3. Prefer composable primitives over a bespoke assertion DSL. Generic operations like event lookup, deterministic execution, and token/zone inspection age better than one-off `assertCompiledStructure(checks)` style mini-frameworks.
4. No production source code changes — only files under `packages/engine/test/`.

## What to Change

### 1. Create `packages/engine/test/helpers/fitl-event-fidelity-helpers.ts`

Provide reusable, composable FITL event helpers built on the existing shared test infrastructure:

- **`getFitlEventFixture()` / `getFitlEventDef()`** — Return the cached FITL production fixture / `GameDef` by composing `getFitlProductionFixture()`. Do not recompile or duplicate existing compilation assertions.
- **`setupFitlEventState(def, opts)`** — Build an isolated event-focused `GameState` by composing `makeIsolatedInitialState()` and declarative overrides for zones, globals, markers, active player, and turn-order mode.
- **`makeFitlToken(id, type, faction, extraProps?)`** — Standard token factory matching FITL naming conventions.
- **`findEventMove(def, state, cardId, side)`** — Locate a specific event move using public kernel APIs.
- **`runEvent(def, state, cardId, side, options?)`** — Execute an event deterministically via `applyMoveWithResolvedDecisionIds()` and return the apply result.
- **`getEventCard(def, cardId)`** and **`assertEventText(def, cardId, expected)`** — Small structural helpers for exact compiled-card lookup and text assertions.
- **Small inspection/assertion primitives** such as token-id collection and exact no-op state assertions, but only where they remove repeated boilerplate without hiding test intent.

Do **not** introduce an overly generic `assertCompiledStructure(def, cardId, checks)` mini-DSL. Structural assertions should remain explicit in the card test that cares about them.

### 2. Extend `packages/engine/test/integration/fitl-events-test-helpers.ts`

Keep existing `createEligibilityOverride` in place. Add re-exports from the new fidelity helpers for convenience, so existing integration test imports don't need to change paths.

### 3. Migrate one representative event suite

Migrate `packages/engine/test/integration/fitl-events-cidg.test.ts` to the new helpers. This is required to prove the helper surface is actually ergonomic for a complex dual-sided event with exact text checks, deterministic decision overrides, depletion behavior, and no-op behavior.

## Files to Touch

- `packages/engine/test/helpers/fitl-event-fidelity-helpers.ts` (new)
- `packages/engine/test/integration/fitl-events-test-helpers.ts` (modify — add re-exports)
- `packages/engine/test/integration/fitl-events-cidg.test.ts` (modify — consume the new helpers)
- `packages/engine/test/integration/fitl-event-fidelity-helpers.test.ts` (new)

## Out of Scope

- Broad migration of all FITL event card suites. This ticket should validate the helper design with CIDG only; wider adoption belongs in follow-up tickets.
- Modifying any engine source code (compiler, kernel, agents, sim).
- Modifying game data files (`data/games/`).
- Changing event behavior or card data.

## Acceptance Criteria

### Tests That Must Pass

1. New helper file compiles without TypeScript errors: `pnpm -F @ludoforge/engine build`.
2. Engine lint remains green: `pnpm -F @ludoforge/engine lint`.
3. Existing engine tests remain green: `pnpm -F @ludoforge/engine test`.
4. A dedicated helper test verifies the new helper primitives (fixture access, state setup, token factory, event move lookup, exact text lookup, and no-op assertion behavior).
5. `fitl-events-cidg.test.ts` runs green after being migrated to the shared helpers.

### Invariants

1. No production source files are modified — only files under `packages/engine/test/`.
2. Existing `createEligibilityOverride` in `fitl-events-test-helpers.ts` remains unchanged and functional.
3. New helpers compose existing shared test helpers instead of duplicating FITL compilation/state bootstrap logic.
4. Helpers depend only on existing test infrastructure plus public kernel API exports — no new production internals.
5. The helper surface is generic enough to support other FITL event cards, not just CIDG.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-fidelity-helpers.test.ts` (new) — helper-focused coverage for fixture access, state setup, token factory, event lookup, and no-op/event-text primitives.
2. `packages/engine/test/integration/fitl-events-cidg.test.ts` (modified) — migrated to shared helpers; existing behavioral coverage preserved.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine lint`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-13
- Actual changes:
  - Added `packages/engine/test/helpers/fitl-event-fidelity-helpers.ts` with shared composable FITL event helpers for cached fixture access, isolated event-state setup, token creation, event lookup, deterministic event execution, exact text assertions, zone inspection, and no-op assertions.
  - Re-exported the new helpers from `packages/engine/test/integration/fitl-events-test-helpers.ts` without changing `createEligibilityOverride`.
  - Added `packages/engine/test/integration/fitl-event-fidelity-helpers.test.ts` to validate the helper API directly.
  - Migrated `packages/engine/test/integration/fitl-events-cidg.test.ts` to the shared helpers while preserving its event-behavior assertions.
- Deviations from original plan:
  - Did not add a generic `assertCompiledStructure(def, cardId, checks)` mini-DSL. The implemented helper surface stays at the level of reusable primitives so structural assertions remain explicit in the event suite that cares about them.
  - Built on existing shared test infrastructure (`getFitlProductionFixture()`, `makeIsolatedInitialState()`, `applyMoveWithResolvedDecisionIds()`) instead of adding another wrapper layer around FITL compilation/bootstrap.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine test`
