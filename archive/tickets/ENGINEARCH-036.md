# ENGINEARCH-036: Add config invariant guards for scoped-var contract schema builder

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — contract builder validation + unit tests
**Deps**: none

## Problem

`createScopedVarContractSchema` centralizes scoped contract schema composition, but currently lacks explicit config-invariant validation. Misconfigured field names can silently overwrite keys during shape composition, and duplicate scope literals currently rely on upstream Zod internals for failure shape/message. This makes failures less deterministic and weakens architectural guardrails at the builder boundary.

## Assumption Reassessment (2026-02-25)

1. `packages/engine/src/kernel/scoped-var-contract.ts` currently builds discriminated unions without validating uniqueness of scope literals or field keys.
2. Current in-repo call sites in `schemas-ast.ts` and `schemas-core.ts` are valid and already covered indirectly by matrix-style schema tests (`schemas-ast.test.ts`, `json-schema.test.ts`), but there is no dedicated unit test file for this builder contract.
3. Duplicate discriminator literals can already fail via `z.discriminatedUnion(...)`, but those errors are not builder-owned, not normalized, and do not cover field-collision classes.
4. **Mismatch + correction**: contract centralization should include deterministic guardrails at the builder boundary, not only at call sites or indirect downstream schema tests.

## Architecture Check

1. Guarding builder config invariants at construction time is cleaner than debugging malformed downstream schemas.
2. Dedicated builder tests improve confidence without coupling to broader AST/trace schema behavior.
3. This remains generic contract infrastructure and does not introduce game-specific behavior into agnostic layers.
4. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Validate schema-builder config invariants

Add fail-fast checks for:
- duplicate scope literals across `global`/`player`/`zone`
- reserved field collisions involving `scope`
- collisions among `var`/`player`/`zone` field names

Throw deterministic errors with actionable messages.

### 2. Add targeted unit tests for failure modes

Add tests for:
- valid config composition (success path)
- each invalid config branch listed above
- deterministic error messaging owned by this builder (instead of relying on Zod internals)

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
2. `packages/engine/test/unit/scoped-var-contract.test.ts` — invalid config branches throw deterministic, builder-owned errors for each invariant.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/unit/scoped-var-contract.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-25
- **What changed**:
  - Added deterministic invariant validation in `createScopedVarContractSchema` for duplicate scope literals, reserved `scope` field collisions, and `var`/`player`/`zone` field-name collisions.
  - Added explicit guardrails for extension-shape key collisions (`commonShape`/branch shapes) that could overwrite reserved discriminator/endpoint keys.
  - Added dedicated unit coverage in `packages/engine/test/unit/scoped-var-contract.test.ts` for valid config and invalid invariant branches.
- **Deviations from original plan**:
  - Extended validation scope slightly to include extension-shape reserved-key collisions for stronger long-term schema composition safety.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test -- test/unit/scoped-var-contract.test.ts` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
