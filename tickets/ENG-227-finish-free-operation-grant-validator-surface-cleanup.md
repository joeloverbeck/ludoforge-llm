# ENG-227: Finish Free-Operation Grant Validator Surface Cleanup

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — shared validator adapters, diagnostics, and missing boundary coverage
**Deps**: archive/tickets/ENG-225-unify-free-operation-grant-contract-validation.md, packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/effects-turn-flow.ts

## Problem

ENG-225 centralized free-operation grant contract detection, but the layer-specific translation from shared violations into diagnostics/runtime errors is still duplicated, and one diagnostic message path is malformed for `sequenceContext requires sequence`. Coverage also misses direct negative tests on the Zod schema surfaces that now rely on the shared contract helper.

## Assumption Reassessment (2026-03-09)

1. The repository now uses `collectTurnFlowFreeOperationGrantContractViolations(...)` as the canonical semantic contract detector for free-operation grants.
2. `validate-gamedef-behavior.ts` and `effects-turn-flow.ts` each still map those violations locally, and the mapping is not yet fully normalized into thin adapters.
3. Mismatch: the shared validator design is in place, but the surrounding surface adapters and direct schema-boundary tests are not fully cleaned up. Correction: finish the adapter extraction, fix misleading diagnostics, and add direct boundary tests.

## Architecture Check

1. Thin layer-specific adapters are cleaner than re-encoding switch logic in each consumer. They keep the shared contract authoritative while still allowing each layer to expose its own error shape.
2. This change stays inside agnostic validation/runtime infrastructure. It does not add any `GameSpecDoc` game-specific behavior or visual-config concerns.
3. No backwards-compatibility shims should be added. The cleanup should tighten the existing contract surfaces, not preserve older error behavior.

## What to Change

### 1. Extract thin violation-to-surface adapters

Factor the shared violation mapping so:
- behavioral validation diagnostics use one reusable adapter
- runtime grant application uses one reusable adapter

This should reduce repeated switch logic and make future contract extensions cheaper and less error-prone.

### 2. Fix misleading diagnostic text

Correct the `sequenceContext requires sequence` message path/text so it does not rewrite `sequenceContext` incorrectly when building the user-facing diagnostic.

### 3. Add direct Zod boundary rejection coverage

Add tests that directly exercise:
- `EffectASTSchema.safeParse(...)`
- `EventCardFreeOperationGrantSchema.safeParse(...)`

for both invalid required-grant pairings, so the shared validator wiring is covered at the schema layer itself and not only indirectly through `validateGameDef`.

## Files to Touch

- `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-zod.ts` (modify if adapter helpers live nearby)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify only if runtime adapter behavior changes)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify only if diagnostic text snapshots/assertions change)

## Out of Scope

- Structural JSON Schema artifact parity tracked in `archive/tickets/ENG-226-express-free-operation-grant-coupling-in-structural-schemas.md`
- Overlapping grant outcome enforcement tracked in `tickets/ENG-224-strengthen-required-outcome-enforcement-for-overlapping-grants.md`
- FITL-specific data migrations tracked in `tickets/ENG-204-ia-drang-reencode-on-grant-contracts.md`

## Acceptance Criteria

### Tests That Must Pass

1. Direct `EffectASTSchema` parsing rejects both invalid `completionPolicy`/`postResolutionTurnFlow` pairings.
2. Direct `EventCardFreeOperationGrantSchema` parsing rejects both invalid `completionPolicy`/`postResolutionTurnFlow` pairings.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation grant contract detection remains centralized, while layer-specific error rendering is handled by thin reusable adapters.
2. Diagnostics remain generic and engine-agnostic; no game-specific assumptions appear in schema, validation, or runtime error paths.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — add direct rejection coverage for invalid required-grant pairings.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — lock correct diagnostic text/path behavior for the shared validator.
3. `packages/engine/test/unit/effects-turn-flow.test.ts` — keep runtime adapter output aligned if runtime error text/context changes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/schemas-ast.test.js dist/test/unit/validate-gamedef.test.js dist/test/unit/effects-turn-flow.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`
