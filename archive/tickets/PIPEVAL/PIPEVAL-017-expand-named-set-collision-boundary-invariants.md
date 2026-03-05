# PIPEVAL-017: Expand named-set collision boundary invariants

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL named-set collision boundary contract hardening + test coverage
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-011-enforce-canonical-named-set-id-collision-diagnostics-in-compile-path.md`

## Problem

The shared named-set collision boundary is in place, but invariant coverage is still narrow (single duplicate pair only), and collision diagnostic options currently accept a free-form string code type. This leaves room for silent drift in deterministic multi-collision behavior and diagnostic code contract safety.

## Assumption Reassessment (2026-03-05)

1. Current tests cover one canonical-equivalent duplicate-id pair in compiler and validator surfaces.
2. There is no direct coverage asserting N-1 diagnostics for multiple raw ids collapsing to the same canonical id in deterministic order.
3. `NamedSetCollisionDiagnosticsOptions.code` is currently typed as `string`, which allows accidental invalid diagnostic-code literals at call sites.
4. Mismatch correction: collision boundary invariants should be locked with stronger tests and a tighter diagnostic-code contract type.

## Architecture Check

1. Strong invariant tests at canonical boundaries are cleaner than relying on downstream incidental behavior and improve long-term refactor safety.
2. Tightening the diagnostic-code type improves robustness without introducing game-specific behavior into agnostic layers.
3. No backwards-compatibility aliases or shims are introduced.

## What to Change

### 1. Strengthen boundary tests for multi-collision behavior

Add coverage for three or more canonical-equivalent raw ids and assert deterministic diagnostics count (`N-1`) and ordering.

### 2. Tighten collision diagnostic code typing

Replace free-form diagnostic code string input with a constrained type that matches CNL diagnostic-code usage expectations at collision-diagnostic call sites.

### 3. Add direct unit test for named-set collision boundary helper

Add focused unit tests for `canonicalizeNamedSetsWithCollisions(...)` and `toNamedSetCanonicalIdCollisionDiagnostics(...)` to lock collision-metadata and diagnostic conversion invariants independent of higher-level compile/validate tests.

## Files to Touch

- `packages/engine/src/cnl/named-set-utils.ts` (modify)
- `packages/engine/test/unit/compiler-api.test.ts` (modify)
- `packages/engine/test/unit/validate-spec.test.ts` (modify)
- `packages/engine/test/unit/named-set-utils.test.ts` (new)

## Out of Scope

- Changing named-set value semantics or lookup behavior
- Changes to visual-config.yaml or runner rendering behavior
- Any game-specific rule logic in GameDef/runtime/simulator/kernel

## Acceptance Criteria

### Tests That Must Pass

1. Boundary tests prove deterministic `N-1` diagnostics for multi-collision duplicate named-set ids.
2. Compiler and validator tests both remain aligned with the strengthened boundary invariants.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Named-set collision ownership remains centralized and deterministic.
2. Diagnostic-code contract at collision boundary rejects untyped/free-form drift.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/named-set-utils.test.ts` — direct boundary invariant tests for collision metadata + diagnostics conversion.
2. `packages/engine/test/unit/compiler-api.test.ts` — add multi-collision compile-only diagnostic expectations.
3. `packages/engine/test/unit/validate-spec.test.ts` — add validator parity expectations for multi-collision behavior.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/named-set-utils.test.js packages/engine/dist/test/unit/compiler-api.test.js packages/engine/dist/test/unit/validate-spec.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

## Outcome

Implemented as planned with one architecture-tightening refinement:

1. Added direct boundary tests in `packages/engine/test/unit/named-set-utils.test.ts` that lock:
   - deterministic collision metadata grouping/order
   - deterministic `N-1` collision diagnostics emission order
2. Expanded multi-collision parity coverage in:
   - `packages/engine/test/unit/compiler-api.test.ts`
   - `packages/engine/test/unit/validate-spec.test.ts`
3. Tightened `NamedSetCollisionDiagnosticsOptions.code` from free-form `string` to a constrained diagnostic-code contract in `packages/engine/src/cnl/named-set-utils.ts`.
4. Architecture refinement vs original plan:
   - avoided introducing inline `CNL_COMPILER_*` literals outside canonical diagnostic registries by deriving the compiler collision code type from the registry type surface, preserving diagnostic registry governance.
