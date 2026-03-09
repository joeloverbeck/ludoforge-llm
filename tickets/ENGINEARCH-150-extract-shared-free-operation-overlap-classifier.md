# ENGINEARCH-150: Extract Shared Free-Operation Overlap Classifier

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel free-operation overlap classification shared across validation, discovery, and runtime
**Deps**: archive/tickets/ENG-224-strengthen-required-outcome-enforcement-for-overlapping-grants.md, packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts, packages/engine/src/kernel/free-operation-grant-authorization.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts

## Problem

Free-operation overlap semantics are still split across multiple layers. Priority ordering is now shared, but the actual overlap-surface and equivalence logic is still duplicated between runtime grant resolution and `GameDef` validation. That drift risk is architectural debt: future grant fields can easily be added to one surface and silently omitted from another.

## Assumption Reassessment (2026-03-09)

1. Runtime overlap enforcement currently builds its own equivalence key in `free-operation-grant-authorization.ts`, including dynamic state like deferred dependencies and sequence-batch semantics.
2. `GameDef` validation currently builds a separate declarative overlap/equivalence model in `validate-gamedef-behavior.ts` for event-card `freeOperationGrants`.
3. Mismatch: priority ordering is centralized, but overlap/equivalence classification is not. Corrected scope: extract one shared overlap-classification module with a generic core plus explicit runtime/declarative adapters.

## Architecture Check

1. One shared overlap classifier is cleaner than maintaining parallel JSON-stringify key builders in validation and runtime.
2. This keeps all grant semantics generic and game-agnostic: `GameSpecDoc` provides data, while `GameDef`/kernel consume one canonical overlap contract.
3. No backwards-compatibility shims should be added. Existing duplicated helpers should be replaced, not aliased indefinitely.

## What to Change

### 1. Extract a canonical overlap-classification module

Create a dedicated module that owns:
- policy-priority comparison
- effective overlap-surface comparison
- contract-equivalence comparison
- explicit extension points for runtime-only dimensions such as deferred dependencies and sequence-batch state

### 2. Rewire current consumers to the shared module

Replace the ad hoc overlap/equivalence builders in:
- runtime grant resolution
- declarative event-grant validation

The new shared module should be the authoritative place for free-operation overlap semantics.

### 3. Add drift guards

Add focused tests that fail if validation/runtime overlap classification diverges again when grant fields change.

## Files to Touch

- `packages/engine/src/kernel/free-operation-grant-overlap.ts` (new)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts` (modify only if shared type helpers belong there)
- `packages/engine/test/unit/kernel/free-operation-grant-overlap.test.ts` (new)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify if runtime parity assertions need rebasing)

## Out of Scope

- Changing the meaning of `completionPolicy`, `outcomePolicy`, or `postResolutionTurnFlow`
- Game-specific card rewrites or visual configuration changes

## Acceptance Criteria

### Tests That Must Pass

1. Validation and runtime classify the same overlap/equivalence pairs identically for the shared declarative surface.
2. Runtime-only state extensions remain additive; they do not fork the base overlap classifier contract.
3. Existing suite: `node --test packages/engine/dist/test/unit/kernel/free-operation-grant-overlap.test.js`
4. Existing suite: `node --test packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/unit/kernel/apply-move.test.js`
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. There is one authoritative overlap-classification contract for free-operation grants.
2. Grant overlap semantics remain fully game-agnostic and derived only from generic grant data/runtime state.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-grant-overlap.test.ts` — pin shared overlap/equivalence behavior and runtime-extension hooks.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — prove declarative validation consumes the shared classifier correctly.
3. `packages/engine/test/unit/kernel/apply-move.test.ts` — prove runtime enforcement remains aligned after extraction.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/free-operation-grant-overlap.test.js`
3. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/unit/kernel/apply-move.test.js`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm run check:ticket-deps`
