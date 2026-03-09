# ENG-226: Express Free-Operation Grant Coupling in Structural Schemas

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel schema modeling, schema artifact generation, and grant-contract boundary parity
**Deps**: archive/tickets/ENG-225-unify-free-operation-grant-contract-validation.md, packages/engine/src/kernel/schemas-ast.ts, packages/engine/src/kernel/schemas-extensions.ts, packages/engine/src/kernel/schema-artifacts.ts

## Problem

ENG-225 centralized free-operation grant contract validation, but the `completionPolicy`/`postResolutionTurnFlow` coupling is still enforced only through Zod `superRefine` and runtime/behavioral validation. The generated `GameDef.schema.json` artifact remains structurally weaker and can accept grant shapes that the canonical engine contract rejects. That leaves an avoidable mismatch between artifact-level validation and the actual agnostic `GameDef` boundary.

## Assumption Reassessment (2026-03-09)

1. `grantFreeOperation` and event-card `freeOperationGrants` now share one semantic contract helper, and `validateGameDefBoundary` rejects invalid required-grant pairings through Zod refinement.
2. The generated draft-07 schema artifacts do not currently encode that coupling, because `superRefine` does not round-trip into JSON Schema output.
3. Mismatch: the schema artifact tests now prove only valid-shape acceptance, not invalid-shape rejection. Correction: remodel the grant schema surfaces so the coupling is structural and survives artifact generation.

## Architecture Check

1. Structural schema modeling is cleaner than refinement-only modeling for a contract that must survive export into `GameDef.schema.json`. It removes a split-brain boundary where JSON Schema and engine validation disagree.
2. This preserves the game-agnostic boundary correctly: the change is entirely about generic free-operation grant shape, not about any game-specific `GameSpecDoc` behavior or visual configuration.
3. No backwards-compatibility aliases or fallback parsing should be introduced. Invalid pairings should become unrepresentable in the structural schema shape.

## What to Change

### 1. Remodel grant schemas as explicit valid structural shapes

Replace the current refinement-only coupling for:
- `grantFreeOperation` effect AST shape
- event-card `freeOperationGrants`

with structural schema composition that can express:
- no completion contract fields
- `completionPolicy: required` with required `postResolutionTurnFlow`

and rejects:
- `completionPolicy: required` without `postResolutionTurnFlow`
- `postResolutionTurnFlow` without `completionPolicy: required`

### 2. Keep shared contract parity after structural remodeling

Retain the canonical shared validator as a defensive/shared contract surface, but ensure the structural schemas, exported artifacts, and `validateGameDefBoundary` all accept and reject the same grant pairings.

### 3. Restore negative artifact-boundary coverage

Reinstate tests that prove invalid required-grant pairings are rejected by generated schema artifacts, not only by runtime/Zod refinement behavior.

## Files to Touch

- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-zod.ts` (modify or delete if no longer needed)
- `packages/engine/src/kernel/schema-artifacts.ts` (modify only if schema generation wiring needs adjustment)
- `packages/engine/test/unit/json-schema.test.ts` (modify)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-viability-contract-parity.test.ts` (modify if artifact parity assertions need expansion)

## Out of Scope

- Overlapping grant outcome/consumption semantics tracked in `tickets/ENG-224-strengthen-required-outcome-enforcement-for-overlapping-grants.md`
- FITL card data migrations tracked in `tickets/ENG-204-ia-drang-reencode-on-grant-contracts.md`
- New free-operation contract modes beyond the current canonical required-resume pairing

## Acceptance Criteria

### Tests That Must Pass

1. Generated `GameDef.schema.json` rejects event free-operation grants with `completionPolicy: required` and no `postResolutionTurnFlow`.
2. Generated `GameDef.schema.json` rejects `grantFreeOperation` effect payloads with `postResolutionTurnFlow` but no `completionPolicy: required`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The same grant contract is enforced at structural schema, boundary validation, and runtime surfaces without relying on path-specific game logic.
2. `GameDef` and simulator/runtime remain fully game-agnostic; no game-specific exceptions leak into schema or validation logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/json-schema.test.ts` — restore invalid-shape rejection coverage at the generated artifact boundary.
2. `packages/engine/test/unit/schemas-ast.test.ts` — prove AST schema structural acceptance/rejection for the required completion contract.
3. `packages/engine/test/unit/kernel/free-operation-viability-contract-parity.test.ts` — ensure schema and contract surfaces stay aligned after the structural remodel.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/json-schema.test.js dist/test/unit/schemas-ast.test.js dist/test/unit/kernel/free-operation-viability-contract-parity.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`
