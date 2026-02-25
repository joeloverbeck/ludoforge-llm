# ENGINEARCH-036: Add config invariant guards for scoped-var contract schema builder

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — contract builder validation + unit tests
**Deps**: none

## Problem

`createScopedVarContractSchema` centralizes scoped contract schema composition, but currently trusts caller config completely. Misconfigured scope literals or field-name collisions can produce confusing runtime/schema behavior and brittle future refactors.

## Assumption Reassessment (2026-02-25)

1. `packages/engine/src/kernel/scoped-var-contract.ts` currently builds discriminated unions without validating uniqueness of scope literals or field keys.
2. Current in-repo call sites are valid, but the module is exported and reusable, so latent misconfiguration risk exists.
3. **Mismatch + correction**: contract centralization should include defensive guardrails at the builder boundary, not only at call sites.

## Architecture Check

1. Guarding builder config invariants at construction time is cleaner than debugging malformed downstream schemas.
2. This remains generic contract infrastructure and does not introduce game-specific behavior into agnostic layers.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Validate schema-builder config invariants

Add fail-fast checks for:
- duplicate scope literals across `global`/`player`/`zone`
- reserved field collisions involving `scope`
- collisions among `var`/`player`/`zone` field names

Throw deterministic errors with actionable messages.

### 2. Add targeted unit tests for failure modes

Add tests for both valid config and each invalid config branch.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-contract.ts` (modify)
- `packages/engine/test/unit/` (new/modify dedicated test file, e.g. `scoped-var-contract.test.ts`)

## Out of Scope

- AST/trace schema contract redesign
- Runtime effect behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Builder throws for duplicate scope literals.
2. Builder throws for `scope`/field-name collisions and `var`/`player`/`zone` collisions.
3. Builder succeeds for valid config and preserves current schema behavior.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped contract builder rejects ambiguous or malformed config deterministically.
2. Contract definitions remain reusable and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-contract.test.ts` — valid config composes expected discriminated schema.
2. `packages/engine/test/unit/scoped-var-contract.test.ts` — invalid config branches throw deterministic errors.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/unit/scoped-var-contract.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
