# ENGINEARCH-141: Pipeline Regression Coverage for Choice-Options Noise Suppression

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — integration/regression coverage for compile/validate surfaces
**Deps**: archive/tickets/ENGINEARCH-128-choice-options-runtime-shape-diagnostic-boundary-and-noise-control.md

## Problem

Noise suppression for secondary choice-options runtime-shape diagnostics is unit-covered in validator tests, but pipeline-level regression coverage for end-to-end compile/validate surfaces is missing.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/test/unit/validate-gamedef.test.ts` currently asserts suppression on invalid options-query paths.
2. Existing compile/validate integration tests do not explicitly assert this suppression policy as a pipeline contract.
3. Mismatch: policy is validated at unit level but not protected at pipeline boundary. Corrected scope: add integration-level regression asserting surfaced diagnostics remain suppression-compliant.

## Architecture Check

1. Integration contract tests reduce drift risk between validator internals and surfaced pipeline behavior.
2. This remains game-agnostic engine validation coverage; no game-specific branching is introduced in GameDef/runtime/simulator.
3. No backwards-compatibility aliases/shims; enforce current strict policy end-to-end.

## What to Change

### 1. Add integration regression for suppression behavior

Introduce an integration test that composes/validates a definition with an invalid options query and asserts:
- primary query-validation diagnostics are present
- secondary `EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID` at the same path is absent

### 2. Keep compile surface unaffected

Confirm compiler shape diagnostics remain emitted where expected and are not suppressed by validator-only policy.

## Files to Touch

- `packages/engine/test/integration/cross-validate-production.test.ts` (modify or add adjacent integration test file)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify only if fixture helpers are shared/extracted)

## Out of Scope

- Any GameSpecDoc or visual-config changes.
- Runtime query-shape inference logic changes.
- Diagnostic taxonomy changes.

## Acceptance Criteria

### Tests That Must Pass

1. Integration pipeline test fails if suppression policy regresses in surfaced validator diagnostics.
2. Primary query-validation diagnostics still surface for invalid options queries.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Validator suppression remains path-scoped and deterministic.
2. GameDef/simulator remain game-agnostic; no game-specific policy branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/cross-validate-production.test.ts` (or dedicated integration file) — enforce end-to-end suppression contract at pipeline boundary.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/cross-validate-production.test.js`
3. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
