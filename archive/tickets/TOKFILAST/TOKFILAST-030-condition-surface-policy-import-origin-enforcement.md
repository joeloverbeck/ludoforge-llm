# TOKFILAST-030: Enforce Condition-Surface Helper Import-Origin in Validator Policy Test

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — validator architecture lint/policy hardening
**Deps**: archive/tickets/TOKFILAST-023-condition-surface-contract-guardrail-policy.md, archive/tickets/TOKFILAST/TOKFILAST-024-condition-surface-contract-taxonomy-normalization.md

## Problem

The condition-surface policy test currently validates helper usage by callee name string only. A local alias/wrapper that reuses the same helper name could bypass the intended architectural guardrail.

## Assumption Reassessment (2026-03-06)

1. `packages/engine/test/unit/lint/condition-surface-validator-callsites-policy.test.ts` currently accepts helper calls by callee identifier text (`append*ConditionSurfacePath` / `conditionSurfacePathFor*`) without validating that those symbols are imported from `../contracts/index.js`.
2. Current policy message already states that ad-hoc aliases/wrappers are disallowed, but the implementation can still be bypassed by same-name local wrappers.
3. Existing policy/lint tests in this area do not yet enforce helper import-origin provenance for condition-surface callsites.

## Architecture Check

1. Guarding both helper name and import origin is cleaner and more robust than name-only checks because it enforces true contract ownership.
2. This remains game-agnostic validator architecture policy; no game-specific behavior is introduced in `GameDef`/runtime/simulator.
3. No backwards-compatibility aliasing/shims are introduced; bypass paths are removed.

## What to Change

### 1. Extend AST policy to verify helper symbol provenance

Augment the lint policy test to assert that accepted helper calls resolve to named imports from `../contracts/index.js`, and fail when helper-like identifiers come from local declarations/wrappers.

### 2. Add a negative policy fixture/assertion

Add coverage that demonstrates same-name local wrappers are rejected by policy.

## Files to Touch

- `packages/engine/test/unit/lint/condition-surface-validator-callsites-policy.test.ts` (modify)

## Out of Scope

- Runtime validator semantics.
- Condition path string formats.

## Acceptance Criteria

### Tests That Must Pass

1. Policy fails when top-level validator callsites route through local/helper wrappers not imported from contracts public surface.
2. Policy passes for canonical validator modules using contract-owned helpers.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Top-level condition-surface path composition remains contract-owned and mechanically enforced.
2. `GameDef` and simulator/runtime remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/condition-surface-validator-callsites-policy.test.ts` — enforce import-origin provenance for condition-surface helpers and reject wrapper bypasses.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/condition-surface-validator-callsites-policy.test.js`
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- What changed:
  - Hardened `condition-surface-validator-callsites-policy.test.ts` to require that helper-shaped condition-path calls are direct named imports from `../contracts/index.js`.
  - Added a focused negative fixture assertion proving same-name local wrappers are rejected even when callee text matches contract helper naming.
  - Kept scope test-only; runtime/kernel validator behavior was not changed.
- Deviations from original plan:
  - `packages/engine/test/helpers/kernel-source-ast-guard.ts` was not modified because existing helpers were sufficient.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/lint/condition-surface-validator-callsites-policy.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
