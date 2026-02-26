# ENGINEARCH-041: Add direct contract tests for scoped-var runtime mapping helpers

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — kernel helper test hardening
**Deps**: none

## Problem

`scoped-var-runtime-mapping.ts` is currently validated indirectly through effect tests. Missing direct helper-contract tests means mapping regressions are detected later and less locally than necessary.

## Assumption Reassessment (2026-02-26)

1. Runtime helper `scoped-var-runtime-mapping.ts` now owns conversion logic for scoped endpoints and var-change/event payloads.
2. Existing tests in `effects-var.test.ts` and `transfer-var.test.ts` assert trace/event parity through effect flows, but there is still no dedicated unit test file for the helper module itself.
3. Existing tests in `scoped-var-runtime-access.test.ts` validate endpoint resolution/read/write behavior, but they do not directly pin runtime mapping payload shapes in `scoped-var-runtime-mapping.ts`.
4. **Mismatch + correction**: the remaining architectural gap is direct contract coverage at the mapping module boundary, not additional effect-level parity testing.

## Architecture Check

1. Direct module-level tests are more robust than the current architecture because they fail mapping regressions locally at the contract boundary instead of only via higher-level effect orchestration.
2. This remains game-agnostic kernel infrastructure testing; no game-specific logic is introduced.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Add dedicated helper contract tests

Create a focused unit test file for `scoped-var-runtime-mapping.ts` that validates:
- `global`, `pvar`, and `zone` endpoint conversions for trace resource endpoints
- scoped var-change payload mapping
- scoped emitted `varChanged` event mapping

### 2. Strengthen drift-proofing assertions

Add explicit assertions that mapped shapes include required scope-specific keys and exclude invalid cross-scope keys.

### 3. Keep implementation scope strict

Do not refactor effect runtime modules for this ticket unless helper testability is blocked. The default path is test-only hardening.

## Files to Touch

- `packages/engine/test/unit/scoped-var-runtime-mapping.test.ts` (new)
- `packages/engine/src/kernel/scoped-var-runtime-mapping.ts` (modify only if testability adjustments are required)

## Out of Scope

- Refactoring effect runtime state access/write logic
- Public API surface changes in `kernel/index.ts`
- Game-specific `GameSpecDoc`/visual-config work

## Acceptance Criteria

### Tests That Must Pass

1. Dedicated unit tests directly validate helper behavior for all supported scopes.
2. Helper regression in scope-key mapping fails dedicated helper tests before higher-level effect tests.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scope translation contract is explicit, deterministic, and locally tested.
2. Runtime mapping helper remains game-agnostic and reusable across effect handlers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-mapping.test.ts` — direct contract coverage for helper mapping outputs and scope-key shapes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-mapping.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What was actually changed:
  - Added a new direct contract test module at `packages/engine/test/unit/scoped-var-runtime-mapping.test.ts`.
  - Covered mapping behavior for `toTraceResourceEndpoint`, `toTraceVarChangePayload`, and `toVarChangedEvent` across `global`, `pvar`, and `zone` scoped endpoints.
  - Added drift guards asserting required scope keys are present and invalid cross-scope keys are absent.
- Deviations from the original plan:
  - No source changes were required in `packages/engine/src/kernel/scoped-var-runtime-mapping.ts`; implementation remained test-only as intended by reassessed scope.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/scoped-var-runtime-mapping.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
