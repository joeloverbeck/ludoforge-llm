# EVTLOG-012: Enforce strict endpoint identity in runner scope endpoint rendering

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: ENGINEARCH-028

## Problem

Runner endpoint scope rendering still tolerates missing endpoint identity (`playerId`/`zoneId`) by printing fallback labels (`Per Player`, `Zone`). This can hide malformed trace payloads and weaken event-log trust.

## Assumption Reassessment (2026-02-25)

1. Runner now rejects invalid endpoint `scope`, but still silently accepts missing identity fields for `perPlayer`/`zone` endpoint contexts.
2. Endpoint messages are intended to represent concrete transfer endpoints, so missing identity should be impossible under strict engine contracts.
3. **Mismatch + correction**: current runner behavior is still permissive for endpoint identity; ticket must switch endpoint rendering to fail-fast semantics.

## Architecture Check

1. Failing fast on missing endpoint identity is cleaner and more robust than fallback labels because endpoint log data should be concrete, not guessed.
2. This preserves the architecture boundary: runner displays agnostic runtime data and does not inject game-specific defaults.
3. No backwards-compatibility fallback labels for malformed endpoint payloads.

## What to Change

### 1. Tighten endpoint renderer contract

Make endpoint rendering require:
- `scope: perPlayer` -> required `playerId`
- `scope: zone` -> required `zoneId`

Throw on missing required identity instead of rendering fallback labels.

### 2. Update translation call surfaces and tests

Ensure all runner call sites pass strict endpoint identity and add failure-path assertions for malformed payloads.

## Files to Touch

- `packages/runner/src/model/model-utils.ts` (modify)
- `packages/runner/src/model/translate-effect-trace.ts` (modify)
- `packages/runner/test/model/model-utils.test.ts` (modify)
- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)

## Out of Scope

- Engine transfer/runtime contract work
- UI styling/text redesign

## Acceptance Criteria

### Tests That Must Pass

1. Endpoint renderer throws when `perPlayer` endpoint is missing `playerId`.
2. Endpoint renderer throws when `zone` endpoint is missing `zoneId`.
3. Valid endpoint rendering behavior remains unchanged for correct payloads.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Endpoint event-log rendering never fabricates endpoint identity.
2. Prefix context remains permissive only where runtime trigger contracts allow optional scope details.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/model-utils.test.ts` — strict missing-identity rejection for endpoint context.
2. `packages/runner/test/model/translate-effect-trace.test.ts` — malformed transfer endpoint payload fails fast at translation boundary.

### Commands

1. `pnpm -F @ludoforge/runner test -- model-utils translate-effect-trace`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
