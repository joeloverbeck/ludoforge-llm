# ENGINEARCH-150: Extract Shared Free-Operation Overlap Classifier

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes - kernel free-operation overlap/equivalence surface construction shared across validation and runtime
**Deps**: archive/tickets/ENG-224-strengthen-required-outcome-enforcement-for-overlapping-grants.md, packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts, packages/engine/src/kernel/free-operation-grant-authorization.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/test/unit/kernel/free-operation-viability-contract-parity.test.ts

## Problem

Free-operation overlap semantics are still split across multiple layers. Priority ordering is already shared, but the actual overlap-surface and equivalence-surface construction is duplicated between runtime grant resolution and `GameDef` validation. That drift risk is architectural debt: future grant fields can be added to one surface and silently omitted from the other.

## Assumption Reassessment (2026-03-09)

1. Runtime overlap enforcement currently builds its own overlap/equivalence surface in `free-operation-grant-authorization.ts`, including runtime-only state such as deferred dependencies and sequence-batch semantics.
2. `GameDef` validation currently builds a separate declarative overlap/equivalence surface in `validate-gamedef-behavior.ts` for event-card `freeOperationGrants`.
3. Discovery does not currently own a separate overlap classifier. `free-operation-discovery-analysis.ts` reuses authorization helpers for applicability checks and is therefore out of scope for this ticket.
4. `compareTurnFlowFreeOperationGrantPriority` is already centralized in `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts`; this ticket should not duplicate or relocate that policy logic unless implementation reveals a stronger reason.
5. Existing tests already cover the runtime/validation behaviors separately in `apply-move.test.ts`, `validate-gamedef.test.ts`, and `free-operation-viability-contract-parity.test.ts`, but they do not pin one shared overlap/equivalence helper.
6. Corrected scope: extract one shared overlap/equivalence surface module with a generic core plus explicit runtime/declarative adapters, and rewire only validation/runtime to use it.

## Architecture Check

1. One shared overlap/equivalence surface module is cleaner than maintaining parallel JSON-stringify key builders in validation and runtime.
2. This keeps all grant semantics generic and game-agnostic: `GameSpecDoc` provides data, while `GameDef`/kernel consume one canonical overlap contract.
3. The cleanest boundary is to keep policy ranking in the contracts layer and move only overlap/equivalence surface construction into a dedicated kernel module. That avoids pulling runtime-only concerns into shared contract types.
4. No backwards-compatibility shims should be added. Existing duplicated helpers should be replaced, not aliased indefinitely.

## What to Change

### 1. Extract a canonical overlap/equivalence surface module

Create a dedicated module that owns:
- effective overlap-surface comparison
- contract-equivalence comparison
- explicit extension points for runtime-only dimensions such as deferred dependencies and sequence-batch state

Do not move `compareTurnFlowFreeOperationGrantPriority` out of the contracts layer unless implementation evidence shows that split is wrong.

### 2. Rewire current consumers to the shared module

Replace the ad hoc overlap/equivalence builders in:
- runtime grant resolution
- declarative event-grant validation

The new shared module should be the authoritative place for free-operation overlap/equivalence surface construction.

### 3. Add drift guards

Add focused tests that fail if validation/runtime overlap/equivalence classification diverges again when shared grant fields change.

## Files to Touch

- `packages/engine/src/kernel/free-operation-grant-overlap.ts` (new)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts` (modify only if shared type helpers belong there)
- `packages/engine/test/unit/kernel/free-operation-grant-overlap.test.ts` (new)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify if runtime parity assertions need rebasing)
- `packages/engine/test/unit/kernel/free-operation-viability-contract-parity.test.ts` (modify if an architecture guard should assert the new shared module wiring)

## Out of Scope

- Changing the meaning of `completionPolicy`, `outcomePolicy`, or `postResolutionTurnFlow`
- Reworking free-operation discovery denial analysis beyond any import rewiring forced by the extraction
- Game-specific card rewrites or visual configuration changes

## Acceptance Criteria

### Tests That Must Pass

1. Validation and runtime classify the same overlap/equivalence pairs identically for the shared declarative surface.
2. Runtime-only state extensions remain additive; they do not fork the base overlap/equivalence surface contract.
3. Discovery remains unchanged in behavior because it is not an overlap-classification owner.
4. Existing suite: `node --test packages/engine/dist/test/unit/kernel/free-operation-grant-overlap.test.js`
5. Existing suite: `node --test packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/unit/kernel/apply-move.test.js packages/engine/dist/test/unit/kernel/free-operation-viability-contract-parity.test.js`
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. There is one authoritative overlap/equivalence surface contract for free-operation grants.
2. Grant overlap semantics remain fully game-agnostic and derived only from generic grant data/runtime state.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-grant-overlap.test.ts` - pin shared overlap/equivalence behavior and runtime-extension hooks.
2. `packages/engine/test/unit/validate-gamedef.test.ts` - prove declarative validation consumes the shared classifier correctly.
3. `packages/engine/test/unit/kernel/apply-move.test.ts` - prove runtime enforcement remains aligned after extraction.
4. `packages/engine/test/unit/kernel/free-operation-viability-contract-parity.test.ts` - optionally guard the new shared helper wiring if the implementation exposes a stable architecture seam.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/free-operation-grant-overlap.test.js`
3. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/unit/kernel/apply-move.test.js packages/engine/dist/test/unit/kernel/free-operation-viability-contract-parity.test.js`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm run check:ticket-deps`

## Outcome

- Outcome amended: 2026-03-09
- Completion date: 2026-03-09
- Actually changed:
  - Added `packages/engine/src/kernel/free-operation-grant-overlap.ts` as the shared overlap/equivalence surface module.
  - Rewired `free-operation-grant-authorization.ts` to use the shared runtime overlap/equivalence helper instead of an ad hoc key builder.
  - Rewired `validate-gamedef-behavior.ts` to use the shared declarative overlap/equivalence helpers instead of duplicated JSON-stringify builders.
  - Added `packages/engine/test/unit/kernel/free-operation-grant-overlap.test.ts` to pin the shared classifier behavior directly.
  - Added an architecture guard in `packages/engine/test/unit/kernel/free-operation-viability-contract-parity.test.ts` so runtime and validation stay wired to the shared helper.
  - Replaced `node:util` deep equality usage in browser-reachable engine code with an internal `packages/engine/src/kernel/deep-equal.ts` helper and added `packages/engine/test/unit/kernel/deep-equal.test.ts` so the required workspace-level `pnpm turbo test` pass succeeds.
- Deviations from original plan:
  - Scope was corrected before implementation: discovery was not an overlap-classification owner, so no discovery behavior was changed.
  - Priority comparison stayed in the contracts layer; only overlap/equivalence surface construction moved into the shared kernel module.
  - `validate-gamedef.test.ts` and `apply-move.test.ts` did not need behavioral edits because their existing coverage already stayed green against the extraction.
  - The final implementation expanded slightly beyond the ticket to fix a browser/runtime boundary issue exposed by the required workspace-level test run.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/free-operation-grant-overlap.test.js`
  - `node --test packages/engine/dist/test/unit/kernel/deep-equal.test.js`
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/unit/kernel/apply-move.test.js packages/engine/dist/test/unit/kernel/free-operation-viability-contract-parity.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
  - `pnpm run check:ticket-deps`
