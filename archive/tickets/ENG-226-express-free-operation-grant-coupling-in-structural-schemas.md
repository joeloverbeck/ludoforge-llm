# ENG-226: Express Free-Operation Grant Coupling in Structural Schemas

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel schema modeling, schema artifact generation, and grant-contract boundary parity
**Deps**: archive/tickets/ENG-225-unify-free-operation-grant-contract-validation.md, packages/engine/src/kernel/schemas-ast.ts, packages/engine/src/kernel/schemas-extensions.ts, packages/engine/src/kernel/schema-artifacts.ts

## Problem

ENG-225 centralized free-operation grant contract validation, but the `completionPolicy`/`postResolutionTurnFlow` coupling is still enforced in schema surfaces through Zod `superRefine` rather than structural composition. The generated `GameDef.schema.json` artifact therefore remains structurally weaker and can accept grant shapes that the canonical engine contract rejects. That leaves an avoidable mismatch between artifact-level validation and the actual agnostic `GameDef` boundary.

## Assumption Reassessment (2026-03-09)

1. `grantFreeOperation` and event-card `freeOperationGrants` now share one semantic contract helper, and direct Zod boundary parsing rejects invalid required-grant pairings through `superRefine`.
2. The generated draft-07 schema artifacts do not currently encode that coupling, because Zod `superRefine` does not round-trip into JSON Schema output.
3. The repo already has direct Zod-surface rejection coverage and behavioral/runtime coverage for these pairings. The remaining gap is artifact-level structural rejection in generated JSON Schema.
4. Correction: remodel the grant schema surfaces so the coupling is structural and survives artifact generation, while leaving shared semantic-adapter cleanup to `tickets/ENG-227-finish-free-operation-grant-validator-surface-cleanup.md`.

## Architecture Check

1. Structural schema modeling is cleaner than refinement-only modeling for a contract that must survive export into `GameDef.schema.json`. It removes a split-brain boundary where JSON Schema and engine validation disagree.
2. This preserves the game-agnostic boundary correctly: the change is entirely about generic free-operation grant shape, not about any game-specific `GameSpecDoc` behavior or visual configuration.
3. Retaining the shared contract helper as a defensive backstop is still beneficial even after the structural remodel. JSON Schema export should become the first line of defense at the artifact boundary, while the canonical helper continues to protect direct runtime/effect paths.
4. No backwards-compatibility aliases or fallback parsing should be introduced. Invalid pairings should become unrepresentable in the structural schema shape.

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

Add tests that prove invalid required-grant pairings are rejected by generated schema artifacts, not only by direct Zod refinement behavior.

## Files to Touch

- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-zod.ts` (modify or delete if no longer needed)
- `packages/engine/src/kernel/schema-artifacts.ts` (modify only if schema generation wiring needs adjustment)
- `packages/engine/schemas/GameDef.schema.json` (regenerate)
- `packages/engine/test/unit/json-schema.test.ts` (modify)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-viability-contract-parity.test.ts` (modify if artifact parity assertions need expansion)

## Out of Scope

- Overlapping grant outcome/consumption semantics tracked in `tickets/ENG-224-strengthen-required-outcome-enforcement-for-overlapping-grants.md`
- FITL card data migrations tracked in `tickets/ENG-204-ia-drang-reencode-on-grant-contracts.md`
- New free-operation contract modes beyond the current canonical required-resume pairing
- Shared validator adapter cleanup and diagnostic-text normalization tracked in `tickets/ENG-227-finish-free-operation-grant-validator-surface-cleanup.md`

## Acceptance Criteria

### Tests That Must Pass

1. Generated `GameDef.schema.json` rejects event free-operation grants with `completionPolicy: required` and no `postResolutionTurnFlow`.
2. Generated `GameDef.schema.json` rejects `grantFreeOperation` effect payloads with `postResolutionTurnFlow` but no `completionPolicy: required`.
3. Direct Zod boundary parsing and behavioral/runtime validation continue rejecting the same invalid pairings after the structural remodel.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The same grant contract is enforced at structural schema, boundary validation, and runtime surfaces without relying on path-specific game logic.
2. `GameDef` and simulator/runtime remain fully game-agnostic; no game-specific exceptions leak into schema or validation logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/json-schema.test.ts` — add invalid-shape rejection coverage at the generated artifact boundary for both event grants and `grantFreeOperation`.
2. `packages/engine/test/unit/schemas-ast.test.ts` — prove direct AST/event Zod schema acceptance and rejection still match the required completion contract after the structural remodel.
3. `packages/engine/test/unit/kernel/free-operation-viability-contract-parity.test.ts` — ensure schema and contract surfaces stay aligned after the structural remodel.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `cd packages/engine && node --test dist/test/unit/json-schema.test.js dist/test/unit/schemas-ast.test.js dist/test/unit/kernel/free-operation-viability-contract-parity.test.js`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-09
- What actually changed:
  - Replaced refinement-only free-operation grant schema coupling with a shared structural-schema helper in `packages/engine/src/kernel/free-operation-grant-zod.ts`.
  - Rewired both schema surfaces in `packages/engine/src/kernel/schemas-ast.ts` and `packages/engine/src/kernel/schemas-extensions.ts` to use the structural helper so generated JSON Schema artifacts encode the required `completionPolicy`/`postResolutionTurnFlow` pairing.
  - Regenerated `packages/engine/schemas/GameDef.schema.json`, `packages/engine/schemas/Trace.schema.json`, and `packages/engine/schemas/EvalReport.schema.json`.
  - Added negative artifact-boundary and direct schema regression coverage for invalid grant pairings.
- Deviations from original plan:
  - `packages/engine/src/kernel/schema-artifacts.ts` did not need wiring changes; the artifact generator started emitting the stronger contract once the Zod schemas became structural.
  - `packages/engine/src/kernel/free-operation-grant-zod.ts` remained as a shared helper instead of being deleted, because it now owns the reusable structural composition as well as the defensive shared refinement adapter.
  - `packages/engine/test/unit/schemas-ast.test.ts` now covers both `EffectASTSchema` and `EventCardFreeOperationGrantSchema` direct parsing, so no separate event-schema-specific unit file was needed.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine schema:artifacts`
  - `cd packages/engine && node --test dist/test/unit/json-schema.test.js dist/test/unit/schemas-ast.test.js dist/test/unit/kernel/free-operation-viability-contract-parity.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm run check:ticket-deps`
