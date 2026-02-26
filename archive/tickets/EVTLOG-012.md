# EVTLOG-012: Enforce strict endpoint identity in runner scope endpoint rendering

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: ENGINEARCH-028

## Problem

Runner endpoint scope rendering still tolerates missing endpoint identity (`playerId`/`zoneId`) by printing fallback labels (`Per Player`, `Zone`). This can hide malformed trace payloads and weaken event-log trust.

## Assumption Reassessment (2026-02-26)

1. ✅ Confirmed: runner already rejects invalid endpoint `scope` at runtime (`Invalid endpoint scope for event-log rendering`).
2. ✅ Confirmed: endpoint rendering for `perPlayer`/`zone` still silently accepts missing identity and falls back to generic labels.
3. ✅ Confirmed: translation call sites already pass endpoint scope details; the architectural gap is contract strictness, not missing plumbing.
4. **Scope correction**: focus this ticket on strict endpoint identity enforcement (type + runtime), and on tests for malformed identity payloads.

## Architecture Check

1. Failing fast on missing endpoint identity is cleaner and more robust than fallback labels because endpoint log data should be concrete, not guessed.
2. Stronger endpoint input typing (discriminated endpoint contract) improves extensibility by making invalid call patterns harder to express.
3. This preserves the architecture boundary: runner displays agnostic runtime data and does not inject game-specific defaults.
4. No backwards-compatibility fallback labels for malformed endpoint payloads.

## What to Change

### 1. Tighten endpoint renderer contract

Make endpoint rendering require:
- `scope: perPlayer` -> required `playerId`
- `scope: zone` -> required `zoneId`

Throw on missing required identity instead of rendering fallback labels.

### 2. Strengthen type contract at call boundaries

Use a discriminated endpoint input type for endpoint formatting so required identity is explicit by scope.

### 3. Update tests

Add failure-path assertions for malformed endpoint identity payloads in model utils and translation boundary tests.

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

## Outcome

- **Completion date**: 2026-02-26
- **What changed**:
  - Endpoint rendering now rejects missing identity for `perPlayer` (`playerId`) and `zone` (`zoneId`) instead of fallback labels.
  - Endpoint rendering input contract was tightened with a discriminated type keyed by `scope`.
  - Translation now maps resource-transfer endpoints through that stricter contract and preserves explicit invalid-scope failure behavior.
  - Tests were updated/added for missing endpoint identity in both utility and translation layers.
- **Deviations from original plan**:
  - None functionally; scope was clarified first to focus on endpoint identity strictness rather than broader translation plumbing.
- **Verification**:
  - `pnpm -F @ludoforge/runner test -- model-utils translate-effect-trace` (pass)
  - `pnpm -F @ludoforge/runner test` (pass)
  - `pnpm -F @ludoforge/runner lint` (pass)
