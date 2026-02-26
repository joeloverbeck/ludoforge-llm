# EVTLOG-016: Centralize transfer endpoint normalization across projection and rendering

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None - runner-only
**Deps**: EVTLOG-015

## Problem

Transfer endpoint validation and normalization are still split across projection (`trace-projection`) and rendering (`translate-effect-trace`). Rendering currently enforces strict endpoint contract failures, but projection still performs partial/coercive extraction logic. This mismatch creates drift risk and inconsistent behavior for malformed transfer endpoints.

## Assumption Reassessment (2026-02-26)

1. `translate-effect-trace` already has broad malformed transfer-endpoint coverage (object shape, `varName`, scope, missing identity).
2. `trace-projection` currently validates only endpoint object-shape and then extracts `scope`/identity with permissive checks (`toNumberOrUndefined` + conditional zone extraction), so malformed payloads can silently degrade instead of failing deterministically.
3. Shared helpers in `model-utils` exist for endpoint object/`varName` guards and endpoint display formatting, but there is no single canonical transfer-endpoint normalizer reused by both projection and rendering.
4. **Scope correction**: this ticket is not only deduplication; it must enforce one strict normalization path so projection and rendering throw the same domain errors for invalid endpoint contracts.

## Architecture Check

1. A single transfer-endpoint normalizer is cleaner than repeated scope branching and ad-hoc extraction in call sites.
2. Centralized normalization makes future endpoint contract evolution safer (one update point).
3. Strict deterministic failures in both projection and rendering are preferable to silent coercion because they preserve invariants and surface contract violations early.
4. No compatibility aliases/fallback coercions should be added.

## What to Change

### 1. Add canonical transfer endpoint normalization in model utilities

Create one shared normalizer that validates endpoint payload object, `varName`, scope membership, and scope identity requirements, returning a normalized endpoint model (`scope`, `varName`, optional `playerId`, optional `zoneId`).

### 2. Refactor projection and rendering to consume normalized endpoints

Replace duplicated scope parsing in both paths with the shared normalized endpoint model.

### 3. Strengthen cross-path invariants in tests

1. Keep existing translation malformed-endpoint coverage, updating it only where needed to assert behavior through the shared normalizer path.
2. Add projection malformed-endpoint tests that assert deterministic errors matching translation semantics for invalid scope and missing required endpoint identity.
3. Add explicit regression checks that valid transfer projection/message behavior remains unchanged.

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

1. Projection and translation both use shared endpoint normalization and throw deterministic domain errors for malformed endpoint payloads.
2. Valid transfer endpoint projection and rendering outputs remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Transfer endpoint contract is normalized once and consumed consistently across runner model layers.
2. Malformed endpoint contracts fail deterministically in both projection and rendering paths.
3. Game-specific data remains in `GameSpecDoc` and `visual-config.yaml`; runtime/simulation contracts remain agnostic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` - keep malformed endpoint assertions and adjust/add only where needed for shared-normalizer invariants.
2. `packages/runner/test/model/trace-projection.test.ts` - add malformed transfer-endpoint payload assertions (invalid scope, missing per-player identity, missing zone identity) plus valid-path regressions.

### Commands

1. `pnpm -F @ludoforge/runner test -- translate-effect-trace trace-projection`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- **Completion date**: 2026-02-26
- **What changed**:
  - Added canonical transfer-endpoint normalization in `model-utils` via `normalizeTransferEndpoint`, including strict validation for payload object shape, `varName`, scope, and required scope identity (`playerId`/`zoneId`).
  - Refactored `trace-projection` and `translate-effect-trace` to consume normalized endpoints instead of local scope branching/extraction logic.
  - Expanded projection tests to cover malformed transfer endpoint invariants and cross-path error parity with translation.
  - Added translation-to-projection malformed-endpoint parity assertion to guarantee shared error semantics.
- **Deviations from original plan**:
  - No architecture deviation; implementation matched the corrected scope and tightened it with explicit cross-path parity checks.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- trace-projection translate-effect-trace` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
