# 15GAMAGEPOLIR-003: Add Policy Expression DSL Typechecking and DAG Validation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — policy expression compiler and diagnostics
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR-001-add-authored-agents-section-to-gamespecdoc.md, tickets/15GAMAGEPOLIR-002-lower-agent-parameters-profiles-and-bindings.md

## Problem

Spec 15 depends on a typed declarative DSL for policy logic. Without compile-time typechecking and dependency validation, policies would fail late at runtime and the mutation surface would no longer be bounded or trustworthy.

## Assumption Reassessment (2026-03-19)

1. The engine already has compiler/type-inference modules for other DSL surfaces, but policy expressions are new and should not be silently folded into unrelated condition/value DSLs.
2. The authored library is intentionally the only reusable logic surface in v1, so dependency validation belongs in the compiler, not the runtime evaluator.
3. Corrected scope: this ticket should validate expression semantics and acyclic library dependencies, but it should not implement move evaluation yet.

## Architecture Check

1. A dedicated policy-expression compiler is cleaner than reusing looser runtime evaluators because Spec 15 requires full compile-time typing and forbidden-form enforcement.
2. Restricting references to named library items preserves the game-agnostic runtime and avoids hidden engine-object access.
3. No user-defined functions, dynamic ref construction, or recursive profile inheritance should be introduced as escape hatches.

## What to Change

### 1. Add the policy-expression compiler/types

Implement typed handling for the v1 DSL forms:

- constants
- parameter/runtime/feature/aggregate refs
- arithmetic/comparison/boolean/select/membership/coalesce helpers
- `boolToNumber`

### 2. Validate library-item dependency graphs

Resolve and topologically order:

- state features
- candidate features
- candidate aggregates
- pruning rules
- score terms
- tie-breakers

Reject cycles, unknown refs, invalid type combinations, and forbidden v1 forms.

### 3. Add deterministic diagnostics

Emit precise compiler diagnostics for:

- mismatched operand types
- illegal aggregate inputs
- preview nesting
- invalid candidate param refs
- division-by-zero states that must be guarded/coalesced or rejected

## File List

- `packages/engine/src/agents/policy-expr.ts` (new)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/test/unit/agents/policy-expr.test.ts` (new)
- `packages/engine/test/unit/cnl/compile-agents.test.ts` (modify)

## Out of Scope

- preview execution and caching
- policy move selection runtime
- traces, diagnostics formatting, or runner/CLI integration
- authored FITL/Texas policy content

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/policy-expr.test.ts` accepts well-typed expressions for the supported v1 forms and rejects forbidden forms.
2. `packages/engine/test/unit/cnl/compile-agents.test.ts` rejects cyclic feature/aggregate dependencies, type-mismatched refs, invalid aggregate usage, nested preview refs, and invalid candidate param refs.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Every compiled policy expression is fully type-checked before runtime execution.
2. Library reuse stays bounded to named items; profiles still cannot contain anonymous executable logic.
3. The policy DSL remains distinct from general engine scripting and does not become a backdoor to arbitrary execution.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-expr.test.ts` — scalar typing, unknown handling, and forbidden-form coverage.
2. `packages/engine/test/unit/cnl/compile-agents.test.ts` — dependency graph and reference validation.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm run check:ticket-deps`
