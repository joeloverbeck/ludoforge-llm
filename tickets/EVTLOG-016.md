# EVTLOG-016: Centralize transfer endpoint normalization across projection and rendering

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None - runner-only
**Deps**: EVTLOG-015

## Problem

Transfer endpoint validation logic is currently split across projection (`trace-projection`) and rendering (`translate-effect-trace`) call paths. Although both now enforce parts of the contract, they duplicate normalization logic and risk drift in future endpoint contract changes.

## Assumption Reassessment (2026-02-26)

1. `trace-projection` and `translate-effect-trace` both inspect transfer endpoint payloads and scope fields.
2. Shared helper usage exists for object-shape and invalid-scope errors, but normalization remains duplicated (scope branching and identity extraction in multiple places).
3. **Mismatch + correction**: the architecture is improved but not yet ideal; transfer endpoint contract should be normalized once and reused across projection and rendering.

## Architecture Check

1. A single endpoint normalization module is cleaner and more robust than repeated scope/identity branching.
2. Shared normalized endpoint data improves extensibility (future endpoint contract additions require one update point).
3. This preserves game-agnostic boundaries: normalization is pure runner model logic, with no game-specific behavior in `GameDef` or simulation/runtime.
4. No compatibility aliases or coercion fallbacks should be added.

## What to Change

### 1. Introduce a single transfer endpoint normalization function

Create a shared model utility that validates and returns normalized transfer endpoints (`from`/`to`) with deterministic errors.

### 2. Refactor projection and rendering to consume normalized endpoints

Replace duplicated per-call-site scope branching with the shared normalized representation in:
- projection metadata derivation
- transfer event-log endpoint display

### 3. Expand cross-path invariant tests

Add tests that ensure malformed endpoint payloads fail identically through projection and translation paths and that valid endpoint messaging/projection behavior remains unchanged.

## Files to Touch

- `packages/runner/src/model/model-utils.ts` (modify)
- `packages/runner/src/model/translate-effect-trace.ts` (modify)
- `packages/runner/src/model/trace-projection.ts` (modify)
- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)
- `packages/runner/test/model/trace-projection.test.ts` (modify)

## Out of Scope

- Engine/runtime schema changes
- UI component-level formatting redesign

## Acceptance Criteria

### Tests That Must Pass

1. Projection and translation both use shared endpoint normalization and produce deterministic domain errors for malformed endpoint payloads.
2. Valid transfer endpoint projection and rendering outputs remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Transfer endpoint contract is defined in one place and consumed consistently across model layers.
2. Game-specific data remains in `GameSpecDoc` and `visual-config.yaml`; runtime/simulation contracts remain agnostic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` - retain/extend malformed endpoint contract assertions against the shared normalizer path.
2. `packages/runner/test/model/trace-projection.test.ts` - add malformed endpoint payload assertions and valid-path regression checks using shared normalization.

### Commands

1. `pnpm -F @ludoforge/runner test -- translate-effect-trace trace-projection`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
