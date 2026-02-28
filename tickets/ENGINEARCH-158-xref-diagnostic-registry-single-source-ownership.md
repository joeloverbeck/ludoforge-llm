# ENGINEARCH-158: Enforce Single-Source Ownership for CNL_XREF Diagnostic Codes

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — cnl diagnostic registry ownership and guardrail policy
**Deps**: archive/tickets/ENGINEARCH-157-diagnostic-taxonomy-guardrails-and-ownership-policy.md

## Problem

`CNL_XREF_*` ownership is still split across multiple modules. `cross-validate-diagnostic-codes.ts` defines the main xref registry, while `action-selector-diagnostic-codes.ts` still owns `CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED` as an inline literal. The policy test currently allows this split ownership instead of enforcing one canonical source.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/cnl/cross-validate-diagnostic-codes.ts` is the canonical xref registry for most `CNL_XREF_*` codes.
2. `packages/engine/src/cnl/action-selector-diagnostic-codes.ts` still contains an inline `CNL_XREF_*` literal and is allowlisted by `compiler-diagnostic-registry-audit.test.ts`.
3. Mismatch: architecture intent is centralized taxonomy ownership. Corrected scope is to move all xref literals into one registry module and make policy enforcement strict.

## Architecture Check

1. A single xref registry removes fragmented ownership, reduces drift risk, and makes additions auditable.
2. This change is taxonomy governance only; no game-specific behavior moves into engine/runtime.
3. No backwards-compatibility aliases/shims: all call sites should consume canonical registry constants directly.

## What to Change

### 1. Move remaining inline xref code to canonical registry

Add `CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED` to `cross-validate-diagnostic-codes.ts` and reference it from action-selector diagnostic mapping.

### 2. Tighten policy allowlist

Update diagnostic registry audit policy to require `CNL_XREF_*` literals only in canonical xref registry module.

### 3. Preserve behavior through constant-based usage

Ensure diagnostics emitted for executor pipeline violations remain unchanged in value/path/severity while using canonical constants.

## Files to Touch

- `packages/engine/src/cnl/cross-validate-diagnostic-codes.ts` (modify)
- `packages/engine/src/cnl/action-selector-diagnostic-codes.ts` (modify)
- `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` (modify)
- `packages/engine/test/unit/cnl/action-selector-contract-diagnostics.test.ts` (modify, if constant-based assertions need alignment)
- `packages/engine/test/unit/compile-actions.test.ts` (modify, if constant-based assertions need alignment)

## Out of Scope

- Runtime simulation logic changes.
- GameSpecDoc or `visual-config.yaml` content changes.
- Cross-namespace refactors beyond xref registry ownership.

## Acceptance Criteria

### Tests That Must Pass

1. No inline `CNL_XREF_*` literals exist outside canonical xref registry module.
2. Executor pipeline unsupported diagnostics still emit with the same code and behavior.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Diagnostic taxonomy ownership is centralized and enforceable by tests.
2. GameDef/runtime/kernel stay game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` — enforce strict single-source xref literal ownership.
2. `packages/engine/test/unit/cnl/action-selector-contract-diagnostics.test.ts` — verify selector-contract diagnostics continue to resolve canonical code values.
3. `packages/engine/test/unit/compile-actions.test.ts` — verify compile path still emits executor pipeline unsupported diagnostics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compiler-diagnostic-registry-audit.test.js packages/engine/dist/test/unit/cnl/action-selector-contract-diagnostics.test.js packages/engine/dist/test/unit/compile-actions.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
