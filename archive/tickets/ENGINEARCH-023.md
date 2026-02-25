# ENGINEARCH-023: Add Dedicated Boundary Tests for resolveMapSpaceId Contracts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — unit-test coverage for selector boundary helper behavior
**Deps**: None

## Problem

`resolveMapSpaceId` is now a critical typed boundary for map-space/zone-property flows, but it has no direct unit tests. Regressions in binding failure behavior, scalar pass-through behavior, or binding-type enforcement can slip through and only appear indirectly in higher-level tests.

## Assumption Reassessment (2026-02-25)

1. `resolveMapSpaceId` is exported from `resolve-selectors.ts` and used by `resolve-ref.ts` and `eval-condition.ts`.
2. `packages/engine/test/unit/resolve-selectors.test.ts` currently covers `resolveZoneSel` and `resolveSingleZoneSel` but has no direct `resolveMapSpaceId` cases.
3. Existing indirect tests in `resolve-ref.test.ts` and `eval-condition.test.ts` exercise call paths that eventually use `resolveMapSpaceId`, but they do not pin helper-local contract semantics directly.
4. No active ticket in `tickets/` currently targets direct boundary tests for `resolveMapSpaceId` contract behavior.

## Architecture Check

1. Boundary-focused tests are cleaner than relying only on indirect call-path coverage because they lock the helper contract where type and error semantics are defined.
2. The tests remain engine-generic and do not encode game-specific behavior; they validate selector contract mechanics only.
3. No backwards-compatibility aliases/shims are introduced; tests enforce strict current contract behavior.

## What to Change

### 1. Add direct resolveMapSpaceId success-path tests

Cover literal and bound-string inputs and assert stable string-to-`ZoneId` pass-through behavior.

### 2. Add direct resolveMapSpaceId failure-path tests

Cover:
- missing binding -> `MISSING_BINDING`
- non-string binding -> `TYPE_MISMATCH`

### 3. Add explicit non-goal boundary assertion

Assert helper behavior remains boundary-local (no zone-existence validation here); existence checks stay at downstream consumers.

### 4. Keep selector test organization coherent

Place tests in `resolve-selectors.test.ts` under a dedicated `describe('resolveMapSpaceId', ...)` section so selector boundary contracts are discoverable.

## Files to Touch

- `packages/engine/test/unit/resolve-selectors.test.ts` (modify)

## Out of Scope

- Changes to selector runtime semantics
- Map-space existence validation behavior changes
- Any GameSpecDoc or visual-config schema updates

## Acceptance Criteria

### Tests That Must Pass

1. Direct tests cover `resolveMapSpaceId` success and failure contract paths.
2. Error-code semantics for missing/non-string bindings are explicitly asserted.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Selector helper contracts stay explicit and regression-resistant.
2. GameDef and simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/resolve-selectors.test.ts` — add dedicated `resolveMapSpaceId` contract tests for literal, bound, missing, and non-string binding cases, including explicit boundary-local pass-through behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/resolve-selectors.test.js`
3. `pnpm -F @ludoforge/engine test:unit`

## Outcome

- **Completed**: 2026-02-25
- **What changed**:
  - Reassessed and corrected ticket assumptions/scope to match current code behavior:
    - clarified that `resolveMapSpaceId` is a boundary helper with string-to-`ZoneId` pass-through (not string normalization),
    - documented existing indirect coverage in `resolve-ref.test.ts`/`eval-condition.test.ts`,
    - added explicit non-goal that zone-existence validation remains downstream.
  - Implemented dedicated direct unit coverage in `packages/engine/test/unit/resolve-selectors.test.ts` under `describe('resolveMapSpaceId', ...)` for:
    - literal input pass-through,
    - bound string resolution,
    - missing binding (`MISSING_BINDING`),
    - non-string binding (`TYPE_MISMATCH`),
    - explicit boundary-local pass-through of unknown ids.
- **Deviation from original plan**:
  - Added one extra boundary contract test (unknown-id pass-through) to lock an edge/invariant implied by current architecture.
- **Verification**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/resolve-selectors.test.js` ✅
  - `pnpm -F @ludoforge/engine test:unit` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
