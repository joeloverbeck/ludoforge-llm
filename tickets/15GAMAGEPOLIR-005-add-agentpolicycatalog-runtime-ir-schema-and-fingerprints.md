# 15GAMAGEPOLIR-005: Add `AgentPolicyCatalog` Runtime IR Schema and Fingerprints

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/runtime types, schemas, serde contracts
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR-002-lower-agent-parameters-profiles-and-bindings.md, archive/tickets/15GAMAGEPOLIR-003-add-policy-expression-dsl-typechecking-and-dag-validation.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-004-add-policy-visibility-metadata-and-canonical-seat-binding-validation.md

## Problem

The compiler needs a stable JSON-serializable target in `GameDef.agents`. Without the runtime IR contract, later evaluator and trace work would either depend on authoring shapes directly or introduce runtime-only objects that break schema validation and serialization.

## Assumption Reassessment (2026-03-19)

1. `packages/engine/src/kernel/types-core.ts` and `schemas-core.ts` are the authoritative runtime contract surfaces for `GameDef`.
2. Spec 15 requires a pure-data compiled catalog plus stable catalog/profile fingerprints for traceability.
3. Corrected scope: this ticket should define and serialize the runtime IR, not execute it.

## Architecture Check

1. A dedicated compiled IR is cleaner than reusing authoring structures because runtime evaluation needs resolved refs, dependency order, and cost metadata.
2. Keeping the catalog as pure JSON preserves existing `GameDef` tooling and avoids custom revivers.
3. No game-specific compiled helpers or class instances should enter `GameDef.agents`.

## What to Change

### 1. Extend `GameDef` with `agents`

Add the runtime types for:

- `AgentPolicyCatalog`
- compiled parameter defs
- compiled profiles
- library indexes
- cost summaries

### 2. Add schema validation and serde coverage

Update kernel schema artifacts and validation so `GameDef.agents`:

- schema-validates
- round-trips through existing JSON tooling
- rejects runtime-only containers/shapes

### 3. Add stable fingerprint generation

Introduce deterministic catalog/profile fingerprint generation based on compiled authored content, not incidental object insertion order.

## File List

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/kernel/schema-artifacts.ts` (modify if required)
- `packages/engine/src/agents/policy-ir.ts` (new)
- `packages/engine/test/unit/cnl/compile-agents.test.ts` (modify)
- `packages/engine/test/unit/kernel/gamedef-agent-policy-schema.test.ts` (new)

## Out of Scope

- move evaluation runtime
- preview execution
- trace emission and diagnostics formatting
- runner or CLI descriptor migration

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/kernel/gamedef-agent-policy-schema.test.ts` proves `GameDef.agents` schema validation accepts valid compiled catalogs and rejects invalid runtime-only shapes.
2. `packages/engine/test/unit/cnl/compile-agents.test.ts` proves catalog/profile fingerprints are stable for unchanged authored policies and `GameDef.agents` JSON round-trips without loss.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm turbo schema:artifacts`

### Invariants

1. `GameDef.agents` remains plain JSON-compatible data.
2. Authored ids remain available for traceability even after lowering.
3. Fingerprints change only when compiled policy content changes, not due to object insertion order.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/gamedef-agent-policy-schema.test.ts` — runtime schema and serde coverage.
2. `packages/engine/test/unit/cnl/compile-agents.test.ts` — fingerprint stability and compiled IR assertions.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo schema:artifacts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`
