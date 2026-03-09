# ENG-227: Finish Free-Operation Grant Validator Surface Cleanup

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — shared validator surface adapters, compiler/validator/runtime diagnostics, and missing regression coverage
**Deps**: archive/tickets/ENG-225-unify-free-operation-grant-contract-validation.md, packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts, packages/engine/src/cnl/compile-effects.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/effects-turn-flow.ts

## Problem

ENG-225 centralized free-operation grant contract detection, but the layer-specific translation from shared violations into compiler diagnostics, behavioral diagnostics, and runtime errors is still partly duplicated. One behavioral diagnostic message path is malformed for `sequenceContext requires sequence`, and there is no regression coverage pinning that message or the shared-surface translation boundaries.

## Assumption Reassessment (2026-03-09)

1. The repository now uses `collectTurnFlowFreeOperationGrantContractViolations(...)` as the canonical semantic contract detector for free-operation grants.
2. `validate-gamedef-behavior.ts`, `effects-turn-flow.ts`, and `cnl/compile-effects.ts` still translate those violations separately. The ticket previously understated the compiler surface area that still duplicates the contract translation.
3. The direct schema-boundary coverage originally called out here is already present:
   - `packages/engine/test/unit/schemas-ast.test.ts` already exercises invalid `EffectASTSchema.safeParse(...)` and `EventCardFreeOperationGrantSchema.safeParse(...)` pairings.
   - `packages/engine/test/unit/json-schema.test.ts` already exercises the generated JSON Schema artifact boundaries for the same coupling.
4. Actual mismatch: the remaining gap is surface-adapter drift, not missing schema-boundary coverage. Correction: normalize the compiler/validator/runtime adapters around the shared contract helper, fix the malformed `sequenceContext` diagnostic text, and add regression tests for the real gaps.

## Architecture Check

1. Thin layer-specific adapters are cleaner than re-encoding switch logic in each consumer. They keep the shared contract authoritative while still allowing each layer to expose its own error shape.
2. The current architecture is still weaker than it should be because `compile-effects.ts` is outside that cleanup boundary even though it participates in the same contract translation problem. Pulling compiler diagnostics into the same adapter model is more robust and extensible than leaving a third bespoke mapping path behind.
3. No backwards-compatibility shims should be added. The cleanup should tighten the current contract surfaces, not preserve stale wording or adapter drift.
4. This change stays inside agnostic compiler/validation/runtime infrastructure. It does not add any `GameSpecDoc` game-specific behavior or visual-config concerns.

## What to Change

### 1. Extract thin violation-to-surface adapters

Factor the shared violation mapping so:
- compile-time diagnostics use one reusable adapter
- behavioral validation diagnostics use one reusable adapter
- runtime grant application uses one reusable adapter

This should reduce repeated switch logic and make future contract extensions cheaper and less error-prone.

### 2. Fix misleading diagnostic text

Correct the `sequenceContext requires sequence` message path/text so it does not rewrite `sequenceContext` incorrectly when building the user-facing diagnostic.

### 3. Add regression coverage for the real gaps

Add tests that directly exercise:
- the malformed `sequenceContext requires sequence` behavioral diagnostic path/text
- the shared compiler/runtime adapter translations that remain easy to drift when the contract helper changes

Do not add redundant schema-boundary tests unless the implementation changes those surfaces materially.

## Files to Touch

- `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-zod.ts` (modify if adapter helpers live nearby)
- `packages/engine/test/unit/compile-effects.test.ts` (modify if compiler adapter behavior changes)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify only if runtime adapter behavior changes)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Structural JSON Schema artifact parity tracked in `archive/tickets/ENG-226-express-free-operation-grant-coupling-in-structural-schemas.md`
- Overlapping grant outcome enforcement tracked in `tickets/ENG-224-strengthen-required-outcome-enforcement-for-overlapping-grants.md`
- FITL-specific data migrations tracked in `tickets/ENG-204-ia-drang-reencode-on-grant-contracts.md`

## Acceptance Criteria

### Tests That Must Pass

1. Direct `EffectASTSchema` parsing rejects both invalid `completionPolicy`/`postResolutionTurnFlow` pairings.
2. Direct `EventCardFreeOperationGrantSchema` parsing rejects both invalid `completionPolicy`/`postResolutionTurnFlow` pairings.
3. Behavioral validation reports `sequenceContext requires sequence` against the correct surface text/path without malformed rewrites.
4. Compiler/runtime translations stay aligned with the shared contract helper after adapter extraction.
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation grant contract detection remains centralized, while layer-specific error rendering is handled by thin reusable adapters.
2. Diagnostics remain generic and engine-agnostic; no game-specific assumptions appear in schema, validation, or runtime error paths.
3. Compiler, validator, and runtime surfaces do not each carry bespoke contract-switch logic for the same violation set.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — lock compiler diagnostics to the shared adapter behavior if compile-time output changes.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — lock correct diagnostic text/path behavior for the shared validator, including the `sequenceContext requires sequence` case.
3. `packages/engine/test/unit/effects-turn-flow.test.ts` — keep runtime adapter output aligned if runtime error text/context changes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/compile-effects.test.js dist/test/unit/validate-gamedef.test.js dist/test/unit/effects-turn-flow.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`

## Outcome

- Outcome amended: 2026-03-09
- Completion date: 2026-03-09
- What actually changed:
  - Added a shared surface-rendering helper in `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts` so free-operation grant contract violations now render path/message text consistently.
  - Rewired `packages/engine/src/kernel/validate-gamedef-behavior.ts` to use data-driven violation-to-diagnostic mapping instead of a bespoke switch, fixing the malformed `sequenceContext requires sequence` message.
  - Rewired `packages/engine/src/kernel/effects-turn-flow.ts` and `packages/engine/src/cnl/compile-effects.ts` to consume the same shared surface rendering instead of hand-assembling their own contract text/path fragments.
  - Added a regression test in `packages/engine/test/unit/validate-gamedef.test.ts` that locks the corrected `freeOperationGrant.sequenceContext requires freeOperationGrant.sequence.` diagnostic.
  - Follow-up refinement: removed the remaining bespoke runtime `sequenceContext` and `sequence.step` contract guards from `packages/engine/src/kernel/effects-turn-flow.ts` so runtime now relies on the same shared contract-rendering path instead of mixing shared and local validation branches.
  - Added direct runtime regressions in `packages/engine/test/unit/effects-turn-flow.test.ts` for missing `sequence`, empty `sequenceContext`, and invalid `sequence.step`.
- Deviations from original plan:
  - No new schema-boundary tests were added because the ticket assumption was stale; `schemas-ast.test.ts` and `json-schema.test.ts` already covered the invalid completion-policy pairings before implementation started.
  - `packages/engine/src/kernel/free-operation-grant-zod.ts` did not need code changes because the relevant Zod-boundary wiring was already in place.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test dist/test/unit/compile-effects.test.js dist/test/unit/validate-gamedef.test.js dist/test/unit/effects-turn-flow.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm run check:ticket-deps`
  - `node --test dist/test/unit/effects-turn-flow.test.js dist/test/unit/validate-gamedef.test.js dist/test/unit/compile-effects.test.js`
