# ENGINEARCH-124: Unify Free-Operation Denial Analysis Single-Pass

**Status**: COMPLETED (2026-02-28)
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — legalChoices discovery pipeline contract wiring
**Deps**: tickets/ENGINEARCH-122-free-operation-zone-filter-deferral-generic-binding-classifier.md, tickets/ENGINEARCH-123-free-operation-zone-filter-deferral-path-completeness.md

## Problem

`legalChoicesDiscover` currently evaluates free-operation grant matching multiple times in `legalChoicesWithPreparedContext`:
- denial explanation via `explainFreeOperationBlockForMove(...)` (zone filters evaluated)
- execution player override via `resolveFreeOperationExecutionPlayer(...)` (grant matching recomputed)
- zone filter payload via `resolveFreeOperationZoneFilter(...)` (grant matching recomputed)

These repeated passes duplicate turn-flow grant-policy evaluation and increase long-term drift risk.

## Assumption Reassessment (2026-02-27)

1. `legalChoicesWithPreparedContext` currently calls free-operation denial analysis before preflight.
2. The same flow later resolves free-operation execution player and zone filter through separate helper calls that each rerun grant matching.
3. The discovery path consumes the preflight result for effect context; there is no additional free-operation recomputation after preflight inside this flow.
4. Mismatch: duplicated evaluation entry points can drift; corrected scope is to compute and thread one canonical free-operation analysis artifact through the discovery step.

## Architecture Check

1. Single-pass analysis is cleaner, more maintainable, and easier to reason about than repeated recomputation.
2. This keeps runtime generic and avoids game-specific logic in flow control.
3. No backwards-compatibility aliasing; one authoritative internal contract for discovery-time free-operation analysis.

## What to Change

### 1. Introduce a discovery-scoped free-operation analysis artifact

Define a local runtime artifact that contains:
- denial explanation
- execution player override (if applicable)
- resolved zone filter (if applicable)
- resolved zone filter diagnostics payload inputs
- enough grant-match context to ensure precheck + preflight consume a single shared analysis basis

### 2. Thread artifact through preflight/effect context assembly

Use the artifact to avoid recomputing execution/zone-filter derivations later in discovery.

### 3. Strengthen drift guard tests

Add/extend tests that would fail if denial reasoning and preflight zone-filter application diverge.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/action-applicability-preflight.ts` (modify only if artifact threading requires call-shape updates)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify if parity guard scenarios need extension)

## Out of Scope

- Applying the same refactor to non-discovery surfaces.
- Turn-flow data model changes.

## Acceptance Criteria

### Tests That Must Pass

1. Discovery uses one canonical free-operation analysis pass for denial + preflight wiring.
2. No behavioral regression in denial causes (`noActiveSeatGrant`, `sequenceLocked`, `actionClassMismatch`, `actionIdMismatch`, `zoneFilterMismatch`).
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Single-source-of-truth internal contract for discovery free-operation analysis.
2. Engine remains game-agnostic and reusable across GameSpecDoc-authored games.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — guard against drift between denial explanation and downstream discovery preflight behavior.
2. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — ensure free-operation denial parity still holds after single-pass refactor.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`

## Outcome

Implemented:
- Added a single discovery-scoped free-operation analysis resolver and wired `legalChoicesWithPreparedContext` to consume one canonical artifact for denial + preflight execution/zone-filter threading.
- Preserved existing denial-cause behavior and zone-filter diagnostics semantics.
- Added a focused regression test covering free-operation `executeAsSeat` impact on discovery preflight pipeline applicability.

Differences vs original plan:
- `packages/engine/src/kernel/action-applicability-preflight.ts` did not require changes after reassessment.
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` already provided sufficient denial parity coverage; no modification was needed.
