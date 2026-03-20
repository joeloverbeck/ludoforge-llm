# 15GAMAGEPOLIR-005: Complete `AgentPolicyCatalog` Fingerprints and Runtime IR Metadata

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/runtime types, schemas, serde contracts
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR-002-lower-agent-parameters-profiles-and-bindings.md, archive/tickets/15GAMAGEPOLIR-003-add-policy-expression-dsl-typechecking-and-dag-validation.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-004-add-policy-visibility-metadata-and-canonical-seat-binding-validation.md

## Problem

The codebase already compiles authored agent policy data into a JSON-serializable `GameDef.agents` runtime IR, but it still falls short of Spec 15 in one important place: deterministic catalog/profile fingerprints are missing from that compiled contract. Without them, later evaluator, trace, and diagnostics work cannot reliably identify the exact compiled policy content they are executing.

## Assumption Reassessment (2026-03-19)

1. `GameDef.agents`, `AgentPolicyCatalog`, compiler lowering, and schema coverage already exist in `packages/engine/src/kernel/*` and `packages/engine/src/cnl/compile-agents.ts`.
2. Existing tests already cover most of the compiled IR surface in `packages/engine/test/unit/compile-agents-authoring.test.ts` and `packages/engine/test/unit/schemas-top-level.test.ts`; the ticket's original test paths are stale.
3. Spec 15 still requires a pure-data compiled catalog plus stable catalog/profile fingerprints for traceability.
4. Corrected scope: this ticket should finish the runtime metadata contract by adding deterministic fingerprints to the existing compiled IR, not re-introduce or redesign the IR itself.

## Architecture Check

1. Extending the existing compiled IR is cleaner than introducing a second parallel policy-runtime shape. The current architecture is already on the right boundary: authored YAML lowers into pure runtime data.
2. Fingerprint generation belongs on the compiled IR boundary, not in traces or evaluators. That keeps downstream consumers simple and makes traceability a property of the contract itself.
3. Fingerprints must be derived from canonicalized compiled content, not object insertion order, and must not require any runtime-only containers or aliases.
4. No game-specific compiled helpers or class instances should enter `GameDef.agents`.

## What to Change

### 1. Extend the existing runtime IR with fingerprint metadata

Add the missing deterministic metadata fields to the already-existing compiled contract:

- `AgentPolicyCatalog.catalogFingerprint`
- per-profile fingerprint metadata

### 2. Keep schema validation and serde parity aligned with the new fields

Update kernel schema/types so the fingerprinted IR:

- schema-validates
- round-trips through existing JSON tooling
- remains plain JSON-compatible data

### 3. Generate fingerprints from canonical compiled content

Introduce deterministic catalog/profile fingerprint generation based on canonicalized compiled policy content, not incidental object insertion order in authoring maps or object literals.

## File List

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/agents/policy-ir.ts` (new, if used to centralize canonical fingerprinting helpers)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)
- `packages/engine/test/unit/property/core-types-validation.property.test.ts` (modify)

## Out of Scope

- policy evaluation runtime
- preview execution
- trace emission and diagnostics formatting
- runner or CLI descriptor migration
- reworking the authored policy DSL or the already-landed compiled IR structure beyond the fingerprint metadata needed for Spec 15

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` proves compiled catalogs now include deterministic catalog/profile fingerprints and that those fingerprints are stable across equivalent authored input with different object insertion order.
2. `packages/engine/test/unit/schemas-top-level.test.ts` proves `GameDef.agents` schema validation accepts the fingerprinted catalog shape.
3. `packages/engine/test/unit/property/core-types-validation.property.test.ts` proves `GameDef.agents` with fingerprints JSON round-trips without losing schema validity.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm turbo schema:artifacts`

### Invariants

1. `GameDef.agents` remains plain JSON-compatible data.
2. Authored ids remain available for traceability even after lowering.
3. Catalog/profile fingerprints change only when compiled policy content changes, not due to object insertion order.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` — compiled IR assertions plus fingerprint stability.
2. `packages/engine/test/unit/schemas-top-level.test.ts` — runtime schema acceptance for the fingerprinted catalog.
3. `packages/engine/test/unit/property/core-types-validation.property.test.ts` — JSON round-trip validity with `GameDef.agents`.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo schema:artifacts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-19
- What actually changed: corrected the ticket scope to reflect that `GameDef.agents` and the compiled runtime IR already existed; added deterministic `catalogFingerprint` and per-profile `fingerprint` fields to the existing IR; introduced canonical fingerprint hashing in `packages/engine/src/agents/policy-ir.ts`; updated compiler lowering, runtime schemas, and schema artifacts; strengthened the existing unit/property tests instead of creating stale-path test files.
- Deviations from original plan: did not create the originally listed `packages/engine/test/unit/cnl/compile-agents.test.ts` or `packages/engine/test/unit/kernel/gamedef-agent-policy-schema.test.ts` because those paths do not exist in the current tree and the relevant ownership already lives in `compile-agents-authoring.test.ts`, `schemas-top-level.test.ts`, and `core-types-validation.property.test.ts`. The runtime IR itself was not reintroduced or redesigned because it was already landed.
- Verification results:
  - `pnpm -C packages/engine build`
  - `node --test packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/schemas-top-level.test.js packages/engine/dist/test/unit/property/core-types-validation.property.test.js`
  - `pnpm -C packages/engine schema:artifacts`
  - `pnpm -C packages/engine lint`
  - `pnpm -C packages/engine test`
