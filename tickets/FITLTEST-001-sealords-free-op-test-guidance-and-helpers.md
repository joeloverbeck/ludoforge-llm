# FITLTEST-001: Sealords Follow-Up Testing Helpers and FITL Cookbook Guidance

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test helpers only in `packages/engine/test/helpers`
**Deps**: `tickets/README.md`, `docs/fitl-event-authoring-cookbook.md`, `packages/engine/test/helpers/turn-order-helpers.ts`, `packages/engine/test/helpers/decision-param-helpers.ts`

## Problem

Recent FITL event work on card 92 (`SEALORDS`) exposed recurring test-authoring confusion around ordered free-operation grants, `limitedOperation` move shapes, and decision normalization. The implementation was data-correct, but the test loop was slowed by avoidable ambiguity:

- ordered grants did not surface the way the initial test expected under `requireUsableAtIssue`
- `limitedOperation` free-op tests were easy to write with the wrong move shape
- multi-grant event windows made narrow behavior assertions harder to isolate
- FITL geography-sensitive targeting needed explicit cookbook guidance so tests assert both inclusion and exclusion instead of relying on adjacency intuition

The repo should provide a cleaner testing path for these scenarios and document the FITL-specific authoring/testing lessons in the FITL cookbook, not in repository-wide agent instruction files.

## Assumption Reassessment (2026-03-15)

1. Current FITL free-operation tests already rely on `pendingFreeOperationGrants`, `normalizeDecisionParamsForMove`, and `applyMoveWithResolvedDecisionIds`, so the right improvement is to reduce friction around those patterns rather than invent a new FITL-only runtime path.
2. `docs/fitl-event-authoring-cookbook.md` already serves as the canonical FITL event guidance document, so game-specific lessons from Sealords belong there rather than in `AGENTS.md` or `CLAUDE.md`.
3. The mismatch discovered during Sealords work was primarily test-shape confusion, not a required engine-runtime architecture change. Scope should therefore stay limited to helper ergonomics and cookbook/testing guidance.

## Architecture Check

1. Adding a reusable test helper for isolated pending free-operation grants is cleaner than recreating raw card-driven runtime objects inline in each FITL event test. It keeps tests shorter and makes grant-specific behavior assertions easier to read and maintain.
2. Recording FITL-specific targeting and test-authoring lessons in the FITL cookbook preserves the `GameSpecDoc` versus engine boundary: FITL guidance stays in FITL docs, while engine/runtime remains game-agnostic.
3. This ticket introduces no backwards-compatibility shims, alias shapes, or card-specific runtime branches. It standardizes existing generic test patterns and documents card-authoring/testing expectations.

## What to Change

### 1. Add an isolated free-operation grant test helper

Add or extend a helper under `packages/engine/test/helpers/` that can:

- take a `cardDriven` state
- set the active seat
- install one or more `pendingFreeOperationGrants`
- preserve the current runtime shape without forcing each test to hand-roll grant objects inline

The helper should be generic, not FITL-specific. It should support ordered/required free-op tests and `executionContext`-driven behavior checks such as:

- in-place Sweep restrictions
- suppressed follow-up choices
- zone-filtered grant isolation

### 2. Document ordered free-op and limited-op testing guidance

Update test guidance in a suitable repo testing location or helper-adjacent documentation/comments to state that ordered free-operation tests should prefer:

- `pendingFreeOperationGrants` assertions for readiness/sequence windows
- resolved board-state assertions for effect behavior
- surfaced legal moves or normalized surfaced moves for `limitedOperation`

Also document what to avoid:

- asserting on unresolved `legalMoves(...).params` for ordered free-op windows unless move shape itself is the subject under test
- using large multi-grant event windows when a single isolated grant fixture would test the behavior more directly

### 3. Add FITL cookbook guidance for geography-sensitive event targeting

Update `docs/fitl-event-authoring-cookbook.md` with FITL-specific lessons from Sealords:

- when playbook/rules narrow a nominal adjacency concept, encode the target space set explicitly in FITL YAML/macros
- test both inclusion and exclusion for disputed or easy-to-misread spaces
- for ordered free-op FITL events, verify runtime grant surfacing and outcome state rather than assuming every authored grant will appear immediately

This guidance should remain FITL-specific and stay in the cookbook.

## Files to Touch

- `packages/engine/test/helpers/turn-order-helpers.ts` (modify)
- `packages/engine/test/helpers/decision-param-helpers.ts` (modify, if helper placement fits better here)
- `docs/fitl-event-authoring-cookbook.md` (modify)
- `packages/engine/test/integration/fitl-events-sealords.test.ts` (modify, only if needed to adopt the new helper as the proving example)

## Out of Scope

- Any new FITL card implementation work
- Engine-runtime behavior changes for free-operation sequencing
- Changes to `AGENTS.md` or `CLAUDE.md`
- Generic map adjacency rewrites or geography model changes

## Acceptance Criteria

### Tests That Must Pass

1. A helper-backed test can create an isolated pending `limitedOperation` free-op grant and execute it without hand-rolled runtime duplication inside the test body.
2. FITL cookbook guidance explicitly covers explicit target sets for geography-sensitive cards and runtime-first testing for ordered free-op events.
3. Existing suite: `pnpm -F @ludoforge/engine build`

### Invariants

1. New helpers remain game-agnostic and operate on generic card-driven free-operation grant state.
2. FITL-specific guidance stays in `docs/fitl-event-authoring-cookbook.md`, not in global repository agent-instruction files.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-sealords.test.ts` — adopt the new helper for one or more isolated free-op grant assertions and prove the helper removes inline runtime duplication.
2. `packages/engine/test/unit/kernel/free-operation-grant-bindings.test.ts` or a nearby helper-focused unit test — verify the helper preserves grant metadata needed for authorization and decision resolution.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/integration/fitl-events-sealords.test.js`
3. `pnpm run check:ticket-deps`
