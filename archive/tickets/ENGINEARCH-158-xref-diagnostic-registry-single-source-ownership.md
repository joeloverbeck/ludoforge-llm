# ENGINEARCH-158: Enforce Single-Source Ownership for CNL_XREF Diagnostic Codes

**Status**: ✅ COMPLETED
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
4. Scope correction: canonical registry coverage should also be asserted in `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts`; the original ticket omitted this.

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

### 4. Strengthen canonical-registry test coverage

Add an explicit assertion that `CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED` is present in the canonical xref registry.

## Files to Touch

- `packages/engine/src/cnl/cross-validate-diagnostic-codes.ts` (modify)
- `packages/engine/src/cnl/action-selector-diagnostic-codes.ts` (modify)
- `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` (modify)
- `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts` (modify)
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
3. Canonical xref registry coverage includes `CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED`.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Diagnostic taxonomy ownership is centralized and enforceable by tests.
2. GameDef/runtime/kernel stay game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` — enforce strict single-source xref literal ownership.
2. `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts` — verify canonical xref registry includes executor pipeline unsupported code.
3. `packages/engine/test/unit/cnl/action-selector-contract-diagnostics.test.ts` — verify selector-contract diagnostics continue to resolve canonical code values.
4. `packages/engine/test/unit/compile-actions.test.ts` — verify compile path still emits executor pipeline unsupported diagnostics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compiler-diagnostic-registry-audit.test.js packages/engine/dist/test/unit/cross-validate-diagnostic-codes.test.js packages/engine/dist/test/unit/cnl/action-selector-contract-diagnostics.test.js packages/engine/dist/test/unit/compile-actions.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-02-28
- **What Changed**:
  - Moved `CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED` into `packages/engine/src/cnl/cross-validate-diagnostic-codes.ts` so xref literal ownership is fully centralized.
  - Updated `packages/engine/src/cnl/action-selector-diagnostic-codes.ts` to consume `CNL_XREF_DIAGNOSTIC_CODES` instead of owning an inline xref literal.
  - Tightened `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` policy to allow `CNL_XREF_*` literals only in `cross-validate-diagnostic-codes.ts`.
  - Strengthened canonical registry coverage in `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts`.
  - Updated selector/compile tests to assert through canonical xref constants where relevant.
- **Deviations From Plan**:
  - Scope was corrected before implementation to include `cross-validate-diagnostic-codes.test.ts`, which was missing from the original ticket despite being central to canonical ownership guarantees.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/compiler-diagnostic-registry-audit.test.js packages/engine/dist/test/unit/cross-validate-diagnostic-codes.test.js packages/engine/dist/test/unit/cnl/action-selector-contract-diagnostics.test.js packages/engine/dist/test/unit/compile-actions.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (331 passed, 0 failed)
  - `pnpm -F @ludoforge/engine lint` ✅

### Post-Completion Refinement (2026-02-28)

- Removed adapter-level ownership module `packages/engine/src/cnl/action-selector-diagnostic-codes.ts`.
- Updated `packages/engine/src/cnl/action-selector-contract-diagnostics.ts` to resolve codes directly from canonical registries:
  - `CNL_COMPILER_DIAGNOSTIC_CODES` for actor/executor binding malformed/missing diagnostics.
  - `CNL_XREF_DIAGNOSTIC_CODES` for executor pipeline unsupported diagnostics.
- Updated `packages/engine/test/unit/cnl/action-selector-contract-diagnostics.test.ts` to assert direct canonical registry mapping and removed references to the deleted adapter module.
- Re-verified:
  - `pnpm -F @ludoforge/engine build` ✅
  - targeted node tests for registry/selector/compile flows ✅
  - `pnpm -F @ludoforge/engine test` ✅ (331 passed, 0 failed)
  - `pnpm -F @ludoforge/engine lint` ✅

### Post-Completion Refinement 2 (2026-02-28)

- Simplified selector-violation code mapping in `packages/engine/src/cnl/action-selector-contract-diagnostics.ts`:
  - replaced duplicated per-kind mapping functions with one typed canonical mapping table keyed by selector role + violation kind.
- Strengthened `packages/engine/test/unit/cnl/action-selector-contract-diagnostics.test.ts` with a table-driven assertion that covers all supported role/kind combinations, including executor `bindingMalformed`.
- Re-verified:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/cnl/action-selector-contract-diagnostics.test.js packages/engine/dist/test/unit/compile-actions.test.js packages/engine/dist/test/unit/compiler-diagnostic-registry-audit.test.js packages/engine/dist/test/unit/cross-validate-diagnostic-codes.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (331 passed, 0 failed)
  - `pnpm -F @ludoforge/engine lint` ✅
