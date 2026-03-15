# FITLTEST-001: Sealords Follow-Up Testing Helpers and FITL Cookbook Guidance

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test helpers only in `packages/engine/test/helpers`
**Deps**: `tickets/README.md`, `docs/fitl-event-authoring-cookbook.md`, `packages/engine/test/helpers/turn-order-helpers.ts`, `packages/engine/test/helpers/decision-param-helpers.ts`

## Problem

Recent FITL event work on card 92 (`SEALORDS`) exposed recurring test-authoring confusion around ordered free-operation grants, `limitedOperation` move shapes, and decision normalization.

Reassessment on 2026-03-15 showed the codebase already contains the intended helper, cookbook guidance, and test coverage. The actual discrepancy was ticket drift: this ticket remained active and written as planned work even though the implementation had already landed.

The original motivating concerns were:

- ordered grants did not surface the way the initial test expected under `requireUsableAtIssue`
- `limitedOperation` free-op tests were easy to write with the wrong move shape
- multi-grant event windows made narrow behavior assertions harder to isolate
- FITL geography-sensitive targeting needed explicit cookbook guidance so tests assert both inclusion and exclusion instead of relying on adjacency intuition

The repo should provide a cleaner testing path for these scenarios and document the FITL-specific authoring/testing lessons in the FITL cookbook, not in repository-wide agent instruction files.

## Assumption Reassessment (2026-03-15)

1. The core assumption still holds: the right architectural direction is generic helper ergonomics around `pendingFreeOperationGrants`, `normalizeDecisionParamsForMove`, and `applyMoveWithResolvedDecisionIds`, not a FITL-specific runtime path.
2. `docs/fitl-event-authoring-cookbook.md` is correctly the canonical home for FITL-specific authoring and testing guidance; no repository-global instruction changes are warranted.
3. The main discrepancy was status and scope drift in this ticket, not missing engine work. The helper and cookbook updates already exist in the codebase, and unit/integration coverage is already present.
4. The clean architecture call remains valid: ordered free-op complexity belongs in generic turn-flow/runtime code and generic test helpers, while Sealords-specific targeting remains in FITL data and FITL-local tests.

## Architecture Check

1. The current architecture is preferable to any alternative that adds FITL-only runtime helpers or aliases. `withPendingFreeOperationGrant` and `withIsolatedFreeOperationGrant` keep the helper layer generic and reusable across card-driven games.
2. Keeping geography-sensitive targeting guidance in the FITL cookbook preserves the engine/data boundary: the engine stays agnostic, while card-specific targeting rules remain declarative and game-local.
3. No backwards-compatibility shims or alias surfaces should be introduced here. The current canonical patterns already enforce the cleaner contract: explicit grant metadata, canonical decision resolution, and test assertions against surfaced runtime state rather than speculative intermediate params.

## Verified Scope

The following work is already present and was verified rather than newly implemented in this pass:

### 1. Generic isolated free-operation grant helper

`packages/engine/test/helpers/turn-order-helpers.ts` already provides:

- `withPendingFreeOperationGrant`
- `withIsolatedFreeOperationGrant`

These helpers:

- operate on generic `cardDriven` runtime state
- can set the active player for isolated grant execution
- preserve canonical grant metadata needed by authorization and decision-resolution paths
- avoid FITL-specific runtime branches

### 2. Ordered free-op and limited-op testing guidance

The intended guidance already exists in:

- helper-adjacent comments in `packages/engine/test/helpers/turn-order-helpers.ts`
- `docs/fitl-event-authoring-cookbook.md`

Those docs already direct tests toward:

- `pendingFreeOperationGrants` assertions for sequence windows
- resolved board-state assertions for behavior
- normalized/surfaced `limitedOperation` move handling

### 3. FITL cookbook guidance for geography-sensitive targeting

`docs/fitl-event-authoring-cookbook.md` already documents:

- explicit target-set encoding when playbook/rules narrow map adjacency
- inclusion and exclusion assertions for geography-sensitive cards
- ordered free-op runtime-first testing patterns using Sealords as the production reference

## Files to Touch

- `packages/engine/test/helpers/turn-order-helpers.ts` (already modified before this verification pass)
- `packages/engine/test/integration/fitl-events-sealords.test.ts` (already modified before this verification pass)
- `packages/engine/test/unit/kernel/free-operation-grant-bindings.test.ts` (already modified before this verification pass)
- `docs/fitl-event-authoring-cookbook.md` (already modified before this verification pass)
- `tickets/FITLTEST-001-sealords-free-op-test-guidance-and-helpers.md` (updated on 2026-03-15 to correct status/scope and record outcome)

## Out of Scope

- Any new FITL card implementation work
- Engine-runtime behavior changes for free-operation sequencing
- Changes to `AGENTS.md` or `CLAUDE.md`
- Generic map adjacency rewrites or geography model changes

## Acceptance Criteria

### Verified Results

1. A helper-backed test can create an isolated pending `limitedOperation` free-op grant and execute it without hand-rolled runtime duplication inside the test body.
2. FITL cookbook guidance explicitly covers explicit target sets for geography-sensitive cards and runtime-first testing for ordered free-op events.
3. The helper remains game-agnostic and preserves grant metadata required by authorization and decision resolution.
4. Relevant build, lint, targeted tests, and the full engine test package all pass on 2026-03-15.

### Invariants

1. New helpers remain game-agnostic and operate on generic card-driven free-operation grant state.
2. FITL-specific guidance stays in `docs/fitl-event-authoring-cookbook.md`, not in global repository agent-instruction files.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-sealords.test.ts` — already covers ordered grant surfacing plus isolated ARVN/US grant execution using `withIsolatedFreeOperationGrant`.
2. `packages/engine/test/unit/kernel/free-operation-grant-bindings.test.ts` — already covers helper metadata preservation, append semantics, and isolated-grant replacement/active-player setup.
3. `packages/engine/test/unit/decision-param-helpers.test.ts` — extra verification run because Sealords helper usage depends on canonical decision normalization rather than alias-style params.

### Commands Run

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine lint`
3. `node --test packages/engine/dist/test/integration/fitl-events-sealords.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/free-operation-grant-bindings.test.js`
5. `node --test packages/engine/dist/test/unit/decision-param-helpers.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-15
- What actually changed:
  - Reassessed the ticket against the live codebase.
  - Confirmed the generic free-operation test helper, Sealords integration coverage, helper unit coverage, and FITL cookbook guidance were already implemented.
  - Updated this ticket so it accurately reflects the completed architecture and verified test surface.
- Deviations from original plan:
  - No engine or test-source changes were required in this pass because the intended implementation had already landed.
  - The remaining work was ticket correction, verification, and archival rather than new helper/runtime implementation.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `node --test packages/engine/dist/test/integration/fitl-events-sealords.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/free-operation-grant-bindings.test.js` passed.
  - `node --test packages/engine/dist/test/unit/decision-param-helpers.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed with 385/385 tests.
  - `pnpm run check:ticket-deps` passed.
